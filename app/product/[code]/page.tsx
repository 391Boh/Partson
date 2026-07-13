import { cache, type CSSProperties } from "react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  type CatalogProduct,
  fetchCatalogProductsByArticle,
  fetchEuroRate,
  findCatalogProductByCode,
  toPriceUah,
} from "app/lib/catalog-server";
import ProductImageWithFallback from "app/components/ProductImageWithFallback";
import ProductRelatedItemsSection from "app/components/ProductRelatedItemsSection";
import {
  buildCatalogCategoryPath,
  buildGroupItemPath,
  buildGroupPath,
  buildManufacturerPath,
} from "app/lib/catalog-links";
import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";
import { buildProductImagePath } from "app/lib/product-image-path";
import {
  buildLegacyProductNameSlug,
  buildProductPath,
  buildProductNameSlug,
  buildVisibleProductName,
  extractProductCodeFromParam,
  extractProductRouteSlugsFromParam,
  safeDecodeURIComponent,
} from "app/lib/product-url";
import {
  resolveProductCodeFromNameSlug,
  resolveProductCodeFromSeoRoute,
} from "app/lib/product-route-resolver";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import {
  getAllPricedProductSitemapEntries,
  getAllProductSitemapEntries,
  getAllProductSitemapSnapshotEntries,
  type ProductSitemapEntry,
} from "app/lib/product-sitemap";
import { getBrandLogoMap, resolveProducerLogo } from "app/lib/brand-logo";
import { producerDescriptions } from "app/lib/producer-descriptions";
import { unstable_noStore as noStore } from "next/cache";
import { clearAllOneCCache } from "app/api/_lib/oneC";
import { getProductReviewStats } from "app/lib/reviews-server";

const PRODUCT_PAGE_ROUTE_DATA_TIMEOUT_MS = 420;
const PRODUCT_PAGE_PRODUCT_LOOKUP_TIMEOUT_MS = 480;
const PRODUCT_PAGE_ROUTE_RECOVERY_TIMEOUT_MS = 280;
const PRODUCT_PAGE_SEO_EURO_RATE_TIMEOUT_MS = 80;
const PRODUCT_PAGE_METADATA_ROUTE_DATA_TIMEOUT_MS = 520;
const STORE_PHONE_DISPLAY = "+38 (063) 421-18-51";
const STORE_PHONE_TEL = "+380634211851";
const STORE_ADDRESS = "Львів, вул. Перфецького, 8";
const PRODUCT_META_DESCRIPTION_MAX_LENGTH = 160;
const shouldPreferSitemapProductLookup = true;

const parseProductStaticParamsLimit = (value: string | undefined) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
};

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  // Respect the documented build limit in production too. dynamicParams + ISR
  // keep every other product route available without pre-rendering thousands
  // of 1C-backed pages during a single build.
  const limit = parseProductStaticParamsLimit(process.env.SEO_PRODUCT_STATIC_PARAMS_LIMIT);
  if (limit <= 0) return [];

  try {
    const entries = await getAllPricedProductSitemapEntries();
    const seen = new Set<string>();
    const params: Array<{ code: string }> = [];

    for (const entry of entries) {
      if (!entry.code) continue;
      if (params.length >= limit) break;

      const productPath = buildProductPath({
        code: entry.code,
        article: entry.article,
        name: entry.name,
        producer: entry.producer,
        group: entry.group,
        subGroup: entry.subGroup,
        category: entry.category,
      });
      const code = safeDecodeURIComponent(productPath.replace(/^\/product\//, ""));
      const dedupeKey = code.toLocaleLowerCase("uk-UA");
      if (!code || seen.has(dedupeKey)) continue;

      seen.add(dedupeKey);
      params.push({ code });
    }

    return params;
  } catch {
    return [];
  }
}

const ProductPurchasePanelClient = dynamic(
  () => import("app/components/ProductPurchasePanelClient"),
  {
    loading: () => (
      <section className="flex h-full flex-col rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_14px_28px_rgba(15,23,42,0.05)] sm:rounded-[24px] sm:p-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="h-[76px] animate-pulse rounded-[16px] bg-slate-100" />
          <div className="h-[76px] animate-pulse rounded-[16px] bg-slate-100" />
        </div>
        <div className="mt-2.5 h-4 w-3/4 animate-pulse rounded-full bg-slate-100" />
        <div className="mt-2.5 h-12 animate-pulse rounded-2xl bg-slate-100" />
      </section>
    ),
  }
);

const ProductDescriptionClientCard = dynamic(
  () => import("app/components/ProductDescriptionClientCard"),
  {
    loading: () => (
      <section className="overflow-hidden rounded-[22px] border border-sky-100 bg-white/92 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.06)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4">
        <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="h-3 w-20 animate-pulse rounded-full bg-sky-100" />
            <div className="mt-2 h-6 w-56 max-w-full animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-8 w-28 animate-pulse rounded-[12px] bg-slate-100" />
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-4 w-full animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-11/12 animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-3/4 animate-pulse rounded-full bg-slate-100" />
        </div>
      </section>
    ),
  }
);

const OpenChatButton = dynamic(() => import("app/components/OpenChatButton"), {
  loading: () => (
    <span className="inline-flex h-9 w-9 rounded-[12px] border border-sky-100 bg-sky-50" />
  ),
});

const ProductPageAdminEditPanel = dynamic(
  () => import("app/components/ProductPageAdminEditPanel")
);

const ProductReviewsSection = dynamic(
  () => import("app/components/ProductReviewsSection"),
  { loading: () => null }
);

const ProductDeferredRecommendations = dynamic(
  () => import("app/components/ProductDeferredRecommendations"),
  {
    loading: () => (
      <section className="overflow-hidden rounded-[22px] border border-sky-100 bg-white/92 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4">
        <div className="h-5 w-64 max-w-full animate-pulse rounded-full bg-slate-100" />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-2.5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-[92px] min-w-0 animate-pulse rounded-[14px] border border-slate-200 bg-slate-100 sm:h-[88px]"
            />
          ))}
        </div>
      </section>
    ),
  }
);

interface ProductPageParams {
  code: string;
}

interface ProductPageProps {
  params: Promise<ProductPageParams>;
  searchParams?: Promise<Record<string, string>>;
}

