import { cache } from "react";
import { readFile } from "node:fs/promises";
import { unstable_cache } from "next/cache";

import { type CatalogProduct, fetchCatalogProductsByQuery } from "app/lib/catalog-server";
import { resolveProductCategoryHierarchy } from "app/lib/catalog-hierarchy";
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
const SEO_COUNTS_SNAPSHOT_PATH = ".cache/seo-counts.json";
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
  // filterValue holds the raw 1C Группа field value used in ?group= URL params
  // (always equal to label — see app/lib/catalog-hierarchy.ts).
  filterValue: string;
  subgroups: SeoFacetItem[];
}

export interface SeoProducerCategoryFacet extends SeoFacetItem {
  groups: SeoProducerGroupFacet[];
}

export interface SeoProducerFacet extends SeoFacetItem {
  groupsCount: number;
  categoriesCount: number;
  topGroups: SeoProducerGroupFacet[];
  topCategories?: SeoProducerCategoryFacet[];
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

const isCatalogSeoFacets = (value: unknown): value is CatalogSeoFacets => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CatalogSeoFacets>;
  return (
    Array.isArray(record.groups) &&
    Array.isArray(record.producers) &&
    typeof record.totalProductCount === "number"
  );
};

const readCatalogSeoFacetsSnapshot = cache(async () => {
  const text = await readFile(SEO_COUNTS_SNAPSHOT_PATH, "utf8").catch(() => "");
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as unknown;
    return isCatalogSeoFacets(parsed) ? parsed : null;
  } catch {
    return null;
  }
});

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
  // 3-level: producerSlug → categorySlug → Map<groupSlug, FacetCounterEntry>
  // Only populated when a product has both Категорія and Группа fields.
  const producerCategoryGroupCounts = new Map<string, NestedFacetCounterMap>();
  // producerSlug → Map<categorySlug, categoryLabel> for building topCategories
  const producerCategoryLabels = new Map<string, Map<string, string>>();

  let totalItems = 0;

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

      // Single source of truth for Категорія/Группа/Підгруппа — see
      // app/lib/catalog-hierarchy.ts. group/subgroup are always the literal
      // 1C values (required for the ?group=/?subcategory= filter to match),
      // category is a display-only outer wrapper.
      const resolved = resolveProductCategoryHierarchy(product);
      const producer = normalizeValue(product.producer);

      if (resolved.group) {
        registerFacetProduct(groupCounts, resolved.group, productKey);
      }

      if (resolved.group && resolved.subgroup) {
        registerNestedFacetProduct(groupSubgroupCounts, resolved.group, resolved.subgroup, productKey);
      }

      if (producer) {
        registerFacetProduct(producerCounts, producer, productKey);
      }

      if (producer && resolved.group) {
        registerNestedFacetProduct(producerGroupCounts, producer, resolved.group, productKey);

        if (resolved.category) {
          const producerSlug = buildSeoSlug(producer);
          const categorySlug = buildSeoSlug(resolved.category);
          if (producerSlug && categorySlug) {
            let catLabels = producerCategoryLabels.get(producerSlug);
            if (!catLabels) {
              catLabels = new Map<string, string>();
              producerCategoryLabels.set(producerSlug, catLabels);
            }
            if (!catLabels.has(categorySlug)) {
              catLabels.set(categorySlug, resolved.category);
            }
            registerDoubleNestedFacetProduct(
              producerCategoryGroupCounts,
              producer,
              resolved.category,
              resolved.group,
              productKey
            );
          }
        }
      }

      if (producer && resolved.group && resolved.subgroup) {
        registerDoubleNestedFacetProduct(
          producerGroupSubgroupCounts,
          producer,
          resolved.group,
          resolved.subgroup,
          productKey
        );
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
    const producerGroups = toFacetList(groupMap).map((groupFacet) => {
      const subgroupMap =
        producerSubgroupMap.get(groupFacet.slug) || new Map<string, FacetCounterEntry>();
      const subgroups = toFacetList(subgroupMap);
      return {
        ...groupFacet,
        filterValue: groupFacet.label, // raw 1C Группа value → used in ?group= URL param
        subgroups,
      };
    });
    const topGroups = producerGroups;
    const categoriesCount = producerGroups.reduce(
      (sum, groupFacet) => sum + groupFacet.subgroups.length,
      0
    );

    // Build 3-level topCategories: Категорія → Группа → Підгруппа
    const catGroupMap =
      producerCategoryGroupCounts.get(producerFacet.slug) ||
      new Map<string, FacetCounterMap>();
    const catLabels =
      producerCategoryLabels.get(producerFacet.slug) || new Map<string, string>();
    const topCategories: SeoProducerCategoryFacet[] = Array.from(catGroupMap.entries())
      .map(([catSlug, groupsInCat]) => {
        const catLabel = catLabels.get(catSlug) || catSlug;
        const catGroups = toFacetList(groupsInCat).map((gf) => {
          const subgroupMap =
            producerSubgroupMap.get(gf.slug) || new Map<string, FacetCounterEntry>();
          const subgroups = toFacetList(subgroupMap);
          return {
            ...gf,
            filterValue: gf.label,
            subgroups,
          };
        });
        const catProductCount = catGroups.reduce((sum, g) => sum + g.productCount, 0);
        return {
          label: catLabel,
          slug: catSlug,
          productCount: catProductCount,
          groups: catGroups,
        };
      })
      .filter((cat) => cat.productCount > 0 && cat.groups.length > 0)
      .sort((a, b) =>
        b.productCount !== a.productCount
          ? b.productCount - a.productCount
          : a.label.localeCompare(b.label, "uk")
      );

    return {
      ...producerFacet,
      groupsCount: producerGroups.length,
      categoriesCount,
      topGroups,
      topCategories: topCategories.length > 0 ? topCategories : undefined,
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
  ["catalog-seo-facets-v14-category-groups-fixed"],
  {
    revalidate: 60 * 60 * 6,
    tags: ["catalog-seo-facets"],
  }
);

const collectSeoFacets = cache(async (): Promise<CatalogSeoFacets> =>
  collectSeoFacetsWithRevalidate()
);

export const getCatalogSeoFacets = async () => collectSeoFacets();

export const getCatalogSeoFacetsWithTimeout = async (timeoutMs = 250) => {
  // The checked-in snapshot is generated from the same catalog scan and is
  // available on every production instance. Reading it first avoids making a
  // cold page request wait for the full paginated 1C traversal. The live
  // loader remains the fallback for development and installations without a
  // snapshot.
  const snapshot = await readCatalogSeoFacetsSnapshot();
  if (snapshot && (snapshot.totalProductCount > 0 || snapshot.groups.length > 0)) {
    return snapshot;
  }

  return resolveWithTimeout(
    () => getCatalogSeoFacets(),
    EMPTY_CATALOG_SEO_FACETS,
    timeoutMs
  );
};

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
