import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import {
  fetchCatalogProductsByFacet,
  fetchCatalogProductsPage,
  type CatalogProduct,
} from "app/lib/catalog-server";
import { getAllProductSitemapEntries } from "app/lib/product-sitemap";
import { getProductTreeDataset } from "app/lib/product-tree";
import {
  buildProductGroupLabel,
  buildProductGroupSlug,
  buildLegacyProductNameSlug,
  buildLegacyProductSeoName,
  buildProductNameSlug,
} from "app/lib/product-url";
import { buildSeoSlug } from "app/lib/seo-slug";

type ProductRouteFacetCandidate = {
  group?: string;
  subGroup?: string;
};

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const PRODUCT_ROUTE_LOOKUP_PAGE_SIZE = parsePositiveInt(
  process.env.PRODUCT_ROUTE_LOOKUP_PAGE_SIZE,
  80
);
const PRODUCT_ROUTE_LOOKUP_MAX_PAGES = parsePositiveInt(
  process.env.PRODUCT_ROUTE_LOOKUP_MAX_PAGES,
  12
);
const PRODUCT_ROUTE_LOOKUP_GLOBAL_MAX_PAGES = parsePositiveInt(
  process.env.PRODUCT_ROUTE_LOOKUP_GLOBAL_MAX_PAGES,
  40
);
const PRODUCT_ROUTE_LOOKUP_REQUEST_TIMEOUT_MS = parsePositiveInt(
  process.env.PRODUCT_ROUTE_LOOKUP_REQUEST_TIMEOUT_MS,
  1200
);

const normalizeSlug = (value: string) => decodeURIComponent(value || "").trim();

const toProductRouteKey = (item: ProductRouteFacetCandidate) =>
  `${(item.group || "").trim().toLowerCase()}::${(item.subGroup || "").trim().toLowerCase()}`;

const setUniqueRouteCode = (
  map: Map<string, string>,
  duplicates: Set<string>,
  rawKey: string,
  rawCode: string
) => {
  const key = normalizeSlug(rawKey).toLowerCase();
  const code = normalizeSlug(rawCode);
  if (!key || !code || duplicates.has(key)) return;

  const existing = map.get(key);
  if (!existing) {
    map.set(key, code);
    return;
  }

  if (existing.toLowerCase() === code.toLowerCase()) return;

  map.delete(key);
  duplicates.add(key);
};

const findProductBySlugs = (
  items: CatalogProduct[],
  groupSlug: string,
  nameSlug: string
) => {
  let prefixMatchedProduct: CatalogProduct | null = null;

  for (const item of items) {
    const itemCode = item.code.trim() || item.article.trim();
    if (!itemCode) continue;

    const currentGroupSlug = buildProductGroupSlug(item);
    const currentNameSlug = buildProductNameSlug(item);
    const legacyPlainNameSlug = buildLegacyProductNameSlug(item);
    const legacyGroupSlug = buildSeoSlug(buildProductGroupLabel(item));
    const legacyNameSlug = buildSeoSlug(buildLegacyProductSeoName(item));
    const matchesCurrent =
      currentGroupSlug === groupSlug && currentNameSlug === nameSlug;
    const matchesCurrentLegacyPlain =
      currentGroupSlug === groupSlug && legacyPlainNameSlug === nameSlug;
    const matchesLegacy =
      legacyGroupSlug === groupSlug && legacyNameSlug === nameSlug;

    if (matchesCurrent || matchesCurrentLegacyPlain || matchesLegacy) {
      return item;
    }

    const matchesCanonicalPrefix =
      currentGroupSlug === groupSlug &&
      currentNameSlug.startsWith(`${nameSlug}-`);
    const matchesLegacyPrefix =
      currentGroupSlug === groupSlug &&
      legacyPlainNameSlug.startsWith(`${nameSlug}-`);

    if (!matchesCanonicalPrefix && !matchesLegacyPrefix) continue;

    if (!prefixMatchedProduct) {
      prefixMatchedProduct = item;
    }
  }

  return prefixMatchedProduct;
};

