export type CatalogQuerySignatureInput = {
  normalizedSearch: string;
  searchFilter: string;
  selectedCars: string[];
  selectedCategories: string[];
  group: string | null;
  subcategory: string | null;
  producer: string | null;
  sortOrder: "none" | "asc" | "desc";
};

export const buildCatalogQuerySignature = ({
  normalizedSearch,
  searchFilter,
  selectedCars,
  selectedCategories,
  group,
  subcategory,
  producer,
  sortOrder,
}: CatalogQuerySignatureInput) =>
  JSON.stringify({
    q: normalizedSearch,
    filter: searchFilter,
    cars: selectedCars,
    cats: selectedCategories,
    group,
    subcat: subcategory,
    producer,
    sort: sortOrder,
  });
