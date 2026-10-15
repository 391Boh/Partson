import "server-only";

import { fetchCatalogProductsByQuery, type CatalogProduct, type CatalogSearchFilter } from "app/lib/catalog-server";
import { catalogRouteCacheClearHooks } from "app/lib/catalog-page-route-cache";
import { normalizeSearchQuery } from "app/lib/catalog-search";
import { getProductTreeDataset } from "app/lib/product-tree";
import {
  buildProductParamFacets,
  formatParamNumber,
  slugifyParamToken,
  matchesProductParamFilters,
  parseProductParams,
  type ParsedProductParams,
  type ProductParamFacet,
  type ProductParamFilter,
} from "app/lib/product-params";

// Parameter filters need the whole category at once: 1C cannot filter by
// description lines, so the set is loaded page by page (with descriptions),
// parsed once, and kept for a few minutes. Admin edits clear it together with
// the catalog-page route cache.

export type CatalogParamsQuery = {
  group: string;
  subcategory: string;
  producer: string;
  selectedCars: string[];
  selectedCategories: string[];
  searchQuery: string;
  searchFilter: CatalogSearchFilter;
  expandHierarchy: boolean;
};

// Price, stock and sort are applied to the loaded set here rather than sent
// to 1C, so one category load serves every combination of them.
export type CatalogParamsListOptions = {
  sortOrder: "none" | "asc" | "desc";
  pricedOnly: boolean;
  priceFrom: number | null; // EUR, as /api/catalog-page receives it
  priceTo: number | null;
  inStock: boolean;
};

const readString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const readStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
const readNonNegative = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const SEARCH_FILTERS = new Set(["article", "name", "code", "producer", "description"]);

// Same body fields /api/catalog-page reads, so the parameter tab and the
// product list always describe the same product set.
export const readCatalogParamsQuery = (body: Record<string, unknown>): CatalogParamsQuery => ({
  group: readString(body.group),
  subcategory: readString(body.subcategory),
  producer: readString(body.producer),
  selectedCars: readStringArray(body.selectedCars),
  selectedCategories: readStringArray(body.selectedCategories),
  searchQuery: normalizeSearchQuery(readString(body.searchQuery)),
  searchFilter: (SEARCH_FILTERS.has(readString(body.searchFilter))
    ? readString(body.searchFilter)
    : "all") as CatalogSearchFilter,
  expandHierarchy: body.expandHierarchy === true,
});

export const readCatalogParamsListOptions = (body: Record<string, unknown>): CatalogParamsListOptions => ({
  sortOrder: body.sortOrder === "asc" || body.sortOrder === "desc" ? body.sortOrder : "none",
  pricedOnly: body.pricedOnly === true,
  priceFrom: readNonNegative(body.priceFrom),
  priceTo: readNonNegative(body.priceTo),
  inStock: body.inStock === true,
});

type ParamBaseEntry ={ product: CatalogProduct; params: ParsedProductParams };
type ParamBase = { entries: ParamBaseEntry[]; complete: boolean; facets: ProductParamFacet[] };

const BASE_TTL_MS = 1000 * 60 * 10;
const PAGE_LIMIT = 240;
const MAX_PAGES = 8; // 1 920 products — far above any single subcategory today
const PAGE_TIMEOUT_MS = 9000;

const baseCache = new Map<string, { expiresAt: number; promise: Promise<ParamBase> }>();
catalogRouteCacheClearHooks.add(() => baseCache.clear());

// Without a category there is nothing meaningful to compare, and loading the
// whole catalog page by page would hammer 1C.
export const canUseProductParams = (query: Pick<CatalogParamsQuery, "group" | "subcategory" | "selectedCategories"> & { expandHierarchy?: boolean }) =>
  !query.expandHierarchy && query.selectedCategories.length <= 1 && Boolean(query.group || query.subcategory || query.selectedCategories.length === 1);

