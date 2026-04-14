import { cache, type CSSProperties } from "react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  fetchCatalogProductsByArticle,
  fetchEuroRate,
  findCatalogProductByCode,
  toPriceUah,
} from "app/lib/catalog-server";
import ProductImageWithFallback from "app/components/ProductImageWithFallback";
import OpenChatButton from "app/components/OpenChatButton";
import ProductPurchasePanelClient from "app/components/ProductPurchasePanelClient";
import {
  buildCatalogCategoryPath,
  buildCatalogProducerPath,
  buildGroupPath,
  buildManufacturerPath,
} from "app/lib/catalog-links";
import { getProductImagePath, PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image";
import {
  buildProductPath,
  buildVisibleProductName,
  extractProductCodeFromParam,
  extractProductRouteSlugsFromParam,
  INTERNAL_PRODUCT_ROUTE_RESOLUTION_PARAM,
} from "app/lib/product-url";
import { resolveProductCodeFromSeoRoute } from "app/lib/product-route-resolver";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 900;

const ProductDescriptionClientCard = dynamic(
  () => import("app/components/ProductDescriptionClientCard"),
  {
    loading: () => (
      <section className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_14px_28px_rgba(15,23,42,0.05)] sm:rounded-[24px] sm:p-4">
        <div className="flex items-end justify-between gap-2.5 border-b border-slate-100 pb-2.5">
          <div className="min-w-0">
            <div className="h-3 w-16 animate-pulse rounded-full bg-sky-100" />
            <div className="mt-2 h-6 w-56 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-6 w-28 animate-pulse rounded-full bg-slate-100" />
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-4 w-full animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-[92%] animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-[84%] animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-[76%] animate-pulse rounded-full bg-slate-100" />
        </div>
      </section>
    ),
  }
);

const ProductRelatedItemsClientSection = dynamic(
  () => import("app/components/ProductRelatedItemsClientSection"),
  {
    loading: () => (
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
    ),
  }
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
    "radial-gradient(circle at 10% 10%, rgba(14,165,233,0.16), transparent 38%), radial-gradient(circle at 90% 15%, rgba(59,130,246,0.15), transparent 33%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
};

const buildProductSeoTitle = (options: {
  visibleName: string;
  producer: string;
  article: string;
  group: string;
  subGroup: string;
}) => {
  const visibleGroup = buildVisibleProductName(options.group);
  const visibleSubGroup = buildVisibleProductName(options.subGroup);
  const categoryLabel = visibleSubGroup || visibleGroup;
  const titleLead = [`Купити ${options.visibleName}`, options.producer || null]
    .filter(Boolean)
    .join(" ");

  if (options.article) {
    return `${titleLead} — артикул ${options.article}`;
  }

  if (categoryLabel) {
    return `${titleLead} — ${categoryLabel}`;
  }

  return titleLead;
};

const buildProductSeoDescription = (options: {
  visibleName: string;
  producer: string;
  article: string;
  code: string;
  group: string;
  subGroup: string;
  quantity: number;
}) => {
  const visibleGroup = buildVisibleProductName(options.group);
  const visibleSubGroup = buildVisibleProductName(options.subGroup);
  const categoryLabel = visibleSubGroup || visibleGroup || "каталог автозапчастин";
  const stockLabel =
    options.quantity > 0
      ? `В наявності ${options.quantity} шт.`
      : "Доступно під замовлення.";

  return [
    `Купити ${options.visibleName}${options.producer ? ` від ${options.producer}` : ""}${options.article ? `, артикул ${options.article}` : ""}.`,
    `Категорія: ${categoryLabel}.`,
    stockLabel,
    options.code ? `Код товару: ${options.code}.` : null,
    "Підбір за кодом і артикулом, доставка по Україні в магазині PartsON.",
  ]
    .filter(Boolean)
    .join(" ");
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
    limit: 12,
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
  lookupLimit: 32,
  fallbackPages: 3,
  pageSize: 60,
  timeoutMs: 1800,
  retries: 0,
  retryDelayMs: 120,
  cacheTtlMs: 1000 * 20,
};
const DEEP_PRODUCT_CATALOG_LOOKUP_OPTIONS = {
  lookupLimit: 40,
  fallbackPages: 4,
  pageSize: 60,
  timeoutMs: 2200,
  retries: 0,
  retryDelayMs: 120,
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

  for (const part of parts) {
    if (part.length < 5) continue;
    if (!/\d/.test(part)) continue;
    tokens.add(part);
  }

  for (let tailSize = 2; tailSize <= 4; tailSize += 1) {
    if (parts.length < tailSize) continue;
    const merged = parts.slice(-tailSize).join("");
    if (merged.length < 6) continue;
    if (!/\d/.test(merged)) continue;
    tokens.add(merged);
  }

  return Array.from(tokens);
};

