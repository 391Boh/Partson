import "server-only";

import {
  fetchEuroRate,
  fetchPriceEuroMapByLookupKeys,
  toPriceUah,
} from "app/lib/catalog-server";
import {
  PRODUCT_IMAGE_FALLBACK_PATH,
  getProductImagePath,
} from "app/lib/product-image";
import {
  getAllProductSitemapEntries,
  type ProductSitemapEntry,
} from "app/lib/product-sitemap";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";

type GoogleMerchantFeedItem = {
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

type GoogleMerchantFeedSnapshot = {
  xml: string;
  itemCount: number;
  skippedCount: number;
  sourceCount: number;
};

const GOOGLE_BASE_NAMESPACE = "http://base.google.com/ns/1.0";

const parseOptionalPositiveInt = (value: string | undefined) => {
  if (!value) return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.floor(numeric);
};

const DEFAULT_SITE_URL = "https://partson.ua";
const MERCHANT_FEED_MAX_ITEMS = parseOptionalPositiveInt(
  process.env.MERCHANT_FEED_MAX_ITEMS
);
const DEFAULT_MERCHANT_FEED_LOOKUP_LIMIT = 50000;
const MERCHANT_FEED_PRICE_LOOKUP_LIMIT =
  parseOptionalPositiveInt(process.env.MERCHANT_FEED_PRICE_LOOKUP_LIMIT) ??
  parseOptionalPositiveInt(process.env.PRODUCT_SITEMAP_MAX_ITEMS) ??
  MERCHANT_FEED_MAX_ITEMS ??
  DEFAULT_MERCHANT_FEED_LOOKUP_LIMIT;
const MERCHANT_FEED_PRICE_LOOKUP_CHUNK_SIZE =
  parseOptionalPositiveInt(process.env.MERCHANT_FEED_PRICE_LOOKUP_CHUNK_SIZE) ?? 60;
const MERCHANT_FEED_PRICE_LOOKUP_CONCURRENCY =
  parseOptionalPositiveInt(process.env.MERCHANT_FEED_PRICE_CONCURRENCY) ?? 6;
const MERCHANT_FEED_DIRECT_PRICE_LOOKUP_LIMIT =
  parseOptionalPositiveInt(process.env.MERCHANT_FEED_DIRECT_PRICE_LOOKUP_LIMIT) ??
  MERCHANT_FEED_PRICE_LOOKUP_LIMIT;

const getMerchantFeedSourceChunkSize = (maxItems: number | null) => {
  if (maxItems == null || !Number.isFinite(maxItems) || maxItems <= 0) {
    return 2000;
  }

  return Math.max(250, Math.min(Math.floor(maxItems), 2000));
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const normalizeSiteUrl = (value?: string | null) => {
  const normalized = (value || "").trim();
  return (normalized || DEFAULT_SITE_URL).replace(/\/+$/, "");
};

const buildProductType = (entry: ProductSitemapEntry) => {
  const seen = new Set<string>();

  return [entry.group, entry.subGroup, entry.category]
    .map((value) => (value || "").trim())
    .filter((value) => {
      if (!value) return false;

      const dedupeKey = value.toLocaleLowerCase("uk-UA");
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    })
    .join(" > ");
};

const buildProductDescription = (entry: ProductSitemapEntry) => {
  const visibleName = buildVisibleProductName(entry.name || entry.code);
  const categoryLabel =
    (entry.subGroup || "").trim() ||
    (entry.group || "").trim() ||
    (entry.category || "").trim() ||
    "автозапчастини";
  const availabilityLabel =
    entry.quantity > 0
      ? `В наявності ${entry.quantity} шт.`
      : "Доступно під замовлення.";

  return [
    `${visibleName}${entry.producer ? ` від виробника ${entry.producer}` : ""}.`,
    `Категорія: ${categoryLabel}.`,
    entry.article ? `Артикул: ${entry.article}.` : null,
    entry.code ? `Код: ${entry.code}.` : null,
    availabilityLabel,
    "Купити автозапчастини на PartsON з доставкою по Україні.",
  ]
    .filter(Boolean)
    .join(" ");
};

const hasPositivePriceEuro = (entry: ProductSitemapEntry) =>
  typeof entry.priceEuro === "number" &&
  Number.isFinite(entry.priceEuro) &&
  entry.priceEuro > 0;

const hasResolvedPrice = (
  prices: Record<string, number>,
  entry: ProductSitemapEntry
) => {
  const articleKey = (entry.article || "").trim().toLowerCase();
  const codeKey = (entry.code || "").trim().toLowerCase();
  const price = (articleKey ? prices[articleKey] : undefined) ?? prices[codeKey];

  return typeof price === "number" && Number.isFinite(price) && price > 0;
};

const lookupMerchantFeedPrices = async (
  entries: ProductSitemapEntry[],
  getLookupKeys: (entry: ProductSitemapEntry) => Array<string | undefined>,
  options?: { includeDirectLookup?: boolean }
) => {
  const prices: Record<string, number> = {};
  const chunkSize = Math.max(1, MERCHANT_FEED_PRICE_LOOKUP_CHUNK_SIZE);
  const chunks: ProductSitemapEntry[][] = [];

  for (let start = 0; start < entries.length; start += chunkSize) {
    chunks.push(entries.slice(start, start + chunkSize));
  }

  let nextChunkIndex = 0;
  const workerCount = Math.min(
    Math.max(1, MERCHANT_FEED_PRICE_LOOKUP_CONCURRENCY),
    chunks.length
  );

  const runWorker = async () => {
    while (nextChunkIndex < chunks.length) {
      const chunkIndex = nextChunkIndex;
      nextChunkIndex += 1;
      const chunk = chunks[chunkIndex] ?? [];
      const lookupKeys = Array.from(
        new Set(
          chunk
            .flatMap(getLookupKeys)
            .map((value) => (value || "").trim())
            .filter(Boolean)
        )
      );
      if (lookupKeys.length === 0) continue;

      const chunkPrices = await fetchPriceEuroMapByLookupKeys(lookupKeys, {
        sourceTimeoutMs: 1800,
        sourceCacheTtlMs: 1000 * 60 * 5,
        timeoutMs: 1600,
        retries: 0,
        retryDelayMs: 80,
        cacheTtlMs: 1000 * 60 * 10,
        includeDirectLookup: options?.includeDirectLookup === true,
        includePricesPost: true,
        directConcurrency: 4,
        maxKeys: lookupKeys.length,
      }).catch(() => ({} as Record<string, number>));

      for (const [key, value] of Object.entries(chunkPrices)) {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
        prices[key] = value;
      }
    }
  };

  await Promise.allSettled(Array.from({ length: workerCount }, runWorker));
  return prices;
};

const enrichMerchantFeedPrices = async (
  entries: ProductSitemapEntry[]
): Promise<ProductSitemapEntry[]> => {
  const allMissingPriceEntries = entries.filter((entry) => !hasPositivePriceEuro(entry));
  if (MERCHANT_FEED_PRICE_LOOKUP_LIMIT <= 0) return entries;

  const missingPriceEntries = allMissingPriceEntries.slice(
    0,
    MERCHANT_FEED_PRICE_LOOKUP_LIMIT
  );
  if (missingPriceEntries.length === 0) return entries;

  const codePrices = await lookupMerchantFeedPrices(
    missingPriceEntries,
    (entry) => [entry.code],
    { includeDirectLookup: false }
  );

  const articleLookupEntries = missingPriceEntries.filter(
    (entry) => entry.article && !hasResolvedPrice(codePrices, entry)
  );
  const articlePrices =
    articleLookupEntries.length > 0
      ? await lookupMerchantFeedPrices(
          articleLookupEntries,
          (entry) => [entry.article],
          { includeDirectLookup: false }
        )
      : {};

  let prices = {
    ...codePrices,
    ...articlePrices,
  };

  const directLookupEntries = missingPriceEntries
    .filter((entry) => !hasResolvedPrice(prices, entry))
    .slice(0, MERCHANT_FEED_DIRECT_PRICE_LOOKUP_LIMIT);

  if (directLookupEntries.length > 0) {
    const directPrices = await lookupMerchantFeedPrices(
      directLookupEntries,
      (entry) => [entry.article, entry.code],
      { includeDirectLookup: true }
    );

    prices = {
      ...prices,
      ...directPrices,
    };
  }

  if (Object.keys(prices).length === 0) return entries;

  return entries.map((entry) => {
    if (hasPositivePriceEuro(entry)) return entry;

    const articleKey = (entry.article || "").trim().toLowerCase();
    const codeKey = (entry.code || "").trim().toLowerCase();
    const priceEuro = (articleKey ? prices[articleKey] : undefined) ?? prices[codeKey];
    if (
      typeof priceEuro !== "number" ||
      !Number.isFinite(priceEuro) ||
      priceEuro <= 0
    ) {
      return entry;
    }

    return {
      ...entry,
      priceEuro,
    };
  });
};

const toGoogleMerchantFeedItem = (
  entry: ProductSitemapEntry,
  siteUrl: string,
  euroRate: number
): GoogleMerchantFeedItem | null => {
  const code = (entry.code || "").trim();
  if (!code) return null;

  const priceUah = toPriceUah(entry.priceEuro ?? null, euroRate);
  if (priceUah == null) return null;

  const article = (entry.article || "").trim() || undefined;
  const imagePath =
    entry.hasPhoto === false
      ? PRODUCT_IMAGE_FALLBACK_PATH
      : getProductImagePath(code, article);

  return {
    id: code,
    title: `${buildVisibleProductName(entry.name || code)}${
      entry.producer ? ` ${entry.producer}` : ""
    }${article ? ` ${article}` : ""}`.trim(),
    description: buildProductDescription(entry),
    link: `${siteUrl}${buildProductPath({
      code,
      article,
      name: entry.name,
      producer: entry.producer,
      group: entry.group,
      subGroup: entry.subGroup,
      category: entry.category,
    })}`,
    imageLink: `${siteUrl}${imagePath}`,
    availability: entry.quantity > 0 ? "in stock" : "out of stock",
    condition: "new",
    price: `${priceUah.toFixed(2)} UAH`,
    brand: (entry.producer || "").trim() || "PartsON",
    mpn: article || code,
    productType: buildProductType(entry),
  };
};

const buildGoogleMerchantFeedXml = (
  siteUrl: string,
  items: GoogleMerchantFeedItem[]
) => {
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="${GOOGLE_BASE_NAMESPACE}">
  <channel>
    <title>PartsON Google Merchant Feed</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>Товарний feed PartsON для Google Merchant Center.</description>
${itemsXml}
  </channel>
</rss>`;
};

export const getGoogleMerchantFeedSnapshot = async (options?: {
  siteUrl?: string;
  maxItems?: number | null;
}): Promise<GoogleMerchantFeedSnapshot> => {
  const siteUrl = normalizeSiteUrl(options?.siteUrl || process.env.NEXT_PUBLIC_SITE_URL);
  const requestedMaxItems =
    options?.maxItems === undefined ? MERCHANT_FEED_MAX_ITEMS : options.maxItems;
  const [euroRate, entries] = await Promise.all([
    fetchEuroRate(),
    getAllProductSitemapEntries(),
  ]);

  const maxItems =
    typeof requestedMaxItems === "number" &&
    Number.isFinite(requestedMaxItems) &&
    requestedMaxItems > 0
      ? Math.floor(requestedMaxItems)
      : null;
  const chunkSize = getMerchantFeedSourceChunkSize(maxItems);
  const items: GoogleMerchantFeedItem[] = [];
  let sourceCount = 0;

  for (let start = 0; start < entries.length; start += chunkSize) {
    if (maxItems != null && items.length >= maxItems) {
      break;
    }

    const sourceChunk = entries.slice(start, start + chunkSize);
    if (sourceChunk.length === 0) {
      continue;
    }

    sourceCount += sourceChunk.length;

    const pricedEntries = await enrichMerchantFeedPrices(sourceChunk);
    for (const entry of pricedEntries) {
      const item = toGoogleMerchantFeedItem(entry, siteUrl, euroRate);
      if (!item) {
        continue;
      }

      items.push(item);
      if (maxItems != null && items.length >= maxItems) {
        break;
      }
    }
  }

  return {
    xml: buildGoogleMerchantFeedXml(siteUrl, items),
    itemCount: items.length,
    skippedCount: Math.max(0, sourceCount - items.length),
    sourceCount,
  };
};
