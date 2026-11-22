import "server-only";

import { cache } from "react";

import {
  EMPTY_CATALOG_SEO_FACETS,
  getCatalogSeoFacetsWithTimeout,
  type CatalogSeoFacets,
  type SeoFacetItem,
  type SeoGroupFacet,
} from "app/lib/catalog-seo";
import { resolveCatalogSeoFacetsWithFallback } from "app/lib/catalog-count-fallback";
import { buildSeoGroupLookup, resolveGroupSeoCounts } from "app/lib/group-seo";
import { getAllProductSitemapEntries, type ProductSitemapEntry } from "app/lib/product-sitemap";
import {
  getProductTreeDataset,
  type ProductTreeDataset,
} from "app/lib/product-tree";

export type GroupsDirectoryItem = {
  label: string;
  slug: string;
  productCount: number;
  /** Missing from a snapshot is different from explicitly counted empty. */
  countsKnown?: boolean;
  subgroupsCount: number;
  subgroups: Array<{
    label: string;
    slug: string;
    productCount: number;
    /** Up to three priced products with a photo, shown instead of an icon. */
    previews?: GroupPreviewProduct[];
    children: Array<{
      label: string;
      slug: string;
      productCount: number;
    }>;
  }>;
};

export type GroupPreviewProduct = { code: string; article?: string; name?: string };

export type GroupsDirectoryData = {
  clientGroups: GroupsDirectoryItem[];
  totalGroups: number;
  totalSubgroups: number;
  totalThirdLevelItems: number;
  totalProductCount: number;
  hasProductCounts: boolean;
};

const EMPTY_DATASET: ProductTreeDataset = { groups: [], labels: [] };
const GROUPS_DIRECTORY_FULL_COUNTS_TIMEOUT_MS = 6000;

const toPositiveProductCount = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
};

const toSeoFallbackSubgroup = (subgroup: SeoFacetItem) => ({
  label: subgroup.label,
  slug: subgroup.slug,
  productCount: toPositiveProductCount(subgroup.productCount),
  children: [],
});

const toSeoFallbackGroup = (group: SeoGroupFacet): GroupsDirectoryItem => {
  const subgroups = (Array.isArray(group.subgroups) ? group.subgroups : [])
    .filter((subgroup) => subgroup.label && subgroup.slug)
    .map(toSeoFallbackSubgroup);

  return {
    label: group.label,
    slug: group.slug,
    productCount: toPositiveProductCount(group.productCount),
    subgroupsCount: subgroups.length,
    subgroups,
  };
};

const buildGroupsDirectoryDataFromSeoFacets = (
  seoFacets: CatalogSeoFacets
): GroupsDirectoryData => {
  const clientGroups = (Array.isArray(seoFacets.groups) ? seoFacets.groups : [])
    .filter((group) => group.label && group.slug)
    .map(toSeoFallbackGroup);

  const totalGroups = clientGroups.length;
  const totalSubgroups = clientGroups.reduce(
    (sum, group) => sum + group.subgroupsCount,
    0
  );
  const totalProductCount = clientGroups.reduce(
    (sum, group) => sum + group.productCount,
    0
  );

  return {
    clientGroups,
    totalGroups,
    totalSubgroups,
    totalThirdLevelItems: 0,
    totalProductCount,
    hasProductCounts: totalProductCount > 0,
  };
};

const pruneEmptyGroups = (groups: GroupsDirectoryItem[]): GroupsDirectoryItem[] =>
  groups.flatMap((group) => {
    if (group.countsKnown === false) return [group];
    if (group.productCount <= 0) return [];
    const subgroups = group.subgroups.flatMap((subgroup) =>
      subgroup.productCount > 0
        ? [{ ...subgroup, children: subgroup.children.filter((child) => child.productCount > 0) }]
        : []
    );
    return [{ ...group, subgroupsCount: subgroups.length, subgroups }];
  });

