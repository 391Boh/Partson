import { formatCatalogLabel } from "app/lib/catalog-label-format";
import { buildVisibleProductName } from "app/lib/product-url";

export const isAccessoriesCatalogGroup = (label: string) =>
  label.trim().toLocaleLowerCase("uk-UA") === "інше";

// Display only: 1C filters and canonical paths retain the original label.
export const buildVisibleCatalogGroupName = (label: string) =>
  isAccessoriesCatalogGroup(label)
    ? "Автоаксесуари та інструмент"
    : formatCatalogLabel(buildVisibleProductName(label));
