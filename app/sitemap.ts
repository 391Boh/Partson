import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import {
  buildCatalogCategoryPath,
  buildCatalogProducerPath,
  toAbsoluteSitePath,
} from "app/lib/catalog-links";
import { getCatalogSeoFacets } from "app/lib/catalog-seo";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

type SitemapEntry = MetadataRoute.Sitemap[number];

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

const buildStaticPages = (siteUrl: string, lastModified: Date): MetadataRoute.Sitemap => [
  {
    url: toAbsoluteSitePath(siteUrl, "/"),
    lastModified,
    changeFrequency: "daily",
    priority: 1,
  },
  {
    url: toAbsoluteSitePath(siteUrl, "/katalog"),
    lastModified,
    changeFrequency: "daily",
    priority: 0.95,
  },
  {
    url: toAbsoluteSitePath(siteUrl, buildCatalogCategoryPath(null)),
    lastModified,
    changeFrequency: "daily",
    priority: 0.9,
  },
  {
    url: toAbsoluteSitePath(siteUrl, buildCatalogProducerPath(null)),
    lastModified,
    changeFrequency: "daily",
    priority: 0.9,
  },
  {
    url: toAbsoluteSitePath(siteUrl, "/groups"),
    lastModified,
    changeFrequency: "weekly",
    priority: 0.72,
  },
  {
    url: toAbsoluteSitePath(siteUrl, "/manufacturers"),
    lastModified,
    changeFrequency: "weekly",
    priority: 0.72,
  },
  {
    url: toAbsoluteSitePath(siteUrl, "/inform"),
    lastModified,
    changeFrequency: "weekly",
    priority: 0.7,
  },
];

const addUniqueSitemapEntry = (
  target: SitemapEntry[],
  seenUrls: Set<string>,
  entry: SitemapEntry
) => {
  if (seenUrls.has(entry.url)) return false;
  seenUrls.add(entry.url);
  target.push(entry);
  return true;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const now = new Date();

  const maxGroupPages = parsePositiveInt(process.env.SITEMAP_MAX_GROUP_PAGES, 6000);
  const maxSubgroupPages = parsePositiveInt(process.env.SITEMAP_MAX_SUBGROUP_PAGES, 30000);
  const maxManufacturerPages = parsePositiveInt(
    process.env.SITEMAP_MAX_MANUFACTURER_PAGES,
    6000
  );

  let dynamicPages: MetadataRoute.Sitemap = [];

  try {
    const facets = await getCatalogSeoFacets();
    const facetLastModified = parseSitemapDate(facets.generatedAt, now);
    const seenUrls = new Set<string>();

    const groupPages = facets.groups
      .slice(0, maxGroupPages)
      .map((group) => ({
        url: toAbsoluteSitePath(siteUrl, buildCatalogCategoryPath(group.label)),
        lastModified: facetLastModified,
        changeFrequency: "weekly" as const,
        priority: 0.82,
      }));

    for (const page of groupPages) {
      addUniqueSitemapEntry(dynamicPages, seenUrls, page);
    }

    let subgroupCount = 0;
    for (const group of facets.groups) {
      if (subgroupCount >= maxSubgroupPages) break;

      for (const subgroup of group.subgroups) {
        if (subgroupCount >= maxSubgroupPages) break;

        const added = addUniqueSitemapEntry(dynamicPages, seenUrls, {
          url: toAbsoluteSitePath(
            siteUrl,
            buildCatalogCategoryPath(group.label, subgroup.label)
          ),
          lastModified: facetLastModified,
          changeFrequency: "weekly",
          priority: 0.78,
        });

        if (added) subgroupCount += 1;
      }
    }

    const manufacturerPages = facets.producers
      .slice(0, maxManufacturerPages)
      .map((producer) => ({
        url: toAbsoluteSitePath(siteUrl, buildCatalogProducerPath(producer.label)),
        lastModified: facetLastModified,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));

    for (const page of manufacturerPages) {
      addUniqueSitemapEntry(dynamicPages, seenUrls, page);
    }
  } catch {
    dynamicPages = [];
  }

  return [...buildStaticPages(siteUrl, now), ...dynamicPages];
}