const resolveProductCodeFromRouteParamUncached = async (rawCode: string) => {
  const routeSlugs = extractProductRouteSlugsFromParam(rawCode || "");
  if (routeSlugs) {
    const lookupTokens = extractLookupTokensFromSeoNameSlug(routeSlugs.nameSlug);
    for (const token of lookupTokens) {
      const matchedProduct = await getFirstResolvedNonNull([
        findCatalogProductByCode(
          token,
          FAST_PRODUCT_CATALOG_LOOKUP_OPTIONS
        ).catch(() => null),
        findCatalogProductByArticleFast(token).catch(() => null),
      ]);
      const matchedCode = (matchedProduct?.code || matchedProduct?.article || "").trim();
      if (!matchedCode) continue;

      return {
        code: matchedCode,
        isSeoRoute: true,
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
      };
    }

    return {
      code: "",
      isSeoRoute: false,
    };
  }

  return {
    code: extractProductCodeFromParam(rawCode || ""),
    isSeoRoute: false,
  };
};

const resolveProductCodeFromRouteParamCached = unstable_cache(
  resolveProductCodeFromRouteParamUncached,
  ["product-page:resolve-route"],
  { revalidate: 900 }
);

const resolveProductCodeFromRouteParam = cache(async (rawCode: string) =>
  resolveProductCodeFromRouteParamCached(rawCode)
);

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
  const rawTitleSource = routeSlugs?.nameSlug || fallbackCode || decodedParam || "Товар";
  const visibleProductName = buildVisibleProductName(rawTitleSource.replace(/-/g, " "));
  const resolvedRoute = await resolveProductCodeFromRouteParam(rawCode || "");
  const resolvedCode = resolvedRoute.code;
  const product = resolvedCode
    ? await resolveWithTimeout(() => getCatalogProduct(resolvedCode), null, 180)
    : null;
  const canonicalPath = product
    ? buildCanonicalProductPath(product, resolvedCode || fallbackCode || decodedParam)
    : `/product/${encodeURIComponent(decodedParam || fallbackCode || "")}`;
  const productImageUrl = `${getSiteUrl()}${PRODUCT_IMAGE_FALLBACK_PATH}`;
  const resolvedVisibleProductName = product
    ? buildVisibleProductName(product.name)
    : visibleProductName;
  const seoTitle = product
    ? buildProductSeoTitle({
        visibleName: resolvedVisibleProductName,
        producer: product.producer,
        article: product.article,
        group: product.group || product.category || "",
        subGroup: product.subGroup || "",
      })
    : `Купити ${visibleProductName}`;
  const description = product
    ? buildProductSeoDescription({
        visibleName: resolvedVisibleProductName,
        producer: product.producer,
        article: product.article,
        code: product.code || resolvedCode,
        group: product.group || product.category || "",
        subGroup: product.subGroup || "",
        quantity: product.quantity,
      })
    : `Купити ${visibleProductName} в PartsON. Підбір автозапчастин за кодом і артикулом з доставкою по Україні.`;
  const keywords = Array.from(
    new Set(
      [
        resolvedVisibleProductName,
        product?.producer,
        product?.article,
        buildVisibleProductName(product?.subGroup || ""),
        buildVisibleProductName(product?.group || product?.category || ""),
        fallbackCode,
        "автозапчастини",
        "купити автозапчастини",
        "каталог автозапчастин",
        "PartsON",
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
      title: `${seoTitle} | PartsON`,
      description,
      images: [{ url: productImageUrl, alt: `Фото товару ${resolvedVisibleProductName}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${seoTitle} | PartsON`,
      description,
      images: [productImageUrl],
    },
    robots: {
      index: !isModalView,
      follow: true,
      googleBot: {
        index: !isModalView,
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
  const { code: resolvedCode, isSeoRoute } = await resolveProductCodeFromRouteParam(
    rawCode || ""
  );
  if (!resolvedCode) notFound();

  const [product, normalizedSearchParams] = await Promise.all([
    getCatalogProduct(resolvedCode),
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
    isSeoRoute &&
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
  const initialPriceUahPromise =
    typeof product.priceEuro === "number" &&
    Number.isFinite(product.priceEuro) &&
    product.priceEuro > 0
      ? resolveWithTimeout(() => fetchEuroRate(), 50, 180).then((rate) =>
          toPriceUah(product.priceEuro ?? null, rate)
        )
      : Promise.resolve<number | null>(null);
  const initialPriceUah = await initialPriceUahPromise;
  const productGroup = (product.group || product.category || "").trim();
  const productSubgroup = (product.subGroup || "").trim();
  const visibleProductName = buildVisibleProductName(product.name);
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
  const groupLandingPath = productGroup ? buildGroupPath(productGroup) : null;
  const producerLandingPath = product.producer
    ? buildManufacturerPath(product.producer)
    : null;
  const categoryCatalogPath = productSubgroup
    ? buildCatalogCategoryPath(productGroup || productSubgroup, productSubgroup)
    : productGroup
      ? buildCatalogCategoryPath(productGroup)
      : "/katalog";
  const producerCatalogPath = product.producer
    ? buildCatalogProducerPath(product.producer, productGroup || undefined)
    : null;
  const canonicalUrl = `${siteUrl}${canonicalPath}`;
  const productImagePath = getProductImagePath(
    product.code || resolvedCode,
    product.article
  );
  const fallbackImagePath = PRODUCT_IMAGE_FALLBACK_PATH;
  const productImageUrl = `${siteUrl}${productImagePath}`;
  const jsonLd = buildProductJsonLd({
    name: product.name,
    visibleName: visibleProductName,
    description: schemaDescription,
    code: product.code,
    article: product.article,
    producer: product.producer,
    group: productGroup,
    subGroup: productSubgroup,
    quantity: product.quantity,
    priceUah: null,
    canonicalUrl,
    imageUrls: [productImageUrl],
  });
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
    hasPrice: false,
    quantity: product.quantity,
  });
  const contentGridClass = isModalView
    ? "grid gap-2.5 p-2.5 sm:p-3 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start"
    : "grid gap-3 p-2.5 sm:gap-3.5 sm:p-3.5 xl:grid-cols-[minmax(264px,312px)_minmax(0,1fr)] xl:items-start 2xl:grid-cols-[minmax(280px,328px)_minmax(0,1fr)]";
  const productImageClass = isModalView
    ? "mx-auto h-[210px] w-full rounded-xl border border-slate-200 bg-slate-50 sm:h-[238px] md:h-[260px]"
    : "mx-auto h-[190px] w-full rounded-2xl border border-slate-200 bg-slate-50 sm:h-[220px] xl:h-[248px] 2xl:h-[260px]";
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
  const productMetaItems = [
    {
      label: "Виробник",
      value: product.producer || "Без бренду",
      href: producerLandingPath,
    },
    {
      label: "Категорія",
      value: visibleProductSubgroup || visibleProductGroup || "Автозапчастини",
      href: categoryCatalogPath,
    },
    {
      label: "Артикул",
      value: product.article || "-",
    },
    {
      label: "Код товару",
      value: product.code || resolvedCode,
    },
  ];
  const keywordButtonHref = producerCatalogPath || categoryCatalogPath || "/katalog";
  const keywordButtonLabel = producerCatalogPath
    ? `Більше від ${product.producer}`
    : visibleProductSubgroup || visibleProductGroup
      ? `До категорії ${visibleProductSubgroup || visibleProductGroup}`
      : "До каталогу";
  const productHeadingText = visibleProductName;
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
      <div
        className={
          isModalView
            ? "mx-auto w-full max-w-[1080px] px-2 py-2 sm:px-3 sm:py-3"
            : "page-shell-inline py-3 sm:py-5"
        }
      >
        <article
          className={`overflow-hidden border border-slate-200/80 bg-white/95 shadow-[0_22px_52px_rgba(15,23,42,0.12)] backdrop-blur-sm ${
            isModalView ? "rounded-2xl" : "rounded-[24px] sm:rounded-[26px]"
          }`}
        >
          <header className="relative block h-auto min-h-0 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-900 px-3 py-3 text-white sm:px-4 sm:py-3.5">
            <div className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.24),transparent_45%),radial-gradient(circle_at_86%_18%,rgba(34,211,238,0.2),transparent_40%)]" />
            <div className="relative">
              {!isModalView && (
                <nav
                  aria-label="Навігація по сторінці товару"
                  className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-300 sm:text-[12px]"
                >
                  {breadcrumbItems.map((item, index) => (
                    <span key={item.href} className="inline-flex items-center gap-2">
                      {index > 0 ? <span className="text-slate-500">/</span> : null}
                      <Link href={item.href} className="transition hover:text-white">
                        {item.label}
                      </Link>
                    </span>
                  ))}
                </nav>
              )}
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0">
                <h1 className="font-display-italic max-w-none break-words text-[clamp(1rem,2.5vw,1.85rem)] font-black leading-[1.04] tracking-[-0.03em] text-white [overflow-wrap:anywhere] [text-wrap:pretty] sm:text-[clamp(1.18rem,2vw,2rem)] xl:max-w-[42ch]">
                  {productHeadingText}
                </h1>
                <div className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:max-w-[760px]">
                  {productMetaItems.map((item) => (
                    <div key={item.label} className="rounded-[16px] border border-white/12 bg-white/7 px-2.5 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-300 sm:text-[10px]">
                        {item.label}
                      </p>
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="mt-1 block text-[13px] font-extrabold leading-5 text-white underline decoration-white/30 underline-offset-4 transition hover:decoration-white [overflow-wrap:anywhere] sm:text-[14px]"
                        >
                          {item.value}
                        </Link>
                      ) : (
                        <p className="mt-1 text-[13px] font-extrabold leading-5 text-white [overflow-wrap:anywhere] sm:text-[14px]">
                          {item.value}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="xl:pl-2">
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
          </header>

          <div className={contentGridClass}>
            <section className="space-y-2.5 xl:sticky xl:top-[calc(var(--header-height,4rem)+0.9rem)]">
              <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-2 shadow-[0_18px_38px_rgba(15,23,42,0.08)] sm:rounded-[24px] sm:p-2.5">
                <ProductImageWithFallback
                  src={productImagePath}
                  fallbackSrc={fallbackImagePath}
                  alt={`Фото товару ${product.name}`}
                  width={640}
                  height={640}
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  className={productImageClass}
                />
              </div>

              <section className="rounded-[20px] border border-slate-200 bg-[image:linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] p-3 shadow-[0_16px_32px_rgba(15,23,42,0.05)] sm:rounded-[24px]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      Потрібна допомога?
                    </p>
                    <p className="mt-1 text-[13px] leading-5 text-slate-600 sm:text-sm sm:leading-6">
                      Якщо потрібна сумісність або аналог, менеджер швидко підбере варіант у чаті.
                    </p>
                  </div>

                  <OpenChatButton message={chatPrefillMessage} title="Відкрити чат з менеджером" />
                </div>
              </section>
            </section>

            <section className="space-y-2.5">
              <ProductDescriptionClientCard
                fallbackText={fallbackDescription}
                lookupKeys={lookupKeys}
                isModalView={isModalView}
                descriptionTextClass={descriptionTextClass}
              />

              {!isModalView && (
                <ProductRelatedItemsClientSection product={product} />
              )}
            </section>
          </div>

          {!isModalView && (
            <section className="border-t border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.72),rgba(255,255,255,0.96))] px-3 py-3.5 sm:px-4 sm:py-4">
              <div className="space-y-3">
                <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(186,230,253,0.22),transparent_38%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] shadow-[0_16px_34px_rgba(15,23,42,0.06)] sm:rounded-[26px]">
                  <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 max-w-4xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700/90">
                          Часто шукають
                        </p>
                        <span className="inline-flex rounded-full border border-sky-200 bg-white/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-700">
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
                        className="inline-flex h-10 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:border-sky-300 hover:text-sky-800 hover:shadow-[0_14px_28px_rgba(14,165,233,0.12)] sm:w-auto"
                      >
                        {keywordButtonLabel}
                      </Link>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap gap-2 sm:gap-2.5">
                      {keywordPhrases.map((phrase) => (
                        <span
                          key={phrase}
                          className="inline-flex min-h-9 items-center rounded-full border border-sky-100 bg-white/92 px-3 py-1.5 text-[12px] font-semibold leading-5 text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.04)] sm:text-[13px]"
                        >
                          {phrase}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>

                <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_16px_34px_rgba(15,23,42,0.06)] sm:rounded-[26px]">
                  <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700/90">
                      Поширені питання
                    </p>
                    <h2 className="font-display-italic mt-1 text-[1.05rem] font-black tracking-[-0.04em] text-slate-900 sm:text-[1.22rem]">
                      Що варто знати перед замовленням
                    </h2>
                  </div>

                  <div className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-3">
                    {faqItems.map((item) => (
                      <div
                        key={item.question}
                        className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3.5"
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
