import "server-only";

import { fetchConfirmedEuroRate, fetchFullCatalogProducts, toPriceUah } from "app/lib/catalog-server";
import { fixCatalogSpelling } from "app/lib/catalog-label-format";
import { getMerchantGalleryImages } from "app/lib/google-merchant-feed";
import { normalizeProductDisplayName } from "app/lib/product-display-name";
import { buildVisibleProductName } from "app/lib/product-url";
import { isPublicCatalogProduct } from "app/lib/public-catalog-product";
import { resolvePublicProductPriceEuro } from "app/lib/public-product-price";

// Avtopro (avtopro.ua) warehouse price list, fetched by its auto-update once
// an hour. Columns in the order set up in the Avtopro cabinet:
// Виробник; Код; Ціна; Кількість; Опис; Фото.
// Avtopro matches offers by manufacturer + part number, so "Код" is the
// article, and rows without either are left out. Only in-stock items at the
// public UAH price. "Фото" lists links separated by commas, all ending in
// .jpg as the Avtopro loader requires one extension for every link.
export const AVTOPRO_PRICE_COLUMNS = ["Виробник", "Код", "Ціна", "Кількість", "Опис", "Фото"];

// The primary photo is 1, gallery photos follow in their product-page order.
export const buildPricePhotoPath = (code: string, index: number) =>
  `/price-photo/${encodeURIComponent(code.trim())}/${index}.jpg`;

// No quoting needed: the field and photo separators never reach a cell.
const cell = (value: string) => value.replace(/[;"\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();

export async function buildAvtoproPriceCsv(siteUrl: string) {
  const [products, euroRate, galleryImages] = await Promise.all([
    fetchFullCatalogProducts(),
    fetchConfirmedEuroRate(),
    getMerchantGalleryImages(),
  ]);
  if (euroRate == null) throw new Error("Cannot publish Avtopro prices without a confirmed exchange rate");

  const rows: string[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    const code = (product.code || "").trim();
    const producer = cell(product.producer || "");
    const article = cell(product.article || "");
    const quantity = Math.floor(Number(product.quantity) || 0);
    if (!code || !producer || !article || quantity <= 0 || !isPublicCatalogProduct(product)) continue;
    const key = `${producer}|${article}`.toLowerCase();
    if (seen.has(key)) continue;
    const price = toPriceUah(resolvePublicProductPriceEuro(product), euroRate);
    if (price == null) continue;
    seen.add(key);

    const photoCount = 1 + (galleryImages.get(code)?.length ?? 0);
    const photos = Array.from({ length: photoCount }, (_, index) => `${siteUrl}${buildPricePhotoPath(code, index + 1)}`);
    // The product page heading's cleanup ("1. 8-2. 0" -> "1.8-2.0").
    const name = cell(normalizeProductDisplayName(fixCatalogSpelling(buildVisibleProductName(product.name || article))));
    rows.push([producer, article, String(price), String(quantity), name, photos.join(",")].join(";"));
  }

  // BOM so Excel and the Avtopro loader read Cyrillic as UTF-8.
  return { csv: `﻿${[AVTOPRO_PRICE_COLUMNS.join(";"), ...rows].join("\r\n")}\r\n`, count: rows.length };
}
