import "server-only";

import { readFile } from "node:fs/promises";

import type {
  CatalogSeoFacets,
  SeoFacetItem,
  SeoGroupFacet,
  SeoProducerFacet,
  SeoProducerGroupFacet,
} from "app/lib/catalog-seo";
import type { ProductSitemapEntry } from "app/lib/product-sitemap";
import { buildSeoSlug } from "app/lib/seo-slug";

type CounterEntry = {
  label: string;
  productKeys: Set<string>;
};

type CounterMap = Map<string, CounterEntry>;
type NestedCounterMap = Map<string, CounterMap>;

const SEO_COUNTS_SNAPSHOT_PATH = ".cache/seo-counts.json";

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const normalizeToken = (value: string | null | undefined) =>
  normalizeValue(value).toLocaleLowerCase("uk-UA");

const pickPreferredLabel = (current: string, candidate: string) => {
  if (!current) return candidate;
  if (!candidate) return current;

  if (current.toLocaleLowerCase("uk-UA") === candidate.toLocaleLowerCase("uk-UA")) {
    const currentLooksUpper = current === current.toUpperCase();
    const candidateLooksUpper = candidate === candidate.toUpperCase();
    if (currentLooksUpper && !candidateLooksUpper) return candidate;
    if (candidate.length > current.length) return candidate;
  }

  return current;
};

const resolveProductKey = (entry: ProductSitemapEntry) => {
  const code = normalizeToken(entry.code);
  const article = normalizeToken(entry.article);
  const name = normalizeToken(entry.name);
  const producer = normalizeToken(entry.producer);

  if (code) return producer ? `code:${code}|producer:${producer}` : `code:${code}`;
  if (article) return producer ? `article:${article}|producer:${producer}` : `article:${article}`;
  if (!name) return "";

  return producer ? `name:${name}|producer:${producer}` : `name:${name}`;
};

const registerProduct = (
  map: CounterMap,
  label: string | null | undefined,
  productKey: string
) => {
  const normalizedLabel = normalizeValue(label);
  if (!normalizedLabel || !productKey) return "";

  const slug = buildSeoSlug(normalizedLabel);
  if (!slug) return "";

  const existing = map.get(slug);
  if (!existing) {
    map.set(slug, {
      label: normalizedLabel,
      productKeys: new Set([productKey]),
    });
    return slug;
  }

  existing.label = pickPreferredLabel(existing.label, normalizedLabel);
  existing.productKeys.add(productKey);
  return slug;
};

const registerNestedProduct = (
  map: NestedCounterMap,
  parentLabel: string | null | undefined,
  childLabel: string | null | undefined,
  productKey: string
) => {
  const parentSlug = buildSeoSlug(normalizeValue(parentLabel));
  if (!parentSlug) return;

  const childMap = map.get(parentSlug) || new Map<string, CounterEntry>();
  registerProduct(childMap, childLabel, productKey);
  map.set(parentSlug, childMap);
};

const toFacetList = (map: CounterMap): SeoFacetItem[] =>
  Array.from(map.entries())
    .map(([slug, entry]) => ({
      label: entry.label,
      slug,
      productCount: entry.productKeys.size,
    }))
    .filter((entry) => entry.label && entry.slug && entry.productCount > 0)
    .sort((left, right) => {
      if (right.productCount !== left.productCount) {
        return right.productCount - left.productCount;
      }
      return left.label.localeCompare(right.label, "uk", { sensitivity: "base" });
    });

export const buildCatalogSeoFacetsFromSitemapEntries = (
  entries: ProductSitemapEntry[]
): CatalogSeoFacets => {
  const productKeys = new Set<string>();
  const groupCounts: CounterMap = new Map();
  const producerCounts: CounterMap = new Map();
  const groupSubgroupCounts: NestedCounterMap = new Map();
  const producerGroupCounts: NestedCounterMap = new Map();
  const producerGroupSubgroupCounts = new Map<string, NestedCounterMap>();

  for (const entry of entries) {
    const productKey = resolveProductKey(entry);
    if (!productKey) continue;
    productKeys.add(productKey);

    const group = normalizeValue(entry.group) || normalizeValue(entry.category);
    const subgroup =
      normalizeValue(entry.subGroup) ||
      (normalizeValue(entry.category).toLocaleLowerCase("uk-UA") !==
      group.toLocaleLowerCase("uk-UA")
        ? normalizeValue(entry.category)
        : "");
    const producer = normalizeValue(entry.producer);

    if (group) {
      registerProduct(groupCounts, group, productKey);
    }

    if (group && subgroup) {
      registerNestedProduct(groupSubgroupCounts, group, subgroup, productKey);
    }

    if (!producer) continue;

    const producerSlug = registerProduct(producerCounts, producer, productKey);
    if (group) {
      registerNestedProduct(producerGroupCounts, producer, group, productKey);
    }

    if (producerSlug && group && subgroup) {
      const nested = producerGroupSubgroupCounts.get(producerSlug) || new Map();
      registerNestedProduct(nested, group, subgroup, productKey);
      producerGroupSubgroupCounts.set(producerSlug, nested);
    }
  }

  const groups: SeoGroupFacet[] = toFacetList(groupCounts).map((group) => ({
    ...group,
    subgroups: toFacetList(groupSubgroupCounts.get(group.slug) || new Map()),
  }));

  const producers: SeoProducerFacet[] = toFacetList(producerCounts).map((producer) => {
    const producerGroups = toFacetList(
      producerGroupCounts.get(producer.slug) || new Map()
    ).map<SeoProducerGroupFacet>((group) => ({
      ...group,
      filterValue: group.label,
      subgroups: toFacetList(
        producerGroupSubgroupCounts.get(producer.slug)?.get(group.slug) || new Map()
      ),
    }));

    return {
      ...producer,
      groupsCount: producerGroups.length,
      categoriesCount: producerGroups.reduce(
        (sum, group) => sum + group.subgroups.length,
        0
      ),
      topGroups: producerGroups,
    };
  });

  return {
    groups,
    producers,
    totalProductCount: productKeys.size,
    generatedAt: new Date().toISOString(),
  };
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

export const readCatalogSeoFacetsSnapshot = async () => {
  const text = await readFile(SEO_COUNTS_SNAPSHOT_PATH, "utf8").catch(() => "");
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as unknown;
    return isCatalogSeoFacets(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const resolveCatalogSeoFacetsWithFallback = async (
  seoFacets: CatalogSeoFacets,
  loadEntries?: () => Promise<ProductSitemapEntry[]>
) => {
  if (seoFacets.totalProductCount > 0 || seoFacets.groups.length > 0 || seoFacets.producers.length > 0) {
    return seoFacets;
  }

  const snapshot = await readCatalogSeoFacetsSnapshot();
  if (snapshot && snapshot.totalProductCount > 0) {
    return snapshot;
  }

  if (!loadEntries) {
    return seoFacets;
  }

  const entries = await loadEntries().catch(() => []);
  return entries.length > 0
    ? buildCatalogSeoFacetsFromSitemapEntries(entries)
    : seoFacets;
};
