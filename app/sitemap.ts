import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

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

  return buildStaticPages(siteUrl, now);
}
