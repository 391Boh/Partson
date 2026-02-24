import { cache } from "react";

import { type CatalogProduct, fetchCatalogProductsPage } from "app/lib/catalog-server";
import { buildSeoSlug } from "app/lib/seo-slug";

const FACET_PAGE_SIZE = 80;
const FACET_MAX_PAGES = 350;
const FACET_MAX_ITEMS = 50000;

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const sortByPopularityThenLabel = (a: SeoFacetItem, b: SeoFacetItem) => {
  if (b.productCount !== a.productCount) return b.productCount - a.productCount;
  return a.label.localeCompare(b.label, "uk");
};

const increaseCounter = (map: Map<string, number>, value: string) => {
  map.set(value, (map.get(value) || 0) + 1);
};

const increaseNestedCounter = (
  map: Map<string, Map<string, number>>,
  parent: string,
  child: string
) => {
  const nested = map.get(parent) || new Map<string, number>();
  nested.set(child, (nested.get(child) || 0) + 1);
  map.set(parent, nested);
};

const toFacetList = (source: Map<string, number>) =>
  Array.from(source.entries())
    .map(([label, productCount]) => ({
      label,
      slug: buildSeoSlug(label),
      productCount,
    }))
    .sort(sortByPopularityThenLabel);

const resolveGroupLabel = (product: CatalogProduct) =>
  normalizeValue(product.group) ||
  normalizeValue(product.category) ||
  normalizeValue(product.subGroup);

const resolveSubgroupLabel = (product: CatalogProduct) => {
  const subgroup = normalizeValue(product.subGroup);
  const group = resolveGroupLabel(product);
  if (!subgroup || !group) return subgroup;
  if (subgroup.toLowerCase() === group.toLowerCase()) return "";
  return subgroup;
};

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

const collectSeoFacets = cache(async (): Promise<CatalogSeoFacets> => {
  const groupCounts = new Map<string, number>();
  const producerCounts = new Map<string, number>();
  const groupSubgroupCounts = new Map<string, Map<string, number>>();
  const producerGroupCounts = new Map<string, Map<string, number>>();

  let totalItems = 0;

  for (let page = 1; page <= FACET_MAX_PAGES; page += 1) {
    const batch = await fetchCatalogProductsPage({
      page,
      limit: FACET_PAGE_SIZE,
    });

    if (batch.length === 0) break;

    for (const product of batch) {
      const group = resolveGroupLabel(product);
      const subgroup = resolveSubgroupLabel(product);
      const producer = normalizeValue(product.producer);

      if (group) {
        increaseCounter(groupCounts, group);
      }

      if (group && subgroup) {
        increaseNestedCounter(groupSubgroupCounts, group, subgroup);
      }

      if (producer) {
        increaseCounter(producerCounts, producer);
      }

      if (producer && group) {
        increaseNestedCounter(producerGroupCounts, producer, group);
      }

      totalItems += 1;
      if (totalItems >= FACET_MAX_ITEMS) break;
    }

    if (totalItems >= FACET_MAX_ITEMS) break;
  }

  const groups = toFacetList(groupCounts).map((groupFacet) => {
    const subgroupMap = groupSubgroupCounts.get(groupFacet.label) || new Map<string, number>();
    const subgroups = toFacetList(subgroupMap).slice(0, 50);
    return { ...groupFacet, subgroups };
  });

  const producers = toFacetList(producerCounts).map((producerFacet) => {
    const groupMap = producerGroupCounts.get(producerFacet.label) || new Map<string, number>();
    const topGroups = toFacetList(groupMap).slice(0, 25);
    return { ...producerFacet, topGroups };
  });

  return {
    groups,
    producers,
    generatedAt: new Date().toISOString(),
  };
});

export const getCatalogSeoFacets = async () => collectSeoFacets();

export const findSeoGroupBySlug = async (slug: string) => {
  const normalizedSlug = normalizeValue(slug).toLowerCase();
  if (!normalizedSlug) return null;
  const data = await getCatalogSeoFacets();
  return data.groups.find((group) => group.slug === normalizedSlug) || null;
};

export const findSeoProducerBySlug = async (slug: string) => {
  const normalizedSlug = normalizeValue(slug).toLowerCase();
  if (!normalizedSlug) return null;
  const data = await getCatalogSeoFacets();
  return data.producers.find((producer) => producer.slug === normalizedSlug) || null;
};

