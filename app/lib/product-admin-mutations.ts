"use client";

// The 1C update payload/endpoint logic below was independently re-implemented
// in Data.tsx's catalog-grid save handler and three separate places in
// ProductPageAdminEditPanel.tsx (name/price/category save, description save,
// quantity change) — same field mapping, same two endpoints, same error
// formatting, copy-pasted four times. Centralized here; each caller still
// owns its own post-save side effects (local state/cache updates), since
// those differ per surface.

export type ProductAdminEditFields = {
  description?: string;
  priceEuro?: number;
  costPriceEuro?: number;
  promoPriceEuro?: number;
  imageDataUrl?: string;
  imageName?: string;
  name?: string;
  catalogNumber?: string;
  producer?: string;
  group?: string;
  subGroup?: string;
  category?: string;
  receipt?: number;
  sale?: number;
};

export type ProductAdminMutationResult = {
  ok: boolean;
  error?: string;
  details?: string;
  code?: string;
  Код?: string;
  priceEuro?: number;
  costPriceEuro?: number;
  promoPriceEuro?: number;
  ЦінаПрод?: number;
  ЦінаЗакуп?: number;
  Акція?: number;
  name?: string;
  catalogNumber?: string;
  quantity?: number;
};

const normalizeAdminResult = (
  payload: ProductAdminMutationResult
): ProductAdminMutationResult => ({
  ...payload,
  error: payload.ok
    ? payload.error
    : [payload.error, payload.details].filter(Boolean).join(": ") || "Помилка збереження",
});

// One or two requests fire depending on which fields are present: description
// goes to its own endpoint (keyed by article, not the internal code), every
// other field goes to /api/product-update.
export async function saveProductAdminFields(
  code: string,
  article: string,
  data: ProductAdminEditFields,
  token: string
): Promise<{ ok: boolean; error?: string; results: ProductAdminMutationResult[] }> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const tasks: Array<Promise<ProductAdminMutationResult>> = [];

  if (data.description !== undefined) {
    // description endpoint uses НомерПоКаталогу (= article), not internal Код
    tasks.push(
      fetch("/api/product-update-description", {
        method: "POST",
        headers,
        body: JSON.stringify({ article, description: data.description }),
      })
        .then((r) => r.json() as Promise<ProductAdminMutationResult>)
        .then(normalizeAdminResult)
        .catch(() => ({ ok: false, error: "Помилка мережі (опис)" }))
    );
  }

  if (
    data.priceEuro !== undefined ||
    data.costPriceEuro !== undefined ||
    data.promoPriceEuro !== undefined ||
    data.imageDataUrl ||
    data.name !== undefined ||
    data.catalogNumber !== undefined ||
    data.producer !== undefined ||
    data.group !== undefined ||
    data.subGroup !== undefined ||
    data.category !== undefined ||
    data.receipt !== undefined ||
    data.sale !== undefined
  ) {
    // article (НомерПоКаталогу) is required by ОбновитьТовар for product lookup.
    // Send Код (internal code) + article (current catalog number) on every request.
    const productUpdateBody: Record<string, unknown> = { Код: code };
    if (article) productUpdateBody.article = article;
    if (data.priceEuro !== undefined) productUpdateBody["ЦінаПрод"] = data.priceEuro;
    if (data.costPriceEuro !== undefined) productUpdateBody["ЦінаЗакуп"] = data.costPriceEuro;
    if (data.promoPriceEuro !== undefined) productUpdateBody["Акція"] = data.promoPriceEuro;
    if (data.imageDataUrl) {
      productUpdateBody.imageDataUrl = data.imageDataUrl;
      if (data.imageName) productUpdateBody.file_name = data.imageName;
    }
    if (data.name !== undefined) productUpdateBody["Наименование"] = data.name;
    if (data.catalogNumber !== undefined) productUpdateBody["НомерПоКаталогу"] = data.catalogNumber;
    if (data.producer !== undefined) productUpdateBody.producer = data.producer;
    if (data.group !== undefined) productUpdateBody.group = data.group;
    if (data.subGroup !== undefined) productUpdateBody.subGroup = data.subGroup;
    if (data.category !== undefined) productUpdateBody.category = data.category;
    if (data.receipt !== undefined) productUpdateBody["Поступлення"] = data.receipt;
    if (data.sale !== undefined) productUpdateBody["Реалізація"] = data.sale;
    tasks.push(
      fetch("/api/product-update", {
        method: "POST",
        headers,
        body: JSON.stringify(productUpdateBody),
      })
        .then((r) => r.json() as Promise<ProductAdminMutationResult>)
        .then(normalizeAdminResult)
        .catch(() => ({ ok: false, error: "Помилка мережі (товар)" }))
    );
  }

  if (tasks.length === 0) return { ok: true, results: [] };

  const results = await Promise.all(tasks);
  const failed = results.find((r) => !r.ok);
  return { ok: !failed, error: failed?.error, results };
}