const findProductByNameSlug = (items: CatalogProduct[], nameSlug: string) => {
  let prefixMatchedProduct: CatalogProduct | null = null;

  for (const item of items) {
    const itemCode = item.code.trim() || item.article.trim();
    if (!itemCode) continue;

    const currentNameSlug = buildProductNameSlug(item);
    const legacyPlainNameSlug = buildLegacyProductNameSlug(item);
    const legacyNameSlug = buildSeoSlug(buildLegacyProductSeoName(item));
    const matchesCurrent = currentNameSlug === nameSlug;
    const matchesCurrentLegacyPlain = legacyPlainNameSlug === nameSlug;
    const matchesLegacy = legacyNameSlug === nameSlug;

    if (matchesCurrent || matchesCurrentLegacyPlain || matchesLegacy) {
      return item;
    }

    const matchesCanonicalPrefix = currentNameSlug.startsWith(`${nameSlug}-`);
    const matchesLegacyPrefix =
      legacyPlainNameSlug.startsWith(`${nameSlug}-`) ||
      legacyNameSlug.startsWith(`${nameSlug}-`);

    if (!matchesCanonicalPrefix && !matchesLegacyPrefix) continue;

    if (!prefixMatchedProduct) {
      prefixMatchedProduct = item;
    }
  }

  return prefixMatchedProduct;
};

const getProductRouteIndex = unstable_cache(
  async () => {
    const entries = await getAllProductSitemapEntries().catch(() => []);
    const direct = new Map<string, string>();
    const prefix = new Map<string, string>();
    const directNameOnly = new Map<string, string>();
    const prefixNameOnly = new Map<string, string>();
    const directNameOnlyDuplicates = new Set<string>();
    const prefixNameOnlyDuplicates = new Set<string>();

    for (const entry of entries) {
      const code = (entry.code || "").trim() || (entry.article || "").trim();
      if (!code) continue;

      const groupSlug = buildProductGroupSlug(entry);
      const canonicalNameSlug = buildProductNameSlug(entry);
      const legacyPlainNameSlug = buildLegacyProductNameSlug(entry);
      const legacyGroupSlug = buildSeoSlug(buildProductGroupLabel(entry));
      const legacyNameSlug = buildSeoSlug(buildLegacyProductSeoName(entry));

      const directKeys = [
        `${groupSlug}::${canonicalNameSlug}`,
        `${groupSlug}::${legacyPlainNameSlug}`,
        `${legacyGroupSlug}::${legacyNameSlug}`,
      ];

      for (const key of directKeys) {
        if (!key.includes("::")) continue;
        if (!direct.has(key)) {
          direct.set(key, code);
        }
      }

      for (const key of [canonicalNameSlug, legacyPlainNameSlug, legacyNameSlug]) {
        setUniqueRouteCode(directNameOnly, directNameOnlyDuplicates, key, code);
      }

      const prefixCandidates = [
        `${groupSlug}::${canonicalNameSlug}`,
        `${groupSlug}::${legacyPlainNameSlug}`,
      ];

      const nameOnlyPrefixCandidates = [canonicalNameSlug, legacyPlainNameSlug, legacyNameSlug];

      for (const fullKey of prefixCandidates) {
        const separatorIndex = fullKey.indexOf("::");
        if (separatorIndex === -1) continue;
        const fullNameSlug = fullKey.slice(separatorIndex + 2);
        const fullGroupSlug = fullKey.slice(0, separatorIndex);
        const parts = fullNameSlug.split("-").filter(Boolean);

        for (let length = parts.length - 1; length >= 2; length -= 1) {
          const prefixKey = `${fullGroupSlug}::${parts.slice(0, length).join("-")}`;
          if (!prefix.has(prefixKey)) {
            prefix.set(prefixKey, code);
          }
        }
      }

      for (const fullNameSlug of nameOnlyPrefixCandidates) {
        const parts = fullNameSlug.split("-").filter(Boolean);

        for (let length = parts.length - 1; length >= 2; length -= 1) {
          const prefixKey = parts.slice(0, length).join("-");
          setUniqueRouteCode(prefixNameOnly, prefixNameOnlyDuplicates, prefixKey, code);
        }
      }
    }

    return { direct, prefix, directNameOnly, prefixNameOnly };
  },
  ["product-route:index-v5-short-name-article"],
  {
    revalidate: 60 * 60,
    tags: ["product-route", "product-sitemap"],
  }
);

