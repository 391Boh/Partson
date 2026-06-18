export type CatalogQuerySignatureInput = {
  normalizedSearch: string;
  searchFilter: string;
  selectedCars: string[];
  selectedCategories: string[];
  group: string | null;
  subcategory: string | null;
  producer: string | null;
  expandHierarchy?: boolean;
  sortOrder: "none" | "asc" | "desc";
  pricedOnly?: boolean;
  priceFrom?: number | null;
  priceTo?: number | null;
  inStock?: boolean;
};

export const buildCatalogQuerySignature = ({
  normalizedSearch,
  searchFilter,
  selectedCars,
  selectedCategories,
  group,
  subcategory,
  producer,
  expandHierarchy = false,
  sortOrder,
  pricedOnly = false,
  priceFrom = null,
  priceTo = null,
  inStock = false,
}: CatalogQuerySignatureInput) =>
  JSON.stringify({
    q: normalizedSearch,
    filter: searchFilter,
    cars: selectedCars,
    cats: selectedCategories,
    group,
    subcat: subcategory,
    producer,
    hierarchy: expandHierarchy,
    sort: sortOrder,
    pricedOnly,
    priceFrom,
    priceTo,
    inStock,
  });
