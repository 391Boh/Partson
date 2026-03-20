import { cache, Suspense, type CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  fetchEuroRate,
  fetchPriceEuro,
  fetchProductDescription,
  findCatalogProductByCode,
  toPriceUah,
} from "app/lib/catalog-server";
import ProductImageWithFallback from "app/components/ProductImageWithFallback";
import OpenChatButton from "app/components/OpenChatButton";
import ProductPageActions from "app/components/ProductPageActions";
import ProductRelatedItemsSection from "app/components/ProductRelatedItemsSection";
import { getProductImagePath, PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image";
import { getSiteUrl } from "app/lib/site-url";
import { buildSeoSlug } from "app/lib/seo-slug";

export const revalidate = 900;

interface ProductPageParams {
  code: string;
}

interface ProductPageSearchParams {
  view?: string | string[];
}

interface ProductPageProps {
  params: Promise<ProductPageParams>;
  searchParams?: Promise<ProductPageSearchParams>;
}

const pageBackground: CSSProperties = {
  backgroundImage:
    "radial-gradient(circle at 10% 10%, rgba(14,165,233,0.16), transparent 38%), radial-gradient(circle at 90% 15%, rgba(59,130,246,0.15), transparent 33%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
};

const formatQuantity = (quantity: number) => {
  if (!Number.isFinite(quantity) || quantity <= 0) return "Під замовлення";
  return `${quantity} шт.`;
};

const formatPriceUah = (priceUah: number | null) => {
  if (priceUah == null) return "За запитом";
  return `${priceUah.toLocaleString("uk-UA")} грн`;
};

const normalizeView = (view: string | string[] | undefined) => {
  if (Array.isArray(view)) return (view[0] || "").trim().toLowerCase();
  return (view || "").trim().toLowerCase();
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
}) => {
  const { siteUrl, canonicalUrl, name, groupName, groupPath } = options;

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

const buildVisibleProductName = (value: string) => {
  const source = (value || "").trim();
  if (!source) return "Товар";

  const cleaned = source.replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || source;
};

const getFirstResolvedValue = async <T,>(
  keys: string[],
  reader: (key: string) => Promise<T | null>
) => {
  const normalizedKeys = keys.map((key) => key.trim()).filter(Boolean);
  if (normalizedKeys.length === 0) return null;

  const attempts = normalizedKeys.map((key, index) =>
    Promise.resolve()
      .then(() => reader(key))
      .then((value) => ({ index, value }))
      .catch(() => ({ index, value: null as T | null }))
  );

  const pending = new Set<number>(attempts.map((_, index) => index));
  while (pending.size > 0) {
    const result = await Promise.race(Array.from(pending, (index) => attempts[index]));
    pending.delete(result.index);
    if (result.value != null) return result.value;
  }

  return null;
};

const getCatalogProduct = cache(async (code: string) => findCatalogProductByCode(code));
const FAST_PRODUCT_LOOKUP_OPTIONS = {
  timeoutMs: 3500,
  retries: 0,
};

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

const shouldIndexProductPage = (product: {
  name: string;
  article: string;
  producer: string;
  quantity: number;
  group?: string;
  subGroup?: string;
  category?: string;
}) => {
  const filledSignals = [
    product.name.trim(),
    product.article.trim(),
    product.producer.trim(),
    (product.group || product.category || "").trim(),
    (product.subGroup || "").trim(),
  ].filter(Boolean).length;

  return Boolean(product.name.trim()) && (product.quantity > 0 || filledSignals >= 3);
};

export async function generateMetadata({
  params,
  searchParams,
}: ProductPageProps): Promise<Metadata> {
  const { code: rawCode } = await params;
  const resolvedSearchParams = await (
    searchParams ?? Promise.resolve({} as ProductPageSearchParams)
  );
  const isModalView = normalizeView(resolvedSearchParams.view) === "modal";
  const resolvedCode = decodeURIComponent(rawCode || "").trim();
  if (!resolvedCode) {
    return {
      title: "Товар не знайдено",
      robots: { index: false, follow: false },
    };
  }

  const product = await getCatalogProduct(resolvedCode);
  if (!product) {
    return {
      title: "Товар не знайдено",
      robots: { index: false, follow: false },
    };
  }

  const canonicalCode = encodeURIComponent(product.code || resolvedCode);
  const canonicalPath = `/product/${canonicalCode}`;
  const visibleProductName = buildVisibleProductName(product.name);
  const productImagePath = getProductImagePath(
    product.code || resolvedCode,
    product.article
  );
  const description = buildProductMetaDescription({
    name: visibleProductName,
    article: product.article,
    producer: product.producer,
    quantity: product.quantity,
  });
  const indexable = shouldIndexProductPage(product);
  const keywords = Array.from(new Set([
    product.name,
    product.code,
    product.article,
    product.producer,
    "автозапчастини",
    "купити автозапчастини",
    "каталог автозапчастин",
    "деталі авто",
    "PartsON",
  ].map((entry) => (entry || "").trim()).filter(Boolean)));
  const otherMeta: Record<string, string> = {
    "product:availability": product.quantity > 0 ? "in stock" : "out of stock",
    "product:condition": "new",
  };
  if (product.producer) otherMeta["product:brand"] = product.producer;
  if (product.article) otherMeta["product:mpn"] = product.article;
  if (product.code) otherMeta["product:retailer_item_id"] = product.code;
  const productImageUrl = `${getSiteUrl()}${productImagePath}`;
  otherMeta["image"] = productImageUrl;
  otherMeta["thumbnail"] = productImageUrl;

  return {
    title: `${visibleProductName}${product.producer ? ` ${product.producer}` : ""}${product.article ? ` ${product.article}` : ""}`,
    description,
    keywords,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "website",
      url: canonicalPath,
      title: visibleProductName,
      description,
      images: [{ url: productImageUrl, alt: `Фото товару ${visibleProductName}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: visibleProductName,
      description,
      images: [productImageUrl],
    },
    robots: {
      index: !isModalView && indexable,
      follow: true,
      googleBot: {
        index: !isModalView && indexable,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    other: otherMeta,
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { code: rawCode } = await params;
  const resolvedCode = decodeURIComponent(rawCode || "").trim();
  if (!resolvedCode) notFound();

  const product = await getCatalogProduct(resolvedCode);
  if (!product) notFound();

  const normalizedSearchParams = (await searchParams) || {};
  const isModalView = normalizeView(normalizedSearchParams.view) === "modal";

  const primaryLookupKey =
    product.article.trim() || product.code.trim() || resolvedCode;
  const lookupKeys = isModalView
    ? [primaryLookupKey]
    : Array.from(
        new Set([product.article.trim(), product.code.trim(), resolvedCode].filter(Boolean))
      );
  const descriptionLookupOptions = isModalView
    ? { timeoutMs: 1100, retries: 0 }
    : { timeoutMs: 1600, retries: 0 };
  const descriptionPromise = primaryLookupKey
    ? fetchProductDescription(primaryLookupKey, descriptionLookupOptions).catch(() => null)
    : Promise.resolve(null);

  const euroRatePromise = fetchEuroRate();
  const [priceEuro, descriptionFromApi, euroRate] = await Promise.all([
    getFirstResolvedValue(lookupKeys, (key) =>
      fetchPriceEuro(key, FAST_PRODUCT_LOOKUP_OPTIONS)
    ),
    descriptionPromise,
    euroRatePromise,
  ]);

  const priceUah = toPriceUah(priceEuro, euroRate);
  const hasPrice = priceUah != null;
  const description = (descriptionFromApi || "").trim();
  const hasDescription = Boolean(description);
  const descriptionDisplayText = hasDescription ? description : "Опис відсутній";
  const schemaDescription = hasDescription
    ? description
    : buildProductMetaDescription({
        name: product.name,
        article: product.article,
        producer: product.producer,
        quantity: product.quantity,
      });

  const siteUrl = getSiteUrl();
  const productGroup = (product.group || product.category || "").trim();
  const productSubgroup = (product.subGroup || "").trim();
  const groupSlug = buildSeoSlug(productGroup);
  const groupLandingPath = groupSlug ? `/groups/${groupSlug}` : null;
  const canonicalCode = encodeURIComponent(product.code || resolvedCode);
  const canonicalUrl = `${siteUrl}/product/${canonicalCode}`;
  const productImagePath = getProductImagePath(
    product.code || resolvedCode,
    product.article
  );
  const fallbackImagePath = PRODUCT_IMAGE_FALLBACK_PATH;
  const productImageUrl = `${siteUrl}${productImagePath}`;
  const jsonLd = hasPrice
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
        priceUah,
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
  });
  const isInStock = Number.isFinite(product.quantity) && product.quantity > 0;
  const faqJsonLd = buildProductFaqJsonLd({
    name: product.name,
    producer: product.producer,
    group: productGroup,
    subGroup: productSubgroup,
    hasPrice,
    quantity: product.quantity,
  });
  const contentGridClass = isModalView
    ? "grid gap-3 p-3 sm:p-4 lg:grid-cols-[340px_minmax(0,1fr)]"
    : "grid gap-3 p-3 sm:gap-4 sm:p-4 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]";
  const productImageClass = isModalView
    ? "mx-auto h-[220px] w-full rounded-xl border border-slate-200 bg-slate-50 sm:h-[250px] md:h-[280px]"
    : "mx-auto h-[220px] w-full rounded-2xl border border-slate-200 bg-slate-50 sm:h-[280px] xl:h-[320px] 2xl:h-[340px]";
  const descriptionTextClass = isModalView
    ? "mt-1.5 max-h-[180px] overflow-y-auto whitespace-pre-line break-words pr-1 text-sm leading-relaxed text-slate-700"
    : "mt-2 max-h-[320px] overflow-y-auto whitespace-pre-line break-words pr-1 text-[14px] font-semibold leading-6 text-slate-700 sm:text-[15px] sm:leading-7";
  const chatPrefillMessage = [
    "Потрібна консультація по товару:",
    product.name,
    product.code ? `Код: ${product.code}` : null,
    product.article ? `Артикул: ${product.article}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      className={isModalView ? "min-h-screen select-none bg-white text-slate-900" : "min-h-screen select-none text-slate-900"}
      style={isModalView ? undefined : pageBackground}
    >
      <div
        className={
          isModalView
            ? "mx-auto w-full max-w-[1080px] px-2 py-2 sm:px-3 sm:py-3"
            : "mx-auto w-full max-w-[1400px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7"
        }
      >
        <article
          className={`overflow-hidden border border-slate-200/80 bg-white/95 shadow-[0_22px_52px_rgba(15,23,42,0.12)] backdrop-blur-sm ${
            isModalView ? "rounded-2xl" : "rounded-[24px] sm:rounded-[26px]"
          }`}
        >
          <header className="relative block h-auto min-h-0 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-900 px-3 py-4 text-white sm:px-5 sm:py-5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.24),transparent_45%),radial-gradient(circle_at_86%_18%,rgba(34,211,238,0.2),transparent_40%)]" />
            <div className="relative">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0">
                <h1 className="font-display-italic max-w-none break-words text-[clamp(1rem,2.5vw,1.85rem)] font-black leading-[1.04] tracking-[-0.03em] text-white [overflow-wrap:anywhere] [text-wrap:pretty] sm:text-[clamp(1.18rem,2vw,2rem)] xl:max-w-[42ch]">
                  {visibleProductName}
                </h1>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:max-w-[760px]">
                  <div className="rounded-[16px] border border-white/12 bg-white/7 px-3 py-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-300 sm:text-[10px]">
                      Виробник
                    </p>
                    <p className="mt-1 text-[13px] font-extrabold leading-5 text-white [overflow-wrap:anywhere] sm:text-[14px]">
                      {product.producer || "Без бренду"}
                    </p>
                  </div>
                  <div className="rounded-[16px] border border-white/12 bg-white/7 px-3 py-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-300 sm:text-[10px]">
                      Категорія
                    </p>
                    <p className="mt-1 text-[13px] font-extrabold leading-5 text-white [overflow-wrap:anywhere] sm:text-[14px]">
                      {productSubgroup || productGroup || "Автозапчастини"}
                    </p>
                  </div>
                  <div className="rounded-[16px] border border-white/12 bg-white/7 px-3 py-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-300 sm:text-[10px]">
                      Код
                    </p>
                    <p className="mt-1 text-[13px] font-extrabold leading-5 text-white [overflow-wrap:anywhere] sm:text-[14px]">
                      {product.code || resolvedCode}
                    </p>
                  </div>
                  <div className="rounded-[16px] border border-white/12 bg-white/7 px-3 py-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-300 sm:text-[10px]">
                      Артикул
                    </p>
                    <p className="mt-1 text-[13px] font-extrabold leading-5 text-white [overflow-wrap:anywhere] sm:text-[14px]">
                      {product.article || "-"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-[20px] border border-white/12 bg-white/8 p-2.5 shadow-[0_18px_34px_rgba(15,23,42,0.18)] backdrop-blur-sm sm:p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[16px] border border-white/12 bg-white/6 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-300">
                      Статус
                    </p>
                    <p className="mt-1 text-[13px] font-extrabold leading-5 text-white sm:text-[14px]">
                      {isInStock ? `В наявності${product.quantity > 0 ? ` · ${product.quantity} шт.` : ""}` : "Під замовлення"}
                    </p>
                  </div>
                  <div className="rounded-[16px] border border-white/12 bg-white/6 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-300">
                      Ціна
                    </p>
                    <p className="mt-1 text-[13px] font-extrabold leading-5 text-white sm:text-[14px]">
                      {hasPrice ? formatPriceUah(priceUah) : "За запитом"}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[12px] font-semibold leading-5 text-slate-200">
                  {hasPrice
                    ? "Замовлення доступне одразу зі сторінки."
                    : "Надішліть запит менеджеру для уточнення ціни."}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <ProductPageActions
                    code={product.code || resolvedCode}
                    article={product.article}
                    name={product.name}
                    producer={product.producer}
                    priceUah={priceUah}
                    quantity={product.quantity}
                    compact
                  />
                </div>
              </div>
            </div>
          </div>
          </header>

          <div className={contentGridClass}>
            <section className="space-y-2.5">
              <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-2.5 shadow-[0_18px_38px_rgba(15,23,42,0.08)] sm:rounded-[26px] sm:p-3">
                <ProductImageWithFallback
                  src={productImagePath}
                  fallbackSrc={fallbackImagePath}
                  alt={`Фото товару ${product.name}`}
                  width={640}
                  height={640}
                  loading="eager"
                  decoding="sync"
                  fetchPriority="high"
                  zoomEnabled={false}
                  className={productImageClass}
                />
              </div>

              <section className="rounded-[22px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] p-3 shadow-[0_16px_32px_rgba(15,23,42,0.05)] sm:rounded-[26px] sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      Потрібна допомога?
                    </p>
                    <p className="mt-1.5 text-sm font-semibold leading-6 text-slate-600">
                      Якщо потрібна сумісність або аналог, напишіть у чат і менеджер підбере варіанти.
                    </p>
                  </div>

                  <OpenChatButton message={chatPrefillMessage} title="Відкрити чат з менеджером" />
                </div>
              </section>

              <section className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_14px_28px_rgba(15,23,42,0.05)] sm:rounded-[26px] sm:p-4">
                <h2 className="font-display-italic text-[1.05rem] font-black tracking-[-0.04em] text-slate-900 sm:text-[1.2rem]">
                  Поширені питання
                </h2>
                <div className="mt-3 space-y-2.5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <h3 className="text-[15px] font-extrabold text-slate-900 not-italic">
                      Як замовити товар?
                    </h3>
                    <p className="mt-1.5 text-sm font-semibold leading-6 text-slate-700">
                      {hasPrice
                        ? "Якщо ціна вже доступна, товар можна одразу додати в замовлення. Якщо потрібна перевірка сумісності, відкрий чат і менеджер підкаже."
                        : "Якщо ціна не показується, надішліть запит менеджеру прямо зі сторінки. Ми уточнимо ціну, наявність і можливі аналоги."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <h3 className="text-[15px] font-extrabold text-slate-900 not-italic">
                      Як перевірити сумісність?
                    </h3>
                    <p className="mt-1.5 text-sm font-semibold leading-6 text-slate-700">
                      Для точного підбору звіряйте код, артикул і виробника. Якщо є сумніви, напишіть у чат з VIN або даними авто.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <h3 className="text-[15px] font-extrabold text-slate-900 not-italic">
                      Які терміни по наявності?
                    </h3>
                    <p className="mt-1.5 text-sm font-semibold leading-6 text-slate-700">
                      {isInStock
                        ? `Зараз товар є в наявності${product.quantity > 0 ? `: ${product.quantity} шт.` : "."}`
                        : "Зараз товар доступний під замовлення. Точний термін постачання уточнюється менеджером після заявки."}
                    </p>
                  </div>
                </div>
              </section>
            </section>

            <section className="space-y-3">
              <section className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_14px_28px_rgba(15,23,42,0.05)] sm:rounded-[26px] sm:p-4">
                <h2 className="font-display-italic text-[1.05rem] font-black tracking-[-0.04em] text-slate-900 sm:text-[1.2rem]">
                  Опис товару
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Коротка інформація про товар, його призначення та статус по каталогу.
                </p>
                <p className={descriptionTextClass}>{descriptionDisplayText}</p>
              </section>

              {!isModalView && (
                <div>
                  <Suspense
                    fallback={
                      <section className="rounded-[26px] border border-slate-200 bg-white p-3 shadow-[0_14px_28px_rgba(15,23,42,0.05)] sm:p-4">
                        <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-3">
                          <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-sky-700">
                              Схожі товари
                            </p>
                            <h2 className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-slate-900">
                              Підбираємо товари з цієї підгрупи
                            </h2>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {Array.from({ length: 3 }).map((_, index) => (
                            <div
                              key={index}
                              className="h-[188px] animate-pulse rounded-[22px] border border-slate-200 bg-slate-100"
                            />
                          ))}
                        </div>
                      </section>
                    }
                  >
                    <ProductRelatedItemsSection product={product} />
                  </Suspense>
                </div>
              )}

            </section>
          </div>
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
