import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { getCatalogSeoFacets } from "app/lib/catalog-seo";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const parseSitemapDate = (value: string | null | undefined, fallbackValue: Date) => {
  if (!value) return fallbackValue;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallbackValue : parsed;
};

const buildStaticPages = (
  siteUrl: string,
  lastModified: Date
): MetadataRoute.Sitemap => [
  {
    url: `${siteUrl}/`,
    lastModified,
    changeFrequency: "daily",
    priority: 1,
  },
  {
    url: `${siteUrl}/katalog`,
    lastModified,
    changeFrequency: "daily",
    priority: 0.95,
  },
  {
    url: `${siteUrl}/groups`,
    lastModified,
    changeFrequency: "daily",
    priority: 0.86,
  },
  {
    url: `${siteUrl}/manufacturers`,
    lastModified,
    changeFrequency: "daily",
    priority: 0.86,
  },
  {
    url: `${siteUrl}/inform`,
    lastModified,
    changeFrequency: "weekly",
    priority: 0.7,
  },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const now = new Date();

  const maxGroupPages = parsePositiveInt(process.env.SITEMAP_MAX_GROUP_PAGES, 5000);
  const maxManufacturerPages = parsePositiveInt(
    process.env.SITEMAP_MAX_MANUFACTURER_PAGES,
    5000
  );

  let dynamicPages: MetadataRoute.Sitemap = [];

  try {
    const facets = await getCatalogSeoFacets();
    const facetLastModified = parseSitemapDate(facets.generatedAt, now);

    const groupPages: MetadataRoute.Sitemap = facets.groups.slice(0, maxGroupPages).map((group) => ({
      url: `${siteUrl}/groups/${encodeURIComponent(group.slug)}`,
      lastModified: facetLastModified,
      changeFrequency: "weekly",
      priority: 0.72,
    }));

    const manufacturerPages: MetadataRoute.Sitemap = facets.producers
      .slice(0, maxManufacturerPages)
      .map((producer) => ({
        url: `${siteUrl}/manufacturers/${encodeURIComponent(producer.slug)}`,
        lastModified: facetLastModified,
        changeFrequency: "weekly",
        priority: 0.72,
      }));

    dynamicPages = [...groupPages, ...manufacturerPages];
  } catch {
    dynamicPages = [];
  }

  return [...buildStaticPages(siteUrl, now), ...dynamicPages];
}