const collectFacetCandidates = cache(async (groupSlug: string) => {
  const dataset = await getProductTreeDataset().catch(() => null);
  if (!dataset) return [] as ProductRouteFacetCandidate[];

  const candidates: ProductRouteFacetCandidate[] = [];
  const seen = new Set<string>();
  const pushCandidate = (candidate: ProductRouteFacetCandidate) => {
    const key = toProductRouteKey(candidate);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  for (const group of dataset.groups) {
    if (buildProductGroupSlug({ group: group.label }) === groupSlug) {
      pushCandidate({ group: group.label });
    }
    if (buildSeoSlug(group.label) === groupSlug) {
      pushCandidate({ group: group.label });
    }

    for (const subgroup of group.subgroups) {
      if (
        buildProductGroupSlug({
          group: group.label,
          subGroup: subgroup.label,
        }) === groupSlug
      ) {
        pushCandidate({
          group: group.label,
          subGroup: subgroup.label,
        });
      }
      if (buildSeoSlug(`${group.label}-${subgroup.label}`) === groupSlug) {
        pushCandidate({
          group: group.label,
          subGroup: subgroup.label,
        });
      }

      for (const child of subgroup.children) {
        if (
          buildProductGroupSlug({
            group: group.label,
            subGroup: child.label,
          }) === groupSlug
        ) {
          pushCandidate({
            group: group.label,
            subGroup: child.label,
          });
        }
        if (buildSeoSlug(`${group.label}-${child.label}`) === groupSlug) {
          pushCandidate({
            group: group.label,
            subGroup: child.label,
          });
        }
      }
    }
  }

  return candidates;
});

const scanFacetCandidate = async (
  candidate: ProductRouteFacetCandidate,
  groupSlug: string,
  nameSlug: string
) => {
  for (let page = 1; page <= PRODUCT_ROUTE_LOOKUP_MAX_PAGES; page += 1) {
    const batch = await fetchCatalogProductsByFacet({
      group: candidate.group,
      subGroup: candidate.subGroup,
      page,
      limit: PRODUCT_ROUTE_LOOKUP_PAGE_SIZE,
    });

    if (batch.length === 0) break;

    const matchedProduct = findProductBySlugs(batch, groupSlug, nameSlug);
    if (matchedProduct) return matchedProduct;

    if (batch.length < PRODUCT_ROUTE_LOOKUP_PAGE_SIZE) break;
  }

  return null;
};

const scanGlobalCatalog = async (groupSlug: string, nameSlug: string) => {
  for (let page = 1; page <= PRODUCT_ROUTE_LOOKUP_GLOBAL_MAX_PAGES; page += 1) {
    const batch = await fetchCatalogProductsPage({
      page,
      limit: PRODUCT_ROUTE_LOOKUP_PAGE_SIZE,
      timeoutMs: PRODUCT_ROUTE_LOOKUP_REQUEST_TIMEOUT_MS,
      retries: 0,
      retryDelayMs: 100,
      cacheTtlMs: 1000 * 60 * 5,
      includePriceEnrichment: false,
    });

    if (batch.length === 0) break;

    const matchedProduct = findProductBySlugs(batch, groupSlug, nameSlug);
    if (matchedProduct) return matchedProduct;

    if (batch.length < PRODUCT_ROUTE_LOOKUP_PAGE_SIZE) break;
  }

  return null;
};

const scanGlobalCatalogByNameSlug = async (nameSlug: string) => {
  for (let page = 1; page <= PRODUCT_ROUTE_LOOKUP_GLOBAL_MAX_PAGES; page += 1) {
    const batch = await fetchCatalogProductsPage({
      page,
      limit: PRODUCT_ROUTE_LOOKUP_PAGE_SIZE,
      timeoutMs: PRODUCT_ROUTE_LOOKUP_REQUEST_TIMEOUT_MS,
      retries: 0,
      retryDelayMs: 100,
      cacheTtlMs: 1000 * 60 * 5,
      includePriceEnrichment: false,
    });

    if (batch.length === 0) break;

    const matchedProduct = findProductByNameSlug(batch, nameSlug);
    if (matchedProduct) return matchedProduct;

    if (batch.length < PRODUCT_ROUTE_LOOKUP_PAGE_SIZE) break;
  }

  return null;
};

const resolveProductByNameSlugUncached = async (rawNameSlug: string) => {
  const nameSlug = normalizeSlug(rawNameSlug);
  if (!nameSlug) return null;

  const indexedRoutes = await getProductRouteIndex().catch(() => null);
  const indexedCode =
    indexedRoutes?.directNameOnly.get(nameSlug.toLowerCase()) ||
    indexedRoutes?.prefixNameOnly.get(nameSlug.toLowerCase()) ||
    null;
  if (indexedCode) {
    return { code: indexedCode };
  }

  const fallbackProduct = await scanGlobalCatalogByNameSlug(nameSlug);
  if (!fallbackProduct) return null;

  const resolvedCode = fallbackProduct.code.trim() || fallbackProduct.article.trim();
  if (!resolvedCode) return null;

  return {
    code: resolvedCode,
  };
};

const resolveProductBySeoRouteUncached = async (
  rawGroupSlug: string,
  rawNameSlug: string
) => {
  const groupSlug = normalizeSlug(rawGroupSlug);
  const nameSlug = normalizeSlug(rawNameSlug);

  if (!groupSlug || !nameSlug) return null;

  const indexedRoutes = await getProductRouteIndex().catch(() => null);
  const routeKey = `${groupSlug}::${nameSlug}`;
  const indexedCode =
    indexedRoutes?.direct.get(routeKey) || indexedRoutes?.prefix.get(routeKey) || null;
  if (indexedCode) {
    return { code: indexedCode };
  }

  const indexedNameOnlyCode =
    indexedRoutes?.directNameOnly.get(nameSlug.toLowerCase()) ||
    indexedRoutes?.prefixNameOnly.get(nameSlug.toLowerCase()) ||
    null;
  if (indexedNameOnlyCode) {
    return { code: indexedNameOnlyCode };
  }

  const facetCandidates = await collectFacetCandidates(groupSlug);
  for (const candidate of facetCandidates) {
    const matchedProduct = await scanFacetCandidate(candidate, groupSlug, nameSlug);
    if (!matchedProduct) continue;

    const resolvedCode = matchedProduct.code.trim() || matchedProduct.article.trim();
    if (!resolvedCode) continue;

    return {
      code: resolvedCode,
    };
  }

  const fallbackProduct = await scanGlobalCatalog(groupSlug, nameSlug);
  if (fallbackProduct) {
    const resolvedCode = fallbackProduct.code.trim() || fallbackProduct.article.trim();
    if (resolvedCode) {
      return {
        code: resolvedCode,
      };
    }
  }

  return resolveProductByNameSlugUncached(nameSlug);

};

const resolveProductByNameSlugCached = unstable_cache(
  async (nameSlug: string) => resolveProductByNameSlugUncached(nameSlug),
  [
    `product-route-name-v5-short-name-article-${PRODUCT_ROUTE_LOOKUP_PAGE_SIZE}-${PRODUCT_ROUTE_LOOKUP_GLOBAL_MAX_PAGES}-${PRODUCT_ROUTE_LOOKUP_REQUEST_TIMEOUT_MS}`,
  ],
  {
    revalidate: 60 * 60,
    tags: ["product-route"],
  }
);

const resolveProductBySeoRouteCached = unstable_cache(
  async (groupSlug: string, nameSlug: string) =>
    resolveProductBySeoRouteUncached(groupSlug, nameSlug),
  [
    `product-route-v9-short-name-article-${PRODUCT_ROUTE_LOOKUP_PAGE_SIZE}-${PRODUCT_ROUTE_LOOKUP_MAX_PAGES}-${PRODUCT_ROUTE_LOOKUP_GLOBAL_MAX_PAGES}-${PRODUCT_ROUTE_LOOKUP_REQUEST_TIMEOUT_MS}`,
  ],
  {
    revalidate: 60 * 60,
    tags: ["product-route"],
  }
);

export const resolveProductCodeFromSeoRoute = cache(
  async (groupSlug: string, nameSlug: string) => {
    const resolved = await resolveProductBySeoRouteCached(groupSlug, nameSlug);
    if (resolved?.code) {
      return resolved.code;
    }

    const uncachedResolved = await resolveProductBySeoRouteUncached(
      groupSlug,
      nameSlug
    ).catch(() => null);
    return uncachedResolved?.code || null;
  }
);

export const resolveProductCodeFromNameSlug = cache(async (nameSlug: string) => {
  const resolved = await resolveProductByNameSlugCached(nameSlug);
  if (resolved?.code) {
    return resolved.code;
  }

  const uncachedResolved = await resolveProductByNameSlugUncached(nameSlug).catch(
    () => null
  );
  return uncachedResolved?.code || null;
});
