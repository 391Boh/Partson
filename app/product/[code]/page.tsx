import { Suspense, cache, type CSSProperties } from "react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  type CatalogProduct,
  fetchCatalogProductsByArticle,
  fetchEuroRate,
  findCatalogProductByCode,
  toPriceUah,
} from "app/lib/catalog-server";
import ProductDescriptionClientCard from "app/components/ProductDescriptionClientCard";
import ProductImageWithFallback from "app/components/ProductImageWithFallback";
import OpenChatButton from "app/components/OpenChatButton";
import ProductRelatedItemsSection from "app/components/ProductRelatedItemsSection";
import ProductRecentlyViewedSection from "app/components/ProductRecentlyViewedSection";
import {
  buildCatalogCategoryPath,
  buildCatalogProducerPath,
  buildGroupItemPath,
  buildGroupPath,
  buildManufacturerPath,
} from "app/lib/catalog-links";
import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";
import { getProductImagePath } from "app/lib/product-image";
import { buildProductImagePath } from "app/lib/product-image-path";
import {
  buildLegacyProductNameSlug,
  buildProductPath,
  buildProductNameSlug,
  buildVisibleProductName,
  extractProductCodeFromParam,
  extractProductRouteSlugsFromParam,
  INTERNAL_PRODUCT_ROUTE_RESOLUTION_PARAM,
} from "app/lib/product-url";
import {
  resolveProductCodeFromNameSlug,
  resolveProductCodeFromSeoRoute,
} from "app/lib/product-route-resolver";
import { getSiteUrl } from "app/lib/site-url";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";

const PRODUCT_PAGE_ROUTE_DATA_TIMEOUT_MS = 2400;
const PRODUCT_PAGE_PRODUCT_LOOKUP_TIMEOUT_MS = 2200;
const PRODUCT_PAGE_ROUTE_RECOVERY_TIMEOUT_MS = 1000;
const PRODUCT_PAGE_SEO_EURO_RATE_TIMEOUT_MS = 120;
const PRODUCT_PAGE_LOGO_FALLBACK_PATH = "/favicon-192x192.png";
const PRODUCT_PAGE_METADATA_ROUTE_DATA_TIMEOUT_MS = 1600;

export const revalidate = 900;

const ProductPurchasePanelClient = dynamic(
  () => import("app/components/ProductPurchasePanelClient"),
  {
    loading: () => (
      <section className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_14px_28px_rgba(15,23,42,0.05)] sm:rounded-[24px] sm:p-4">
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

const ProductRelatedItemsFallback = () => (
  <section className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_18px_36px_rgba(15,23,42,0.06)] sm:rounded-[24px] sm:p-4">
    <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-2.5">
      <div>
        <div className="h-3 w-16 animate-pulse rounded-full bg-sky-100" />
        <div className="mt-2 h-6 w-52 animate-pulse rounded-full bg-slate-100" />
      </div>
      <div className="h-6 w-24 animate-pulse rounded-full bg-slate-100" />
    </div>
    <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:thin] md:grid md:overflow-visible lg:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-[156px] min-w-[min(84vw,258px)] shrink-0 animate-pulse rounded-[18px] border border-slate-200 bg-slate-100 sm:min-w-[280px] md:min-w-0"
        />
      ))}
    </div>
  </section>
);

const ProductRecentlyViewedFallback = () => (
  <section className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_18px_36px_rgba(15,23,42,0.06)] sm:rounded-[24px] sm:p-4">
    <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-2.5">
      <div>
        <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-2 h-6 w-64 animate-pulse rounded-full bg-slate-100" />
      </div>
      <div className="h-6 w-24 animate-pulse rounded-full bg-slate-100" />
    </div>
    <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:thin] md:grid md:overflow-visible lg:grid-cols-2 2xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-[188px] min-w-[min(84vw,258px)] shrink-0 animate-pulse rounded-[18px] border border-slate-200 bg-slate-100 sm:min-w-[280px] md:min-w-0"
        />
      ))}
    </div>
  </section>
);

interface ProductPageParams {
  code: string;
}

interface ProductPageSearchParams {
  view?: string | string[];
  [INTERNAL_PRODUCT_ROUTE_RESOLUTION_PARAM]?: string | string[];
}

interface ProductPageProps {
  params: Promise<ProductPageParams>;
  searchParams?: Promise<ProductPageSearchParams>;
}

