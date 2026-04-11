import type { MetadataRoute } from "next";

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

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Sitemap generation timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export default async function sitemap(props: {
  id: Promise<string | number>;
}): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const id = String(await props.id);
  const lastModified = new Date();

  let entries: Awaited<ReturnType<typeof getProductEntriesBySitemapId>> = [];

  try {
    entries = await withTimeout(getProductEntriesBySitemapId(id), 25000);
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

      const hasSeoRouteContext = Boolean(
        normalize(entry.group) ||
          normalize(entry.subGroup) ||
          normalize(entry.category)
      );

      const productPath = hasSeoRouteContext
        ? buildProductPath({
            code: normalizedCode,
            article: entry.article ?? undefined,
            name: entry.name ?? undefined,
            producer: entry.producer ?? undefined,
            group: entry.group ?? undefined,
            subGroup: entry.subGroup ?? undefined,
            category: entry.category ?? undefined,
          })
        : `/product/${encodeURIComponent(normalizedCode)}`;

      return {
        url: `${siteUrl}${productPath}`,
        lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.65,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return items;
}