const buildGroupsDirectoryData = (
  dataset: ProductTreeDataset,
  seoFacets: CatalogSeoFacets
): GroupsDirectoryData => {
  const groupLookup = buildSeoGroupLookup(seoFacets.groups);
  const treeGroups: GroupsDirectoryItem[] = dataset.groups.map((group) => {
    const counts = resolveGroupSeoCounts(group, groupLookup);

    return {
      label: group.label,
      slug: group.slug,
      productCount: counts.productCount,
      countsKnown: counts.countsKnown,
      subgroupsCount: counts.subgroupsCount,
      subgroups: group.subgroups.map((subgroup) => ({
        label: subgroup.label,
        slug: subgroup.slug,
        productCount: counts.subgroupProductCounts.get(subgroup.slug) ?? 0,
        children: (Array.isArray(subgroup.children) ? subgroup.children : []).map((child) => ({
          label: child.label,
          slug: child.slug,
          productCount: counts.childProductCounts.get(child.slug) ?? 0,
        })),
      })),
    };
  });

  // Prune explicitly counted empty nodes. A fresh tree can contain a new
  // category absent from an older counts snapshot; retain its real links.
  const countsKnown = treeGroups.some((group) => group.countsKnown);
  const clientGroups = countsKnown ? pruneEmptyGroups(treeGroups) : treeGroups;

  const totalGroups = clientGroups.length;
  const totalSubgroups = clientGroups.reduce(
    (sum, group) => sum + group.subgroupsCount,
    0
  );
  const totalThirdLevelItems = clientGroups.reduce(
    (sum, group) =>
      sum +
      group.subgroups.reduce(
        (innerSum, subgroup) => innerSum + subgroup.children.length,
        0
      ),
    0
  );
  const totalProductCount = clientGroups.reduce(
    (sum, group) => sum + group.productCount,
    0
  );

  return {
    clientGroups,
    totalGroups,
    totalSubgroups,
    totalThirdLevelItems,
    totalProductCount,
    hasProductCounts: totalProductCount > 0,
  };
};

const PREVIEWS_PER_GROUP = 3;
const previewKey = (category?: string, group?: string) =>
  `${(category || "").trim().toLowerCase()}\u0000${(group || "").trim().toLowerCase()}`;

// Real photos of products sold in each group: in-stock priced items first,
// then any priced item with a photo. Nothing is shown for a group without one.
const attachGroupPreviews = (
  data: GroupsDirectoryData,
  entries: ProductSitemapEntry[]
): GroupsDirectoryData => {
  const ranked = new Map<string, ProductSitemapEntry[]>();
  for (const entry of entries) {
    if (entry.hasPhoto !== true || !(Number(entry.priceEuro) > 0)) continue;
    const key = previewKey(entry.category, entry.group);
    const list = ranked.get(key);
    if (list) list.push(entry);
    else ranked.set(key, [entry]);
  }

  const pick = (category: string, group: string) => {
    const list = ranked.get(previewKey(category, group));
    if (!list?.length) return undefined;
    const inStock = list.filter((entry) => entry.quantity > 0);
    const ordered = [...inStock, ...list.filter((entry) => !(entry.quantity > 0))];
    return ordered.slice(0, PREVIEWS_PER_GROUP).map((entry) => ({
      code: entry.code,
      ...(entry.article ? { article: entry.article } : {}),
      ...(entry.name ? { name: entry.name } : {}),
    }));
  };

  return {
    ...data,
    clientGroups: data.clientGroups.map((group) => ({
      ...group,
      subgroups: group.subgroups.map((subgroup) => {
        const previews = pick(group.label, subgroup.label);
        return previews ? { ...subgroup, previews } : subgroup;
      }),
    })),
  };
};

export const getFullGroupsDirectoryData = cache(async () => {
  const [dataset, rawSeoFacets] = await Promise.all([
    getProductTreeDataset().catch(() => EMPTY_DATASET),
    getCatalogSeoFacetsWithTimeout(GROUPS_DIRECTORY_FULL_COUNTS_TIMEOUT_MS).catch(
      () => EMPTY_CATALOG_SEO_FACETS
    ),
  ]);
  const seoFacets = await resolveCatalogSeoFacetsWithFallback(
    rawSeoFacets,
    getAllProductSitemapEntries
  );

  const data =
    dataset.groups.length > 0
      ? buildGroupsDirectoryData(dataset, seoFacets)
      : buildGroupsDirectoryDataFromSeoFacets(seoFacets);
  const entries = await getAllProductSitemapEntries().catch(() => [] as ProductSitemapEntry[]);
  return attachGroupPreviews(data, entries);
});
