// Shared by KatalogClientPage's local-restore layout effect and the inline
// pre-paint script in app/katalog/page.tsx: both must agree on whether the
// browser's saved catalog state will change the request the server rendered.
//
// Written as a self-contained function (no imports, no syntax that a
// compiler would rewrite with helpers) because page.tsx inlines its source
// via Function.prototype.toString.
export const CATALOG_RESTORE_STYLE_ID = "catalog-restore-pending";
export const CATALOG_RESULTS_ATTRIBUTE = "data-catalog-results";
// Mirrors the grid/list preference from localStorage so the server can render
// the first page in the layout this browser will show.
export const CATALOG_VIEW_MODE_COOKIE = "partson_catalog_view";

export function detectCatalogRestoreOverride(
  search: string,
  storage: Pick<Storage, "getItem"> | null
): boolean {
  const params = new URLSearchParams(search || "");
  const reset = params.get("reset");
  if (reset === "1" || reset === "search") return true;
  if (!storage) return false;

  const sort = storage.getItem("partson:catalogSortOrder");
  if (sort === "asc" || sort === "desc") return true;

  try {
    const cars = JSON.parse(storage.getItem("partson:selectedCars") || "[]");
    if (Array.isArray(cars)) {
      for (let i = 0; i < cars.length; i += 1) {
        if (typeof cars[i] === "string" && cars[i].trim() !== "") return true;
      }
    }
  } catch (error) {
    void error;
  }

  try {
    const selection = JSON.parse(storage.getItem("partson:selectedCarSelection") || "null");
    if (
      selection &&
      typeof selection === "object" &&
      typeof selection.brand === "string" &&
      selection.brand.trim() &&
      typeof selection.model === "string" &&
      selection.model.trim() &&
      typeof selection.label === "string" &&
      selection.label.trim()
    ) {
      return true;
    }
  } catch (error) {
    void error;
  }

  return false;
}
