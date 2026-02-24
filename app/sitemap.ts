import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { getCatalogSeoFacets } from "app/lib/catalog-seo";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const seoFacets = await getCatalogSeoFacets();
  const now = new Date(seoFacets.generatedAt);

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
      url: `${siteUrl}/Inform`,
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

  const groupPages: MetadataRoute.Sitemap = seoFacets.groups.map((group) => ({
    url: `${siteUrl}/groups/${group.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const producerPages: MetadataRoute.Sitemap = seoFacets.producers.map((producer) => ({
    url: `${siteUrl}/manufacturers/${producer.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticPages, ...groupPages, ...producerPages];
}