const pageBackground: CSSProperties = {
  backgroundImage:
    "radial-gradient(circle at 0% 0%, rgba(14,165,233,0.18), transparent 24%), radial-gradient(circle at 100% 8%, rgba(20,184,166,0.1), transparent 22%), linear-gradient(180deg, #edf5f9 0%, #f8fafc 42%, #eef4f8 100%)",
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeLandingValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const buildProductGroupLandingFallbackPath = (
  productCategory: string,
  productGroup: string
) => {
  const normalizedCategory = normalizeLandingValue(productCategory);
  const normalizedGroup = normalizeLandingValue(productGroup);

  if (
    normalizedCategory &&
    normalizedGroup &&
    normalizedCategory.toLocaleLowerCase("uk-UA") !==
      normalizedGroup.toLocaleLowerCase("uk-UA")
  ) {
    return buildGroupItemPath(
      buildPlainSeoSlug(normalizedCategory),
      buildPlainSeoSlug(normalizedGroup)
    );
  }

  if (normalizedGroup) {
    return buildGroupPath(normalizedGroup);
  }

  if (normalizedCategory) {
    return buildGroupPath(normalizedCategory);
  }

  return "/groups";
};

const buildPureProductName = (
  value: string,
  hints?: {
    producer?: string;
    article?: string;
    name?: string;
    group?: string;
    subGroup?: string;
  }
) => {
  const baseName = buildVisibleProductName(value);
  if (!baseName) return "Товар";

  const loweredBaseName = baseName.toLowerCase();
  const buyPrefixIndex = loweredBaseName.indexOf("купити ");
  const articleMarkerIndex = loweredBaseName.indexOf(" артикул ");
  const categoryMarkerIndex = loweredBaseName.indexOf(" у категор");

  // Handles common generated heading pattern: "Купити <NAME> артикул <...> у категорії <...>".
  if (buyPrefixIndex !== -1) {
    const nameStart = buyPrefixIndex + "купити ".length;
    const stopCandidates = [articleMarkerIndex, categoryMarkerIndex].filter(
      (index) => index > nameStart
    );
    const nameEnd = stopCandidates.length > 0 ? Math.min(...stopCandidates) : baseName.length;
    const extracted = baseName.slice(nameStart, nameEnd).replace(/\s{2,}/g, " ").trim();
    if (extracted) {
      return extracted;
    }
  }

  let cleaned = baseName
    .replace(/^купити\s+/iu, "")
    .replace(/\s*\|\s*.+$/u, "")
    .replace(/\s+[—-]\s*(артикул|код|виробник)\b.*$/iu, "")
    .replace(/\s+артикул\s+[^\s,;|/]+/giu, "")
    .replace(/\s+у\s+категорі[їи]\s+.+$/iu, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const normalizedArticle = (hints?.article || "").trim();
  if (normalizedArticle) {
    const articleRegex = new RegExp(
      `(?:\\s*[—-]?\\s*артикул\\s*)?${escapeRegExp(normalizedArticle)}\\b`,
      "iu"
    );
    cleaned = cleaned.replace(articleRegex, "").replace(/\s{2,}/g, " ").trim();
  }

  const normalizedProducer = (hints?.producer || "").trim();
  if (normalizedProducer) {
    const producerTailRegex = new RegExp(
      `(?:\\s*[-/,]?\\s*)${escapeRegExp(normalizedProducer)}$`,
      "iu"
    );
    cleaned = cleaned.replace(producerTailRegex, "").replace(/\s{2,}/g, " ").trim();
  }

  const categoryLabel = buildVisibleProductName(
    (hints?.subGroup || hints?.group || "").trim()
  );
  if (categoryLabel && categoryLabel !== "Товар") {
    const categoryTailRegex = new RegExp(
      `\\s*(?:у\\s+категорі[їи]\\s+)?${escapeRegExp(categoryLabel)}$`,
      "iu"
    );
    cleaned = cleaned.replace(categoryTailRegex, "").replace(/\s{2,}/g, " ").trim();
  }

  return cleaned || baseName;
};

const makeSeoTextTrim = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();

const stripTrailingSeoPunctuation = (value: string) =>
  value
    // Keep a dash after two digits: "98-" means "from 1998 onward" in fitment text.
    .replace(/(?<!\b\d{2})[—–-]\s*$/u, "")
    .replace(/[.,;:\s]+$/u, "")
    .trim();

const buildReadableNameFromSlugSource = (value: string) => {
  const normalized = safeDecodeURIComponent(value || "").trim();
  if (!normalized) return "";

  return normalized
    .replace(/--/g, " ")
    .replace(/_/g, " ")
    .replace(/(?<=\p{L})-(?=\p{L})/gu, " ")
    .replace(/(?<=\p{L})-(?=\d)/gu, " ")
    .replace(/(?<=\d)-(?=\p{L})/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const buildFrontendProductHeading = (
  value: string,
  hints?: {
    producer?: string;
    article?: string;
    group?: string;
    subGroup?: string;
  }
) => {
  const baseName = buildVisibleProductName(value);
  if (!baseName) return "Товар";

  let cleaned = baseName;

  // Strip common generated wrapper from UI heading only.
  cleaned = cleaned.replace(/^\s*купити\s+/iu, "").trim();

  const markerMatch = cleaned.match(/\s+(артикул|у\s+категорі[їи])\b/iu);
  if (markerMatch && typeof markerMatch.index === "number") {
    cleaned = cleaned.slice(0, markerMatch.index).trim();
  }

  const normalizedArticle = (hints?.article || "").trim();
  if (normalizedArticle) {
    cleaned = cleaned
      .replace(
        new RegExp(
          `(?:\\s*[—-]?\\s*артикул\\s*)?${escapeRegExp(normalizedArticle)}\\b`,
          "iu"
        ),
        ""
      )
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  const normalizedProducer = (hints?.producer || "").trim();
  if (normalizedProducer) {
    cleaned = cleaned
      .replace(new RegExp(`\\b${escapeRegExp(normalizedProducer)}\\b$`, "iu"), "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  const categoryLabel = buildVisibleProductName(
    (hints?.subGroup || hints?.group || "").trim()
  );
  if (categoryLabel && categoryLabel !== "Товар") {
    cleaned = cleaned
      .replace(new RegExp(`\\b${escapeRegExp(categoryLabel)}\\b$`, "iu"), "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return cleaned || buildPureProductName(value, hints);
};

const buildCatalogProductFromSitemapEntry = (
  entry: ProductSitemapEntry
): CatalogProduct => ({
  code: (entry.code || entry.article || "").trim(),
  article: (entry.article || "").trim(),
  name: (entry.name || entry.article || entry.code || "Товар").trim(),
  producer: (entry.producer || "").trim(),
  quantity: Number.isFinite(entry.quantity) ? Math.max(0, entry.quantity) : 0,
  priceEuro:
    typeof entry.priceEuro === "number" &&
    Number.isFinite(entry.priceEuro) &&
    entry.priceEuro > 0
      ? entry.priceEuro
      : entry.priceEuro === null
        ? null
        : undefined,
  group: (entry.group || "").trim(),
  subGroup: (entry.subGroup || "").trim(),
  category: (entry.category || "").trim(),
  hasPhoto: entry.hasPhoto,
});

const buildProductJsonLd = (options: {
  name: string;
  visibleName: string;
  description: string;
  code: string;
  article: string;
  producer: string;
  group: string;
  subGroup: string;
  quantity: number;
  priceUah: number | null;
  canonicalUrl: string;
  imageUrls: string[];
  aggregateRating?: { ratingCount: number; avgRating: number };
}) => {
  const {
    name,
    visibleName,
    description,
    code,
    article,
    producer,
    group,
    subGroup,
    quantity,
    priceUah,
    canonicalUrl,
    imageUrls,
    aggregateRating,
  } = options;

  const offers =
    priceUah != null
      ? {
          "@type": "Offer",
          "@id": `${canonicalUrl}#offer`,
          priceCurrency: "UAH",
          price: String(priceUah),
          availability:
            quantity > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
          inventoryLevel:
            quantity > 0
              ? {
                  "@type": "QuantitativeValue",
                  value: quantity,
                }
              : undefined,
          seller: {
            "@type": "Organization",
            name: "PartsON",
            url: new URL("/", canonicalUrl).toString(),
            telephone: STORE_PHONE_TEL,
            address: {
              "@type": "PostalAddress",
              streetAddress: "вул. Перфецького, 8",
              addressLocality: "Львів",
              addressCountry: "UA",
            },
          },
          priceValidUntil: new Date(
            Date.now() + 1000 * 60 * 60 * 24 * 30
          ).toISOString().slice(0, 10),
          url: canonicalUrl,
          shippingDetails: {
            "@type": "OfferShippingDetails",
            shippingDestination: {
              "@type": "DefinedRegion",
              addressCountry: "UA",
            },
            shippingRate: {
              "@type": "MonetaryAmount",
              value: "0",
              currency: "UAH",
            },
            deliveryTime: {
              "@type": "ShippingDeliveryTime",
              handlingTime: {
                "@type": "QuantitativeValue",
                minValue: 0,
                maxValue: 1,
                unitCode: "DAY",
              },
              transitTime: {
                "@type": "QuantitativeValue",
                minValue: 1,
                maxValue: 3,
                unitCode: "DAY",
              },
            },
          },
          hasMerchantReturnPolicy: {
            "@type": "MerchantReturnPolicy",
            applicableCountry: "UA",
            returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
            merchantReturnDays: 14,
            returnFees: "https://schema.org/FreeReturn",
            returnMethod: "https://schema.org/ReturnByMail",
          },
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonicalUrl}#product`,
    name: visibleName || name,
    alternateName: visibleName !== name ? visibleName : undefined,
    description,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    category: [group, subGroup].filter(Boolean).join(" / ") || "Автозапчастини",
    image: imageUrls.map((url) => ({
      "@type": "ImageObject",
      url,
    })),
    sku: article || undefined,
    mpn: code || undefined,
    brand: producer ? { "@type": "Brand", name: producer } : undefined,
    manufacturer: producer ? { "@type": "Organization", name: producer } : undefined,
    identifier: [
      code
        ? {
            "@type": "PropertyValue",
            propertyID: "code",
            value: code,
          }
        : null,
      article
        ? {
            "@type": "PropertyValue",
            propertyID: "article",
            value: article,
          }
        : null,
    ].filter(Boolean),
    additionalProperty: [
      group
        ? {
            "@type": "PropertyValue",
            name: "Група",
            value: group,
          }
        : null,
      subGroup
        ? {
            "@type": "PropertyValue",
            name: "Підгрупа",
            value: subGroup,
          }
        : null,
    ].filter(Boolean),
    offers,
    ...(aggregateRating && aggregateRating.ratingCount >= 3
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: aggregateRating.avgRating.toFixed(1),
            reviewCount: String(aggregateRating.ratingCount),
            bestRating: "5",
            worstRating: "1",
          },
        }
      : {}),
  };
};

const buildProductItemPageJsonLd = (options: {
  siteUrl: string;
  canonicalUrl: string;
  name: string;
  description: string;
  imageUrl: string;
  hasProductSchema: boolean;
}) => {
  const { siteUrl, canonicalUrl, name, description, imageUrl, hasProductSchema } = options;

  return {
    "@context": "https://schema.org",
    "@type": "ItemPage",
    "@id": `${canonicalUrl}#page`,
    url: canonicalUrl,
    name,
    description,
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: imageUrl,
    },
    mainEntity: hasProductSchema
      ? {
          "@id": `${canonicalUrl}#product`,
        }
      : undefined,
  };
};

const buildProductBreadcrumbJsonLd = (options: {
  siteUrl: string;
  canonicalUrl: string;
  name: string;
  topCategoryName?: string;
  topCategoryPath?: string | null;
  groupName?: string;
  groupPath?: string | null;
  subGroupName?: string;
  subGroupPath?: string | null;
}) => {
  const {
    siteUrl,
    canonicalUrl,
    name,
    topCategoryName,
    topCategoryPath,
    groupName,
    groupPath,
    subGroupName,
    subGroupPath,
  } = options;

  const itemListElement = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Головна",
      item: siteUrl,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Каталог",
      item: `${siteUrl}/katalog`,
    },
  ];

  if (topCategoryName && topCategoryPath) {
    itemListElement.push({
      "@type": "ListItem",
      position: itemListElement.length + 1,
      name: topCategoryName,
      item: `${siteUrl}${topCategoryPath}`,
    });
  }

  if (groupName && groupPath) {
    itemListElement.push({
      "@type": "ListItem",
      position: itemListElement.length + 1,
      name: groupName,
      item: `${siteUrl}${groupPath}`,
    });
  }

  if (
    subGroupName &&
    subGroupPath &&
    subGroupName.toLowerCase() !== (groupName || "").toLowerCase()
  ) {
    itemListElement.push({
      "@type": "ListItem",
      position: itemListElement.length + 1,
      name: subGroupName,
      item: `${siteUrl}${subGroupPath}`,
    });
  }

  itemListElement.push({
    "@type": "ListItem",
    position: itemListElement.length + 1,
    name,
    item: canonicalUrl,
  });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  };
};

const buildProductFaqJsonLd = (options: {
  name: string;
  producer: string;
  group: string;
  subGroup: string;
  hasPrice: boolean;
  quantity: number;
}) => {
  const { name, producer, group, subGroup, hasPrice, quantity } = options;
  const productLabel = name || "цього товару";
  const producerLabel = producer || "виробника";
  const groupLabel = subGroup || group || "запчастин";
  const availLabel = quantity > 0 ? `є в наявності ${quantity} шт.` : "доступний під замовлення";

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `Як замовити ${productLabel} у Львові?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: hasPrice
            ? `Додайте ${productLabel} у кошик прямо на сторінці. Оплата: готівка, картка (термінал), онлайн або безготівково для юридичних осіб. Доставка Нова Пошта, Укрпошта, Meest по Україні або самовивіз у Львові.`
            : `Для уточнення ціни на ${productLabel} надішліть запит менеджеру через чат. Ми підберемо оптимальний варіант від перевіреного постачальника.`,
        },
      },
      {
        "@type": "Question",
        name: `Як перевірити сумісність ${productLabel} з моїм авто?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Для перевірки сумісності ${productLabel} від ${producerLabel} надайте VIN-код або марку, модель і рік авто. Менеджер PartsON безкоштовно підбере запчастину категорії ${groupLabel}. Підбір також за оригінальним артикулом або кодом.`,
        },
      },
      {
        "@type": "Question",
        name: `Яка наявність і терміни доставки ${productLabel}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Зараз ${productLabel} ${availLabel}. Доставка по Львову — кур'єром у день замовлення. По Україні — Нова Пошта, Укрпошта або Meest, 1–3 дні. Самовивіз у нашому магазині у Львові.`,
        },
      },
      {
        "@type": "Question",
        name: `Чи є гарантія на ${productLabel}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Так, PartsON надає гарантію якості на всі запчастини від перевірених постачальників. Продаємо оригінальні та аналогові деталі — ${producerLabel} та інших брендів. У разі питань менеджер допоможе з поверненням або заміною.`,
        },
      },
    ],
  };
};

const findCatalogProductByArticleFast = async (value: string) => {
  const normalized = (value || "").trim();
  if (!normalized) return null;

  const byArticle = await fetchCatalogProductsByArticle(normalized, {
    limit: 4,
    timeoutMs: 480,
    retries: 0,
    retryDelayMs: 100,
    cacheTtlMs: 1000 * 20,
    exactOnly: true,
  });
  if (byArticle.length === 0) return null;

  const target = normalized.toLowerCase();
  return (
    byArticle.find((item) => item.article.trim().toLowerCase() === target) ||
    byArticle.find((item) => item.code.trim().toLowerCase() === target) ||
    byArticle[0] ||
    null
  );
};

