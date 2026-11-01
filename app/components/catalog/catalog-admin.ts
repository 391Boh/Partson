"use client";

import { saveProductAdminFields } from "app/lib/product-admin-mutations";
import type { ProductAdminEditFields } from "app/lib/product-admin-mutations";
import { invalidateCatalogClientCache } from "app/lib/catalog-client-cache";
import { clearBrowserCatalogCache } from "./catalog-cache";
import type { useCatalogData } from "./useCatalogData";

type CatalogUpdates = Pick<ReturnType<typeof useCatalogData>, "updateCatalogItemPrice" | "updateCatalogItemFields">;

/** Loaded only for an actual edit; apply confirmed values without refetching the grid. */
export async function saveCatalogAdminEdit(
  code: string,
  article: string,
  data: ProductAdminEditFields,
  token: string,
  { updateCatalogItemPrice, updateCatalogItemFields }: CatalogUpdates
): Promise<{ ok: boolean; error?: string; quantity?: number }> {
  const { results } = await saveProductAdminFields(code, article, data, token);
  if (results.length === 0) return { ok: true };
  const failed = results.find((r) => !r.ok);

  // Update price in local cache using confirmed values from 1C
  const priceResult = results.find(
    (r) =>
      r.ok &&
      (r.ЦінаПрод !== undefined ||
        r.ЦінаЗакуп !== undefined ||
        r.priceEuro !== undefined ||
        r.costPriceEuro !== undefined)
  );
  if (priceResult) {
    updateCatalogItemPrice({
      code: priceResult.code || code,
      Код: priceResult.Код || code,
      ЦінаПрод: priceResult.ЦінаПрод,
      ЦінаЗакуп: priceResult.ЦінаЗакуп,
      priceEuro: priceResult.priceEuro,
      costPriceEuro: priceResult.costPriceEuro,
    });
  }

  // Update local catalog item with all confirmed values from 1C
  if (!failed) {
    const updateResult = results.find((r) => r.ok);
    const confirmedName = updateResult?.name ?? data.name;
    const confirmedArticle = updateResult?.catalogNumber ?? data.catalogNumber;
    const fieldsToUpdate: { name?: string; article?: string; group?: string; subGroup?: string; category?: string; producer?: string } = {};
    if (confirmedName) fieldsToUpdate.name = confirmedName;
    if (confirmedArticle) fieldsToUpdate.article = confirmedArticle;
    if (data.group !== undefined) fieldsToUpdate.group = data.group;
    if (data.subGroup !== undefined) fieldsToUpdate.subGroup = data.subGroup;
    if (data.category !== undefined) fieldsToUpdate.category = data.category;
    if (data.producer !== undefined) fieldsToUpdate.producer = data.producer;
    if (Object.keys(fieldsToUpdate).length) {
      updateCatalogItemFields(code, fieldsToUpdate);
    }
    const qtyResult = results.find((r) => r.ok && r.quantity !== undefined);
    if (qtyResult?.quantity !== undefined) {
      updateCatalogItemFields(code, { quantity: qtyResult.quantity });
    }
    // Clear browser page cache so the next filter/scroll fetch hits 1C fresh.
    // router.refresh() is intentionally NOT called: it would trigger a slow
    // catalog re-fetch (empty cache → full 1C round-trip) and overwrite the
    // optimistic update that is already visible via updateCatalogItemFields above.
    clearBrowserCatalogCache();
    invalidateCatalogClientCache({ code, ...(qtyResult?.quantity !== undefined ? { quantity: qtyResult.quantity } : {}) });
  }

  return failed ?? { ok: true, quantity: results.find((r) => r.ok && r.quantity !== undefined)?.quantity };
}
