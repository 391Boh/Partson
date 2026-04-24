import "server-only";

import { fetchEuroRate, toPriceUah } from "app/lib/catalog-server";
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

const toGoogleMerchantFeedItem = (
  entry: ProductSitemapEntry,
  siteUrl: string,
  euroRate: number
): GoogleMerchantFeedItem | null => {
  const code = (entry.code || "").trim();
  if (!code) return null;

  const priceUah = toPriceUah(entry.priceEuro, euroRate);
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
  const maxItems =
    options?.maxItems === undefined ? MERCHANT_FEED_MAX_ITEMS : options.maxItems;
  const [euroRate, entries] = await Promise.all([
    fetchEuroRate(),
    getAllProductSitemapEntries(),
  ]);

  const sourceEntries =
    maxItems && maxItems > 0 ? entries.slice(0, maxItems) : entries;
  const items = sourceEntries
    .map((entry) => toGoogleMerchantFeedItem(entry, siteUrl, euroRate))
    .filter((item): item is GoogleMerchantFeedItem => item !== null);

  return {
    xml: buildGoogleMerchantFeedXml(siteUrl, items),
    itemCount: items.length,
    skippedCount: sourceEntries.length - items.length,
    sourceCount: sourceEntries.length,
  };
};