const FAST_PRODUCT_CATALOG_LOOKUP_OPTIONS = {
  lookupLimit: 10,
  fallbackPages: 1,
  pageSize: 24,
  timeoutMs: 820,
  retries: 0,
  retryDelayMs: 100,
  cacheTtlMs: 1000 * 20,
};
const DEEP_PRODUCT_CATALOG_LOOKUP_OPTIONS = {
  lookupLimit: 14,
  fallbackPages: 1,
  pageSize: 28,
  timeoutMs: 1050,
  retries: 0,
  retryDelayMs: 100,
  cacheTtlMs: 1000 * 60 * 10,
};
const getCatalogProductUncached = async (code: string) => {
  const initialMatch = await getFirstResolvedNonNull([
    findCatalogProductByCode(code, FAST_PRODUCT_CATALOG_LOOKUP_OPTIONS).catch(
      () => null
    ),
    findCatalogProductByArticleFast(code).catch(() => null),
  ]);
  if (initialMatch) return initialMatch;

  // Reliability fallback: use default deep lookup only when fast sources miss.
  return findCatalogProductByCode(code, DEEP_PRODUCT_CATALOG_LOOKUP_OPTIONS).catch(
    () => null
  );
};

// No unstable_cache here — ISR (revalidate=3600) + oneC.js in-memory cache are sufficient.
// unstable_cache with a 900s TTL would prevent admin edits from showing immediately
// because revalidateTag has a race condition with router.refresh() in Next.js 16.
// After clearOneCCacheForProduct() + revalidatePath(), the next RSC render fetches fresh.
const getCatalogProduct = cache(getCatalogProductUncached);

const buildProductMetaDescription = (options: {
  name?: string;
  article?: string;
  code?: string;
  category?: string;
  group?: string;
  subGroup?: string;
}) => {
  const { category, group, subGroup } = options;
  const categoryLabel = buildVisibleProductName(category || "автозапчастин");
  const groupLabel =
    group && buildVisibleProductName(group).toLowerCase() !== categoryLabel.toLowerCase()
      ? buildVisibleProductName(group)
      : "";
  const subGroupLabel =
    subGroup && buildVisibleProductName(subGroup).toLowerCase() !== groupLabel.toLowerCase()
      ? buildVisibleProductName(subGroup)
      : "";

  return trimSeoDescription(
    [
      `Купити автозапчастини з категорії ${categoryLabel}${groupLabel ? `, група ${groupLabel}` : ""}${subGroupLabel ? `, ${subGroupLabel}` : ""}.`,
      "Онлайн замовлення на сайті.",
      `${STORE_PHONE_DISPLAY}, ${STORE_ADDRESS}.`,
    ].join(" ")
  );
};

const buildProductFallbackDescription = (options: {
  visibleName: string;
  producer: string;
  group: string;
  subGroup: string;
  quantity: number;
}) => {
  const { visibleName, producer, group, subGroup, quantity } = options;
  const categoryLabel =
    buildVisibleProductName(subGroup || group || "каталогу автозапчастин");
  const availabilityLabel =
    quantity > 0
      ? "Наявність і ціну підтверджуємо перед оформленням."
      : "Менеджер уточнить термін постачання перед замовленням.";

  return trimSeoDescription([
    `${trimSeoPhrase(`${visibleName}${producer ? ` ${producer}` : ""}`, 82)}. ${availabilityLabel}`,
    `${categoryLabel ? `Категорія: ${categoryLabel}.` : ""}`,
    "Підбір за VIN, перевірка сумісності, аналоги, артикул, код виробника, самовивіз у Львові та доставка по Україні.",
    "Перед замовленням звіряємо параметри деталі, виробника, покоління авто й можливі заміни.",
  ].filter(Boolean).join(" "), 300);
};

const trimSeoPhrase = (value: string, maxLength: number) => {
  const normalized = makeSeoTextTrim(value);
  if (normalized.length <= maxLength) return normalized;

  const slice = normalized.slice(0, maxLength + 1);
  const boundary = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf(","));
  return `${stripTrailingSeoPunctuation(
    slice.slice(0, boundary > 48 ? boundary : maxLength)
  )}...`;
};

const trimSeoDescription = (
  value: string,
  maxLength = PRODUCT_META_DESCRIPTION_MAX_LENGTH
) => {
  const normalized = makeSeoTextTrim(value);
  if (normalized.length <= maxLength) return normalized;

  const slice = normalized.slice(0, maxLength + 1);
  const boundary = Math.max(
    slice.lastIndexOf("."),
    slice.lastIndexOf(";"),
    slice.lastIndexOf(","),
    slice.lastIndexOf(" ")
  );
  const trimmed = slice
    .slice(0, boundary > 120 ? boundary : maxLength)
    .replace(/\s+([.,;:!?])/g, "$1");

  return `${stripTrailingSeoPunctuation(trimmed)}...`;
};

const buildProductSeoTitle = (options: {
  name: string;
  producer?: string;
}) => {
  const { name, producer } = options;
  const baseName = buildVisibleProductName(name);
  const normalizedProducer = (producer || "").trim();
  const nameAlreadyHasProducer =
    normalizedProducer.length > 0 &&
    baseName.toLowerCase().includes(normalizedProducer.toLowerCase());
  const withProducer =
    normalizedProducer && !nameAlreadyHasProducer
      ? `${baseName} ${normalizedProducer}`
      : baseName;

  return trimSeoPhrase(withProducer, 65) || "Автозапчастина";
};

// Cross-reference/OEM codes live in parentheses in the raw 1C name (e.g. "(LIN030104/AD030213)")
// and get stripped everywhere else — pull them out so they're still searchable as keywords.
const extractParentheticalKeywordTokens = (rawName: string) => {
  const matches = (rawName || "").match(/\(([^)]*)\)/g) || [];
  const tokens: string[] = [];

  for (const match of matches) {
    const inner = match.slice(1, -1);
    for (const part of inner.split(/[/,;|]+/)) {
      const trimmed = part.trim();
      if (trimmed.length >= 3 && !tokens.includes(trimmed)) tokens.push(trimmed);
    }
  }

  return tokens;
};

