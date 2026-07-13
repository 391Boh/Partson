import "server-only";

import type { SeoFacetItem, SeoGroupFacet } from "app/lib/catalog-seo";
import type { ProductTreeGroup } from "app/lib/product-tree";
import { buildPlainSeoSlug } from "app/lib/seo-slug";

type LookupTarget = {
  label: string;
  slug?: string;
  legacySlug?: string;
  plainSlug?: string;
};

type LookupItem<T extends { label: string; slug: string }> = T &
  Partial<{ plainSlug: string }>;

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const normalizeLookupKey = (value: string | null | undefined) =>
  normalizeValue(value).toLocaleLowerCase("uk-UA");

const toPositiveInt = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
};

const buildLookupKeys = ({
  label,
  slug,
  legacySlug,
  plainSlug,
}: LookupTarget) => {
  const normalizedLabel = normalizeValue(label);
  return Array.from(
    new Set(
      [
        normalizeLookupKey(normalizedLabel),
        normalizeLookupKey(buildPlainSeoSlug(normalizedLabel)),
        normalizeLookupKey(slug),
        normalizeLookupKey(legacySlug),
        normalizeLookupKey(plainSlug),
      ].filter(Boolean)
    )
  );
};

const buildFacetLookup = <T extends { label: string; slug: string }>(
  items: Array<LookupItem<T>>
) => {
  const lookup = new Map<string, LookupItem<T>>();

  for (const item of items) {
    for (const key of buildLookupKeys(item)) {
      if (!lookup.has(key)) {
        lookup.set(key, item);
      }
    }
  }

  return lookup;
};

const findFacetMatch = <T extends { label: string; slug: string }>(
  lookup: Map<string, LookupItem<T>>,
  target: LookupTarget
) => {
  for (const key of buildLookupKeys(target)) {
    const match = lookup.get(key);
    if (match) return match;
  }

  return null;
};

export const buildSeoGroupLookup = (groups: SeoGroupFacet[]) => buildFacetLookup(groups);

export const resolveGroupSeoCounts = (
  group: ProductTreeGroup,
  groupLookup: Map<string, LookupItem<SeoGroupFacet>>
) => {
  const directGroupFacet = findFacetMatch(groupLookup, group);
  const directSubgroupLookup = buildFacetLookup<SeoFacetItem>(
    directGroupFacet?.subgroups ?? []
  );
  const subgroupProductCounts = new Map<string, number>();
  const childProductCounts = new Map<string, number>();

  let subgroupProductsTotal = 0;

  for (const subgroup of group.subgroups) {
    // The product tree may contain an outer display category (for example
    // "Гальмівна система"), while SEO facets use the actual 1C group
    // ("Гальмівні колодки") as their top level. Match both layouts.
    const rootSubgroupFacet = findFacetMatch(groupLookup, subgroup);
    const nestedSubgroupFacet = findFacetMatch(directSubgroupLookup, subgroup);
    const subgroupFacet = rootSubgroupFacet ?? nestedSubgroupFacet;
    const childLookup = buildFacetLookup<SeoFacetItem>(
      rootSubgroupFacet?.subgroups ?? []
    );
    let childrenProductsTotal = 0;

    for (const child of subgroup.children ?? []) {
      const childFacet = findFacetMatch(childLookup, child);
      const childProductCount = toPositiveInt(childFacet?.productCount);
      childProductCounts.set(child.slug, childProductCount);
      childrenProductsTotal += childProductCount;
    }

    // A facet group's productCount already includes its nested subgroups.
    // Math.max keeps a useful fallback for legacy snapshots without a parent
    // total while avoiding double-counting current snapshots.
    const productCount = Math.max(
      toPositiveInt(subgroupFacet?.productCount),
      childrenProductsTotal
    );

    subgroupProductCounts.set(subgroup.slug, productCount);
    subgroupProductsTotal += productCount;
  }

  return {
    productCount: Math.max(
      toPositiveInt(directGroupFacet?.productCount),
      subgroupProductsTotal
    ),
    subgroupsCount: Math.max(
      Array.isArray(directGroupFacet?.subgroups)
        ? directGroupFacet.subgroups.length
        : 0,
      group.subgroups.length
    ),
    subgroupProductCounts,
    childProductCounts,
  };
};
