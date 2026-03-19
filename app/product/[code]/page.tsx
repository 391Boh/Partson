import { cache, Suspense, type CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
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
  description: string;
  code: string;
  article: string;
  producer: string;
  quantity: number;
  priceUah: number | null;
  canonicalUrl: string;
  imageUrls: string[];
}) => {
  const { name, description, code, article, producer, quantity, priceUah, canonicalUrl, imageUrls } = options;

  const offers =
    priceUah != null
      ? {
          "@type": "Offer",
          priceCurrency: "UAH",
          price: String(priceUah),
          availability:
            quantity > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/PreOrder",
          itemCondition: "https://schema.org/NewCondition",
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
    name,
    description,
    url: canonicalUrl,
    category: "Автозапчастини",
    image: imageUrls,
    sku: article || undefined,
    mpn: code || undefined,
    brand: producer ? { "@type": "Brand", name: producer } : undefined,
    offers,
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
  const productImagePath = getProductImagePath(
    product.code || resolvedCode,
    product.article
  );
  const description = buildProductMetaDescription({
    name: product.name,
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

  return {
    title: product.name,
    description,
    keywords,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "article",
      url: canonicalPath,
      title: product.name,
      description,
      images: [{ url: productImagePath, alt: `Фото товару ${product.name}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      images: [productImagePath],
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
        description: schemaDescription,
        code: product.code,
        article: product.article,
        producer: product.producer,
        quantity: product.quantity,
        priceUah,
        canonicalUrl,
        imageUrls: [productImageUrl],
      })
    : null;
  const breadcrumbJsonLd = buildProductBreadcrumbJsonLd({
    siteUrl,
    canonicalUrl,
    name: product.name,
    groupName: productGroup || undefined,
    groupPath: groupLandingPath,
  });
  const isInStock = Number.isFinite(product.quantity) && product.quantity > 0;
  const contentGridClass = isModalView
    ? "grid gap-3 p-3 sm:p-4 lg:grid-cols-[340px_minmax(0,1fr)]"
    : "grid gap-4 p-3 sm:gap-5 sm:p-5 xl:grid-cols-[420px_minmax(0,1fr)]";
  const productImageClass = isModalView
    ? "mx-auto h-[220px] w-full rounded-xl border border-slate-200 bg-slate-50 sm:h-[250px] md:h-[280px]"
    : "mx-auto h-[250px] w-full rounded-2xl border border-slate-200 bg-slate-50 sm:h-[360px] xl:h-[400px]";
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
            : "mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-6 sm:py-7 xl:px-8"
        }
      >
        {!isModalView && (
          <div className="mb-3 space-y-2.5 sm:space-y-3">
            <nav className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-500 sm:gap-2 sm:text-xs">
              <Link href="/" className="transition hover:text-slate-800">
                Головна
              </Link>
              <span>/</span>
              <Link href="/katalog" className="transition hover:text-slate-800">
                Каталог
              </Link>
              {groupLandingPath && productGroup && (
                <>
                  <span>/</span>
                  <Link href={groupLandingPath} className="transition hover:text-slate-800">
                    {productGroup}
                  </Link>
                </>
              )}
              <span>/</span>
              <span className="text-slate-700">{product.name}</span>
            </nav>

            <Link
              href="/katalog"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-800 sm:w-auto sm:justify-start sm:py-1.5"
            >
              &larr; Повернутися в каталог
            </Link>
          </div>
        )}

        <article
          className={`overflow-hidden border border-slate-200/80 bg-white/95 shadow-[0_22px_52px_rgba(15,23,42,0.12)] backdrop-blur-sm ${
            isModalView ? "rounded-2xl" : "rounded-[24px] sm:rounded-[26px]"
          }`}
        >
          <header className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-900 px-3 py-4 text-white sm:px-6 sm:py-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.24),transparent_45%),radial-gradient(circle_at_86%_18%,rgba(34,211,238,0.2),transparent_40%)]" />
            <div className="relative grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">
                  Деталі товару
                </p>
                <h1 className="mt-2 max-w-none break-words text-[clamp(1.05rem,6.2vw,2.85rem)] font-black leading-[1.02] tracking-[-0.05em] text-white [overflow-wrap:anywhere] sm:max-w-[30ch] sm:text-[clamp(1.4rem,3.2vw,2.85rem)] sm:leading-[0.98]">
                  {product.name}
                </h1>
                <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-4 sm:gap-2">
                  {product.producer && (
                    <span className="inline-flex max-w-full rounded-full border border-white/15 bg-white/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-200 [overflow-wrap:anywhere] sm:px-3 sm:text-[11px] sm:tracking-[0.1em]">
                      {product.producer}
                    </span>
                  )}
                  {product.article && (
                    <span className="inline-flex max-w-full rounded-full border border-white/15 bg-white/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-200 [overflow-wrap:anywhere] sm:px-3 sm:text-[11px] sm:tracking-[0.1em]">
                      Артикул: {product.article}
                    </span>
                  )}
                  {productSubgroup && (
                    <span className="inline-flex max-w-full rounded-full border border-sky-300/25 bg-sky-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-100 [overflow-wrap:anywhere] sm:px-3 sm:text-[11px] sm:tracking-[0.1em]">
                      {productSubgroup}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 lg:justify-end">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-[0.1em] ${
                    isInStock
                      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                      : "border-amber-300/25 bg-amber-400/10 text-amber-100"
                  }`}
                >
                  {isInStock ? `В наявності ${product.quantity} шт.` : "Під замовлення"}
                </span>
                {product.code && (
                  <span className="inline-flex max-w-full rounded-full border border-white/15 bg-white/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-200 [overflow-wrap:anywhere] sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-[0.1em]">
                    Код: {product.code}
                  </span>
                )}
              </div>
            </div>
          </header>

          <div className={contentGridClass}>
            <section className="space-y-3">
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

              <section className="rounded-[22px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] p-3.5 shadow-[0_16px_32px_rgba(15,23,42,0.05)] sm:rounded-[26px] sm:p-4">
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
            </section>

            <section className="space-y-4">
              <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-3.5 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.04)] sm:rounded-2xl sm:px-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Код</p>
                  <p className="mt-1 text-[15px] font-extrabold text-slate-900 [overflow-wrap:anywhere]">{product.code || "-"}</p>
                </div>
                <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-3.5 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.04)] sm:rounded-2xl sm:px-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Артикул</p>
                  <p className="mt-1 text-[15px] font-extrabold text-slate-900 [overflow-wrap:anywhere]">{product.article || "-"}</p>
                </div>
                <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-3.5 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.04)] sm:rounded-2xl sm:px-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Виробник</p>
                  <p className="mt-1 text-[15px] font-extrabold text-slate-900 [overflow-wrap:anywhere]">{product.producer || "-"}</p>
                </div>
                <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-3.5 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.04)] sm:rounded-2xl sm:px-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Наявність</p>
                  <p className="mt-1 text-[15px] font-extrabold text-slate-900">{formatQuantity(product.quantity)}</p>
                </div>
              </div>

              <section className="rounded-[22px] border border-sky-200/80 bg-[linear-gradient(135deg,rgba(240,249,255,0.98),rgba(236,253,245,0.92))] p-3.5 shadow-[0_18px_36px_rgba(14,165,233,0.1)] sm:rounded-[26px] sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700/90">Ціна</p>
                    <p className={`mt-1 break-words text-[26px] font-black leading-tight tracking-[-0.04em] sm:text-[30px] ${hasPrice ? "text-sky-700" : "text-slate-700"}`}>
                      {formatPriceUah(priceUah)}
                    </p>
                    <p className="mt-2 max-w-[42ch] text-[13px] font-semibold leading-5 text-slate-600 sm:text-sm sm:leading-6">
                      {hasPrice
                        ? "Оформіть замовлення прямо зі сторінки або змініть кількість перед додаванням."
                        : "Ціна уточнюється. Відправте запит менеджеру і ми швидко підготуємо пропозицію."}
                    </p>
                  </div>
                  <div
                    className={`inline-flex rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                      isInStock
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {isInStock ? "В наявності" : "Під замовлення"}
                  </div>
                </div>
                <Link
                  href="/katalog"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-white transition hover:bg-slate-700 sm:w-auto"
                >
                  До каталогу
                </Link>
                <ProductPageActions
                  code={product.code || resolvedCode}
                  article={product.article}
                  name={product.name}
                  producer={product.producer}
                  priceUah={priceUah}
                  quantity={product.quantity}
                />
              </section>

              <section className="rounded-[22px] border border-slate-200 bg-white p-3.5 shadow-[0_14px_28px_rgba(15,23,42,0.05)] sm:rounded-[26px] sm:p-5">
                <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-500">Опис товару</h2>
                <p className={descriptionTextClass}>{descriptionDisplayText}</p>
              </section>

              {!isModalView && (
                <Suspense
                  fallback={
                    <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_14px_28px_rgba(15,23,42,0.05)] sm:p-5">
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </div>
  );
}