const buildProductSeoKeywords = (options: {
  productName: string;
  article: string;
  code: string;
  producer: string;
  category: string;
  description?: string;
  rawName?: string;
}) => {
  const { productName, article, code, producer, category, description, rawName } = options;

  const descriptionWords: string[] = [];
  if (description) {
    const stopWords = new Set(["що", "для", "при", "або", "але", "від", "під", "над", "між", "без", "про", "через", "після", "перед", "його", "яких", "якій", "також", "може", "якщо", "цього", "буде", "були", "щоб", "своє", "коли", "яке", "який", "інші", "всіх", "такі", "деякі", "дана", "даний", "цими"]);
    const words = description
      .split(/[\s,\.;\:\!\?\/\(\)\-–—«»"']+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 4 && !stopWords.has(w.toLowerCase()) && !/^\d+$/.test(w));
    for (const word of words) {
      if (!descriptionWords.includes(word)) descriptionWords.push(word);
    }
  }

  const crossReferenceTokens = extractParentheticalKeywordTokens(rawName || "");

  const entries = [
    productName,
    article ? `${productName} ${article}` : null,
    producer ? `${productName} ${producer}` : null,
    category ? `${productName} ${category}` : null,
    article ? `${article} купити` : null,
    code && code !== article ? `${code} купити` : null,
    producer ? `${producer} запчастини` : null,
    category ? `${category} купити` : null,
    ...crossReferenceTokens,
    ...descriptionWords,
    "автозапчастини Львів",
    "підбір запчастин за VIN",
    "PartsON",
  ];

  return Array.from(
    new Set(
      entries
        .map((entry) => (entry || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )
  ).slice(0, 20);
};

const getFirstResolvedNonNull = async <T,>(promises: Array<Promise<T | null>>) => {
  if (promises.length === 0) return null;

  const attempts = promises.map((promise, index) =>
    Promise.resolve(promise)
      .then((value) => ({ index, value }))
      .catch(() => ({ index, value: null as T | null }))
  );

  const pending = new Set<number>(attempts.map((_, index) => index));
  while (pending.size > 0) {
    const result = await Promise.race(
      Array.from(pending, (index) => attempts[index])
    );
    pending.delete(result.index);
    if (result.value != null) {
      return result.value;
    }
  }

  return null;
};

const toPositiveNumberOrNull = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const getProductSeoEuroRate = cache(async () =>
  resolveWithTimeout(() => fetchEuroRate(), 50, PRODUCT_PAGE_SEO_EURO_RATE_TIMEOUT_MS)
);

const resolveProductSeoPrice = cache(
  async (
    inlinePriceEuro: number | null | undefined
  ): Promise<{
    priceEuro: number | null;
    priceUah: number | null;
    euroRate: number | null;
  }> => {
    const inlinePrice = toPositiveNumberOrNull(inlinePriceEuro);
    if (inlinePrice == null) {
      return { priceEuro: null, priceUah: null, euroRate: null };
    }

    const priceEuro = inlinePrice;
    const euroRate = await getProductSeoEuroRate();
    const priceUah = toPriceUah(priceEuro, euroRate);

    return {
      priceEuro,
      priceUah,
      euroRate,
    };
  }
);

const buildCanonicalProductPath = (
  product: {
    code: string;
    article: string;
    name: string;
    producer: string;
    group?: string;
    subGroup?: string;
    category?: string;
  },
  fallbackCode: string
) =>
  buildProductPath({
    code: product.code || fallbackCode,
    article: product.article,
    name: product.name,
    producer: product.producer,
    group: product.group,
    subGroup: product.subGroup,
    category: product.category,
  });

const extractLookupTokensFromSeoNameSlug = (rawNameSlug: string) => {
  const normalized = safeDecodeURIComponent(rawNameSlug || "").trim().toLowerCase();
  if (!normalized) return [] as string[];

  const parts = normalized.split("-").map((entry) => entry.trim()).filter(Boolean);
  if (parts.length === 0) return [] as string[];

  const tokens = new Set<string>();
  const addLookupToken = (
    token: string,
    options?: { minLength?: number; requireDigit?: boolean }
  ) => {
    const normalizedToken = token.replace(/^-+|-+$/g, "").trim();
    const minLength = options?.minLength ?? 3;
    if (normalizedToken.length < minLength) return;
    if (options?.requireDigit && !/\d/.test(normalizedToken)) return;
    tokens.add(normalizedToken);
  };

  for (const part of parts) {
    addLookupToken(part, { requireDigit: true });
  }

  for (let tailSize = 1; tailSize <= 6; tailSize += 1) {
    if (parts.length < tailSize) continue;
    const tailParts = parts.slice(-tailSize);
    const minLength = tailSize === 1 ? 3 : 5;
    for (const separator of ["", "-", ".", "/", " "]) {
      addLookupToken(tailParts.join(separator), { minLength });
    }
  }

  return Array.from(tokens);
};

const extractPrimaryLookupTokenFromSeoNameSlug = (rawNameSlug: string) => {
  const normalized = safeDecodeURIComponent(rawNameSlug || "").trim().toLowerCase();
  if (!normalized) return "";

  const parts = normalized.split("-").map((entry) => entry.trim()).filter(Boolean);
  for (let tailSize = Math.min(6, parts.length); tailSize >= 2; tailSize -= 1) {
    const tailParts = parts.slice(-tailSize);
    const isNumericCodeTail = tailParts.every((part) => /^\d+$/.test(part));
    if (!isNumericCodeTail) continue;

    const hyphenatedCode = tailParts.join("-");
    if (hyphenatedCode.length >= 5) return hyphenatedCode;
    const compactCode = tailParts.join("");
    if (compactCode.length >= 5) return compactCode;
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const token = parts[index];
    if (token.length < 3) continue;
    if (!/\d/.test(token)) continue;
    return token;
  }

  for (let tailSize = Math.min(6, parts.length); tailSize >= 1; tailSize -= 1) {
    const tailParts = parts.slice(-tailSize);
    const lookupToken = tailParts.join(tailSize === 1 ? "" : "-");
    if (lookupToken.length >= (tailSize === 1 ? 3 : 5)) {
      return lookupToken;
    }
  }

  return "";
};

const doesProductMatchSeoNameSlug = (
  product: NonNullable<Awaited<ReturnType<typeof getCatalogProductUncached>>>,
  rawNameSlug: string
) => {
  const requestedSlug = safeDecodeURIComponent(rawNameSlug || "").trim().toLowerCase();
  if (!requestedSlug) return false;

  const canonicalSlug = buildProductNameSlug(product).toLowerCase();
  const legacySlug = buildLegacyProductNameSlug(product).toLowerCase();
  const requestedParts = requestedSlug.split("-").filter(Boolean);
  const canUsePrefixMatch = requestedParts.length >= 2 && requestedSlug.length >= 8;

  return (
    canonicalSlug === requestedSlug ||
    legacySlug === requestedSlug ||
    (canUsePrefixMatch &&
      (canonicalSlug.startsWith(`${requestedSlug}-`) ||
        legacySlug.startsWith(`${requestedSlug}-`)))
  );
};

type ResolvedProductRouteData = {
  code: string;
  isSeoRoute: boolean;
  product: Awaited<ReturnType<typeof getCatalogProductUncached>> | null;
};

const buildUniqueLookupTokens = (rawNameSlug: string) =>
  [
    extractPrimaryLookupTokenFromSeoNameSlug(rawNameSlug),
    ...extractLookupTokensFromSeoNameSlug(rawNameSlug),
  ].filter((token, index, array) => Boolean(token) && array.indexOf(token) === index);

const isPlausibleProductLookupToken = (token: string) => {
  const normalized = (token || "").trim();
  return normalized.length >= 4 && /\d/.test(normalized);
};

const normalizeProductLookupToken = (value: string) =>
  (value || "").trim().toLowerCase();

const compactProductLookupToken = (value: string) =>
  normalizeProductLookupToken(value).replace(/[\s./_-]+/g, "");

const normalizeProductRouteLookupParam = (value: string) =>
  safeDecodeURIComponent(value || "").trim().toLowerCase();

const getSitemapProductLookupIndex = cache(async () => {
  const snapshotEntries = await getAllProductSitemapSnapshotEntries().catch(
    () => []
  );
  const entries = snapshotEntries.length > 0
    ? snapshotEntries
    : shouldPreferSitemapProductLookup
      ? await getAllPricedProductSitemapEntries().catch(() => [])
      : await getAllProductSitemapEntries().catch(() => []);
  const index = new Map<string, CatalogProduct>();

  for (const entry of entries) {
    const product = buildCatalogProductFromSitemapEntry(entry);
    const routeParam = normalizeProductRouteLookupParam(
      buildProductPath({
        code: entry.code,
        article: entry.article,
        name: entry.name,
        producer: entry.producer,
        group: entry.group,
        subGroup: entry.subGroup,
        category: entry.category,
      }).replace(/^\/product\//, "")
    );

    if (routeParam && !index.has(`route:${routeParam}`)) {
      index.set(`route:${routeParam}`, product);
    }

    for (const candidate of [entry.article || "", entry.code || ""]) {
      const direct = normalizeProductLookupToken(candidate);
      const compact = compactProductLookupToken(candidate);
      if (direct && !index.has(`direct:${direct}`)) {
        index.set(`direct:${direct}`, product);
      }
      if (compact && !index.has(`compact:${compact}`)) {
        index.set(`compact:${compact}`, product);
      }
    }
  }

  return index;
});

const findSitemapProductByLookupTokens = cache(async (lookupTokens: string[]) => {
  const normalizedTokens = Array.from(
    new Set(
      lookupTokens
        .map((token) => token.trim())
        .filter(isPlausibleProductLookupToken)
    )
  );
  if (normalizedTokens.length === 0) return null;

  const index = await getSitemapProductLookupIndex();

  for (const token of normalizedTokens) {
    const direct = normalizeProductLookupToken(token);
    const compact = compactProductLookupToken(token);
    const matched =
      index.get(`direct:${direct}`) || index.get(`compact:${compact}`) || null;
    if (matched) return matched;
  }

  return null;
});

const findSitemapProductByRouteParam = cache(async (rawParam: string) => {
  const routeParam = normalizeProductRouteLookupParam(rawParam);
  if (!routeParam) return null;

  const index = await getSitemapProductLookupIndex();
  return index.get(`route:${routeParam}`) || null;
});

const findCatalogProductByLookupToken = async (token: string) => {
  if (shouldPreferSitemapProductLookup) {
    const sitemapMatch = await findSitemapProductByLookupTokens([token]).catch(
      () => null
    );
    if (sitemapMatch) return sitemapMatch;
  }

  const fastMatch = await getFirstResolvedNonNull([
    findCatalogProductByCode(
      token,
      {
        ...FAST_PRODUCT_CATALOG_LOOKUP_OPTIONS,
        timeoutMs: 850,
        lookupLimit: 8,
        exactOnly: true,
      }
    ).catch(() => null),
    findCatalogProductByArticleFast(token).catch(() => null),
  ]);

  if (fastMatch) {
    return fastMatch;
  }

  return getCatalogProduct(token).catch(() => null);
};

const resolveProductFromSeoNameSlug = async (rawNameSlug: string) => {
  const lookupTokens = buildUniqueLookupTokens(rawNameSlug);

  for (const token of lookupTokens) {
    const matchedProduct = await findCatalogProductByLookupToken(token);
    const matchedCode = (matchedProduct?.code || matchedProduct?.article || "").trim();
    if (!matchedProduct || !matchedCode) continue;
    if (!doesProductMatchSeoNameSlug(matchedProduct, rawNameSlug)) continue;

    return {
      code: matchedCode,
      product: matchedProduct,
    };
  }

  return null;
};

const resolveProductCodeFromRouteParamUncached = async (rawCode: string) => {
  const decodedParam = safeDecodeURIComponent(rawCode || "").trim();
  const routeSlugs = extractProductRouteSlugsFromParam(rawCode || "");
  if (routeSlugs) {
    const matchedProductRoute = await resolveProductFromSeoNameSlug(routeSlugs.nameSlug);
    if (matchedProductRoute) {
      return {
        code: matchedProductRoute.code,
        isSeoRoute: true,
        product: matchedProductRoute.product,
      };
    }

    const resolvedCode = await resolveProductCodeFromSeoRoute(
      routeSlugs.groupSlug,
      routeSlugs.nameSlug
    );
    if (resolvedCode) {
      return {
        code: resolvedCode,
        isSeoRoute: true,
        product: null,
      };
    }

    const resolvedCodeByNameSlug = await resolveProductCodeFromNameSlug(
      routeSlugs.nameSlug
    );
    if (resolvedCodeByNameSlug) {
      return {
        code: resolvedCodeByNameSlug,
        isSeoRoute: true,
        product: null,
      };
    }

    return {
      code: "",
      isSeoRoute: false,
      product: null,
    };
  }

  const directCode = extractProductCodeFromParam(rawCode || "");
  // When the URL is in CODE~slug format, directCode is the prefix before "~" and
  // differs from the full decodedParam. In that case the decodedParam is not a valid
  // name slug — skip slug-based resolution entirely to avoid burning the resolver
  // budget on a guaranteed-miss global catalog scan.
  const hasCodePrefix = Boolean(directCode) && directCode !== decodedParam;
  // Pure numeric-dash codes (e.g. "00-00000100") are direct 1C codes, not SEO slugs.
  const isDirectNumericCode = !hasCodePrefix && /^\d{2,}-\d{4,}$/.test(decodedParam);
  const looksLikeSeoNameSlug =
    !hasCodePrefix && !isDirectNumericCode && decodedParam.includes("-") && !decodedParam.includes("~");
  const directProduct = directCode && !looksLikeSeoNameSlug
    ? await findCatalogProductByLookupToken(directCode)
    : null;
  const directProductCode = (directProduct?.code || directProduct?.article || "").trim();
  if (directProductCode) {
    return {
      code: directProductCode,
      isSeoRoute: false,
      product: directProduct,
    };
  }

  if (!hasCodePrefix) {
    const matchedProductRoute = await resolveProductFromSeoNameSlug(decodedParam);
    if (matchedProductRoute) {
      return {
        code: matchedProductRoute.code,
        isSeoRoute: true,
        product: matchedProductRoute.product,
      };
    }

    const resolvedCodeByNameSlug = await resolveProductCodeFromNameSlug(decodedParam);
    if (resolvedCodeByNameSlug) {
      return {
        code: resolvedCodeByNameSlug,
        isSeoRoute: true,
        product: null,
      };
    }
  }

  // directCode was extracted from the URL but no product was confirmed in the
  // catalog via any lookup path. Return empty code so the caller can apply
  // canUseDirectFallbackCode heuristics rather than always showing a fallback page.
  return {
    code: "",
    isSeoRoute: false,
    product: null,
  };
};

const resolveProductCodeFromRouteParamCached = unstable_cache(
  resolveProductCodeFromRouteParamUncached,
  ["product-page:resolve-route-v13-article-slug-variants"],
  { revalidate: 900, tags: ["product-page-data"] }
);

const resolveProductCodeFromRouteParam = cache(async (rawCode: string) => {
  const cachedRouteData = await resolveProductCodeFromRouteParamCached(rawCode);
  if (cachedRouteData.code) {
    return cachedRouteData;
  }

  return resolveProductCodeFromRouteParamUncached(rawCode);
});

const getResolvedProductRouteDataUncached = async (
  rawCode: string
): Promise<ResolvedProductRouteData> => {
  const resolvedRoute = await resolveProductCodeFromRouteParam(rawCode);
  if (!resolvedRoute.code) {
    return {
      code: "",
      isSeoRoute: resolvedRoute.isSeoRoute,
      product: null,
    };
  }

  if (resolvedRoute.product) {
    return {
      code: resolvedRoute.code,
      isSeoRoute: resolvedRoute.isSeoRoute,
      product: resolvedRoute.product,
    };
  }

  return {
    code: resolvedRoute.code,
    isSeoRoute: resolvedRoute.isSeoRoute,
    product: await getCatalogProduct(resolvedRoute.code),
  };
};

const getResolvedProductRouteDataCached = unstable_cache(
  getResolvedProductRouteDataUncached,
  ["product-page:resolved-route-product-v13-article-slug-variants"],
  { revalidate: 900, tags: ["product-page-data"] }
);

const getResolvedProductRouteData = cache(async (rawCode: string) => {
  const cachedRouteData = await getResolvedProductRouteDataCached(rawCode);
  if (cachedRouteData.code) {
    return cachedRouteData;
  }

  return getResolvedProductRouteDataUncached(rawCode);
});

const canUseDirectProductCodeFallback = (rawCode: string) => {
  const decodedParam = safeDecodeURIComponent(rawCode || "").trim();
  if (!decodedParam) return false;
  if (extractProductRouteSlugsFromParam(decodedParam)) return false;

  // Pure numeric code with dashes (e.g. "00-00000100") — standard 1C internal code format.
  // These are not SEO slugs: no letters, so there is no name/article ambiguity.
  if (/^\d{2,}-\d{4,}$/.test(decodedParam)) return true;

  return decodedParam.includes("~") || !decodedParam.includes("-");
};

const resolveProductRouteDataFromSitemapParam = cache(
  async (rawCode: string): Promise<ResolvedProductRouteData | null> => {
    const decodedParam = safeDecodeURIComponent(rawCode || "").trim();
    if (!decodedParam) return null;

    const routeProduct = await findSitemapProductByRouteParam(decodedParam).catch(
      () => null
    );
    const routeProductCode = (routeProduct?.code || routeProduct?.article || "").trim();
    if (routeProduct && routeProductCode) {
      return {
        code: routeProductCode,
        isSeoRoute: true,
        product: routeProduct,
      };
    }

    const routeSlugs = extractProductRouteSlugsFromParam(decodedParam);
    const canUseDirectFallbackCode = canUseDirectProductCodeFallback(decodedParam);
    const lookupSource =
      routeSlugs?.nameSlug || (!canUseDirectFallbackCode ? decodedParam : "");
    const lookupTokens = lookupSource ? buildUniqueLookupTokens(lookupSource) : [];
    if (lookupTokens.length === 0) return null;

    const product = await findSitemapProductByLookupTokens(lookupTokens).catch(
      () => null
    );
    const code = (product?.code || product?.article || "").trim();
    if (!product || !code) return null;

    return {
      code,
      isSeoRoute: Boolean(lookupSource),
      product,
    };
  }
);

const recoverProductRouteDataFromNameSlug = async (
  rawCode: string
): Promise<ResolvedProductRouteData | null> => {
  const decodedParam = safeDecodeURIComponent(rawCode || "").trim();
  if (!decodedParam || extractProductRouteSlugsFromParam(decodedParam)) return null;

  const recoveredRoute = await resolveWithTimeout(
    () => resolveProductFromSeoNameSlug(decodedParam),
    null,
    PRODUCT_PAGE_ROUTE_RECOVERY_TIMEOUT_MS
  );
  if (recoveredRoute?.code) {
    return {
      code: recoveredRoute.code,
      isSeoRoute: true,
      product: recoveredRoute.product,
    };
  }

  const recoveredCode = await resolveWithTimeout(
    () => resolveProductCodeFromNameSlug(decodedParam),
    null,
    PRODUCT_PAGE_ROUTE_RECOVERY_TIMEOUT_MS
  );
  if (!recoveredCode) return null;

  const recoveredProduct = await resolveWithTimeout(
    () => getCatalogProduct(recoveredCode),
    null,
    PRODUCT_PAGE_PRODUCT_LOOKUP_TIMEOUT_MS
  );

  return {
    code: recoveredCode,
    isSeoRoute: true,
    product: recoveredProduct,
  };
};

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { code: rawCode } = await params;
  const isModalView = false;
  const decodedParam = safeDecodeURIComponent(rawCode || "").trim();
  const routeSlugs = extractProductRouteSlugsFromParam(decodedParam);
  const fallbackCode = extractProductCodeFromParam(decodedParam);
  const canUseDirectFallbackCode = canUseDirectProductCodeFallback(rawCode || "");
  let routeData =
    shouldPreferSitemapProductLookup
      ? (await resolveProductRouteDataFromSitemapParam(rawCode || "")) ?? {
          code: "",
          isSeoRoute: false,
          product: null,
        }
      : await resolveWithTimeout(
          () => getResolvedProductRouteData(rawCode || ""),
          { code: "", isSeoRoute: false, product: null },
          PRODUCT_PAGE_METADATA_ROUTE_DATA_TIMEOUT_MS
        );
  if (!routeData.code && canUseDirectFallbackCode && fallbackCode) {
    const directProduct = await resolveWithTimeout(
      () => getCatalogProduct(fallbackCode),
      null,
      700
    );
    if (directProduct) {
      routeData = {
        code: (directProduct.code || directProduct.article || fallbackCode).trim(),
        isSeoRoute: false,
        product: directProduct,
      };
    }
  }
  if (!routeData.code) {
    const metadataLookupSource = routeSlugs?.nameSlug || (!canUseDirectFallbackCode ? decodedParam : "");
    const metadataLookupTokens = metadataLookupSource
      ? buildUniqueLookupTokens(metadataLookupSource)
      : [];
    const sitemapProduct = await resolveWithTimeout(
      () => findSitemapProductByLookupTokens(metadataLookupTokens),
      null,
      650
    );
    if (sitemapProduct) {
      routeData = {
        code: (sitemapProduct.code || sitemapProduct.article || "").trim(),
        isSeoRoute: Boolean(metadataLookupSource),
        product: sitemapProduct,
      };
    }
  }

  const routeProduct = routeData.product;
  const resolvedCode = (routeData.code || fallbackCode || "").trim();
  const fallbackTitleSource =
    routeSlugs?.nameSlug || resolvedCode || decodedParam || "Товар";
  const productProducer = (routeProduct?.producer || "").trim();
  const productArticle = (routeProduct?.article || "").trim();
  const productCategory = (routeProduct?.category || "").trim();
  const productGroup = (routeProduct?.group || productCategory || "").trim();
  const productSubGroup = (routeProduct?.subGroup || "").trim();
  const seoVisibleProductName = buildPureProductName(
    routeProduct?.name || buildReadableNameFromSlugSource(fallbackTitleSource),
    {
      producer: productProducer,
      article: productArticle,
      group: productGroup,
      subGroup: productSubGroup,
    }
  );
  const categoryLabel = buildVisibleProductName(productSubGroup || productGroup || productCategory);
  const canonicalPath = routeProduct
    ? buildCanonicalProductPath(routeProduct, resolvedCode || fallbackCode)
    : `/product/${encodeURIComponent(decodedParam || resolvedCode || fallbackCode || "")}`;

  const productImagePath = routeProduct && routeProduct.hasPhoto !== false
    ? buildProductImagePath(routeProduct.code || resolvedCode, routeProduct.article, {
        noFallback: false,
      })
    : PRODUCT_IMAGE_FALLBACK_PATH;
  const siteUrl = getSiteUrl();
  const productImageUrl = `${siteUrl}${productImagePath}`;
  const canonicalUrl = `${siteUrl}${canonicalPath}`;
  const shouldIndexProduct = !isModalView && Boolean(routeProduct);

  const inlinePriceEuroForMeta = toPositiveNumberOrNull(routeProduct?.priceEuro);
  const seoPriceForMeta = await resolveProductSeoPrice(inlinePriceEuroForMeta);

  const seoTitle = buildProductSeoTitle({
    name: seoVisibleProductName,
    producer: productProducer,
  });

  const description = buildProductMetaDescription({
    category: productCategory || productGroup,
    group: productCategory ? productGroup : productSubGroup,
    subGroup: productCategory ? productSubGroup : "",
  });

  const keywords = buildProductSeoKeywords({
    productName: seoVisibleProductName,
    article: productArticle,
    code: resolvedCode,
    producer: productProducer,
    category: categoryLabel,
    description: routeProduct?.description,
    rawName: routeProduct?.name,
  });

  return {
    metadataBase: new URL(siteUrl),
    title: {
      absolute: seoTitle,
    },
    description,
    keywords,
    alternates: {
      canonical: canonicalPath,
      languages: {
        "uk-UA": canonicalPath,
        "x-default": canonicalPath,
      },
    },
    category: "auto parts",
    openGraph: {
      type: "article",
      url: canonicalUrl,
      title: seoTitle,
      description,
      images: [{
        url: productImageUrl,
        alt: `${seoVisibleProductName}${productArticle ? ` арт. ${productArticle}` : ""} — автозапчастина PartsON`,
      }],
      siteName: "PartsON",
      locale: "uk_UA",
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description,
      images: [{ url: productImageUrl, alt: `${seoVisibleProductName}${productArticle ? ` арт. ${productArticle}` : ""} — автозапчастина PartsON` }],
    },
    robots: {
      index: shouldIndexProduct,
      follow: true,
      googleBot: {
        index: shouldIndexProduct,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    other: {
      "product:retailer_item_id": resolvedCode || productArticle,
      "product:brand": productProducer,
      "product:category": categoryLabel,
      ...(seoPriceForMeta.priceUah != null
        ? {
            "product:price:amount": String(seoPriceForMeta.priceUah),
            "product:price:currency": "UAH",
          }
        : {}),
      "product:availability":
        routeProduct && routeProduct.quantity > 0 ? "in stock" : "out of stock",
      "geo.region": "UA-46",
      "geo.placename": "Львів",
    },
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const sp = searchParams ? await searchParams : {} as Record<string, string>;
  if (sp._refresh) {
    noStore();
    clearAllOneCCache();
  }
  const { code: rawCode } = await params;
  const routeSlugs = extractProductRouteSlugsFromParam(rawCode || "");
  const fallbackCodeFromRoute = extractProductCodeFromParam(rawCode || "");
  const canUseDirectFallbackCode = canUseDirectProductCodeFallback(rawCode || "");
  const routeLookupSource = routeSlugs?.nameSlug || (!canUseDirectFallbackCode ? rawCode || "" : "");
  const routeLookupTokens = routeLookupSource ? buildUniqueLookupTokens(routeLookupSource) : [];
  const primaryRouteLookupToken =
    routeLookupTokens.find(isPlausibleProductLookupToken) || "";
  const sitemapRouteDataPromise = shouldPreferSitemapProductLookup
    ? resolveProductRouteDataFromSitemapParam(rawCode || "")
    : null;
  let directCodeProductPromise: Promise<CatalogProduct | null> | null = null;
  // Direct 1C lookup is delayed until the local sitemap snapshot misses.
  if (
    !shouldPreferSitemapProductLookup &&
    canUseDirectFallbackCode &&
    fallbackCodeFromRoute
  ) {
    directCodeProductPromise = getCatalogProduct(fallbackCodeFromRoute).catch(() => null);
  }
  const slugRecoveredProductPromise = primaryRouteLookupToken
    ? shouldPreferSitemapProductLookup
      ? findSitemapProductByLookupTokens(routeLookupTokens).catch(() => null)
      : getFirstResolvedNonNull<CatalogProduct>([
          getCatalogProduct(primaryRouteLookupToken).catch(() => null),
          findSitemapProductByLookupTokens(routeLookupTokens).catch(() => null),
        ])
    : null;
  const sitemapRouteData = await sitemapRouteDataPromise;
  let routeData =
    sitemapRouteData ??
    (canUseDirectFallbackCode && fallbackCodeFromRoute && !routeSlugs
      ? {
          code: "",
          isSeoRoute: false,
          product: null,
        }
      : await resolveWithTimeout(
          () => getResolvedProductRouteData(rawCode || ""),
          {
            code: "",
            isSeoRoute: false,
            product: null,
          },
          PRODUCT_PAGE_ROUTE_DATA_TIMEOUT_MS
        ));
  if (!routeData.code) {
    const recoveredRouteData = await resolveWithTimeout(
      () => recoverProductRouteDataFromNameSlug(rawCode || ""),
      null,
      PRODUCT_PAGE_ROUTE_RECOVERY_TIMEOUT_MS
    );
    if (recoveredRouteData?.code) {
      routeData = recoveredRouteData;
    }
  }

  let resolvedCode = (routeData.code || (canUseDirectFallbackCode ? fallbackCodeFromRoute : "") || "").trim();
  let product = routeData.product;

  if (resolvedCode) {
    const freshProduct = await resolveWithTimeout(
      () =>
        directCodeProductPromise && resolvedCode === fallbackCodeFromRoute
          ? directCodeProductPromise
          : getCatalogProduct(resolvedCode),
      null,
      PRODUCT_PAGE_PRODUCT_LOOKUP_TIMEOUT_MS
    );
    if (freshProduct) product = freshProduct;
  }

  if (!resolvedCode && canUseDirectFallbackCode && fallbackCodeFromRoute) {
    const directFallbackProduct = await resolveWithTimeout(
      () => directCodeProductPromise || getCatalogProduct(fallbackCodeFromRoute),
      null,
      1200
    );
    if (directFallbackProduct) {
      product = directFallbackProduct;
      resolvedCode = (directFallbackProduct.code || directFallbackProduct.article || fallbackCodeFromRoute).trim();
    }
  }

  if (!resolvedCode && !canUseDirectFallbackCode && !routeSlugs) {
    const legacySlugLookupToken = primaryRouteLookupToken || extractPrimaryLookupTokenFromSeoNameSlug(rawCode || "");
    if (legacySlugLookupToken) {
      const legacyFallbackProduct = await resolveWithTimeout(
        () => slugRecoveredProductPromise || getCatalogProduct(legacySlugLookupToken),
        null,
        PRODUCT_PAGE_PRODUCT_LOOKUP_TIMEOUT_MS
      );
      // Only accept the product if its canonical slug matches the requested URL.
      // Without this check a numeric token (e.g. "12345") could match an unrelated
      // product and cause a redirect to the wrong page.
      if (legacyFallbackProduct && doesProductMatchSeoNameSlug(legacyFallbackProduct, rawCode || "")) {
        product = legacyFallbackProduct;
        resolvedCode = (
          legacyFallbackProduct.code ||
          legacyFallbackProduct.article ||
          legacySlugLookupToken
        ).trim();
      }
    }
  }

  if (!resolvedCode) {
    // Only recover a fallback code for patterns that are plausibly real product codes:
    //   - codes without any dashes (e.g. "12345", "ABC123") — canUseDirectFallbackCode
    //   - codes/slugs that contain the "~" segment separator — canonical indexed routes
    //   - indexed routes with the "--" group/name separator — recover the embedded code
    //     from the name slug portion so API-down renders don't 404 valid URLs
    // Do NOT expand arbitrary dash-separated strings (e.g. "invalid-product-xyz")
    // into a resolved code — those should fall through to notFound().
    const recoveredToken = routeSlugs?.nameSlug
      ? extractPrimaryLookupTokenFromSeoNameSlug(routeSlugs.nameSlug)
      : primaryRouteLookupToken || null;

    resolvedCode = (
      (canUseDirectFallbackCode ? fallbackCodeFromRoute : null) ||
      (recoveredToken && isPlausibleProductLookupToken(recoveredToken)
        ? recoveredToken
        : null) ||
      ""
    ).trim();
  }

  if (!product && slugRecoveredProductPromise) {
    const recoveredProduct = await resolveWithTimeout(
      () => slugRecoveredProductPromise,
      null,
      650
    );
    if (recoveredProduct) {
      product = recoveredProduct;
      resolvedCode = (
        recoveredProduct.code ||
        recoveredProduct.article ||
        resolvedCode ||
        primaryRouteLookupToken
      ).trim();
    }
  }

  if (!resolvedCode) notFound();

  const hasResolvedCatalogProduct = Boolean(product);
  if (!product) {
    notFound();
  }

  const isModalView = false;
  const isSeoResolvedInternally = false;
  const canonicalPath = buildCanonicalProductPath(product, resolvedCode);
  const currentRouteParam = safeDecodeURIComponent(rawCode || "").trim();
  const canonicalRouteParam = safeDecodeURIComponent(
    canonicalPath.replace(/^\/product\//, "")
  ).trim();

  if (
    hasResolvedCatalogProduct &&
    !isSeoResolvedInternally &&
    currentRouteParam !== canonicalRouteParam
  ) {
    redirect(canonicalPath);
  }

  const primaryLookupKey =
    product.article.trim() || product.code.trim() || resolvedCode;
  const lookupKeys = isModalView
    ? [primaryLookupKey]
    : Array.from(
        new Set([product.article.trim(), product.code.trim(), resolvedCode].filter(Boolean))
      );
  const inlineInitialPriceEuro = toPositiveNumberOrNull(product.priceEuro);
  const shouldEmitProductStructuredData = !isModalView && hasResolvedCatalogProduct;
  const productCategory = (product.category || "").trim();
  const productGroup = (product.group || productCategory || "").trim();
  const productSubgroup = (product.subGroup || "").trim();
  const visibleProductName = buildPureProductName(product.name, {
    producer: product.producer,
    article: product.article,
    group: productGroup,
    subGroup: productSubgroup,
  });
  const visibleProductGroup = buildVisibleProductName(productGroup);
  const visibleProductSubgroup = buildVisibleProductName(productSubgroup);
  const siteUrl = getSiteUrl();
  const pagePrice = await resolveProductSeoPrice(inlineInitialPriceEuro);
  const initialPriceUah = pagePrice.priceUah;
  const recommendationEuroRate = pagePrice.euroRate ?? undefined;
  const initialCostPriceUah =
    product.costPriceEuro != null && pagePrice.euroRate != null
      ? toPriceUah(product.costPriceEuro, pagePrice.euroRate)
      : null;
  const fallbackDescription = buildProductFallbackDescription({
    visibleName: visibleProductName,
    producer: product.producer,
    group: productGroup,
    subGroup: productSubgroup,
    quantity: product.quantity,
  });
  const schemaDescription = buildProductMetaDescription({
    category: productCategory || productGroup,
    group: productCategory ? productGroup : productSubgroup,
    subGroup: productCategory ? productSubgroup : "",
  });
  const categoryCatalogGroupValue =
    productGroup || productCategory || productSubgroup;
  const categoryCatalogSubcategoryValue =
    productSubgroup || undefined;
  const groupSeoFallbackPath = productGroup
    ? buildProductGroupLandingFallbackPath(productCategory, productGroup)
    : null;
  const producerLandingPath = product.producer
    ? buildManufacturerPath(product.producer)
    : null;
  const brandLogoMap = await getBrandLogoMap().catch(() => new Map<string, string>());
  const producerLogoPath = product.producer
    ? resolveProducerLogo(product.producer, brandLogoMap)
    : null;
  const producerDescription = product.producer
    ? (producerDescriptions[product.producer] ?? null)
    : null;
  const categoryCatalogPath = categoryCatalogGroupValue
    ? buildCatalogCategoryPath(categoryCatalogGroupValue, categoryCatalogSubcategoryValue)
    : "/katalog";
  const groupLandingPath = groupSeoFallbackPath;
  const categoryLandingPath = productSubgroup
    ? buildProductGroupLandingFallbackPath(productCategory || productGroup, productSubgroup)
    : groupSeoFallbackPath;
  const categoryLandingHref =
    categoryLandingPath ||
    groupLandingPath ||
    groupSeoFallbackPath ||
    categoryCatalogPath;
  const topCategoryPath =
    productCategory &&
    productCategory.toLowerCase() !== productGroup.toLowerCase()
      ? buildGroupPath(productCategory)
      : null;
  const categoryHierarchyParts = [
    topCategoryPath ? productCategory : null,
    productGroup || null,
    productSubgroup && productSubgroup.toLowerCase() !== productGroup.toLowerCase()
      ? productSubgroup
      : null,
  ].filter(Boolean) as string[];
  const categoryHierarchyText = categoryHierarchyParts
    .map(buildVisibleProductName)
    .filter(Boolean)
    .join(" → ");
  const canonicalUrl = `${siteUrl}${canonicalPath}`;
  const productHasKnownPhoto = product.hasPhoto !== false;
  const productDisplayImagePath = productHasKnownPhoto
    ? buildProductImagePath(product.code || resolvedCode, product.article, {
        catalog: true,
      })
    : "";
  const productSeoImagePath = productHasKnownPhoto
    ? buildProductImagePath(product.code || resolvedCode, product.article)
    : PRODUCT_IMAGE_FALLBACK_PATH;
  const productSeoImageUrl = `${siteUrl}${productSeoImagePath}`;
  const reviewStats = resolvedCode
    ? await resolveWithTimeout(() => getProductReviewStats(resolvedCode), null, 150)
    : null;
  const jsonLd = shouldEmitProductStructuredData
    ? buildProductJsonLd({
        name: product.name,
        visibleName: visibleProductName,
        description: schemaDescription,
        code: product.code,
        article: product.article,
        producer: product.producer,
        group: productGroup,
        subGroup: productSubgroup,
        quantity: product.quantity,
        priceUah: initialPriceUah,
        canonicalUrl,
        imageUrls: [productSeoImageUrl],
        aggregateRating: reviewStats ?? undefined,
      })
    : null;
  const itemPageJsonLd = buildProductItemPageJsonLd({
    siteUrl,
    canonicalUrl,
    name: visibleProductName,
    description: schemaDescription,
    imageUrl: productSeoImageUrl,
    hasProductSchema: Boolean(jsonLd),
  });
  const breadcrumbJsonLd = buildProductBreadcrumbJsonLd({
    siteUrl,
    canonicalUrl,
    name: visibleProductName,
    topCategoryName: topCategoryPath ? buildVisibleProductName(productCategory) : undefined,
    topCategoryPath: topCategoryPath || undefined,
    groupName: productGroup || undefined,
    groupPath: groupLandingPath,
    subGroupName: productSubgroup || undefined,
    subGroupPath: productSubgroup ? categoryLandingHref : null,
  });
  const isInStock = Number.isFinite(product.quantity) && product.quantity > 0;
  const faqJsonLd = buildProductFaqJsonLd({
    name: visibleProductName,
    producer: product.producer,
    group: productGroup,
    subGroup: productSubgroup,
    hasPrice: initialPriceUah != null,
    quantity: product.quantity,
  });
  const contentGridClass = isModalView
    ? "grid gap-2.5 p-2.5 sm:p-3"
    : "grid gap-3 p-2.5 sm:gap-3.5 sm:p-3.5 lg:p-4";
  const heroProductImageClass = isModalView
    ? "mx-auto aspect-square w-full max-w-[260px] rounded-[18px] border border-cyan-400/18 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.84),rgba(2,6,23,0.98))]"
    : "mx-auto aspect-square w-full max-w-[320px] rounded-[18px] border border-sky-100/70 bg-[radial-gradient(circle_at_top,rgba(224,242,254,0.9),rgba(255,255,255,0.98)_48%,rgba(241,245,249,0.96))] sm:max-w-[360px] xl:max-w-full";
  const descriptionTextClass = isModalView
    ? "mt-1.5 space-y-2 break-words text-sm font-medium leading-relaxed text-slate-700"
    : "mt-2.5 space-y-2.5 break-words text-[14px] font-medium leading-[1.62] text-slate-700 sm:text-[15px]";
  const chatPrefillMessage = [
    "Потрібна консультація по товару:",
    product.name,
    product.code ? `Код: ${product.code}` : null,
    product.article ? `Артикул: ${product.article}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const breadcrumbItems = ([
    { href: "/", label: "Головна" },
    { href: "/katalog", label: "Каталог" },
    topCategoryPath
      ? { href: topCategoryPath, label: buildVisibleProductName(productCategory) }
      : null,
    groupLandingPath && productGroup
      ? { href: groupLandingPath, label: visibleProductGroup }
      : null,
    productSubgroup &&
    productSubgroup.toLowerCase() !== (productGroup || "").toLowerCase()
      ? { href: categoryLandingHref, label: visibleProductSubgroup }
      : null,
  ].filter(Boolean) as Array<{ href: string; label: string }>).filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.href === item.href) === index
  );
  const normalizedProductArticle = hasResolvedCatalogProduct
    ? (product.article || "").trim()
    : "";
  const normalizedProductCode = (product.code || resolvedCode || "").trim();
  const hasDistinctProductCode =
    Boolean(normalizedProductArticle) &&
    Boolean(normalizedProductCode) &&
    normalizedProductArticle.toLowerCase() !== normalizedProductCode.toLowerCase();
  const productIdentifierLabel = normalizedProductArticle
    ? hasDistinctProductCode
      ? "Артикул"
      : "Артикул / код"
    : normalizedProductCode
      ? "Код товару"
      : "Ідентифікатор";
  const productIdentifierValue =
    normalizedProductArticle || normalizedProductCode || "-";
  const productIdentifierHint = hasDistinctProductCode
    ? `Код товару: ${normalizedProductCode}`
    : null;
  const productHeaderInfoItems = [
    product.producer
      ? {
          label: "Виробник",
          value: product.producer,
          href: producerLandingPath,
        }
      : null,
    visibleProductSubgroup || visibleProductGroup
      ? {
          label: visibleProductSubgroup
            ? "Підкатегорія"
            : topCategoryPath
              ? "Група"
              : "Категорія",
          value: visibleProductSubgroup || visibleProductGroup,
          href: categoryLandingHref,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; href?: string | null }>;
  const productHeaderMetaGridClass = productHeaderInfoItems.length > 0
    ? "mt-3 grid gap-2 sm:grid-cols-[minmax(210px,0.85fr)_minmax(0,1.15fr)]"
    : "mt-3 max-w-[380px]";
  const productHeadingText = buildFrontendProductHeading(product.name, {
    producer: product.producer,
    article: product.article,
    group: productGroup,
    subGroup: productSubgroup,
  });
  const productFitmentText = [
    categoryHierarchyText
      ? `Розділ каталогу: ${categoryHierarchyText}.`
      : visibleProductSubgroup || visibleProductGroup
        ? `Розділ каталогу: ${visibleProductSubgroup || visibleProductGroup}.`
        : null,
    "Надішліть VIN або дані авто в чат — менеджер перевірить сумісність, підбере аналоги та підкаже по наявності.",
  ]
    .filter(Boolean)
    .join(" ");
  const productSeoDetails = {
    title: "Підбір і важливі деталі",
    items: [
      productIdentifierValue !== "-"
        ? `Основний ідентифікатор для пошуку: ${productIdentifierValue}. За ним можна звірити товар у каталозі або швидко поставити питання менеджеру.`
        : "Товар можна підібрати за назвою, виробником, VIN-кодом або параметрами авто.",
      product.producer
        ? `Виробник: ${product.producer}. Якщо потрібен аналог, менеджер підбере сумісну заміну цього бренду або альтернативного виробника.`
        : "Для позицій без явного виробника перевіряємо сумісність за артикулом, кодом і описом з 1С.",
      visibleProductSubgroup || visibleProductGroup
        ? `Категорія: ${categoryHierarchyText || visibleProductSubgroup || visibleProductGroup}. Це допомагає швидко перейти до суміжних товарів і груп каталогу.`
        : "Сторінка товару доповнена описом, щоб його було легше знайти за кодом, артикулом і назвою.",
      product.quantity > 0
        ? "Наявність показана в картці товару, але перед оформленням замовлення ціну й залишок можна уточнити."
        : "Якщо товар не показує залишок, можна надіслати запит: менеджер уточнить термін постачання і запропонує аналоги.",
    ],
  };
  const productHeroHighlights = Array.from(
    new Set(
      [
        "VIN-підбір",
        "Аналоги",
        "Самовивіз Львів",
        "Доставка",
      ].filter(Boolean)
    )
  ).slice(0, 5);
  const faqItems = [
    {
      question: "Як замовити та оплатити?",
      answer: [
        isInStock
          ? `Є в наявності ${product.quantity} шт. — можна оформити відразу.`
          : "Доступно під замовлення — менеджер уточнить термін.",
        "Оплата: готівка, термінал, онлайн на сайті або рахунок для юросіб.",
      ].join(" "),
    },
    {
      question: "Як перевірити сумісність?",
      answer: `Надайте VIN-код або марку/модель/рік авто — менеджер безкоштовно підбере ${visibleProductName} з перевіркою сумісності. Також підбираємо за артикулом${product.article ? ` ${product.article}` : ""} або кодом.`,
    },
    {
      question: "Доставка та самовивіз?",
      answer:
        "Доставка: Нова Пошта, Укрпошта або Meest по всій Україні (1–3 дні). Кур'єром по Львову. Самовивіз у магазині — в день замовлення.",
    },
  ];
  return (
    <div
      className={isModalView ? "min-h-screen select-none bg-white text-slate-900" : "min-h-screen select-none text-slate-900"}
      style={isModalView ? undefined : pageBackground}
    >
      {productHasKnownPhoto ? (
        <link
          rel="preload"
          as="image"
          href={productDisplayImagePath}
          fetchPriority="high"
        />
      ) : null}
      <div
        className={
          isModalView
            ? "mx-auto w-full max-w-[1080px] px-2 py-2 sm:px-3 sm:py-3"
            : "page-shell-inline py-2.5 sm:py-4"
        }
      >
        <article
          className={`overflow-hidden border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.97),rgba(255,255,255,0.99))] shadow-[0_22px_58px_rgba(15,23,42,0.1)] backdrop-blur-xl ${
            isModalView ? "rounded-2xl" : "rounded-[24px] sm:rounded-[26px]"
          }`}
        >
          <header className="relative m-2 block h-auto min-h-0 overflow-hidden rounded-[20px] border border-slate-200/90 bg-[linear-gradient(135deg,rgba(248,250,252,0.99),rgba(240,249,255,0.97)_48%,rgba(255,255,255,0.94)_100%)] px-3 py-3 shadow-[0_16px_42px_rgba(15,23,42,0.09)] ring-1 ring-white/80 transition-[box-shadow,border-color,background-color] duration-300 sm:m-3 sm:rounded-[24px] sm:px-4 sm:py-4">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(14,165,233,0.13),transparent_30%),radial-gradient(circle_at_92%_12%,rgba(20,184,166,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.38),transparent_58%)]" />
            <div className="pointer-events-none absolute inset-y-6 left-0 w-[3px] rounded-full bg-gradient-to-b from-sky-400 via-cyan-200 to-red-400/70" />
            <div className="pointer-events-none absolute left-6 right-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-red-200/70" />
            <div className="pointer-events-none absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-sky-200/30 via-white to-transparent" />
            <div className="pointer-events-none absolute right-8 top-6 h-20 w-20 rounded-full border border-white/50 bg-white/50 blur-xl" />
            <div className="relative">
              {!isModalView && (
                <nav aria-label="Навігаційні хлібні крихти">
                  <ol className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-500 sm:text-[12px]">
                    {breadcrumbItems.map((item, index) => (
                      <li
                        key={`${item.href}:${item.label}:${index}`}
                        className="inline-flex items-center gap-2"
                      >
                        {index > 0 ? <span className="text-slate-300" aria-hidden="true">/</span> : null}
                        <Link href={item.href} className="transition hover:text-sky-700">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
              <div className="grid gap-3 xl:grid-cols-[minmax(190px,224px)_minmax(0,1fr)_296px] xl:items-stretch 2xl:grid-cols-[minmax(204px,240px)_minmax(0,1fr)_312px]">
                <div className="order-2 min-w-0 self-stretch xl:order-1">
                  <div className="flex h-full min-h-[220px] items-center justify-center overflow-hidden rounded-[20px] border border-white/80 bg-white/86 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_14px_30px_rgba(14,165,233,0.1)] backdrop-blur-sm transition-[box-shadow,border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-sky-200/90 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_18px_36px_rgba(14,165,233,0.14)] sm:min-h-[260px] xl:min-h-0">
                    <ProductImageWithFallback
                      alt={`Фото товару ${product.name}`}
                      width={640}
                      height={640}
                      loading="eager"
                      decoding="sync"
                      fetchPriority="high"
                      zoomEnabled
                      productCode={product.code || resolvedCode}
                      articleHint={product.article}
                      hasKnownPhoto={productHasKnownPhoto}
                      preferCachedPreview
                      unoptimized
                      className={heroProductImageClass}
                    />
                  </div>
                </div>

                <div className="order-1 flex h-full min-w-0 flex-col justify-center rounded-[20px] border border-white/80 bg-white/78 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.07)] ring-1 ring-white/70 backdrop-blur-md transition-[box-shadow,border-color,background-color] duration-300 hover:border-sky-100 hover:bg-white/86 hover:shadow-[0_16px_34px_rgba(15,23,42,0.09)] xl:order-2 sm:p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-[13px] border px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.09em] shadow-[0_8px_18px_rgba(15,23,42,0.07)] ${
                        isInStock
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isInStock ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                        aria-hidden="true"
                      />
                      {isInStock ? "В наявності" : "Під замовлення"}
                    </span>
                    {product.producer ? (
                      <span className="inline-flex rounded-[13px] border border-slate-200/90 bg-[linear-gradient(145deg,rgba(255,255,255,1),rgba(248,250,252,0.96))] px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.09em] text-slate-600 shadow-[0_2px_4px_rgba(15,23,42,0.04),0_6px_14px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,1)]">
                        {product.producer}
                      </span>
                    ) : null}
                  </div>

                  <h1
                    style={{ fontStyle: "normal" }}
                    className="font-display mt-2.5 max-w-none break-words text-[clamp(1.22rem,1.9vw,1.72rem)] font-extrabold leading-[1.2] tracking-[-0.01em] text-slate-950 [overflow-wrap:anywhere] [text-wrap:pretty] xl:max-w-[42ch]"
                  >
                    {productHeadingText}
                  </h1>
                  <div className={productHeaderMetaGridClass}>
                    <div className="rounded-[14px] border border-sky-200/80 bg-[linear-gradient(145deg,rgba(240,249,255,0.98),rgba(255,255,255,0.94))] px-3 py-2.5 shadow-[0_8px_18px_rgba(14,165,233,0.07)]">
                      <p className="text-[9px] font-bold uppercase tracking-[0.11em] text-sky-700">
                        {productIdentifierLabel}
                      </p>
                      <p className="mt-1 font-mono text-[13px] font-extrabold leading-5 tracking-normal text-slate-950 [overflow-wrap:anywhere]">
                        {productIdentifierValue}
                      </p>
                      {productIdentifierHint ? (
                        <p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-500">
                          {productIdentifierHint}
                        </p>
                      ) : null}
                    </div>

                    {productHeaderInfoItems.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {productHeaderInfoItems.map((item) => (
                          item.label === "Виробник" ? (
                            producerLogoPath ? (
                              <div
                                key="producer-card"
                                className="flex items-center justify-center overflow-hidden rounded-[14px] border border-slate-200/90 bg-[linear-gradient(145deg,rgba(255,255,255,1),rgba(248,250,252,0.97),rgba(240,249,255,0.93))] shadow-[0_4px_12px_rgba(15,23,42,0.06)] transition-[box-shadow,border-color] duration-300 hover:border-sky-200 hover:shadow-[0_6px_16px_rgba(14,165,233,0.09)]"
                              >
                                {producerLandingPath ? (
                                  <Link href={producerLandingPath} className="flex items-center justify-center px-3 py-2.5" title={product.producer}>
                                    <Image
                                      src={producerLogoPath}
                                      alt={product.producer}
                                      width={72}
                                      height={38}
                                      className="h-8 w-auto max-w-[72px] object-contain"
                                      priority
                                    />
                                  </Link>
                                ) : (
                                  <div className="flex items-center justify-center px-3 py-2.5">
                                    <Image
                                      src={producerLogoPath}
                                      alt={product.producer}
                                      width={72}
                                      height={38}
                                      className="h-8 w-auto max-w-[72px] object-contain"
                                      priority
                                    />
                                  </div>
                                )}
                              </div>
                            ) : null
                          ) : (
                            <div
                              key={item.label}
                              className="rounded-[14px] border border-slate-200 bg-white/82 px-3 py-2.5 shadow-[0_4px_10px_rgba(15,23,42,0.05)] backdrop-blur-sm transition-[box-shadow,border-color] duration-300 hover:border-sky-200"
                            >
                              <p className="text-[9px] font-bold uppercase tracking-[0.11em] text-slate-500">
                                {item.label}
                              </p>
                              {item.href ? (
                                <Link
                                  href={item.href}
                                  className="mt-1 block text-[13px] font-bold leading-5 text-slate-900 transition hover:text-sky-700 [overflow-wrap:anywhere]"
                                >
                                  {item.value}
                                </Link>
                              ) : (
                                <p className="mt-1 text-[13px] font-bold leading-5 text-slate-900 [overflow-wrap:anywhere]">
                                  {item.value}
                                </p>
                              )}
                            </div>
                          )
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {productHeroHighlights.map((item) => (
                      <span
                        key={item}
                        className="inline-flex min-h-6 items-center rounded-[9px] border border-slate-200/90 bg-[linear-gradient(145deg,rgba(255,255,255,1),rgba(248,250,252,0.96))] px-2 py-0.5 text-[10px] font-semibold tracking-normal text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_8px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,1)] backdrop-blur-sm"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="order-3 min-w-0 self-stretch xl:pl-1">
                  <div className="h-full rounded-[22px] border border-white/80 bg-white/82 p-1.5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] ring-1 ring-white/70 backdrop-blur-sm transition-[box-shadow,border-color] duration-300 hover:border-sky-100 hover:shadow-[0_16px_36px_rgba(15,23,42,0.1)]">
                    <ProductPurchasePanelClient
                      lookupKeys={lookupKeys}
                      isModalView={isModalView}
                      initialPriceUah={initialPriceUah}
                      initialCostPriceUah={initialCostPriceUah}
                      hasKnownNoPrice={product.priceEuro === null}
                      resolvedCode={resolvedCode}
                      product={product}
                      isInStock={isInStock}
                    />
                  </div>
                </div>
              </div>
            </div>
          </header>

          <ProductPageAdminEditPanel
            code={product.code || resolvedCode}
            article={product.article || ""}
            name={product.name || ""}
            producer={product.producer || ""}
            priceEuro={product.priceEuro ?? null}
            costPriceEuro={product.costPriceEuro ?? null}
            group={product.group || ""}
            subGroup={product.subGroup || ""}
            category={product.category || ""}
            quantity={product.quantity ?? 0}
            description={product.description || ""}
          />

          {producerDescription && product.producer ? (
            <div className="border-b border-slate-100/80 px-3 py-3 sm:px-4 sm:py-3.5">
              <div className="flex items-start gap-3 rounded-[18px] border border-slate-200/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-3.5 py-3 shadow-[0_2px_8px_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,1)] sm:px-4 sm:py-3.5">
                {producerLogoPath ? (
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-slate-200/70 bg-white shadow-[0_2px_6px_rgba(15,23,42,0.07)]">
                    <Image
                      src={producerLogoPath}
                      alt={product.producer}
                      width={48}
                      height={30}
                      className="h-6 w-8 object-contain"
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      Про виробника
                    </p>
                    {producerLandingPath ? (
                      <Link
                        href={producerLandingPath}
                        className="text-[10px] font-semibold text-sky-600 transition hover:text-sky-800 hover:underline"
                      >
                        {product.producer}
                      </Link>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-600">{product.producer}</span>
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-[1.55] text-slate-600 [overflow-wrap:anywhere]">
                    {producerDescription
                      .replace(
                        new RegExp(`^\\s*${(product.producer || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-–—]?\\s*`, "i"),
                        ""
                      )
                      .trim()}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className={contentGridClass}>
            <section className="space-y-2.5">
              <div className="grid gap-2.5">
                <ProductDescriptionClientCard
                  fallbackText={fallbackDescription}
                  initialText={product.description || null}
                  lookupKeys={lookupKeys}
                  isModalView={isModalView}
                  descriptionTextClass={descriptionTextClass}
                  enableClientLookup
                  fitmentText={productFitmentText}
                  contactPhone={STORE_PHONE_DISPLAY}
                  contactAddress={STORE_ADDRESS}
                  productName={visibleProductName || undefined}
                  seoDetails={productSeoDetails}
                  chatButton={
                    <OpenChatButton
                      message={chatPrefillMessage}
                      title="Відкрити чат з менеджером"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-sky-200 bg-white text-sky-700 shadow-[0_10px_20px_rgba(14,165,233,0.12)] transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50"
                    />
                  }
                />
                {(categoryHierarchyParts.length > 0 || Boolean(visibleProductGroup)) && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-[14px] border border-slate-100 bg-white/80 px-3 py-2.5 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.1em] text-sky-700">
                      Розділ:
                    </span>
                    <nav aria-label="Шлях до категорії" className="flex flex-wrap items-center gap-1.5">
                      {[
                        topCategoryPath
                          ? { label: buildVisibleProductName(productCategory), href: topCategoryPath }
                          : null,
                        groupLandingPath && productGroup
                          ? { label: visibleProductGroup, href: groupLandingPath }
                          : null,
                        productSubgroup &&
                        productSubgroup.toLowerCase() !== productGroup.toLowerCase()
                          ? { label: visibleProductSubgroup, href: categoryLandingHref }
                          : null,
                      ]
                        .filter(Boolean)
                        .map((item, index) => (
                          <span key={(item as { href: string }).href} className="inline-flex items-center gap-1.5">
                            {index > 0 && (
                              <span className="text-slate-300" aria-hidden="true">›</span>
                            )}
                            <Link
                              href={(item as { href: string; label: string }).href}
                              className="inline-flex items-center rounded-[9px] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc,#ffffff)] px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                            >
                              {(item as { href: string; label: string }).label}
                            </Link>
                          </span>
                        ))}
                    </nav>
                    <Link
                      href={categoryCatalogPath}
                      className="ml-auto text-[10px] font-semibold text-sky-600 transition hover:text-sky-800 hover:underline"
                    >
                      Усі товари →
                    </Link>
                  </div>
                )}
              </div>

              {!isModalView && (
                <>
                  <ProductRelatedItemsSection
                    product={{
                      code: product.code,
                      article: product.article,
                      name: product.name,
                      producer: product.producer,
                      group: product.group,
                      subGroup: product.subGroup,
                      category: product.category,
                    }}
                    euroRate={recommendationEuroRate}
                  />
                  <ProductDeferredRecommendations
                    product={{
                      code: product.code,
                      article: product.article,
                      name: product.name,
                      producer: product.producer,
                      quantity: product.quantity,
                      priceEuro: product.priceEuro,
                      group: product.group,
                      subGroup: product.subGroup,
                      category: product.category,
                      hasPhoto: product.hasPhoto,
                    }}
                    euroRate={recommendationEuroRate}
                  />
                </>
              )}
            </section>
          </div>

          {!isModalView && resolvedCode && (
            <ProductReviewsSection productCode={resolvedCode} />
          )}

          {!isModalView && (
            <section className="border-t border-slate-100/80 bg-[linear-gradient(180deg,rgba(226,232,240,0.28),rgba(255,255,255,0.92))] px-3 py-3 sm:px-4 sm:py-3.5">
              <div className="overflow-hidden rounded-[20px] border border-slate-900/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,244,248,0.96))] shadow-[0_16px_36px_rgba(2,6,23,0.09)]">
                <div className="border-b border-slate-900/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(8,47,73,0.9))] px-4 py-3 sm:px-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300">
                    Сумісність та характеристики
                  </p>
                  <h2
                    style={{ fontStyle: "normal" }}
                    className="font-display mt-0.5 text-[1rem] font-extrabold leading-[1.2] tracking-[-0.01em] text-white sm:text-[1.1rem]"
                  >
                    {visibleProductName
                      ? `Характеристики: ${visibleProductName.length > 52 ? `${visibleProductName.slice(0, 52).trimEnd()}…` : visibleProductName}`
                      : "Що важливо знати про цей товар"}
                  </h2>
                </div>
                <div className="grid gap-2.5 px-3 py-3 sm:px-4 sm:py-3.5 lg:grid-cols-3">
                  {faqItems.map((item) => (
                    <div
                      key={item.question}
                      className="rounded-[16px] border border-slate-900/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(236,243,248,0.94))] px-3.5 py-3 shadow-[0_8px_18px_rgba(2,6,23,0.05)]"
                    >
                      <h3 className="text-[13.5px] font-bold leading-5 text-slate-950 not-italic">
                        {item.question}
                      </h3>
                      <p className="mt-1.5 text-[13px] font-medium leading-[1.55] text-slate-600">
                        {item.answer}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </article>
      </div>

      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(itemPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      {!isModalView && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
        />
      )}
    </div>
  );
}
