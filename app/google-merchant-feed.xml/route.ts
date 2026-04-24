import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

import {
  fetchCatalogProductsPage,
  fetchEuroRate,
  fetchPriceEuro,
  toPriceUah,
  type CatalogProduct,
} from "app/lib/catalog-server";
import { getProductImagePath } from "app/lib/product-image";
import { buildVisibleProductName, buildProductPath } from "app/lib/product-url";

const GOOGLE_BASE_NAMESPACE = "http://base.google.com/ns/1.0";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://partson.shop";

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const FEED_MAX_ITEMS = parsePositiveInt(process.env.MERCHANT_FEED_MAX_ITEMS, 10000);
const FEED_MAX_PAGES = parsePositiveInt(process.env.MERCHANT_FEED_MAX_PAGES, 300);
const FEED_PAGE_SIZE = parsePositiveInt(process.env.MERCHANT_FEED_PAGE_SIZE, 100);
const FEED_PAGE_CONCURRENCY = parsePositiveInt(process.env.MERCHANT_FEED_PAGE_CONCURRENCY, 2);
const FEED_PRICE_CONCURRENCY = parsePositiveInt(process.env.MERCHANT_FEED_PRICE_CONCURRENCY, 10);
const FEED_STOP_AFTER_EMPTY_PAGES = parsePositiveInt(
  process.env.MERCHANT_FEED_STOP_AFTER_EMPTY_PAGES,
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
    product.quantity > 0 ? `В наявності ${product.quantity} шт.` : "Доступно під замовлення.";

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

const collectAllProducts = async (): Promise<CatalogProduct[]> => {
  const seenCodes = new Set<string>();
  const products: CatalogProduct[] = [];

  let totalScanned = 0;
  let page = 1;
  let emptyPagesInRow = 0;

  while (
    page <= FEED_MAX_PAGES &&
    products.length < FEED_MAX_ITEMS &&
    emptyPagesInRow < FEED_STOP_AFTER_EMPTY_PAGES
  ) {
    const pageNumbers: number[] = [];

    for (
      let i = 0;
      i < FEED_PAGE_CONCURRENCY && page <= FEED_MAX_PAGES;
      i += 1, page += 1
    ) {
      pageNumbers.push(page);
    }

    process.stdout.write(
      `⏳ Сторінки ${pageNumbers[0]}–${pageNumbers[pageNumbers.length - 1]} | Зібрано: ${products.length} | Проскановано: ${totalScanned}...\r`
    );

    const batches = await Promise.all(
      pageNumbers.map(async (p) => {
        try {
          const batch = await fetchCatalogProductsPage({
            page: p,
            limit: FEED_PAGE_SIZE,
          });

          return {
            page: p,
            items: batch,
          };
        } catch (error) {
          console.warn(`\n⚠️ Не вдалося прочитати сторінку ${p}`, error);
          return {
            page: p,
            items: [] as CatalogProduct[],
          };
        }
      })
    );

    for (const { page: batchPage, items: batch } of batches) {
      totalScanned += batch.length;

      if (batch.length === 0) {
        emptyPagesInRow += 1;
        console.warn(`\n⚠️ Порожня сторінка ${batchPage}. Підряд: ${emptyPagesInRow}`);
      } else {
        emptyPagesInRow = 0;
      }

      for (const item of batch) {
        const code = (item.code || "").trim();
        if (!code) continue;

        const dedupeKey = code.toLowerCase();
        if (seenCodes.has(dedupeKey)) continue;

        seenCodes.add(dedupeKey);
        products.push(item);

        if (products.length >= FEED_MAX_ITEMS) {
          break;
        }
      }

      if (products.length >= FEED_MAX_ITEMS) {
        break;
      }
    }
  }

  console.log(`\n✅ Проскановано: ${totalScanned} | Унікальних товарів: ${products.length}`);
  console.log(`ℹ️ Зупинка після порожніх сторінок підряд: ${emptyPagesInRow}/${FEED_STOP_AFTER_EMPTY_PAGES}`);

  return products;
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R | null>
): Promise<R[]> => {
  const results: R[] = [];
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;

        const result = await worker(items[index], index);
        if (result !== null) results.push(result);
      }
    })
  );

  return results;
};

type FeedItem = {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  availability: string;
  condition: string;
  price: string;
  brand: string;
  mpn: string;
  productType: string;
};

async function main() {
  console.log("🚀 Генерація Google Merchant Feed...");
  const startTime = Date.now();

  const [euroRate, allProducts] = await Promise.all([fetchEuroRate(), collectAllProducts()]);

  console.log(
    `💰 Підтягуємо ціни для ${allProducts.length} товарів (concurrency: ${FEED_PRICE_CONCURRENCY})...`
  );

  let withPrice = 0;
  let withoutPrice = 0;
  let processed = 0;

  const items = await mapWithConcurrency<CatalogProduct, FeedItem>(
    allProducts,
    FEED_PRICE_CONCURRENCY,
    async (product) => {
      const code = (product.code || "").trim();
      if (!code) return null;

      processed += 1;

      if (processed % 200 === 0) {
        process.stdout.write(
          `  → Оброблено: ${processed}/${allProducts.length} | З ціною: ${withPrice} | Без ціни: ${withoutPrice}...\r`
        );
      }

      const lookupKey = (product.article || "").trim() || code;

      const priceEuro =
        typeof product.priceEuro === "number" && product.priceEuro > 0
          ? product.priceEuro
          : await fetchPriceEuro(lookupKey, {
              timeoutMs: 3000,
              retries: 1,
              cacheTtlMs: 1000 * 60 * 60 * 12,
            });

      const priceUah = toPriceUah(priceEuro, euroRate);

      if (priceUah == null) {
        withoutPrice += 1;
        return null;
      }

      withPrice += 1;

      return {
        id: code,
        title: `${buildVisibleProductName(product.name)}${
          product.producer ? ` ${product.producer}` : ""
        }${product.article ? ` ${product.article}` : ""}`.trim(),
        description: buildProductDescription(product),
        link: `${SITE_URL}${buildProductPath(product)}`,
        imageLink: `${SITE_URL}${getProductImagePath(code, product.article)}`,
        availability: product.quantity > 0 ? "in stock" : "out of stock",
        condition: "new",
        price: `${priceUah.toFixed(2)} UAH`,
        brand: (product.producer || "").trim() || "PartsON",
        mpn: (product.article || "").trim() || code,
        productType: [product.group || product.category || "", product.subGroup || ""]
          .filter(Boolean)
          .join(" > "),
      };
    }
  );

  console.log(`\n✅ З ціною: ${withPrice} | Без ціни: ${withoutPrice}`);
  console.log("💾 Будуємо XML...");

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

  mkdirSync(join(process.cwd(), "public"), { recursive: true });
  writeFileSync(join(process.cwd(), "public", "google-merchant-feed.xml"), xml, "utf-8");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n🎉 Фід збережено: public/google-merchant-feed.xml");
  console.log(`⏱  Час генерації: ${elapsed}с`);
  console.log(`📦 Товарів у фіді: ${items.length}`);
}

main().catch((error) => {
  console.error("❌ Помилка:", error);
  process.exit(1);
});