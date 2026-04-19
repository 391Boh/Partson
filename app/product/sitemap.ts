import type { MetadataRoute } from "next";

import { getProductImagePath } from "app/lib/product-image";
import { buildProductPath } from "app/lib/product-url";
import {
  getProductEntriesBySitemapId,
  getProductSitemapIds,
} from "app/lib/product-sitemap";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

export async function generateSitemaps() {
  return getProductSitemapIds();
}

function normalize(value?: string | null): string {
  return (value ?? "").trim();
}

export default async function sitemap(props: {
  id: Promise<string | number>;
}): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const id = String(await props.id);
  const lastModified = new Date();

  let entries: Awaited<ReturnType<typeof getProductEntriesBySitemapId>> = [];

  try {
    entries = await getProductEntriesBySitemapId(id);
  } catch (error) {
    console.error(`Failed to build product sitemap for id "${id}"`, error);
    return [];
  }

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
      const productImages =
        entry.hasPhoto === false
          ? undefined
          : [`${siteUrl}${getProductImagePath(normalizedCode, entry.article)}`];

      return {
        url: `${siteUrl}${productPath}`,
        lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.65,
        images: productImages,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return items;
}
