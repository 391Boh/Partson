import { headers } from "next/headers";
import { NextResponse } from "next/server";

import {
  fetchCatalogProductsPage,
  fetchEuroRate,
  fetchPriceEuro,
  toPriceUah,
  type CatalogProduct,
} from "app/lib/catalog-server";
import { getProductImagePath } from "app/lib/product-image";
import { buildVisibleProductName, buildProductPath } from "app/lib/product-url";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 21600;

const GOOGLE_BASE_NAMESPACE = "http://base.google.com/ns/1.0";

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const FEED_MAX_ITEMS = parsePositiveInt(process.env.MERCHANT_FEED_MAX_ITEMS, 1200);
const FEED_MAX_PAGES = parsePositiveInt(process.env.MERCHANT_FEED_MAX_PAGES, 30);
const FEED_PAGE_SIZE = parsePositiveInt(process.env.MERCHANT_FEED_PAGE_SIZE, 80);
const FEED_PRICE_CONCURRENCY = parsePositiveInt(
  process.env.MERCHANT_FEED_PRICE_CONCURRENCY,
  10
);

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const buildProductDescription = (product: CatalogProduct) => {
  const visibleName = buildVisibleProductName(product.name);
  const categoryLabel = product.subGroup || product.group || product.category || "автозапчастини";
  const availabilityLabel =
    product.quantity > 0
      ? `В наявності ${product.quantity} шт.`
      : "Доступно під замовлення.";

  return [
    `${visibleName}${product.producer ? ` від виробника ${product.producer}` : ""}.`,
    `Категорія: ${categoryLabel}.`,
    product.article ? `Артикул: ${product.article}.` : null,
    product.code ? `Код: ${product.code}.` : null,
    availabilityLabel,
    "Купити автозапчастини на PartsON з доставкою по Україні.",
  ]
    .filter(Boolean)
    .join(" ");
};

const collectFeedProducts = async () => {
  const products: CatalogProduct[] = [];
  const seenCodes = new Set<string>();

  for (let page = 1; page <= FEED_MAX_PAGES; page += 1) {
    const batch = await fetchCatalogProductsPage({ page, limit: FEED_PAGE_SIZE });
    if (batch.length === 0) break;

    for (const item of batch) {
      const code = item.code.trim();
      if (!code || seenCodes.has(code)) continue;

      seenCodes.add(code);
      products.push(item);

      if (products.length >= FEED_MAX_ITEMS) return products;
    }

    if (batch.length < FEED_PAGE_SIZE) break;
  }

  return products;
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R | null>
) => {
  const results: R[] = [];
  const limit = Math.max(1, concurrency);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      const result = await worker(items[currentIndex]);
      if (result != null) results.push(result);
    }
  });

  await Promise.all(runners);
  return results;
};

export async function GET() {
  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const euroRate = await fetchEuroRate();
  const products = await collectFeedProducts();

  const items = await mapWithConcurrency(
    products,
    FEED_PRICE_CONCURRENCY,
    async (product) => {
      const code = product.code.trim();
      if (!code) return null;

      const priceEuro =
        typeof product.priceEuro === "number" && product.priceEuro > 0
          ? product.priceEuro
          : await fetchPriceEuro(product.article.trim() || code, {
              timeoutMs: 1800,
              retries: 0,
              cacheTtlMs: 1000 * 60 * 60 * 6,
            });
      const priceUah = toPriceUah(priceEuro, euroRate);
      if (priceUah == null) return null;

      const productPath = buildProductPath(product);

      return {
        id: code,
        title: `${buildVisibleProductName(product.name)}${product.producer ? ` ${product.producer}` : ""}${product.article ? ` ${product.article}` : ""}`.trim(),
        description: buildProductDescription(product),
        link: `${siteUrl}${productPath}`,
        imageLink: `${siteUrl}${getProductImagePath(code, product.article)}`,
        availability: product.quantity > 0 ? "in stock" : "out of stock",
        condition: "new",
        price: `${priceUah.toFixed(2)} UAH`,
        brand: product.producer.trim() || "PartsON",
        mpn: product.article.trim() || code,
        productType: [product.group || product.category || "", product.subGroup || ""]
          .filter(Boolean)
          .join(" > "),
      };
    }
  );

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rss version="2.0" xmlns:g="${GOOGLE_BASE_NAMESPACE}">`,
    "  <channel>",
    "    <title>PartsON Google Merchant Feed</title>",
    `    <link>${escapeXml(siteUrl)}</link>`,
    "    <description>Товарний feed PartsON для Google Merchant Center.</description>",
    ...items.map((item) =>
      [
        "    <item>",
        `      <g:id>${escapeXml(item.id)}</g:id>`,
        `      <title>${escapeXml(item.title)}</title>`,
        `      <description>${escapeXml(item.description)}</description>`,
        `      <link>${escapeXml(item.link)}</link>`,
        `      <g:image_link>${escapeXml(item.imageLink)}</g:image_link>`,
        `      <g:availability>${escapeXml(item.availability)}</g:availability>`,
        `      <g:condition>${escapeXml(item.condition)}</g:condition>`,
        `      <g:price>${escapeXml(item.price)}</g:price>`,
        `      <g:brand>${escapeXml(item.brand)}</g:brand>`,
        `      <g:mpn>${escapeXml(item.mpn)}</g:mpn>`,
        item.productType
          ? `      <g:product_type>${escapeXml(item.productType)}</g:product_type>`
          : null,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n")
    ),
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new NextResponse(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