export async function isTerminalCatalogParamsQuery(query: CatalogParamsQuery): Promise<boolean> {
  if (!canUseProductParams(query)) return false;
  const tree = await getProductTreeDataset();
  const normalize = (value: string) => value.trim().toLocaleLowerCase('uk-UA');
  const path = (query.selectedCategories[0] || '').split(/\s+\/\s+/);
  const target = normalize(query.subcategory || path.at(-1) || query.group || '');
  const parent = normalize(query.subcategory || query.selectedCategories.length ? query.group || path.at(-2) || '' : '');
  const matches: boolean[] = [];
  for (const group of tree.groups) {
    if (!parent && [group.label, group.slug, group.legacySlug].some((label) => label && normalize(label) === target)) matches.push(group.subgroups.length === 0);
    for (const subgroup of group.subgroups) {
      const inGroup = !parent || [group.label, group.slug, group.legacySlug].some((label) => label && normalize(label) === parent);
      if (inGroup && [subgroup.label, subgroup.slug, subgroup.legacySlug].some((label) => label && normalize(label) === target)) {
        matches.push(subgroup.children.length === 0);
      }
      const inSubgroup = inGroup || [subgroup.label, subgroup.slug, subgroup.legacySlug].some((label) => label && normalize(label) === parent);
      if (inSubgroup && subgroup.children.some((child) => [child.label, child.slug, child.legacySlug].some((label) => label && normalize(label) === target))) matches.push(true);
    }
  }
  return matches.length > 0 && matches.every(Boolean);
}

const buildBaseKey = (query: CatalogParamsQuery) =>
  JSON.stringify([
    query.group,
    query.subcategory,
    query.producer,
    query.selectedCars,
    query.selectedCategories,
    query.searchQuery,
    query.searchFilter,
    query.expandHierarchy,
  ]);

const fetchBasePage = (
  query: CatalogParamsQuery,
  options: { page: number; cursor: string; cursorField: string; expandHierarchy: boolean }
) =>
  fetchCatalogProductsByQuery({
    page: options.page,
    limit: PAGE_LIMIT,
    cursor: options.cursor || null,
    cursorField: options.cursorField || null,
    selectedCars: query.selectedCars,
    selectedCategories: query.selectedCategories,
    searchQuery: query.searchQuery,
    searchFilter: query.searchFilter,
    includeDescription: true,
    group: query.group,
    subcategory: query.subcategory,
    producer: query.producer,
    expandHierarchy: options.expandHierarchy,
    sortOrder: "none",
    timeoutMs: PAGE_TIMEOUT_MS,
    retries: 1,
    retryDelayMs: 150,
    cacheTtlMs: BASE_TTL_MS,
    includePriceEnrichment: false,
    preferLegacySource: false,
    forceAllgoodsSource: true,
  });

