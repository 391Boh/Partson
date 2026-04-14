import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { getInformationPath, informationSections } from "app/inform/section-config";
import { buildGroupItemPath, buildManufacturerPath } from "app/lib/catalog-links";
import { getCatalogSeoFacets } from "app/lib/catalog-seo";
import { getProductTreeDataset } from "app/lib/product-tree";

export type SitemapChangeFrequency =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface SitemapPathEntry {
  path: string;
  lastModified?: string;
  changeFrequency?: SitemapChangeFrequency;
  priority?: number;
}

export const PAGE_SITEMAP_SECTION_PATHS = [
  "/groups-sitemap.xml",
  "/manufacturers-sitemap.xml",
  "/information-sitemap.xml",
  "/other-pages-sitemap.xml",
] as const;

const SITEMAP_REVALIDATE_SECONDS = 60 * 60;

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const collectGroupListingPaths = (
  groups: Array<{
    slug: string;
    subgroups: Array<{
      slug: string;
      children: Array<{
        slug: string;
      }>;
    }>;
  }>
) => {
  const subgroupPaths: string[] = [];
  const childPaths: string[] = [];
  const seenSubgroupPaths = new Set<string>();
  const seenChildPaths = new Set<string>();

  for (const group of groups) {
    const groupSlug = (group.slug || "").trim();
    if (!groupSlug) continue;

    for (const subgroup of group.subgroups || []) {
      const subgroupSlug = (subgroup.slug || "").trim();
      if (!subgroupSlug) continue;

      const subgroupPath = buildGroupItemPath(groupSlug, subgroupSlug);
      if (!seenSubgroupPaths.has(subgroupPath)) {
        seenSubgroupPaths.add(subgroupPath);
        subgroupPaths.push(subgroupPath);
      }

      for (const child of Array.isArray(subgroup.children) ? subgroup.children : []) {
        const childSlug = (child.slug || "").trim();
        if (!childSlug) continue;

        const childPath = buildGroupItemPath(groupSlug, childSlug);
        if (seenChildPaths.has(childPath)) continue;
        seenChildPaths.add(childPath);
        childPaths.push(childPath);
      }
    }
  }

  return { subgroupPaths, childPaths };
};

const buildGroupsSitemapEntries = async (): Promise<SitemapPathEntry[]> => {
  const now = new Date().toISOString();
  const maxGroupPages = parsePositiveInt(process.env.SITEMAP_MAX_GROUP_PAGES, 6000);
  const maxGroupListingPages = parsePositiveInt(
    process.env.SITEMAP_MAX_GROUP_LISTING_PAGES,
    6000
  );
  const maxCategoryLeafPages = parsePositiveInt(
    process.env.SITEMAP_MAX_CATEGORY_LEAF_PAGES,
    12000
  );

  const entries: SitemapPathEntry[] = [
    {
      path: "/groups",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.88,
    },
  ];

  const dataset = await getProductTreeDataset().catch(() => null);
  if (!dataset) return entries;

  for (const group of dataset.groups.slice(0, maxGroupPages)) {
    entries.push({
      path: `/groups/${encodeURIComponent(group.slug)}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.84,
    });
  }

  const { subgroupPaths, childPaths } = collectGroupListingPaths(dataset.groups);

  for (const path of subgroupPaths.slice(0, maxGroupListingPages)) {
    entries.push({
      path,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  for (const path of childPaths.slice(0, maxCategoryLeafPages)) {
    entries.push({
      path,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.78,
    });
  }

  return entries;
};

const buildManufacturersSitemapEntries = async (): Promise<SitemapPathEntry[]> => {
  const now = new Date().toISOString();
  const maxManufacturerPages = parsePositiveInt(
    process.env.SITEMAP_MAX_MANUFACTURER_PAGES,
    6000
  );

  const entries: SitemapPathEntry[] = [
    {
      path: "/manufacturers",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.88,
    },
  ];

  const facets = await getCatalogSeoFacets().catch(() => null);
  if (!facets) return entries;

  for (const producer of facets.producers.slice(0, maxManufacturerPages)) {
    entries.push({
      path: buildManufacturerPath(producer.slug),
      lastModified: facets.generatedAt,
      changeFrequency: "weekly",
      priority: 0.82,
    });
  }

  return entries;
};

const getGroupsSitemapEntriesCached = unstable_cache(
  buildGroupsSitemapEntries,
  ["groups-sitemap-v2"],
  {
    revalidate: SITEMAP_REVALIDATE_SECONDS,
    tags: ["groups-sitemap"],
  }
);

const getManufacturersSitemapEntriesCached = unstable_cache(
  buildManufacturersSitemapEntries,
  ["manufacturers-sitemap-v1"],
  {
    revalidate: SITEMAP_REVALIDATE_SECONDS,
    tags: ["manufacturers-sitemap"],
  }
);

export const getGroupsSitemapEntries = cache(async () => getGroupsSitemapEntriesCached());

export const getManufacturersSitemapEntries = cache(
  async () => getManufacturersSitemapEntriesCached()
);

export const getInformationSitemapEntries = cache(async (): Promise<SitemapPathEntry[]> => {
  const now = new Date().toISOString();

  return informationSections.map((section) => ({
    path: getInformationPath(section.key),
    lastModified: now,
    changeFrequency: "monthly",
    priority: section.key === "delivery" ? 0.74 : 0.64,
  }));
});

export const getOtherPagesSitemapEntries = cache(async (): Promise<SitemapPathEntry[]> => {
  const now = new Date().toISOString();

  return [
    {
      path: "/",
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      path: "/auto",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      path: "/katalog",
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.86,
    },
  ];
});
