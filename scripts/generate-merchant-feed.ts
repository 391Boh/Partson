/**
 * Запускати: npx tsx scripts/generate-merchant-feed.ts
 * Або додати в package.json: "generate:feed": "tsx scripts/generate-merchant-feed.ts"
 * Додати в build: "build": "npm run generate:feed && next build"
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

import {
  fetchCatalogProductsPage,
  fetchEuroRate,
  fetchPriceEuro,
  toPriceUah,
  type CatalogProduct,
} from "../app/lib/catalog-server";
import { getProductImagePath } from "../app/lib/product-image";
import { buildVisibleProductName, buildProductPath } from "../app/lib/product-url";

const GOOGLE_BASE_NAMESPACE = "http://base.google.com/ns/1.0";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://partson.ua";

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const FEED_MAX_ITEMS = parsePositiveInt(process.env.MERCHANT_FEED_MAX_ITEMS, 1200);
const FEED_MAX_PAGES = parsePositiveInt(process.env.MERCHANT_FEED_MAX_PAGES, 30);
const FEED_PAGE_SIZE = parsePositiveInt(process.env.MERCHANT_FEED_PAGE_SIZE, 80);
const FEED_PRICE_CONCURRENCY = parsePositiveInt(process.env.MERCHANT_FEED_PRICE_CONCURRENCY, 10);
const FEED_PAGE_CONCURRENCY = parsePositiveInt(process.env.MERCHANT_FEED_PAGE_CONCURRENCY, 5);

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

const collectFeedProducts = async (): Promise<CatalogProduct[]> => {
  const seenCodes = new Set<string>();
  const products: CatalogProduct[] = [];

  console.log("⏳ Завантажуємо сторінку 1...");
  const firstBatch = await fetchCatalogProductsPage({ page: 1, limit: FEED_PAGE_SIZE });
  if (firstBatch.length === 0) return products;

  for (const item of firstBatch) {
    const code = item.code.trim();
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);
    products.push(item);
  }

  if (firstBatch.length < FEED_PAGE_SIZE || products.length >= FEED_MAX_ITEMS) {
    return products;
  }

  let page = 2;
  let done = false;

  while (!done && page <= FEED_MAX_PAGES && products.length < FEED_MAX_ITEMS) {
    const pageNumbers: number[] = [];
    for (let i = 0; i < FEED_PAGE_CONCURRENCY && page <= FEED_MAX_PAGES; i++, page++) {
      pageNumbers.push(page);
    }

    console.log(`⏳ Завантажуємо сторінки ${pageNumbers[0]}–${pageNumbers[pageNumbers.length - 1]}...`);

    const batches = await Promise.all(
      pageNumbers.map((p) => fetchCatalogProductsPage({ page: p, limit: FEED_PAGE_SIZE }))
    );

    for (const batch of batches) {
      for (const item of batch) {
        const code = item.code.trim();
        if (!code || seenCodes.has(code)) continue;
        seenCodes.add(code);
        products.push(item);
        if (products.length >= FEED_MAX_ITEMS) return products;
      }
      if (batch.length < FEED_PAGE_SIZE) {
        done = true;
        break;
      }
    }
  }

  return products;
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R | null>
): Promise<R[]> => {
  const results: R[] = [];
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      const result = await worker(items[i]);
      if (result != null) results.push(result);
    }
  });

  await Promise.all(runners);
  return results;
};

async function main() {
  console.log("🚀 Генерація Google Merchant Feed...");
  const startTime = Date.now();

  const [euroRate, products] = await Promise.all([
    fetchEuroRate(),
    collectFeedProducts(),
  ]);

  console.log(`✅ Зібрано ${products.length} товарів. Підтягуємо ціни...`);

  let processed = 0;
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
              cacheTtlMs: 1000 * 60 * 60 * 12,
            });

      const priceUah = toPriceUah(priceEuro, euroRate);
      if (priceUah == null) return null;

      processed++;
      if (processed % 100 === 0) {
        console.log(`  → Оброблено ${processed}/${products.length}...`);
      }

      const productPath = buildProductPath(product);

      return {
        id: code,
        title: `${buildVisibleProductName(product.name)}${product.producer ? ` ${product.producer}` : ""}${product.article ? ` ${product.article}` : ""}`.trim(),
        description: buildProductDescription(product),
        link: `${SITE_URL}${productPath}`,
        imageLink: `${SITE_URL}${getProductImagePath(code, product.article)}`,
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

  console.log(`✅ Готово товарів з цінами: ${items.length}`);

  const itemsXml = items
    .map((item) =>
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
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="${GOOGLE_BASE_NAMESPACE}">
  <channel>
    <title>PartsON Google Merchant Feed</title>
    <link>${escapeXml(SITE_URL)}</link>
    <description>Товарний feed PartsON для Google Merchant Center.</description>
${itemsXml}
  </channel>
</rss>`;

  // Зберігаємо в /public — Next.js роздає як статичний файл миттєво
  const outputDir = join(process.cwd(), "public");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, "google-merchant-feed.xml");
  writeFileSync(outputPath, xml, "utf-8");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 Фід збережено: public/google-merchant-feed.xml`);
  console.log(`⏱  Час генерації: ${elapsed}с`);
  console.log(`📦 Товарів у фіді: ${items.length}`);
}

main().catch((err) => {
  console.error("❌ Помилка генерації фіду:", err);
  process.exit(1);
});