const pageBackground: CSSProperties = {
  backgroundImage:
    "radial-gradient(circle at 0% 0%, rgba(14,165,233,0.22), transparent 24%), radial-gradient(circle at 100% 8%, rgba(248,113,113,0.14), transparent 22%), radial-gradient(circle at 58% 18%, rgba(34,211,238,0.12), transparent 26%), linear-gradient(180deg, #e8f0f5 0%, #f8fafc 40%, #e6eef4 100%)",
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

  // Handles common SEO heading pattern: "Купити <NAME> артикул <...> у категорії <...>".
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

  // Strip common SEO wrapper from UI heading only.
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

const buildReadableNameFromRoute = (rawCode: string, fallbackCode: string) => {
  const decodedParam = decodeURIComponent(rawCode || "").trim();
  const routeSlugs = extractProductRouteSlugsFromParam(decodedParam);
  const nameSource = routeSlugs?.nameSlug || decodedParam || fallbackCode;
  const withoutInternalCode = nameSource.replace(/~[^~]+$/u, "");
  const readable = buildVisibleProductName(withoutInternalCode.replace(/[-_]+/g, " "));

  return readable && readable !== "Товар" ? readable : `Товар ${fallbackCode}`;
};

const buildFallbackProductFromRoute = (
  rawCode: string,
  resolvedCode: string
): CatalogProduct => {
  const normalizedCode = (resolvedCode || extractProductCodeFromParam(rawCode || "") || "").trim();

  return {
    code: normalizedCode,
    article: "",
    name: buildReadableNameFromRoute(rawCode, normalizedCode || "PartsON"),
    producer: "",
    quantity: 0,
    priceEuro: null,
    group: "",
    subGroup: "",
    category: "",
    hasPhoto: false,
  };
};

const normalizeView = (view: string | string[] | undefined) => {
  if (Array.isArray(view)) return (view[0] || "").trim().toLowerCase();
  return (view || "").trim().toLowerCase();
};

const hasInternalSeoResolution = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value.some((entry) => (entry || "").trim() === "1");
  }

  return (value || "").trim() === "1";
};

