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

function hasResolvableSeoLookupToken(value?: string | null): boolean {
  const normalized = normalize(value);
  return normalized.length >= 5 && /\d/.test(normalized);
}

function canUseSeoProductPath(entry: Awaited<ReturnType<typeof getProductEntriesBySitemapId>>[number]) {
  const hasFacetContext = Boolean(
    normalize(entry.group) ||
      normalize(entry.subGroup) ||
      normalize(entry.category)
  );
  const hasName = Boolean(normalize(entry.name));

  if (!hasFacetContext || !hasName) {
    return false;
  }

  return (
    hasResolvableSeoLookupToken(entry.article) ||
    hasResolvableSeoLookupToken(entry.code)
  );
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

      const productPath = canUseSeoProductPath(entry)
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
