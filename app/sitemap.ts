import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { getCatalogSeoFacets } from "app/lib/catalog-seo";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

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

  let groupPages: MetadataRoute.Sitemap = [];
  let manufacturerPages: MetadataRoute.Sitemap = [];

  try {
    const facets = await getCatalogSeoFacets();

    groupPages = facets.groups.map((group) => ({
      url: `${siteUrl}/groups/${group.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.75,
    }));

    manufacturerPages = facets.producers.map((producer) => ({
      url: `${siteUrl}/manufacturers/${producer.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.75,
    }));
  } catch {
    // Keep static pages in sitemap if facet data is temporarily unavailable.
  }

  return [...staticPages, ...groupPages, ...manufacturerPages];
}
