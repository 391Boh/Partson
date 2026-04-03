import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import {
  fetchCatalogProductsByFacet,
  fetchCatalogProductsPage,
  type CatalogProduct,
} from "app/lib/catalog-server";
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

const normalizeSlug = (value: string) => decodeURIComponent(value || "").trim();

const toProductRouteKey = (item: ProductRouteFacetCandidate) =>
  `${(item.group || "").trim().toLowerCase()}::${(item.subGroup || "").trim().toLowerCase()}`;

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
    });

    if (batch.length === 0) break;

    const matchedProduct = findProductBySlugs(batch, groupSlug, nameSlug);
    if (matchedProduct) return matchedProduct;

    if (batch.length < PRODUCT_ROUTE_LOOKUP_PAGE_SIZE) break;
  }

  return null;
};

const resolveProductBySeoRouteUncached = async (
  rawGroupSlug: string,
  rawNameSlug: string
) => {
  const groupSlug = normalizeSlug(rawGroupSlug);
  const nameSlug = normalizeSlug(rawNameSlug);

  if (!groupSlug || !nameSlug) return null;

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
  if (!fallbackProduct) return null;

  const resolvedCode = fallbackProduct.code.trim() || fallbackProduct.article.trim();
  if (!resolvedCode) return null;

  return {
    code: resolvedCode,
  };
};

const resolveProductBySeoRouteCached = unstable_cache(
  async (groupSlug: string, nameSlug: string) =>
    resolveProductBySeoRouteUncached(groupSlug, nameSlug),
  [
    `product-route-v3-${PRODUCT_ROUTE_LOOKUP_PAGE_SIZE}-${PRODUCT_ROUTE_LOOKUP_MAX_PAGES}-${PRODUCT_ROUTE_LOOKUP_GLOBAL_MAX_PAGES}`,
  ],
  {
    revalidate: 60 * 60,
    tags: ["product-route"],
  }
);

export const resolveProductCodeFromSeoRoute = cache(
  async (groupSlug: string, nameSlug: string) => {
    const resolved = await resolveProductBySeoRouteCached(groupSlug, nameSlug);
    return resolved?.code || null;
  }
);