const loadBase = async (query: CatalogParamsQuery): Promise<ParamBase> => {
  const entries: ParamBaseEntry[] = [];
  const seen = new Set<string>();
  const add = (products: CatalogProduct[]) => {
    for (const product of products) {
      const key = product.code || `${product.article}|${product.producer}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      entries.push({ product, params: parseProductParams(product) });
    }
  };

  // The hierarchy (scope=hierarchy) path merges sub-branches but returns at
  // most 240 products per branch, so the set is read with plain cursor paging
  // (the full category: 756 brake pads, not 240) and, in hierarchy mode,
  // topped up with the merged branches for children the plain query misses.
  const hierarchyPage = query.expandHierarchy
    ? fetchBasePage(query, { page: 1, cursor: "", cursorField: "", expandHierarchy: true }).catch(() => null)
    : Promise.resolve(null);

  let cursor = "";
  let cursorField = "";
  let complete = false;
  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const result = await fetchBasePage(query, {
      page: pageIndex + 1,
      cursor,
      cursorField,
      expandHierarchy: false,
    });
    add(result.items);

    const nextCursor = result.nextCursor || "";
    if (!result.hasMore || result.items.length === 0 || !nextCursor || nextCursor === cursor) {
      complete = !result.hasMore || result.items.length === 0;
      break;
    }
    cursor = nextCursor;
    cursorField = result.cursorField || "";
  }

  const hierarchyResult = await hierarchyPage;
  if (hierarchyResult) add(hierarchyResult.items);

  if (entries.length === 0 && !complete) {
    throw new Error("Catalog params base is empty");
  }
  return { entries, complete, facets: buildProductParamFacets(entries.map((entry) => entry.params), []) };
};

const getBase = (query: CatalogParamsQuery) => {
  const key = buildBaseKey(query);
  const now = Date.now();
  const cached = baseCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = loadBase(query);
  baseCache.set(key, { expiresAt: now + BASE_TTL_MS, promise });
  void promise.then((base) => {
    // Empty contexts are valid (e.g. a producer with no fitting products),
    // but should stay retryable rather than pinning a transient empty set.
    if (!base.entries.length && baseCache.get(key)?.promise === promise) baseCache.delete(key);
  }, () => {});
  promise.catch(() => {
    if (baseCache.get(key)?.promise === promise) baseCache.delete(key);
  });
  if (baseCache.size > 200) {
    for (const [entryKey, entry] of baseCache) {
      if (entry.expiresAt <= now) baseCache.delete(entryKey);
    }
  }
  return promise;
};

export type CatalogParamsResult = {
  facets: ProductParamFacet[];
  totalCount: number;
  withParamsCount: number;
  matchCount: number;
  complete: boolean;
};

export const getCatalogParamFacets = async (
  query: CatalogParamsQuery,
  filters: ProductParamFilter[]
): Promise<CatalogParamsResult> => {
  // Schema belongs to the category, not to a particular search/car/producer.
  // Keep its fields, options and ranges stable while contextual counts change.
  const schemaQuery: CatalogParamsQuery = {
    ...query, producer: "", selectedCars: [], searchQuery: "", searchFilter: "all",
  };
  const [base, schemaBase] = await Promise.all([getBase(query), getBase(schemaQuery)]);
  const parsedList = base.entries.map((entry) => entry.params);
  const facets = schemaBase.facets.map((facet): ProductParamFacet => {
    const counts = new Map<string, number>();
    let count = 0;
    for (const params of parsedList) {
      const entry = params.get(facet.id);
      if (!entry || !matchesProductParamFilters(params, filters, facet.id)) continue;
      if (entry.numbers.length) count += 1;
      const values = new Set([...entry.choices.keys(), ...entry.numbers.map((number) => slugifyParamToken(formatParamNumber(number, entry.unit)))]);
      for (const id of values) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    if (facet.kind === "range") return { ...facet, count };
    return { ...facet, values: facet.values.map((option) => ({ ...option, count: counts.get(option.id) ?? 0 })) };
  });
  return {
    facets,
    totalCount: base.entries.length,
    withParamsCount: parsedList.filter((params) => params.size > 0).length,
    matchCount: filters.length
      ? parsedList.filter((params) => matchesProductParamFilters(params, filters)).length
      : base.entries.length,
    complete: base.complete && schemaBase.complete,
  };
};

const readPrice = (product: CatalogProduct) =>
  typeof product.priceEuro === "number" && Number.isFinite(product.priceEuro) && product.priceEuro > 0
    ? product.priceEuro
    : null;

export const getCatalogProductsMatchingParams = async (
  query: CatalogParamsQuery,
  filters: ProductParamFilter[],
  list: CatalogParamsListOptions
) => {
  const base = await getBase(query);
  const hasPriceRange = list.priceFrom !== null || list.priceTo !== null;
  const products = base.entries
    .filter((entry) => matchesProductParamFilters(entry.params, filters))
    .map((entry) => entry.product)
    .filter((product) => {
      if (list.inStock && !(product.inStock || (product.quantity ?? 0) > 0)) return false;
      const price = readPrice(product);
      if ((list.pricedOnly || hasPriceRange) && price === null) return false;
      if (price !== null && list.priceFrom !== null && price < list.priceFrom) return false;
      if (price !== null && list.priceTo !== null && price > list.priceTo) return false;
      return true;
    });

  if (list.sortOrder === "none") return products;
  const direction = list.sortOrder === "asc" ? 1 : -1;
  // Unpriced products go last in both directions, as in the 1C sort.
  return [...products].sort((a, b) => {
    const priceA = readPrice(a);
    const priceB = readPrice(b);
    if (priceA === null || priceB === null) return priceA === null ? (priceB === null ? 0 : 1) : -1;
    return (priceA - priceB) * direction;
  });
};
