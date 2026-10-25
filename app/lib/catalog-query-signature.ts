import type { CatalogSortOrder } from "app/lib/catalog-sort";

export type CatalogQuerySignatureInput = {
  normalizedSearch: string;
  vehicle?: string;
  searchFilter: string;
  selectedCars: string[];
  selectedCategories: string[];
  group: string | null;
  subcategory: string | null;
  producer: string | null;
  expandHierarchy?: boolean;
  promoOnly?: boolean;
  paramFilters?: string;
  sortOrder: CatalogSortOrder;
  pricedOnly?: boolean;
  withPhoto?: boolean;
  priceFrom?: number | null;
  priceTo?: number | null;
  priceRate?: number | null;
  inStock?: boolean;
};

export const buildCatalogQuerySignature = ({
  normalizedSearch,
  vehicle = "",
  searchFilter,
  selectedCars,
  selectedCategories,
  group,
  subcategory,
  producer,
  expandHierarchy = false,
  promoOnly = false,
  paramFilters = "",
  sortOrder,
  pricedOnly = false,
  withPhoto = false,
  priceFrom = null,
  priceTo = null,
  priceRate = null,
  inStock = false,
}: CatalogQuerySignatureInput) =>
  JSON.stringify({
    q: normalizedSearch,
    ...(vehicle ? { vehicle } : {}),
    filter: searchFilter,
    cars: selectedCars,
    cats: selectedCategories,
    group,
    subcat: subcategory,
    producer,
    hierarchy: expandHierarchy,
    promoOnly,
    sort: sortOrder,
    pricedOnly,
    priceFrom,
    priceTo,
    priceRate,
    inStock,
    // Only present when on, so an unfiltered signature stays byte-identical
    // to the server-rendered initial payload's.
    ...(withPhoto ? { withPhoto: true } : {}),
    // Only present when set, so signatures without the "Параметри" filter
    // stay byte-identical to the server-rendered initial payload's.
    ...(paramFilters ? { params: paramFilters } : {}),
  });
