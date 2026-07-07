import "server-only";

import type { CatalogProduct } from "app/lib/catalog-server";

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

export const normalizeHierarchyKey = (value: string | null | undefined) =>
  normalizeValue(value).toLocaleLowerCase("uk-UA");

export type ResolvedProductHierarchy = {
  // "" when this product carries no real top-level Категорія tier — its
  // Група/Підгруппа pair is the whole story for that product.
  category: string;
  group: string;
  subgroup: string;
};

/**
 * Reconstructs the true Категорія → Группа → Підгруппа tier for a product.
 *
 * product.group / product.subGroup must stay exactly as 1C stored them —
 * fetchCatalogProductsByQuery filters by an *exact* match against those raw
 * values (GROUP_FIELDS / SUBGROUP_FIELDS), so anything used as a "group" or
 * "subgroup" facet must be the literal raw value or its catalog link breaks.
 * Категорія is purely a display-only outer wrapper: it groups several
 * Группа facets together in the UI but is never itself sent as a filter, so
 * it's safe to just read it as-is (no reordering against the navigation tree
 * — reordering would swap in a value that no longer matches any real product
 * tag and silently break the "Відкрити групу" link).
 *
 * This is the single source of truth for the hierarchy — both the SEO facet
 * snapshot builder and the manufacturer page's live fallback must resolve
 * products through this function so they never disagree with each other.
 */
export const resolveProductCategoryHierarchy = (
  product: Pick<CatalogProduct, "group" | "subGroup" | "category">
): ResolvedProductHierarchy => {
  const rawGroup = normalizeValue(product.group);
  const rawSubgroup = normalizeValue(product.subGroup);
  const rawCategory = normalizeValue(product.category);

  const sameAsGroup =
    rawCategory && rawGroup && normalizeHierarchyKey(rawCategory) === normalizeHierarchyKey(rawGroup);

  if (!rawCategory || sameAsGroup) {
    return { category: "", group: rawGroup, subgroup: rawSubgroup };
  }

  return { category: rawCategory, group: rawGroup, subgroup: rawSubgroup };
};
