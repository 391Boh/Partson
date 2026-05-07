import { cache } from "react";
import { unstable_cache } from "next/cache";

import { type CatalogProduct, fetchCatalogProductsByQuery } from "app/lib/catalog-server";
import { getProductTreeDataset } from "app/lib/product-tree";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { buildSeoSlug } from "app/lib/seo-slug";

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const parseOptionalPositiveInt = (value: string | undefined) => {
  if (value == null || value.trim() === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
};

const FACET_PAGE_SIZE = parsePositiveInt(process.env.SEO_FACET_PAGE_SIZE, 120);
const FACET_MAX_PAGES = parseOptionalPositiveInt(process.env.SEO_FACET_MAX_PAGES);
const FACET_MAX_ITEMS = parseOptionalPositiveInt(process.env.SEO_FACET_MAX_ITEMS);

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();
const normalizeToken = (value: string | null | undefined) =>
  normalizeValue(value).toLowerCase();

interface FacetCounterEntry {
  label: string;
  productKeys: Set<string>;
}

type FacetCounterMap = Map<string, FacetCounterEntry>;
type NestedFacetCounterMap = Map<string, FacetCounterMap>;

export interface SeoFacetItem {
  label: string;
  slug: string;
  productCount: number;
}

export interface SeoGroupFacet extends SeoFacetItem {
  subgroups: SeoFacetItem[];
}

export interface SeoProducerGroupFacet extends SeoFacetItem {
  // filterValue holds the raw 1C Группа field value used in ?group= URL params.
  // label may differ when the swap-correction in resolveFacetHierarchy promotes
  // a Категорія value to the human-visible group name.
  filterValue: string;
  subgroups: SeoFacetItem[];
}

export interface SeoProducerFacet extends SeoFacetItem {
  groupsCount: number;
  categoriesCount: number;
  topGroups: SeoProducerGroupFacet[];
}

export interface CatalogSeoFacets {
  groups: SeoGroupFacet[];
  producers: SeoProducerFacet[];
  totalProductCount: number;
  generatedAt: string;
}

export const EMPTY_CATALOG_SEO_FACETS: CatalogSeoFacets = {
  groups: [],
  producers: [],
  totalProductCount: 0,
  generatedAt: "",
};

const sortByPopularityThenLabel = (a: SeoFacetItem, b: SeoFacetItem) => {
  if (b.productCount !== a.productCount) return b.productCount - a.productCount;
  return a.label.localeCompare(b.label, "uk");
};

const pickPreferredLabel = (current: string, candidate: string) => {
  if (!current) return candidate;
  if (!candidate) return current;

  if (current.toLowerCase() === candidate.toLowerCase()) {
    const currentLooksUpper = current === current.toUpperCase();
    const candidateLooksUpper = candidate === candidate.toUpperCase();
    if (currentLooksUpper && !candidateLooksUpper) return candidate;
    if (candidate.length > current.length) return candidate;
  }

  return current;
};

const registerFacetProduct = (
  map: FacetCounterMap,
  label: string,
  productKey: string
) => {
  const normalizedLabel = normalizeValue(label);
  if (!normalizedLabel || !productKey) return null;

  const facetKey = buildSeoSlug(normalizedLabel);
  if (!facetKey) return null;

  const existing = map.get(facetKey);
  if (!existing) {
    map.set(facetKey, {
      label: normalizedLabel,
      productKeys: new Set([productKey]),
    });
    return facetKey;
  }

  existing.label = pickPreferredLabel(existing.label, normalizedLabel);
  existing.productKeys.add(productKey);
  return facetKey;
};

const registerNestedFacetProduct = (
  map: Map<string, FacetCounterMap>,
  parentLabel: string,
  childLabel: string,
  productKey: string
) => {
  const parentKey = buildSeoSlug(normalizeValue(parentLabel));
  if (!parentKey) return;

  const nested = map.get(parentKey) || new Map<string, FacetCounterEntry>();
  registerFacetProduct(nested, childLabel, productKey);
  map.set(parentKey, nested);
};

const registerDoubleNestedFacetProduct = (
  map: Map<string, NestedFacetCounterMap>,
  firstLabel: string,
  secondLabel: string,
  thirdLabel: string,
  productKey: string
) => {
  const firstKey = buildSeoSlug(normalizeValue(firstLabel));
  const secondKey = buildSeoSlug(normalizeValue(secondLabel));
  if (!firstKey || !secondKey) return;

  const secondLevel = map.get(firstKey) || new Map<string, FacetCounterMap>();
  const nested = secondLevel.get(secondKey) || new Map<string, FacetCounterEntry>();
  registerFacetProduct(nested, thirdLabel, productKey);
  secondLevel.set(secondKey, nested);
  map.set(firstKey, secondLevel);
};

const toFacetList = (source: FacetCounterMap): SeoFacetItem[] =>
  Array.from(source.entries())
    .map(([slug, entry]) => ({
      label: entry.label,
      slug,
      productCount: entry.productKeys.size,
    }))
    .filter((item) => item.label && item.slug && item.productCount > 0)
    .sort(sortByPopularityThenLabel);

type GroupHierarchyLookup = {
  groups: Set<string>;
  subgroups: Set<string>;
  children: Set<string>;
};

const normalizeHierarchyKey = (value: string | null | undefined) =>
  normalizeValue(value).toLocaleLowerCase("uk-UA");

const buildGroupHierarchyLookup = (
  dataset: Awaited<ReturnType<typeof getProductTreeDataset>> | null
): GroupHierarchyLookup => {
  const groups = new Set<string>();
  const subgroups = new Set<string>();
  const children = new Set<string>();

  for (const group of dataset?.groups ?? []) {
    const groupKey = normalizeHierarchyKey(group.label);
    if (groupKey) groups.add(groupKey);

    for (const subgroup of group.subgroups ?? []) {
      const subgroupKey = normalizeHierarchyKey(subgroup.label);
      if (subgroupKey) subgroups.add(subgroupKey);

      for (const child of subgroup.children ?? []) {
        const childKey = normalizeHierarchyKey(child.label);
        if (childKey) children.add(childKey);
      }
    }
  }

  return { groups, subgroups, children };
};

const resolveFacetHierarchy = (
  product: CatalogProduct,
  lookup: GroupHierarchyLookup
) => {
  const rawGroup = normalizeValue(product.group);
  const rawSubgroup = normalizeValue(product.subGroup);
  const rawCategory = normalizeValue(product.category);

  let group = rawGroup || rawCategory;
  let subgroup = "";
  let category = "";

  if (rawSubgroup && rawSubgroup.toLowerCase() !== group.toLowerCase()) {
    subgroup = rawSubgroup;
  } else if (rawCategory && rawCategory.toLowerCase() !== group.toLowerCase()) {
    subgroup = rawCategory;
  }

  if (
    rawCategory &&
    rawCategory.toLowerCase() !== group.toLowerCase() &&
    rawCategory.toLowerCase() !== subgroup.toLowerCase()
  ) {
    category = rawCategory;
  }

  // Some 1C rows come with swapped fields: group contains a subgroup,
  // while category contains the real top-level group.
  if (!rawSubgroup && rawGroup && rawCategory) {
    const rawGroupKey = normalizeHierarchyKey(rawGroup);
    const rawCategoryKey = normalizeHierarchyKey(rawCategory);
    const looksSwapped =
      lookup.subgroups.has(rawGroupKey) && lookup.groups.has(rawCategoryKey);

    if (looksSwapped) {
      group = rawCategory;
      subgroup = rawGroup;
      category = "";
    }
  }

  const leaf = category || subgroup;
  return { group, subgroup, category, leaf };
};

const resolveProductKey = (product: CatalogProduct) => {
  const code = normalizeToken(product.code);
  const article = normalizeToken(product.article);
  const name = normalizeToken(product.name);
  const producer = normalizeToken(product.producer);
  if (code) return producer ? `code:${code}|producer:${producer}` : `code:${code}`;
  if (article) return producer ? `article:${article}|producer:${producer}` : `article:${article}`;

  if (!name) return "";

  return producer ? `name:${name}|producer:${producer}` : `name:${name}`;
};

const buildCatalogSeoFacets = async (): Promise<CatalogSeoFacets> => {
  const allProductKeys = new Set<string>();
  const groupCounts = new Map<string, FacetCounterEntry>();
  const producerCounts = new Map<string, FacetCounterEntry>();
  const groupSubgroupCounts = new Map<string, FacetCounterMap>();
  const producerGroupCounts = new Map<string, FacetCounterMap>();
  const producerGroupSubgroupCounts = new Map<string, NestedFacetCounterMap>();
  // producerGroupDisplayLabels[producerSlug][groupFilterSlug] = swap-corrected display label.
  // Populated only when resolveFacetHierarchy corrects a swapped Группа/Категорія pair so
  // that the human-visible label differs from the raw Группа filter value.
  const producerGroupDisplayLabels = new Map<string, Map<string, string>>();

  let totalItems = 0;
  const dataset = await getProductTreeDataset().catch(() => null);
  const hierarchyLookup = buildGroupHierarchyLookup(dataset);

  let cursor = "";
  let cursorField = "";
  let cursorModeActive = false;

  for (let page = 1; ; page += 1) {
    if (FACET_MAX_PAGES != null && page > FACET_MAX_PAGES) {
      break;
    }

    const batchResult = await fetchCatalogProductsByQuery({
      page: cursorModeActive ? 1 : page,
      limit: FACET_PAGE_SIZE,
      forceAllgoodsSource: true,
      cursor: cursor || undefined,
      cursorField: cursorField || undefined,
      sortOrder: "none",
    });
    const batch = batchResult.items;

    if (batch.length === 0) break;

    for (const product of batch) {
      const productKey = resolveProductKey(product);
      if (!productKey) continue;
      allProductKeys.add(productKey);

      const { group, leaf } = resolveFacetHierarchy(
        product,
        hierarchyLookup
      );
      const producer = normalizeValue(product.producer);


      if (group) {
        registerFacetProduct(groupCounts, group, productKey);
      }

      if (group && leaf) {
        registerNestedFacetProduct(groupSubgroupCounts, group, leaf, productKey);
      }

      if (producer) {
        registerFacetProduct(producerCounts, producer, productKey);
      }

      // Use the original product.group (Группа field as returned by 1C) rather than
      // the swap-corrected `group` for producer→group registration.
      //
      // resolveFacetHierarchy may replace `group` with `product.category` when it
      // detects swapped 1C fields; the corrected label is useful for global category
      // display but causes empty catalog results when used as a URL filter, because
      // the catalog queries 1C with Группа=<label> and 1C never has Группа=<corrected>
      // for those products — it only has Группа=<original subgroup value>.
      const rawGroupForFilter =
        normalizeValue(product.group) || normalizeValue(product.category);

      if (producer && rawGroupForFilter) {
        registerNestedFacetProduct(producerGroupCounts, producer, rawGroupForFilter, productKey);

        // When resolveFacetHierarchy detected a swap, `group` (swap-corrected label
        // derived from Категорія) differs from `rawGroupForFilter` (original Группа
        // value).  Record the corrected label so it can be used as the display label
        // on the manufacturer page while filterValue stays as rawGroupForFilter.
        if (group && group !== rawGroupForFilter) {
          const producerSlug = buildSeoSlug(normalizeValue(producer));
          const groupFilterSlug = buildSeoSlug(normalizeValue(rawGroupForFilter));
          if (producerSlug && groupFilterSlug) {
            let displayMap = producerGroupDisplayLabels.get(producerSlug);
            if (!displayMap) {
              displayMap = new Map<string, string>();
              producerGroupDisplayLabels.set(producerSlug, displayMap);
            }
            if (!displayMap.has(groupFilterSlug)) {
              displayMap.set(groupFilterSlug, group);
            }
          }
        }
      }

      if (producer && rawGroupForFilter && leaf) {
        const leafNorm = normalizeValue(leaf);
        // Skip self-referencing subgroup that arises when a swapped product has
        // rawGroup==leaf (both equal to the original Группа subgroup value).
        if (leafNorm.toLowerCase() !== rawGroupForFilter.toLowerCase()) {
          registerDoubleNestedFacetProduct(
            producerGroupSubgroupCounts,
            producer,
            rawGroupForFilter,
            leaf,
            productKey
          );
        }
      }

      totalItems += 1;
      if (FACET_MAX_ITEMS != null && totalItems >= FACET_MAX_ITEMS) break;
    }

    if (FACET_MAX_ITEMS != null && totalItems >= FACET_MAX_ITEMS) break;

    const nextCursor = (batchResult.nextCursor || "").trim();
    if (nextCursor && nextCursor !== cursor) {
      cursor = nextCursor;
      cursorField = (batchResult.cursorField || "").trim();
      cursorModeActive = true;
    } else if (cursorModeActive) {
      break;
    }

    if (!batchResult.hasMore) break;
  }

  const groups = toFacetList(groupCounts).map((groupFacet) => {
    const subgroupMap =
      groupSubgroupCounts.get(groupFacet.slug) || new Map<string, FacetCounterEntry>();
    const subgroups = toFacetList(subgroupMap);
    return { ...groupFacet, subgroups };
  });

  const producers = toFacetList(producerCounts).map((producerFacet) => {
    const groupMap =
      producerGroupCounts.get(producerFacet.slug) || new Map<string, FacetCounterEntry>();
    const producerSubgroupMap =
      producerGroupSubgroupCounts.get(producerFacet.slug) ||
      new Map<string, FacetCounterMap>();
    const displayLabels =
      producerGroupDisplayLabels.get(producerFacet.slug) || new Map<string, string>();
    const producerGroups = toFacetList(groupMap).map((groupFacet) => {
      const subgroupMap =
        producerSubgroupMap.get(groupFacet.slug) || new Map<string, FacetCounterEntry>();
      const subgroups = toFacetList(subgroupMap);
      // groupFacet.label = raw Группа value (the filter key stored by registerFacetProduct).
      // displayLabels may hold a swap-corrected human-friendly name for this slug.
      const displayLabel = displayLabels.get(groupFacet.slug) || groupFacet.label;
      return {
        ...groupFacet,
        label: displayLabel,          // human-friendly (swap-corrected when applicable)
        filterValue: groupFacet.label, // raw 1C Группа value → used in ?group= URL param
        subgroups,
      };
    });
    const topGroups = producerGroups;
    const categoriesCount = producerGroups.reduce(
      (sum, groupFacet) => sum + groupFacet.subgroups.length,
      0
    );
    return {
      ...producerFacet,
      groupsCount: producerGroups.length,
      categoriesCount,
      topGroups,
    };
  });

  return {
    groups,
    producers,
    totalProductCount: allProductKeys.size,
    generatedAt: new Date().toISOString(),
  };
};

const collectSeoFacetsWithRevalidate = unstable_cache(
  buildCatalogSeoFacets,
  ["catalog-seo-facets-v12-producer-raw-group-filter"],
  {
    revalidate: 60 * 60 * 6,
    tags: ["catalog-seo-facets"],
  }
);

const collectSeoFacets = cache(async (): Promise<CatalogSeoFacets> =>
  collectSeoFacetsWithRevalidate()
);

export const getCatalogSeoFacets = async () => collectSeoFacets();

export const getCatalogSeoFacetsWithTimeout = async (timeoutMs = 250) =>
  resolveWithTimeout(
    () => getCatalogSeoFacets(),
    EMPTY_CATALOG_SEO_FACETS,
    timeoutMs
  );

const buildSlugLookupCandidates = (value: string) => {
  const normalized = normalizeValue(value);
  if (!normalized) return [] as string[];

  return Array.from(new Set([normalized.toLowerCase(), buildSeoSlug(normalized)]));
};

export const findSeoGroupBySlug = cache(async (slug: string) => {
  const slugCandidates = buildSlugLookupCandidates(slug);
  if (slugCandidates.length === 0) return null;
  const data = await getCatalogSeoFacets();
  return data.groups.find((group) => slugCandidates.includes(group.slug)) || null;
});

export const findSeoProducerBySlug = cache(async (slug: string) => {
  const slugCandidates = buildSlugLookupCandidates(slug);
  if (slugCandidates.length === 0) return null;
  const data = await getCatalogSeoFacets();
  return data.producers.find((producer) => slugCandidates.includes(producer.slug)) || null;
});





