import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { collectCatalogProductCodes } from "app/lib/catalog-server";
import { getProductImagePath } from "app/lib/product-image";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/katalog`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/inform`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/groups`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/manufacturers`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  const maxProducts = parsePositiveInt(process.env.SITEMAP_MAX_PRODUCTS, 6000);
  const maxPages = parsePositiveInt(process.env.SITEMAP_MAX_PAGES, 120);
  const pageSize = parsePositiveInt(process.env.SITEMAP_PAGE_SIZE, 80);

  let productCodes: string[] = [];
  try {
    productCodes = await collectCatalogProductCodes({
      maxPages,
      maxItems: maxProducts,
      pageSize,
    });
  } catch {
    productCodes = [];
  }

  const seenProductCodes = new Set<string>();
  const productPages: MetadataRoute.Sitemap = [];

  for (const rawCode of productCodes) {
    const normalizedCode = (rawCode || "").trim();
    if (!normalizedCode) continue;

    const dedupeKey = normalizedCode.toLowerCase();
    if (seenProductCodes.has(dedupeKey)) continue;
    seenProductCodes.add(dedupeKey);

    const encodedCode = encodeURIComponent(normalizedCode);
    const imagePath = getProductImagePath(normalizedCode);

    productPages.push({
      url: `${siteUrl}/product/${encodedCode}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
      images: [`${siteUrl}${imagePath}`],
    });
  }

  return [...staticPages, ...productPages];
}
