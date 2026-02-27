import { cache } from "react";
import { unstable_cache } from "next/cache";

import { type CatalogProduct, fetchCatalogProductsPage } from "app/lib/catalog-server";
import { buildSeoSlug } from "app/lib/seo-slug";

const FACET_PAGE_SIZE = 120;
const FACET_MAX_PAGES = 220;
const FACET_MAX_ITEMS = 30000;

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();
const normalizeToken = (value: string | null | undefined) =>
  normalizeValue(value).toLowerCase();

interface FacetCounterEntry {
  label: string;
  productKeys: Set<string>;
}

type FacetCounterMap = Map<string, FacetCounterEntry>;

export interface SeoFacetItem {
  label: string;
  slug: string;
  productCount: number;
}

export interface SeoGroupFacet extends SeoFacetItem {
  subgroups: SeoFacetItem[];
}

export interface SeoProducerFacet extends SeoFacetItem {
  topGroups: SeoFacetItem[];
}

interface CatalogSeoFacets {
  groups: SeoGroupFacet[];
  producers: SeoProducerFacet[];
  generatedAt: string;
}

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

const toFacetList = (source: FacetCounterMap): SeoFacetItem[] =>
  Array.from(source.entries())
    .map(([slug, entry]) => ({
      label: entry.label,
      slug,
      productCount: entry.productKeys.size,
    }))
    .filter((item) => item.label && item.slug && item.productCount > 0)
    .sort(sortByPopularityThenLabel);

const resolveGroupLabel = (product: CatalogProduct) =>
  normalizeValue(product.group) || normalizeValue(product.category);

const resolveSubgroupLabel = (product: CatalogProduct) => {
  const subgroup = normalizeValue(product.subGroup);
  const category = normalizeValue(product.category);
  const group = resolveGroupLabel(product);

  if (!group) return "";
  if (subgroup && subgroup.toLowerCase() !== group.toLowerCase()) return subgroup;
  if (category && category.toLowerCase() !== group.toLowerCase()) return category;
  if (!subgroup) return "";
  if (subgroup.toLowerCase() === group.toLowerCase()) return "";
  return subgroup;
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
  const groupCounts = new Map<string, FacetCounterEntry>();
  const producerCounts = new Map<string, FacetCounterEntry>();
  const groupSubgroupCounts = new Map<string, FacetCounterMap>();
  const producerGroupCounts = new Map<string, FacetCounterMap>();

  let totalItems = 0;

  for (let page = 1; page <= FACET_MAX_PAGES; page += 1) {
    const batch = await fetchCatalogProductsPage({
      page,
      limit: FACET_PAGE_SIZE,
    });

    if (batch.length === 0) break;

    for (const product of batch) {
      const productKey = resolveProductKey(product);
      if (!productKey) continue;

      const group = resolveGroupLabel(product);
      const subgroup = resolveSubgroupLabel(product);
      const producer = normalizeValue(product.producer);


      if (group) {
        registerFacetProduct(groupCounts, group, productKey);
      }

      if (group && subgroup) {
        registerNestedFacetProduct(groupSubgroupCounts, group, subgroup, productKey);
      }

      if (producer) {
        registerFacetProduct(producerCounts, producer, productKey);
      }

      if (producer && group) {
        registerNestedFacetProduct(producerGroupCounts, producer, group, productKey);
      }

      totalItems += 1;
      if (totalItems >= FACET_MAX_ITEMS) break;
    }

    if (totalItems >= FACET_MAX_ITEMS) break;
    if (batch.length < FACET_PAGE_SIZE) break;
  }

  const groups = toFacetList(groupCounts).map((groupFacet) => {
    const subgroupMap =
      groupSubgroupCounts.get(groupFacet.slug) || new Map<string, FacetCounterEntry>();
    const subgroups = toFacetList(subgroupMap).slice(0, 50);
    return { ...groupFacet, subgroups };
  });

  const producers = toFacetList(producerCounts).map((producerFacet) => {
    const groupMap =
      producerGroupCounts.get(producerFacet.slug) || new Map<string, FacetCounterEntry>();
    const topGroups = toFacetList(groupMap).slice(0, 25);
    return { ...producerFacet, topGroups };
  });

  return {
    groups,
    producers,
    generatedAt: new Date().toISOString(),
  };
};

const collectSeoFacetsWithRevalidate = unstable_cache(
  buildCatalogSeoFacets,
  ["catalog-seo-facets-v5"],
  {
    revalidate: 60 * 60 * 6,
    tags: ["catalog-seo-facets"],
  }
);

const collectSeoFacets = cache(async (): Promise<CatalogSeoFacets> =>
  collectSeoFacetsWithRevalidate()
);

export const getCatalogSeoFacets = async () => collectSeoFacets();

const normalizeSlug = (slug: string) => buildSeoSlug(normalizeValue(slug));

export const findSeoGroupBySlug = cache(async (slug: string) => {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return null;
  const data = await getCatalogSeoFacets();
  return data.groups.find((group) => group.slug === normalizedSlug) || null;
});

export const findSeoProducerBySlug = cache(async (slug: string) => {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return null;
  const data = await getCatalogSeoFacets();
  return data.producers.find((producer) => producer.slug === normalizedSlug) || null;
});











