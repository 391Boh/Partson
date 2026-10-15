import type { MetadataRoute } from "next";

import { getMerchantGalleryImages } from "app/lib/google-merchant-feed";
import { buildProductSeoImagePath } from "app/lib/product-image-path";
import { buildProductPath } from "app/lib/product-url";
import {
  getPricedProductEntriesBySitemapId,
  getPricedProductSitemapIds,
} from "app/lib/product-sitemap";
import { getProductSitemapLastModified } from "app/lib/product-sitemap-lastmod";
import { getConfiguredSitemapLastModified } from "app/lib/sitemap-dates";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

export async function generateSitemaps() {
  try {
    return await getPricedProductSitemapIds();
  } catch (error) {
    console.error("Failed to generate product sitemap ids", error);
    return [];
  }
}

function normalize(value?: string | null): string {
  return (value ?? "").trim();
}

// Next's metadata sitemap serializer writes image URLs verbatim, so escape
// query separators here to keep the generated image sitemap valid XML.
function escapeXmlUrl(value: string): string {
  return value.replace(/&/g, "&amp;");
}

// The extra photos uploaded to a product's gallery (Firestore). Read once for
// all sitemap chunks per revalidation instead of once per chunk.
let galleryImagesPromise: Promise<Map<string, string[]>> | null = null;
let galleryImagesLoadedAt = 0;
const GALLERY_IMAGES_TTL_MS = 30 * 60 * 1000;

const getGalleryImages = () => {
  if (!galleryImagesPromise || Date.now() - galleryImagesLoadedAt > GALLERY_IMAGES_TTL_MS) {
    galleryImagesLoadedAt = Date.now();
    galleryImagesPromise = getMerchantGalleryImages().catch(() => new Map<string, string[]>());
  }
  return galleryImagesPromise;
};

export default async function sitemap(props: {
  id: Promise<string | number>;
}): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const id = String(await props.id);
  const lastModified = getConfiguredSitemapLastModified();

  let entries: Awaited<ReturnType<typeof getPricedProductEntriesBySitemapId>> = [];

  try {
    entries = await getPricedProductEntriesBySitemapId(id);
  } catch (error) {
    console.error(`Failed to build product sitemap for id "${id}"`, error);
    return [];
  }

  const [productLastModified, galleryImages] = await Promise.all([
    getProductSitemapLastModified(entries).catch(() => new Map<string, string>()),
    getGalleryImages(),
  ]);

  const items: MetadataRoute.Sitemap = entries
    .map((entry) => {
      const normalizedCode = normalize(entry.code);

      if (!normalizedCode) {
        return null;
      }

      const productPath = buildProductPath({
        code: normalizedCode,
        article: entry.article ?? undefined,
        name: entry.name ?? undefined,
        producer: entry.producer ?? undefined,
        group: entry.group ?? undefined,
        subGroup: entry.subGroup ?? undefined,
        category: entry.category ?? undefined,
      });
      // Same order as the page: the primary photo, then the gallery ones.
      const galleryUrls = (galleryImages.get(normalizedCode) ?? [])
        .map((url) =>
          url.startsWith("/") ? `${siteUrl}${url}` : /^https:\/\//i.test(url) ? url : ""
        )
        .filter(Boolean)
        .map(escapeXmlUrl);
      const productImages =
        entry.hasPhoto !== true
          ? undefined
          : [
              escapeXmlUrl(
                `${siteUrl}${buildProductSeoImagePath(
                  normalizedCode,
                  entry.article ?? undefined
                )}`
              ),
              ...galleryUrls,
            ];

      return {
        url: `${siteUrl}${productPath}`,
        lastModified: productLastModified.get(normalizedCode) ?? lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.65,
        images: productImages,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return items;
}