const buildSearchParamsString = (searchParams: ProductPageSearchParams) => {
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(searchParams)) {
    if (key === INTERNAL_PRODUCT_ROUTE_RESOLUTION_PARAM || rawValue == null) continue;

    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        const normalizedValue = (value || "").trim();
        if (!normalizedValue) continue;
        params.append(key, normalizedValue);
      }
      continue;
    }

    const normalizedValue = rawValue.trim();
    if (!normalizedValue) continue;
    params.set(key, normalizedValue);
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
};

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
              : "https://schema.org/PreOrder",
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
          },
          priceValidUntil: new Date(
            Date.now() + 1000 * 60 * 60 * 24 * 14
          ).toISOString(),
          url: canonicalUrl,
          shippingDetails: {
            "@type": "OfferShippingDetails",
            shippingDestination: {
              "@type": "DefinedRegion",
              addressCountry: "UA",
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
          },
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonicalUrl}#product`,
    name,
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
  groupName?: string;
  groupPath?: string | null;
  subGroupName?: string;
  subGroupPath?: string | null;
}) => {
  const {
    siteUrl,
    canonicalUrl,
    name,
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

  if (groupName && groupPath) {
    itemListElement.push({
      "@type": "ListItem",
      position: 3,
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

const getCatalogProductCached = unstable_cache(
  getCatalogProductUncached,
  ["product-page:catalog-product-v3"],
  { revalidate: 900 }
);

const getCatalogProduct = cache(async (code: string) => {
  const cachedProduct = await getCatalogProductCached(code);
  if (cachedProduct) return cachedProduct;

  return getCatalogProductUncached(code);
});

const buildProductMetaDescription = (options: {
  name: string;
  article: string;
  producer: string;
  quantity: number;
}) => {
  const { name, article, producer, quantity } = options;
  const availabilityLabel = quantity > 0
    ? `в наявності ${quantity} шт.`
    : "доступно під замовлення";

  return [
    `Купити ${name}${producer ? ` ${producer}` : ""}${article ? `, артикул ${article}` : ""}: ${availabilityLabel}.`,
    "Підбір за VIN, перевірка сумісності, самовивіз у Львові та доставка Новою поштою по Україні.",
  ].filter(Boolean).join(" ");
};

const buildProductFallbackDescription = (options: {
  visibleName: string;
  producer: string;
  article: string;
  code: string;
  group: string;
  subGroup: string;
  quantity: number;
}) => {
  const { visibleName, producer, article, code, group, subGroup, quantity } = options;
  const categoryLabel =
    buildVisibleProductName(subGroup || group || "каталогу автозапчастин");
  const availabilityLabel =
    quantity > 0 ? `Товар доступний у кількості ${quantity} шт.` : "Позиція доступна під замовлення.";

  return [
    `${visibleName}${producer ? ` від виробника ${producer}` : ""} належить до категорії ${categoryLabel}.`,
    article ? `Артикул: ${article}.` : null,
    code ? `Код товару: ${code}.` : null,
    availabilityLabel,
    "Для точного підбору рекомендуємо звіряти код, артикул і сумісність з вашим авто.",
  ]
    .filter(Boolean)
    .join(" ");
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
  ): Promise<{ priceEuro: number | null; priceUah: number | null }> => {
    const inlinePrice = toPositiveNumberOrNull(inlinePriceEuro);
    if (inlinePrice == null) {
      return { priceEuro: null, priceUah: null };
    }

    const priceEuro = inlinePrice;
    const euroRate = await getProductSeoEuroRate();
    const priceUah = toPriceUah(priceEuro, euroRate);

    return {
      priceEuro,
      priceUah,
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
  const normalized = decodeURIComponent(rawNameSlug || "").trim().toLowerCase();
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

  for (let tailSize = 1; tailSize <= 4; tailSize += 1) {
    if (parts.length < tailSize) continue;
    const tailParts = parts.slice(-tailSize);
    const minLength = tailSize === 1 ? 3 : 5;
    addLookupToken(tailParts.join(""), { minLength });
    addLookupToken(tailParts.join("-"), { minLength });
  }

  return Array.from(tokens);
};

const extractPrimaryLookupTokenFromSeoNameSlug = (rawNameSlug: string) => {
  const normalized = decodeURIComponent(rawNameSlug || "").trim().toLowerCase();
  if (!normalized) return "";

  const parts = normalized.split("-").map((entry) => entry.trim()).filter(Boolean);
  for (let tailSize = Math.min(4, parts.length); tailSize >= 2; tailSize -= 1) {
    const tailParts = parts.slice(-tailSize);
    const isNumericCodeTail = tailParts.every((part) => /^\d+$/.test(part));
    if (!isNumericCodeTail) continue;

    const hyphenatedCode = tailParts.join("-");
    if (hyphenatedCode.length >= 5) return hyphenatedCode;
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const token = parts[index];
    if (token.length < 3) continue;
    if (!/\d/.test(token)) continue;
    return token;
  }

  for (let tailSize = Math.min(4, parts.length); tailSize >= 1; tailSize -= 1) {
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
  const requestedSlug = decodeURIComponent(rawNameSlug || "").trim().toLowerCase();
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

const findCatalogProductByLookupToken = async (token: string) => {
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
  const decodedParam = decodeURIComponent(rawCode || "").trim();
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
  const directProduct = directCode
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

  return {
    code: directCode,
    isSeoRoute: false,
    product: null,
  };
};

const resolveProductCodeFromRouteParamCached = unstable_cache(
  resolveProductCodeFromRouteParamUncached,
  ["product-page:resolve-route-v11-short-name-article"],
  { revalidate: 900 }
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
  ["product-page:resolved-route-product-v11-short-name-article"],
  { revalidate: 900 }
);

const getResolvedProductRouteData = cache(async (rawCode: string) => {
  const cachedRouteData = await getResolvedProductRouteDataCached(rawCode);
  if (cachedRouteData.code) {
    return cachedRouteData;
  }

  return getResolvedProductRouteDataUncached(rawCode);
});

const canUseDirectProductCodeFallback = (rawCode: string) => {
  const decodedParam = decodeURIComponent(rawCode || "").trim();
  if (!decodedParam) return false;
  if (extractProductRouteSlugsFromParam(decodedParam)) return false;

  return decodedParam.includes("~") || !decodedParam.includes("-");
};

const recoverProductRouteDataFromNameSlug = async (
  rawCode: string
): Promise<ResolvedProductRouteData | null> => {
  const decodedParam = decodeURIComponent(rawCode || "").trim();
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
  searchParams,
}: ProductPageProps): Promise<Metadata> {
  const [{ code: rawCode }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as ProductPageSearchParams),
  ]);
  const isModalView = normalizeView(resolvedSearchParams.view) === "modal";
  const decodedParam = decodeURIComponent(rawCode || "").trim();
  const routeSlugs = extractProductRouteSlugsFromParam(decodedParam);
  const fallbackCode = extractProductCodeFromParam(decodedParam);
  const routeData = await resolveWithTimeout(
    () => getResolvedProductRouteData(rawCode || ""),
    { code: "", isSeoRoute: false, product: null },
    PRODUCT_PAGE_METADATA_ROUTE_DATA_TIMEOUT_MS
  );

  const routeProduct = routeData.product;
  const resolvedCode = (routeData.code || fallbackCode || "").trim();
  const fallbackTitleSource =
    routeSlugs?.nameSlug || resolvedCode || decodedParam || "Товар";
  const seoVisibleProductName = buildVisibleProductName(
    (routeProduct?.name || fallbackTitleSource).replace(/-/g, " ")
  );
  const productProducer = (routeProduct?.producer || "").trim();
  const productArticle = (routeProduct?.article || "").trim();
  const productGroup = (routeProduct?.group || routeProduct?.category || "").trim();
  const productSubGroup = (routeProduct?.subGroup || "").trim();
  const categoryLabel = buildVisibleProductName(productSubGroup || productGroup);
  const canonicalPath = routeProduct
    ? buildCanonicalProductPath(routeProduct, resolvedCode || fallbackCode)
    : `/product/${encodeURIComponent(decodedParam || resolvedCode || fallbackCode || "")}`;

  const productImagePath = routeProduct
    ? getProductImagePath(routeProduct.code || resolvedCode, routeProduct.article)
    : PRODUCT_IMAGE_FALLBACK_PATH;
  const productImageUrl = `${getSiteUrl()}${productImagePath}`;
  const shouldIndexProduct = !isModalView && Boolean(resolvedCode || fallbackCode);

  const seoTitle = [
    seoVisibleProductName
      ? `Купити ${seoVisibleProductName}${productProducer ? ` ${productProducer}` : ""}`
      : "Купити автозапчастину",
    productArticle
      ? `артикул ${productArticle}`
      : resolvedCode || null,
    "ціна і наявність Львів",
    "PartsON",
  ]
    .filter(Boolean)
    .join(" | ");

  const description = [
    `Купити ${seoVisibleProductName}${productProducer ? ` ${productProducer}` : ""}${productArticle ? ` (артикул ${productArticle})` : resolvedCode ? ` (код ${resolvedCode})` : ""} у Львові.`,
    categoryLabel ? `Категорія: ${categoryLabel}.` : null,
    "Ціна, наявність, підбір за VIN, аналоги та доставка по Україні в PartsON.",
  ]
    .filter(Boolean)
    .join(" ");

  const normalizedName = seoVisibleProductName.toLowerCase();
  const seoNameParts = normalizedName
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}-]+/gu, "").trim())
    .filter((part) => part.length >= 3)
    .slice(0, 8);
  const keywords = Array.from(
    new Set(
      [
        seoVisibleProductName,
        resolvedCode,
        productArticle,
        productProducer,
        categoryLabel,
        resolvedCode ? `${seoVisibleProductName} ${resolvedCode}` : null,
        productArticle ? `${seoVisibleProductName} ${productArticle}` : null,
        productProducer ? `${seoVisibleProductName} ${productProducer}` : null,
        categoryLabel ? `купити ${seoVisibleProductName} ${categoryLabel}` : null,
        productArticle ? `${productArticle} купити` : null,
        resolvedCode ? `${resolvedCode} купити` : null,
        resolvedCode ? `${resolvedCode} ціна` : null,
        categoryLabel ? `${categoryLabel} купити` : null,
        categoryLabel ? `${categoryLabel} ціна` : null,
        productProducer ? `${productProducer} запчастини` : null,
        productProducer ? `${productProducer} купити` : null,
        productArticle ? `${productArticle} PartsON` : null,
        resolvedCode ? `${resolvedCode} PartsON` : null,
        "автозапчастини",
        "купити автозапчастини",
        "каталог автозапчастин",
        "ціна автозапчастин",
        "наявність автозапчастин",
        "підбір запчастин за кодом",
        "запчастини за артикулом",
        "PartsON",
        ...seoNameParts,
      ]
        .map((entry) => (entry || "").trim())
        .filter(Boolean)
    )
  );

  return {
    title: seoTitle,
    description,
    keywords,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "website",
      url: canonicalPath,
      title: seoTitle,
      description,
      images: [{
        url: productImageUrl,
        alt: `Фото товару ${seoVisibleProductName}`,
        width: 1200,
        height: 1200,
      }],
      siteName: "PartsON",
      locale: "uk_UA",
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description,
      images: [{ url: productImageUrl, alt: `Фото товару ${seoVisibleProductName}` }],
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
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { code: rawCode } = await params;
  const fallbackCodeFromRoute = extractProductCodeFromParam(rawCode || "");
  const canUseDirectFallbackCode = canUseDirectProductCodeFallback(rawCode || "");
  let routeData = await resolveWithTimeout(
    () => getResolvedProductRouteData(rawCode || ""),
    {
      code: "",
      isSeoRoute: false,
      product: null,
    },
    PRODUCT_PAGE_ROUTE_DATA_TIMEOUT_MS
  );
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

  if (!product && resolvedCode) {
    product = await resolveWithTimeout(
      () => getCatalogProduct(resolvedCode),
      null,
      PRODUCT_PAGE_PRODUCT_LOOKUP_TIMEOUT_MS
    );
  }

  if (!resolvedCode && canUseDirectFallbackCode && fallbackCodeFromRoute) {
    const directFallbackProduct = await resolveWithTimeout(
      () => getCatalogProduct(fallbackCodeFromRoute),
      null,
      PRODUCT_PAGE_PRODUCT_LOOKUP_TIMEOUT_MS
    );
    if (directFallbackProduct) {
      product = directFallbackProduct;
      resolvedCode = (directFallbackProduct.code || directFallbackProduct.article || fallbackCodeFromRoute).trim();
    }
  }

  if (!resolvedCode) {
    const routeSlugs = extractProductRouteSlugsFromParam(rawCode || "");
    const recoveredToken = routeSlugs?.nameSlug
      ? extractPrimaryLookupTokenFromSeoNameSlug(routeSlugs.nameSlug)
      : extractPrimaryLookupTokenFromSeoNameSlug(rawCode || "");

    resolvedCode = (fallbackCodeFromRoute || recoveredToken || "").trim();
  }

  if (!resolvedCode) notFound();

  const [normalizedSearchParams] = await Promise.all([
    searchParams ?? Promise.resolve({} as ProductPageSearchParams),
  ]);
  const hasResolvedCatalogProduct = Boolean(product);
  if (!product) {
    product = buildFallbackProductFromRoute(rawCode || "", resolvedCode);
  }

  const isModalView = normalizeView(normalizedSearchParams.view) === "modal";
  const isSeoResolvedInternally = hasInternalSeoResolution(
    normalizedSearchParams[INTERNAL_PRODUCT_ROUTE_RESOLUTION_PARAM]
  );
  const canonicalPath = buildCanonicalProductPath(product, resolvedCode);
  const currentRouteParam = decodeURIComponent(rawCode || "").trim();
  const canonicalRouteParam = decodeURIComponent(
    canonicalPath.replace(/^\/product\//, "")
  ).trim();

  if (
    hasResolvedCatalogProduct &&
    !isSeoResolvedInternally &&
    currentRouteParam !== canonicalRouteParam
  ) {
    redirect(`${canonicalPath}${buildSearchParamsString(normalizedSearchParams)}`);
  }

  const primaryLookupKey =
    product.article.trim() || product.code.trim() || resolvedCode;
  const lookupKeys = isModalView
    ? [primaryLookupKey]
    : Array.from(
        new Set([product.article.trim(), product.code.trim(), resolvedCode].filter(Boolean))
      );
  const inlineInitialPriceEuro = toPositiveNumberOrNull(product.priceEuro);
  const pagePrice = await resolveProductSeoPrice(inlineInitialPriceEuro);
  const initialPriceUah = pagePrice.priceUah;
  const recommendationEuroRate = await getProductSeoEuroRate();
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
  const fallbackDescription = buildProductFallbackDescription({
    visibleName: visibleProductName,
    producer: product.producer,
    article: product.article,
    code: product.code || resolvedCode,
    group: productGroup,
    subGroup: productSubgroup,
    quantity: product.quantity,
  });
  const schemaDescription = buildProductMetaDescription({
    name: product.name,
    article: product.article,
    producer: product.producer,
    quantity: product.quantity,
  });

  const siteUrl = getSiteUrl();
  const groupSeoFallbackPath = productGroup
    ? buildProductGroupLandingFallbackPath(productCategory, productGroup)
    : null;
  const producerLandingPath = product.producer
    ? buildManufacturerPath(product.producer)
    : null;
  const categoryCatalogPath = productSubgroup
    ? buildCatalogCategoryPath(productSubgroup)
    : productGroup
      ? buildCatalogCategoryPath(productGroup)
      : "/katalog";
  const producerCatalogPath = product.producer
    ? buildCatalogProducerPath(product.producer, productGroup || undefined)
    : null;
  const groupLandingPath = groupSeoFallbackPath;
  const categoryLandingPath = productSubgroup
    ? buildProductGroupLandingFallbackPath(productGroup || productCategory, productSubgroup)
    : groupSeoFallbackPath;
  const categoryLandingHref =
    categoryLandingPath ||
    groupLandingPath ||
    groupSeoFallbackPath ||
    categoryCatalogPath;
  const canonicalUrl = `${siteUrl}${canonicalPath}`;
  const fallbackImagePath = PRODUCT_PAGE_LOGO_FALLBACK_PATH;
  const productHasKnownPhoto = product.hasPhoto !== false;
  const productFullImagePath = productHasKnownPhoto
    ? getProductImagePath(product.code || resolvedCode, product.article)
    : PRODUCT_PAGE_LOGO_FALLBACK_PATH;
  const productDisplayImagePath = productHasKnownPhoto
    ? buildProductImagePath(product.code || resolvedCode, product.article, {
        catalog: true,
      })
    : PRODUCT_PAGE_LOGO_FALLBACK_PATH;
  const productImageUrl = `${siteUrl}${productFullImagePath}`;
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
        imageUrls: [productImageUrl],
      })
    : null;
  const itemPageJsonLd = buildProductItemPageJsonLd({
    siteUrl,
    canonicalUrl,
    name: visibleProductName,
    description: schemaDescription,
    imageUrl: productImageUrl,
    hasProductSchema: Boolean(jsonLd),
  });
  const breadcrumbJsonLd = buildProductBreadcrumbJsonLd({
    siteUrl,
    canonicalUrl,
    name: product.name,
    groupName: productGroup || undefined,
    groupPath: groupLandingPath,
    subGroupName: productSubgroup || undefined,
    subGroupPath: productSubgroup ? categoryLandingHref : null,
  });
  const isInStock = Number.isFinite(product.quantity) && product.quantity > 0;
  const faqJsonLd = buildProductFaqJsonLd({
    name: product.name,
    producer: product.producer,
    group: productGroup,
    subGroup: productSubgroup,
    hasPrice: initialPriceUah != null,
    quantity: product.quantity,
  });
  const contentGridClass = isModalView
    ? "grid gap-2.5 p-2.5 sm:p-3"
    : "grid gap-3.5 p-2.5 sm:gap-4 sm:p-4";
  const heroProductImageClass = isModalView
    ? "mx-auto h-[190px] w-full rounded-[18px] border border-cyan-400/18 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.84),rgba(2,6,23,0.98))] sm:h-[214px]"
    : "mx-auto h-[190px] w-full rounded-[18px] border border-cyan-400/18 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.84),rgba(2,6,23,0.98))] sm:h-[218px] xl:h-[224px] 2xl:h-[236px]";
  const descriptionTextClass = isModalView
    ? "mt-1.5 max-h-[172px] overflow-y-auto whitespace-pre-line break-words pr-0.5 text-sm leading-relaxed text-slate-700"
    : "mt-2.5 max-h-[238px] overflow-y-auto whitespace-pre-line break-words pr-0.5 text-[14px] leading-[1.72] text-slate-700 sm:text-[15px]";
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
          label: "Категорія",
          value: visibleProductSubgroup || visibleProductGroup,
          href: categoryLandingHref,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; href?: string | null }>;
  const productHeaderMetaGridClass = productHeaderInfoItems.length > 0
    ? "mt-3 grid gap-2 sm:grid-cols-[minmax(210px,0.85fr)_minmax(0,1.15fr)]"
    : "mt-3 max-w-[380px]";
  const keywordButtonHref =
    producerLandingPath || producerCatalogPath || categoryLandingHref || "/groups";
  const keywordButtonLabel = producerCatalogPath
    ? `Більше від ${product.producer}`
    : visibleProductSubgroup || visibleProductGroup
      ? `До категорії ${visibleProductSubgroup || visibleProductGroup}`
      : "До каталогу";
  const productHeadingText = buildFrontendProductHeading(product.name, {
    producer: product.producer,
    article: product.article,
    group: productGroup,
    subGroup: productSubgroup,
  });
  const productHeroLeadText =
    "Перевіримо сумісність за VIN, підберемо оригінал або аналог і погодимо доставку по Україні.";
  const productHeroHighlights = Array.from(
    new Set(
      [
        "Підбір за VIN",
        "Оригінали й аналоги",
        "Самовивіз Львів",
        "Доставка 1-3 дні",
      ].filter(Boolean)
    )
  ).slice(0, 5);
  const keywordPhrases = Array.from(
    new Set(
      [
        visibleProductName,
        product.producer ? `${visibleProductName} ${product.producer}` : null,
        product.article ? `${visibleProductName} ${product.article}` : null,
        `${visibleProductName} Львів`,
        `${visibleProductName} купити Львів`,
        `${visibleProductName} ціна`,
        `${visibleProductName} Нова Пошта`,
        `${visibleProductName} доставка по Україні`,
        visibleProductSubgroup ? `${visibleProductSubgroup} ${visibleProductName}` : null,
        visibleProductGroup ? `${visibleProductGroup} купити Львів` : null,
        product.producer ? `${product.producer} ${visibleProductName} купити` : null,
        product.producer ? `${product.producer} запчастини Львів` : null,
        product.article ? `${product.article} купити` : null,
        product.article ? `${product.article} ціна` : null,
      ]
        .map((item) => (item || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )
  ).slice(0, 12);
  const keywordSummaryText = `Зібрали ключові запити, за якими найчастіше шукають ${visibleProductName}${product.producer ? ` від ${product.producer}` : ""}${visibleProductSubgroup || visibleProductGroup ? ` у розділі ${visibleProductSubgroup || visibleProductGroup}` : ""}, щоб швидше перейти до суміжних позицій, брендів і категорій каталогу.`;
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
      <link
        rel="preload"
        as="image"
        href={productDisplayImagePath}
        fetchPriority="high"
      />
      <div
        className={
          isModalView
            ? "mx-auto w-full max-w-[1080px] px-2 py-2 sm:px-3 sm:py-3"
            : "page-shell-inline py-3 sm:py-5"
        }
      >
        <article
          className={`overflow-hidden border border-slate-900/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(241,245,249,0.96),rgba(255,255,255,0.98))] shadow-[0_32px_90px_rgba(2,6,23,0.14)] backdrop-blur-xl ${
            isModalView ? "rounded-2xl" : "rounded-[24px] sm:rounded-[26px]"
          }`}
        >
          <header className="relative m-2 block h-auto min-h-0 overflow-hidden rounded-[20px] border border-slate-900/90 bg-[linear-gradient(140deg,rgba(2,6,23,0.98),rgba(15,23,42,0.98)_38%,rgba(8,47,73,0.94)_78%,rgba(8,145,178,0.82))] px-3 py-3 shadow-[0_22px_54px_rgba(2,6,23,0.34),0_10px_22px_rgba(14,165,233,0.12)] ring-1 ring-cyan-400/15 sm:m-3 sm:rounded-[24px] sm:px-4 sm:py-4">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(34,211,238,0.24),transparent_24%),radial-gradient(circle_at_88%_10%,rgba(248,113,113,0.18),transparent_22%),linear-gradient(180deg,transparent,rgba(2,6,23,0.08))]" />
            <div className="pointer-events-none absolute inset-y-6 left-0 w-[3px] rounded-full bg-gradient-to-b from-cyan-300 via-white/70 to-red-400/80" />
            <div className="pointer-events-none absolute left-6 right-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-red-300/60" />
            <div className="pointer-events-none absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-cyan-300/20 via-white/70 to-transparent" />
            <div className="pointer-events-none absolute right-8 top-6 h-20 w-20 rounded-full border border-white/10 bg-white/5 blur-xl" />
            <div className="relative">
              {!isModalView && (
                <nav
                  aria-label="Навігація по сторінці товару"
                  className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-300 sm:text-[12px]"
                >
                  {breadcrumbItems.map((item, index) => (
                    <span
                      key={`${item.href}:${item.label}:${index}`}
                      className="inline-flex items-center gap-2"
                    >
                      {index > 0 ? <span className="text-slate-600">/</span> : null}
                      <Link href={item.href} className="transition hover:text-cyan-200">
                        {item.label}
                      </Link>
                    </span>
                  ))}
                </nav>
              )}
              <div className="grid gap-3.5 xl:grid-cols-[minmax(190px,224px)_minmax(0,1fr)_300px] xl:items-start 2xl:grid-cols-[minmax(206px,238px)_minmax(0,1fr)_320px]">
                <div className="order-2 min-w-0 xl:order-1">
                  <div className="overflow-hidden rounded-[20px] border border-cyan-400/18 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.18),transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,6,23,0.98))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_34px_rgba(2,6,23,0.28)] backdrop-blur-sm">
                    <ProductImageWithFallback
                      src={productDisplayImagePath}
                      fallbackSrc={fallbackImagePath}
                      alt={`Фото товару ${product.name}`}
                      width={640}
                      height={640}
                      loading="eager"
                      decoding="sync"
                      fetchPriority="high"
                      zoomEnabled={false}
                      productCode={product.code || resolvedCode}
                      articleHint={product.article}
                      hasKnownPhoto={productHasKnownPhoto}
                      className={heroProductImageClass}
                    />
                  </div>
                </div>

                <div className="order-1 min-w-0 xl:order-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-[14px] border border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100 shadow-[0_10px_26px_rgba(34,211,238,0.12)]">
                      Картка товару
                    </span>
                    <span
                      className={`inline-flex rounded-[14px] border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] shadow-[0_10px_26px_rgba(2,6,23,0.22)] ${
                        isInStock
                          ? "border-emerald-300/35 bg-emerald-400/12 text-emerald-100"
                          : "border-amber-300/35 bg-amber-400/12 text-amber-100"
                      }`}
                    >
                      {isInStock ? "В наявності" : "Під замовлення"}
                    </span>
                  </div>

                  <h1 className="font-display-italic mt-2.5 max-w-none break-words text-[clamp(1.2rem,2.45vw,2.12rem)] font-black leading-[1.02] tracking-[-0.042em] text-white [overflow-wrap:anywhere] [text-wrap:pretty] xl:max-w-[40ch]">
                    {productHeadingText}
                  </h1>
                  <p className="mt-2 max-w-2xl text-[13px] font-medium leading-5 text-slate-200/90 sm:text-[14px] sm:leading-6">
                    {productHeroLeadText}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {productHeroHighlights.map((item) => (
                      <span
                        key={item}
                        className="inline-flex min-h-7 items-center rounded-[11px] border border-white/14 bg-white/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.04em] text-slate-100 shadow-[0_8px_20px_rgba(2,6,23,0.14)] backdrop-blur-sm"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                  <div className={productHeaderMetaGridClass}>
                    <div className="rounded-[16px] border border-cyan-400/18 bg-[linear-gradient(165deg,rgba(14,165,233,0.16),rgba(15,23,42,0.92)_30%,rgba(2,6,23,0.96))] px-3.5 py-3 shadow-[0_14px_28px_rgba(2,6,23,0.22)]">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200 sm:text-[11px]">
                        {productIdentifierLabel}
                      </p>
                      <p className="mt-1.5 font-mono text-[15px] font-black leading-5 tracking-normal text-white [overflow-wrap:anywhere] sm:text-[17px]">
                        {productIdentifierValue}
                      </p>
                      {productIdentifierHint ? (
                        <p className="mt-1 text-[12px] font-medium leading-5 text-slate-300">
                          {productIdentifierHint}
                        </p>
                      ) : null}
                    </div>

                    {productHeaderInfoItems.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {productHeaderInfoItems.map((item) => (
                          <div
                            key={item.label}
                            className="rounded-[15px] border border-white/10 bg-white/8 px-3 py-2.5 shadow-[0_10px_20px_rgba(2,6,23,0.14)] backdrop-blur-sm"
                          >
                            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 sm:text-[10px]">
                              {item.label}
                            </p>
                            {item.href ? (
                              <Link
                                href={item.href}
                                className="mt-1 block text-[13px] font-extrabold leading-5 text-white transition hover:text-cyan-200 [overflow-wrap:anywhere]"
                              >
                                {item.value}
                              </Link>
                            ) : (
                              <p className="mt-1 text-[13px] font-extrabold leading-5 text-white [overflow-wrap:anywhere]">
                                {item.value}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="order-3 xl:pl-1.5">
                  <div className="rounded-[22px] border border-cyan-400/16 bg-[linear-gradient(180deg,rgba(2,6,23,0.3),rgba(15,23,42,0.46),rgba(8,47,73,0.28))] p-1.5 shadow-[0_16px_36px_rgba(2,6,23,0.24)] backdrop-blur-sm">
                    <ProductPurchasePanelClient
                      lookupKeys={lookupKeys}
                      isModalView={isModalView}
                      initialPriceUah={initialPriceUah}
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

          <div className={contentGridClass}>
            <section className="space-y-2.5">
              <section className="rounded-[22px] border border-slate-900/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,47,73,0.96))] p-3 shadow-[0_16px_34px_rgba(2,6,23,0.16)] sm:rounded-[24px]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                      Потрібна допомога?
                    </p>
                    <p className="mt-1 text-[13px] leading-5 text-slate-200 sm:text-sm sm:leading-6">
                      Якщо потрібна сумісність або аналог, менеджер швидко підбере варіант у чаті.
                    </p>
                  </div>

                  <OpenChatButton
                    message={chatPrefillMessage}
                    title="Відкрити чат з менеджером"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-cyan-300/30 bg-white/10 text-cyan-100 shadow-[0_14px_28px_rgba(8,145,178,0.24)] transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-cyan-200/45 hover:bg-white/16 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40"
                  />
                </div>
              </section>

              <ProductDescriptionClientCard
                fallbackText={fallbackDescription}
                initialText={null}
                lookupKeys={lookupKeys}
                isModalView={isModalView}
                descriptionTextClass={descriptionTextClass}
              />

              {!isModalView && (
                <Suspense fallback={<ProductRelatedItemsFallback />}>
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
                </Suspense>
              )}

              {!isModalView && (
                <Suspense fallback={<ProductRecentlyViewedFallback />}>
                  <ProductRecentlyViewedSection
                    product={{
                      code: product.code,
                      article: product.article,
                      name: product.name,
                      producer: product.producer,
                      quantity: product.quantity,
                      group: product.group,
                      subGroup: product.subGroup,
                      category: product.category,
                      hasPhoto: product.hasPhoto,
                      priceEuro: product.priceEuro,
                    }}
                    euroRate={recommendationEuroRate}
                  />
                </Suspense>
              )}
            </section>
          </div>

          {!isModalView && (
            <section className="border-t border-slate-900/8 bg-[linear-gradient(180deg,rgba(226,232,240,0.34),rgba(255,255,255,0.95))] px-3 py-3.5 sm:px-4 sm:py-4">
              <div className="space-y-3">
                <div className="overflow-hidden rounded-[24px] border border-slate-900/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,244,248,0.96))] shadow-[0_20px_44px_rgba(2,6,23,0.1)] sm:rounded-[26px]">
                  <div className="border-b border-slate-900/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(8,47,73,0.9))] px-4 py-4 sm:px-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                      Поширені питання
                    </p>
                    <h2 className="font-display-italic mt-1 text-[1.05rem] font-black tracking-[-0.04em] text-white sm:text-[1.22rem]">
                      Що варто знати перед замовленням
                    </h2>
                  </div>

                  <div className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-3">
                    {faqItems.map((item) => (
                      <div
                        key={item.question}
                        className="rounded-[20px] border border-slate-900/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(236,243,248,0.94))] px-4 py-3.5 shadow-[0_12px_24px_rgba(2,6,23,0.06)]"
                      >
                        <h3 className="text-[15px] font-extrabold text-slate-950 not-italic">
                          {item.question}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {item.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <section className="overflow-hidden rounded-[24px] border border-slate-900/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(227,238,245,0.96),rgba(232,250,255,0.82))] shadow-[0_20px_44px_rgba(2,6,23,0.1)] sm:rounded-[26px]">
                  <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 max-w-4xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-900">
                          Ключові пошукові фрази
                        </p>
                        <span className="inline-flex rounded-[12px] border border-slate-900/10 bg-slate-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100">
                          {keywordPhrases.length} запитів
                        </span>
                      </div>
                      <h2 className="font-display-italic mt-2 text-[1.04rem] font-black tracking-[-0.04em] text-slate-950 sm:text-[1.16rem]">
                        Як шукають цю запчастину в каталозі
                      </h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700 sm:text-[15px]">
                        {keywordSummaryText}
                      </p>
                    </div>

                    <div className="flex w-full shrink-0 xl:w-auto xl:justify-end">
                      <Link
                        href={keywordButtonHref}
                        className="inline-flex h-10 w-full items-center justify-center rounded-[14px] border border-slate-900/10 bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(2,6,23,0.14)] transition hover:border-cyan-400/30 hover:text-cyan-100 hover:shadow-[0_18px_32px_rgba(8,145,178,0.18)] sm:w-auto"
                      >
                        {keywordButtonLabel}
                      </Link>
                    </div>
                  </div>

                  <div className="border-t border-white/80 px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap gap-2 sm:gap-2.5">
                      {keywordPhrases.map((phrase) => (
                        <span
                          key={phrase}
                          className="inline-flex min-h-9 items-center rounded-[14px] border border-slate-900/8 bg-white/88 px-3 py-1.5 text-[12px] font-semibold leading-5 text-slate-800 shadow-[0_10px_22px_rgba(15,23,42,0.05)] sm:text-[13px]"
                        >
                          {phrase}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </section>
          )}
        </article>
      </div>

      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {!isModalView && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
    </div>
  );
}

