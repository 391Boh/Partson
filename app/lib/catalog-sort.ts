// Catalog sort as the client keeps it (state, localStorage, /api/catalog-page
// body): "asc"/"desc" sort by price, "name_asc"/"name_desc" alphabetically.
export type CatalogSortOrder = "none" | "asc" | "desc" | "name_asc" | "name_desc";

export const CATALOG_SORT_ORDERS: readonly CatalogSortOrder[] = ["none", "asc", "desc", "name_asc", "name_desc"];

export const isCatalogSortOrder = (value: unknown): value is CatalogSortOrder =>
  typeof value === "string" && (CATALOG_SORT_ORDERS as readonly string[]).includes(value);

// The price-only view of the sort: client-side price re-sorting, page-size
// and "sorted without cursor" logic apply to price sort only. Name order is
// produced and paged by 1C like the default order.
export const priceSortOrder = (sort: CatalogSortOrder): "none" | "asc" | "desc" =>
  sort === "asc" || sort === "desc" ? sort : "none";

export const CATALOG_SORT_LABELS: Record<CatalogSortOrder, string> = {
  none: "Без сортування",
  asc: "Ціна: від низької",
  desc: "Ціна: від високої",
  name_asc: "Назва: А → Я",
  name_desc: "Назва: Я → А",
};
