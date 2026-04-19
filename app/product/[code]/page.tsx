import { Suspense, cache, type CSSProperties } from "react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  fetchCatalogProductsByArticle,
  fetchEuroRate,
  fetchPriceEuro,
  findCatalogProductByCode,
  toPriceUah,
} from "app/lib/catalog-server";
import ProductDescriptionClientCard from "app/components/ProductDescriptionClientCard";
import ProductImageWithFallback from "app/components/ProductImageWithFallback";
import OpenChatButton from "app/components/OpenChatButton";
import ProductRelatedItemsSection from "app/components/ProductRelatedItemsSection";
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
  buildProductPath,
  buildVisibleProductName,
  extractProductCodeFromParam,
  extractProductRouteSlugsFromParam,
  INTERNAL_PRODUCT_ROUTE_RESOLUTION_PARAM,
} from "app/lib/product-url";
import {
  resolveProductCodeFromNameSlug,
  resolveProductCodeFromSeoRoute,
} from "app/lib/product-route-resolver";
import { getProductTreeDataset } from "app/lib/product-tree";
import { getSiteUrl } from "app/lib/site-url";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";

const PRODUCT_PAGE_ROUTE_DATA_TIMEOUT_MS = 2200;
const PRODUCT_PAGE_PRODUCT_LOOKUP_TIMEOUT_MS = 1300;
const PRODUCT_PAGE_SEO_PRICE_LOOKUP_TIMEOUT_MS = 650;
const PRODUCT_PAGE_SEO_PRICE_REQUEST_TIMEOUT_MS = 500;
const PRODUCT_PAGE_SEO_EURO_RATE_TIMEOUT_MS = 350;
const PRODUCT_PAGE_SEO_PRICE_CACHE_TTL_MS = 1000 * 60 * 10;
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
    <div className="mt-3 grid gap-2.5 lg:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-[156px] animate-pulse rounded-[18px] border border-slate-200 bg-slate-100"
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
    "radial-gradient(circle at 10% 10%, rgba(103,232,249,0.22), transparent 34%), radial-gradient(circle at 90% 15%, rgba(191,219,254,0.22), transparent 30%), linear-gradient(180deg, #f8fcff 0%, #eef6ff 52%, #f8fafc 100%)",
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const resolveProductGroupLandingPath = cache(
  async (productCategory: string, productGroup: string): Promise<string | null> => {
    const normalizedCategory = productCategory.trim();
    const normalizedGroup = productGroup.trim();

    if (!normalizedGroup) return null;

    const catalogFallbackPath =
      normalizedCategory && normalizedCategory.toLowerCase() !== normalizedGroup.toLowerCase()
        ? buildCatalogCategoryPath(normalizedCategory, normalizedGroup)
        : buildCatalogCategoryPath(normalizedGroup);

    const dataset = await getProductTreeDataset().catch(() => null);
    if (!dataset) return catalogFallbackPath;

    const normalizedCategorySlug = buildPlainSeoSlug(normalizedCategory);
    const normalizedGroupSlug = buildPlainSeoSlug(normalizedGroup);

    if (!normalizedGroupSlug) return catalogFallbackPath;

    const directGroup = dataset.groups.find(
      (entry) =>
        entry.slug === normalizedGroupSlug || entry.legacySlug === normalizedGroupSlug
    );
    if (directGroup) {
      return buildGroupPath(directGroup.slug);
    }

    const resolveNestedGroupPath = (parentGroupSlug: string) => {
      const parentGroup = dataset.groups.find(
        (entry) => entry.slug === parentGroupSlug || entry.legacySlug === parentGroupSlug
      );
      if (!parentGroup) return null;

      const subgroup = parentGroup.subgroups.find(
        (entry) => entry.slug === normalizedGroupSlug || entry.legacySlug === normalizedGroupSlug
      );
      if (subgroup) {
        return buildGroupItemPath(parentGroup.slug, subgroup.slug);
      }

      for (const subgroupEntry of parentGroup.subgroups) {
        const child = subgroupEntry.children.find(
          (entry) => entry.slug === normalizedGroupSlug || entry.legacySlug === normalizedGroupSlug
        );
        if (child) {
          return buildGroupItemPath(parentGroup.slug, child.slug);
        }
      }

      return null;
    };

    if (normalizedCategorySlug) {
      const categoryMatchPath = resolveNestedGroupPath(normalizedCategorySlug);
      if (categoryMatchPath) {
        return categoryMatchPath;
      }
    }

    for (const parentGroup of dataset.groups) {
      const nestedGroupPath = resolveNestedGroupPath(parentGroup.slug);
      if (nestedGroupPath) {
        return nestedGroupPath;
      }
    }

    return catalogFallbackPath;
  }
);

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
  const productLabel = name || "товару";
  const producerLabel = producer || "виробника";
  const groupLabel = subGroup || group || "каталогу";
  const availabilityLabel = quantity > 0 ? "є в наявності" : "доступний під замовлення";

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `Як замовити ${productLabel}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: hasPrice
            ? `Товар ${productLabel} можна додати в замовлення прямо на сторінці. Якщо потрібна додаткова консультація по підбору, менеджер допоможе уточнити сумісність і терміни.`
            : `Для товару ${productLabel} ціна уточнюється. Надішліть запит менеджеру зі сторінки товару і ми підготуємо актуальну пропозицію.`,
        },
      },
      {
        "@type": "Question",
        name: `Чи підійде ${productLabel} до мого авто?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Товар відноситься до підгрупи ${groupLabel}. Для точного підбору рекомендуємо перевіряти код, артикул і виробника ${producerLabel}, а також звіряти сумісність з менеджером перед оформленням.`,
        },
      },
      {
        "@type": "Question",
        name: `Яка наявність і терміни по ${productLabel}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Зараз товар ${availabilityLabel}. Актуальна наявність, статус замовлення і можливі аналоги уточнюються в момент оформлення заявки.`,
        },
      },
    ],
  };
};

const findCatalogProductByArticleFast = async (value: string) => {
  const normalized = (value || "").trim();
  if (!normalized) return null;

  const byArticle = await fetchCatalogProductsByArticle(normalized, {
    limit: 6,
    timeoutMs: 700,
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
  lookupLimit: 18,
  fallbackPages: 1,
  pageSize: 36,
  timeoutMs: 1100,
  retries: 0,
  retryDelayMs: 100,
  cacheTtlMs: 1000 * 20,
};
const DEEP_PRODUCT_CATALOG_LOOKUP_OPTIONS = {
  lookupLimit: 28,
  fallbackPages: 2,
  pageSize: 40,
  timeoutMs: 1600,
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
  ["product-page:catalog-product"],
  { revalidate: 900 }
);

const getCatalogProduct = cache(async (code: string) => getCatalogProductCached(code));

const buildProductMetaDescription = (options: {
  name: string;
  article: string;
  producer: string;
  quantity: number;
}) => {
  const { name, article, producer, quantity } = options;
  const details = [
    article ? `артикул ${article}` : null,
    producer ? `виробник ${producer}` : null,
    quantity > 0 ? `в наявності ${quantity} шт.` : "під замовлення",
  ]
    .filter(Boolean)
    .join(", ");

  return `Купити ${name}. ${details}. Каталог автозапчастин PartsON.`;
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

const normalizeProductSeoLookupKeys = (rawLookupKeys: string) =>
  Array.from(
    new Set(
      rawLookupKeys
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).slice(0, 3);

const lookupProductSeoPriceEuroUncached = async (rawLookupKeys: string) => {
  const lookupKeys = normalizeProductSeoLookupKeys(rawLookupKeys);
  if (lookupKeys.length === 0) return null;

  return resolveWithTimeout(
    () =>
      getFirstResolvedNonNull(
        lookupKeys.map((lookupKey) =>
          fetchPriceEuro(lookupKey, {
            timeoutMs: PRODUCT_PAGE_SEO_PRICE_REQUEST_TIMEOUT_MS,
            retries: 0,
            retryDelayMs: 100,
            cacheTtlMs: PRODUCT_PAGE_SEO_PRICE_CACHE_TTL_MS,
          }).then(toPositiveNumberOrNull)
        )
      ),
    null,
    PRODUCT_PAGE_SEO_PRICE_LOOKUP_TIMEOUT_MS
  );
};

const lookupProductSeoPriceEuroCached = unstable_cache(
  lookupProductSeoPriceEuroUncached,
  ["product-page:seo-price-euro-v1"],
  {
    revalidate: 60 * 10,
    tags: ["product-seo-price"],
  }
);

const getProductSeoEuroRate = cache(async () =>
  resolveWithTimeout(() => fetchEuroRate(), 50, PRODUCT_PAGE_SEO_EURO_RATE_TIMEOUT_MS)
);

const resolveProductSeoPrice = cache(
  async (
    inlinePriceEuro: number | null | undefined,
    rawLookupKeys: string
  ): Promise<{ priceEuro: number | null; priceUah: number | null }> => {
    const inlinePrice = toPositiveNumberOrNull(inlinePriceEuro);
    const priceEuro = inlinePrice ?? (await lookupProductSeoPriceEuroCached(rawLookupKeys));

    if (priceEuro == null) {
      return { priceEuro: null, priceUah: null };
    }

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
  const addLookupToken = (token: string, minLength = 3) => {
    if (token.length < minLength) return;
    if (!/\d/.test(token)) return;
    tokens.add(token);
  };

  for (const part of parts) {
    addLookupToken(part);
  }

  for (let tailSize = 2; tailSize <= 4; tailSize += 1) {
    if (parts.length < tailSize) continue;
    const tailParts = parts.slice(-tailSize);
    addLookupToken(tailParts.join(""), 5);
    addLookupToken(tailParts.join("-"), 5);
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

  return "";
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

const findCatalogProductByLookupToken = async (token: string) =>
  getFirstResolvedNonNull([
    findCatalogProductByCode(
      token,
      {
        ...FAST_PRODUCT_CATALOG_LOOKUP_OPTIONS,
        timeoutMs: 700,
        lookupLimit: 8,
        exactOnly: true,
      }
    ).catch(() => null),
    findCatalogProductByArticleFast(token).catch(() => null),
  ]);

const resolveProductFromSeoNameSlug = async (rawNameSlug: string) => {
  const lookupTokens = buildUniqueLookupTokens(rawNameSlug);

  for (const token of lookupTokens) {
    const matchedProduct = await findCatalogProductByLookupToken(token);
    const matchedCode = (matchedProduct?.code || matchedProduct?.article || "").trim();
    if (!matchedCode) continue;

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
  ["product-page:resolve-route-v8-short-name-article"],
  { revalidate: 900 }
);

const resolveProductCodeFromRouteParam = cache(async (rawCode: string) =>
  resolveProductCodeFromRouteParamCached(rawCode)
);

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
  ["product-page:resolved-route-product-v8-short-name-article"],
  { revalidate: 900 }
);

const getResolvedProductRouteData = cache(async (rawCode: string) =>
  getResolvedProductRouteDataCached(rawCode)
);

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

  const recoveredCode = await resolveProductCodeFromNameSlug(decodedParam);
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
  const metadataLookupKeys = Array.from(
    new Set(
      [productArticle, routeProduct?.code, resolvedCode, fallbackCode]
        .map((value) => (value || "").trim())
        .filter(Boolean)
    )
  );
  const seoPrice = await resolveProductSeoPrice(
    routeProduct?.priceEuro ?? null,
    metadataLookupKeys.join("\n")
  );
  const shouldIndexProduct = !isModalView && seoPrice.priceUah != null;

  const seoTitle = [
    seoVisibleProductName
      ? `Купити ${seoVisibleProductName}`
      : "Купити автозапчастину",
    productProducer ? `виробник ${productProducer}` : null,
    productArticle ? `артикул ${productArticle}` : null,
    categoryLabel ? `категорія ${categoryLabel}` : null,
    resolvedCode ? `код ${resolvedCode}` : null,
    "ціна",
    "доставка",
    "PartsON",
  ]
    .filter(Boolean)
    .join(" | ");

  const description = [
    `Купити ${seoVisibleProductName}${productProducer ? ` від ${productProducer}` : ""}${productArticle ? `, артикул ${productArticle}` : ""}.`,
    categoryLabel ? `Категорія: ${categoryLabel}.` : null,
    resolvedCode ? `Код товару: ${resolvedCode}.` : null,
    "Доставка по Україні, підбір за кодом, артикулом і VIN в PartsON.",
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
      images: [productImageUrl],
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
    const recoveredRouteData = await recoverProductRouteDataFromNameSlug(rawCode || "");
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

  if (!resolvedCode) notFound();

  const [normalizedSearchParams] = await Promise.all([
    searchParams ?? Promise.resolve({} as ProductPageSearchParams),
  ]);
  if (!product) notFound();

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
  const productSeoPrice = await resolveProductSeoPrice(
    product.priceEuro ?? null,
    lookupKeys.join("\n")
  );
  const initialPriceUah = productSeoPrice.priceUah;
  const shouldEmitProductStructuredData = !isModalView && initialPriceUah != null;
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
  const groupLandingPath = productGroup
    ? await resolveProductGroupLandingPath(productCategory, productGroup)
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
    subGroupPath: productSubgroup ? categoryCatalogPath : null,
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
    : "grid gap-3 p-2.5 sm:gap-3.5 sm:p-3.5";
  const heroProductImageClass = isModalView
    ? "mx-auto h-[220px] w-full rounded-[22px] border border-slate-200/85 bg-slate-50 sm:h-[250px]"
    : "mx-auto h-[220px] w-full rounded-[24px] border border-slate-200/85 bg-slate-50 sm:h-[250px] xl:h-[260px] 2xl:h-[276px]";
  const descriptionTextClass = isModalView
    ? "mt-1.5 max-h-[172px] overflow-y-auto whitespace-pre-line break-words pr-0.5 text-sm leading-relaxed text-slate-700"
    : "mt-2 max-h-[238px] overflow-y-auto whitespace-pre-line break-words pr-0.5 text-[14px] leading-6 text-slate-700 sm:text-[15px] sm:leading-[1.65]";
  const chatPrefillMessage = [
    "Потрібна консультація по товару:",
    product.name,
    product.code ? `Код: ${product.code}` : null,
    product.article ? `Артикул: ${product.article}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const breadcrumbItems = [
    { href: "/", label: "Головна" },
    { href: "/katalog", label: "Каталог" },
    groupLandingPath && productGroup
      ? { href: groupLandingPath, label: visibleProductGroup }
      : null,
    productSubgroup &&
    productSubgroup.toLowerCase() !== (productGroup || "").toLowerCase()
      ? { href: categoryCatalogPath, label: visibleProductSubgroup }
      : null,
  ].filter(Boolean) as Array<{ href: string; label: string }>;
  const normalizedProductArticle = (product.article || "").trim();
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
          href: categoryCatalogPath,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; href?: string | null }>;
  const productHeaderMetaGridClass = productHeaderInfoItems.length > 0
    ? "mt-4 grid gap-2.5 lg:grid-cols-[minmax(220px,0.92fr)_minmax(0,1.08fr)]"
    : "mt-4 max-w-[430px]";
  const keywordButtonHref =
    producerLandingPath || producerCatalogPath || categoryCatalogPath || "/katalog";
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
  const keywordPhrases = Array.from(
    new Set(
      [
        visibleProductName,
        product.producer ? `${visibleProductName} ${product.producer}` : null,
        product.article ? `${visibleProductName} ${product.article}` : null,
        visibleProductSubgroup ? `${visibleProductSubgroup} ${visibleProductName}` : null,
        visibleProductGroup ? `${visibleProductGroup} ${visibleProductName}` : null,
        product.producer && (visibleProductSubgroup || visibleProductGroup)
          ? `${product.producer} ${visibleProductSubgroup || visibleProductGroup}`
          : null,
        `купити ${visibleProductName}`,
        `${visibleProductName} ціна`,
        `${visibleProductName} доставка Львів`,
        `${visibleProductName} доставка по Україні`,
        `${visibleProductName} самовивіз Львів`,
        `${visibleProductName} купити Львів`,
        `${visibleProductName} Нова пошта`,
        `${visibleProductName} в наявності Львів`,
        product.article ? `${product.article} доставка Львів` : null,
        product.article ? `${product.article} самовивіз Львів` : null,
        product.producer ? `${product.producer} ${visibleProductName} купити` : null,
        product.producer ? `${product.producer} ${visibleProductName} доставка по Україні` : null,
      ]
        .map((item) => (item || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )
  ).slice(0, 10);
  const keywordSummaryText = `Зібрали короткі запити, за якими найчастіше шукають ${visibleProductName}${product.producer ? ` від ${product.producer}` : ""}${visibleProductSubgroup || visibleProductGroup ? ` у розділі ${visibleProductSubgroup || visibleProductGroup}` : ""}.`;
  const faqItems = [
    {
      question: "Як замовити товар?",
      answer:
        "Надішліть запит менеджеру прямо зі сторінки або дочекайтесь, поки підтягнеться актуальна ціна. Якщо потрібна перевірка сумісності, відкрий чат і менеджер підкаже.",
    },
    {
      question: "Як перевірити сумісність?",
      answer:
        "Для точного підбору звіряйте код, артикул і виробника. Якщо є сумніви, напишіть у чат з VIN або даними авто.",
    },
    {
      question: "Які терміни по наявності?",
      answer: isInStock
        ? `Зараз товар є в наявності${product.quantity > 0 ? `: ${product.quantity} шт.` : "."}`
        : "Зараз товар доступний під замовлення. Точний термін постачання уточнюється менеджером після заявки.",
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
          className={`overflow-hidden border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,252,255,0.96),rgba(255,255,255,0.98))] shadow-[0_28px_68px_rgba(14,165,233,0.11)] backdrop-blur-xl ${
            isModalView ? "rounded-2xl" : "rounded-[24px] sm:rounded-[26px]"
          }`}
        >
          <header className="relative m-2.5 block h-auto min-h-0 overflow-hidden rounded-[24px] border border-cyan-100/95 bg-[linear-gradient(135deg,rgba(255,255,255,0.99),rgba(241,249,255,0.97)_52%,rgba(236,253,245,0.9))] px-3 py-3.5 shadow-[0_24px_60px_rgba(14,165,233,0.16),0_8px_22px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.86)] ring-1 ring-white/80 sm:m-3.5 sm:rounded-[28px] sm:px-5 sm:py-5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(125,211,252,0.26),transparent_30%),radial-gradient(circle_at_92%_12%,rgba(134,239,172,0.18),transparent_28%)]" />
            <div className="pointer-events-none absolute left-6 right-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
            <div className="pointer-events-none absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
            <div className="pointer-events-none absolute inset-x-5 bottom-[-18px] h-10 rounded-[999px] bg-cyan-400/10 blur-2xl" />
            <div className="relative">
              {!isModalView && (
                <nav
                  aria-label="Навігація по сторінці товару"
                  className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500 sm:text-[12px]"
                >
                  {breadcrumbItems.map((item, index) => (
                    <span key={item.href} className="inline-flex items-center gap-2">
                      {index > 0 ? <span className="text-slate-300">/</span> : null}
                      <Link href={item.href} className="transition hover:text-cyan-800">
                        {item.label}
                      </Link>
                    </span>
                  ))}
                </nav>
              )}
              <div className="grid gap-4 xl:grid-cols-[minmax(220px,252px)_minmax(0,1fr)_324px] xl:items-start 2xl:grid-cols-[minmax(240px,268px)_minmax(0,1fr)_348px]">
                <div className="order-2 min-w-0 xl:order-1">
                  <div className="overflow-hidden rounded-[26px] border border-white/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,249,255,0.94),rgba(248,250,252,0.96))] p-2 shadow-[0_18px_40px_rgba(14,165,233,0.1)] backdrop-blur-sm">
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
                      className={heroProductImageClass}
                    />
                  </div>
                </div>

                <div className="order-1 min-w-0 xl:order-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-cyan-200/80 bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-800 shadow-[0_10px_22px_rgba(8,145,178,0.08)]">
                      Картка товару
                    </span>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] shadow-[0_10px_22px_rgba(15,23,42,0.06)] ${
                        isInStock
                          ? "border-emerald-200/90 bg-emerald-50/90 text-emerald-800"
                          : "border-amber-200/90 bg-amber-50/90 text-amber-800"
                      }`}
                    >
                      {isInStock ? "В наявності" : "Під замовлення"}
                    </span>
                  </div>

                  <h1 className="font-display-italic mt-3 max-w-none break-words text-[clamp(1.16rem,2.6vw,2.18rem)] font-black leading-[1.08] tracking-normal text-slate-950 [overflow-wrap:anywhere] [text-wrap:pretty] xl:max-w-[44ch]">
                    {productHeadingText}
                  </h1>
                  <div className={productHeaderMetaGridClass}>
                    <div className="rounded-[22px] border border-cyan-100/90 bg-[linear-gradient(160deg,rgba(255,255,255,0.99),rgba(236,254,255,0.92),rgba(240,253,244,0.82))] px-4 py-3.5 shadow-[0_16px_34px_rgba(14,165,233,0.09)]">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-800 sm:text-[11px]">
                        {productIdentifierLabel}
                      </p>
                      <p className="mt-2 font-mono text-[17px] font-black leading-6 tracking-normal text-slate-950 [overflow-wrap:anywhere] sm:text-[19px]">
                        {productIdentifierValue}
                      </p>
                      {productIdentifierHint ? (
                        <p className="mt-1.5 text-[12px] font-medium leading-5 text-slate-500 sm:text-[13px]">
                          {productIdentifierHint}
                        </p>
                      ) : null}
                    </div>

                    {productHeaderInfoItems.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {productHeaderInfoItems.map((item) => (
                          <div
                            key={item.label}
                            className="rounded-[20px] border border-white/90 bg-white/82 px-3.5 py-3 shadow-[0_12px_28px_rgba(14,165,233,0.07)] backdrop-blur-sm"
                          >
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 sm:text-[10px]">
                              {item.label}
                            </p>
                            {item.href ? (
                              <Link
                                href={item.href}
                                className="mt-1.5 block text-[13px] font-extrabold leading-5 text-slate-900 transition hover:text-cyan-800 [overflow-wrap:anywhere] sm:text-[14px]"
                              >
                                {item.value}
                              </Link>
                            ) : (
                              <p className="mt-1.5 text-[13px] font-extrabold leading-5 text-slate-900 [overflow-wrap:anywhere] sm:text-[14px]">
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
                  <div className="rounded-[28px] border border-white/90 bg-white/76 p-1.5 shadow-[0_18px_40px_rgba(14,165,233,0.11)] backdrop-blur-sm">
                    <ProductPurchasePanelClient
                      lookupKeys={lookupKeys}
                      isModalView={isModalView}
                      initialPriceUah={initialPriceUah}
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
              <section className="rounded-[22px] border border-white/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(240,249,255,0.9),rgba(236,253,245,0.72))] p-3 shadow-[0_14px_30px_rgba(14,165,233,0.07)] sm:rounded-[24px]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-800">
                      Потрібна допомога?
                    </p>
                    <p className="mt-1 text-[13px] leading-5 text-slate-600 sm:text-sm sm:leading-6">
                      Якщо потрібна сумісність або аналог, менеджер швидко підбере варіант у чаті.
                    </p>
                  </div>

                  <OpenChatButton message={chatPrefillMessage} title="Відкрити чат з менеджером" />
                </div>
              </section>

              <ProductDescriptionClientCard
                fallbackText={fallbackDescription}
                lookupKeys={lookupKeys}
                isModalView={isModalView}
                descriptionTextClass={descriptionTextClass}
              />

              {!isModalView && (
                <Suspense fallback={<ProductRelatedItemsFallback />}>
                  <ProductRelatedItemsSection product={product} />
                </Suspense>
              )}
            </section>
          </div>

          {!isModalView && (
            <section className="border-t border-white/80 bg-[linear-gradient(180deg,rgba(248,252,255,0.78),rgba(255,255,255,0.95))] px-3 py-3.5 sm:px-4 sm:py-4">
              <div className="space-y-3">
                <section className="overflow-hidden rounded-[24px] border border-white/80 bg-[radial-gradient(circle_at_top_left,rgba(165,243,252,0.28),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,252,255,0.94))] shadow-[0_18px_38px_rgba(14,165,233,0.1)] sm:rounded-[26px]">
                  <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 max-w-4xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-800">
                          Часто шукають
                        </p>
                        <span className="inline-flex rounded-full border border-cyan-200 bg-white/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-cyan-800">
                          {keywordPhrases.length} запитів
                        </span>
                      </div>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-[15px]">
                        {keywordSummaryText}
                      </p>
                    </div>

                    <div className="flex w-full shrink-0 xl:w-auto xl:justify-end">
                      <Link
                        href={keywordButtonHref}
                        className="inline-flex h-10 w-full items-center justify-center rounded-full border border-slate-200 bg-white/92 px-4 text-sm font-semibold text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-cyan-300 hover:text-cyan-800 hover:shadow-[0_14px_28px_rgba(14,165,233,0.12)] sm:w-auto"
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
                          className="inline-flex min-h-9 items-center rounded-full border border-cyan-100 bg-white/92 px-3 py-1.5 text-[12px] font-semibold leading-5 text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.04)] sm:text-[13px]"
                        >
                          {phrase}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>

                <div className="overflow-hidden rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,252,255,0.94))] shadow-[0_18px_38px_rgba(14,165,233,0.1)] sm:rounded-[26px]">
                  <div className="border-b border-white/80 px-4 py-4 sm:px-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-800">
                      Поширені питання
                    </p>
                    <h2 className="font-display-italic mt-1 text-[1.05rem] font-black tracking-normal text-slate-900 sm:text-[1.22rem]">
                      Що варто знати перед замовленням
                    </h2>
                  </div>

                  <div className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-3">
                    {faqItems.map((item) => (
                      <div
                        key={item.question}
                        className="rounded-[22px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(240,249,255,0.9))] px-4 py-3.5 shadow-[0_10px_22px_rgba(14,165,233,0.08)]"
                      >
                        <h3 className="text-[15px] font-extrabold text-slate-900 not-italic">
                          {item.question}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {item.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
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
