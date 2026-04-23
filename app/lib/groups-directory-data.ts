import "server-only";

import { cache } from "react";

import {
  EMPTY_CATALOG_SEO_FACETS,
  getCatalogSeoFacetsWithTimeout,
  type CatalogSeoFacets,
  type SeoFacetItem,
  type SeoGroupFacet,
} from "app/lib/catalog-seo";
import { buildSeoGroupLookup, resolveGroupSeoCounts } from "app/lib/group-seo";
import {
  getProductTreeDataset,
  type ProductTreeDataset,
} from "app/lib/product-tree";

export type GroupsDirectoryItem = {
  label: string;
  slug: string;
  productCount: number;
  subgroupsCount: number;
  subgroups: Array<{
    label: string;
    slug: string;
    productCount: number;
    children: Array<{
      label: string;
      slug: string;
    }>;
  }>;
};

export type GroupsDirectoryData = {
  clientGroups: GroupsDirectoryItem[];
  totalGroups: number;
  totalSubgroups: number;
  totalThirdLevelItems: number;
  totalProductCount: number;
  hasProductCounts: boolean;
};

const EMPTY_DATASET: ProductTreeDataset = { groups: [], labels: [] };
const GROUPS_DIRECTORY_FALLBACK_TIMEOUT_MS = 4500;
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

const buildGroupsDirectoryData = (
  dataset: ProductTreeDataset,
  seoFacets: CatalogSeoFacets
): GroupsDirectoryData => {
  const groupLookup = buildSeoGroupLookup(seoFacets.groups);
  const clientGroups: GroupsDirectoryItem[] = dataset.groups.map((group) => {
    const counts = resolveGroupSeoCounts(group, groupLookup);

    return {
      label: group.label,
      slug: group.slug,
      productCount: counts.productCount,
      subgroupsCount: counts.subgroupsCount,
      subgroups: group.subgroups.map((subgroup) => ({
        label: subgroup.label,
        slug: subgroup.slug,
        productCount: counts.subgroupProductCounts.get(subgroup.slug) ?? 0,
        children: (Array.isArray(subgroup.children) ? subgroup.children : []).map((child) => ({
          label: child.label,
          slug: child.slug,
        })),
      })),
    };
  });

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

export const getFastGroupsDirectoryData = cache(async () => {
  const dataset = await getProductTreeDataset().catch(() => EMPTY_DATASET);
  if (dataset.groups.length > 0) {
    return buildGroupsDirectoryData(dataset, EMPTY_CATALOG_SEO_FACETS);
  }

  const seoFacets = await getCatalogSeoFacetsWithTimeout(
    GROUPS_DIRECTORY_FALLBACK_TIMEOUT_MS
  ).catch(() => EMPTY_CATALOG_SEO_FACETS);

  return buildGroupsDirectoryDataFromSeoFacets(seoFacets);
});

export const getFullGroupsDirectoryData = cache(async () => {
  const [dataset, seoFacets] = await Promise.all([
    getProductTreeDataset().catch(() => EMPTY_DATASET),
    getCatalogSeoFacetsWithTimeout(GROUPS_DIRECTORY_FULL_COUNTS_TIMEOUT_MS).catch(
      () => EMPTY_CATALOG_SEO_FACETS
    ),
  ]);

  if (dataset.groups.length > 0) {
    return buildGroupsDirectoryData(dataset, seoFacets);
  }

  return buildGroupsDirectoryDataFromSeoFacets(seoFacets);
});
