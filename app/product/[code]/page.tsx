import { cache, type CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import {
  fetchEuroRate,
  fetchPriceEuro,
  fetchProductDescription,
  findCatalogProductByCode,
  toPriceUah,
} from "app/lib/catalog-server";
import { getProductImagePath } from "app/lib/product-image";
import { getSiteUrl } from "app/lib/site-url";

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
  if (!Number.isFinite(quantity) || quantity <= 0) return "РџС–Рґ Р·Р°РјРѕРІР»РµРЅРЅСЏ";
  return `${quantity} С€С‚.`;
};

const formatPriceUah = (priceUah: number | null) => {
  if (priceUah == null) return "Р—Р° Р·Р°РїРёС‚РѕРј";
  return `${priceUah.toLocaleString("uk-UA")} РіСЂРЅ`;
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
  imageUrl: string;
}) => {
  const { name, description, code, article, producer, quantity, priceUah, canonicalUrl, imageUrl } = options;

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
    image: [imageUrl],
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
}) => {
  const { siteUrl, canonicalUrl, name } = options;

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Catalog",
        item: `${siteUrl}/katalog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name,
        item: canonicalUrl,
      },
    ],
  };
};

const getFirstResolvedValue = async <T,>(
  keys: string[],
  reader: (key: string) => Promise<T | null>
) => {
  for (const key of keys) {
    const value = await reader(key);
    if (value != null) return value;
  }
  return null;
};

const getCatalogProduct = cache(async (code: string) => findCatalogProductByCode(code));

const buildProductMetaDescription = (options: {
  name: string;
  article: string;
  producer: string;
  quantity: number;
}) => {
  const { name, article, producer, quantity } = options;
  const details = [
    article ? `Р°СЂС‚РёРєСѓР» ${article}` : null,
    producer ? `РІРёСЂРѕР±РЅРёРє ${producer}` : null,
    quantity > 0 ? `РІ РЅР°СЏРІРЅРѕСЃС‚С– ${quantity} С€С‚.` : "РїС–Рґ Р·Р°РјРѕРІР»РµРЅРЅСЏ",
  ]
    .filter(Boolean)
    .join(", ");

  return `РљСѓРїРёС‚Рё ${name}. ${details}. РљР°С‚Р°Р»РѕРі Р°РІС‚РѕР·Р°РїС‡Р°СЃС‚РёРЅ PartsON.`;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { code: rawCode } = await params;
  const resolvedCode = decodeURIComponent(rawCode || "").trim();
  if (!resolvedCode) {
    return {
      title: "РўРѕРІР°СЂ РЅРµ Р·РЅР°Р№РґРµРЅРѕ",
      robots: { index: false, follow: false },
    };
  }

  const product = await getCatalogProduct(resolvedCode);
  if (!product) {
    return {
      title: "РўРѕРІР°СЂ РЅРµ Р·РЅР°Р№РґРµРЅРѕ",
      robots: { index: false, follow: false },
    };
  }

  const canonicalCode = encodeURIComponent(product.code || resolvedCode);
  const canonicalPath = `/product/${canonicalCode}`;
  const productImagePath = getProductImagePath(product.code || resolvedCode);
  const description = buildProductMetaDescription({
    name: product.name,
    article: product.article,
    producer: product.producer,
    quantity: product.quantity,
  });
  const keywords = Array.from(new Set([
    product.name,
    product.code,
    product.article,
    product.producer,
    "auto parts",
    "parts catalog",
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
      images: [
        { url: productImagePath, alt: `Р¤РѕС‚Рѕ С‚РѕРІР°СЂСѓ ${product.name}` },
        { url: "/Car-parts-fullwidth.png", alt: "PartsON - Р°РІС‚РѕР·Р°РїС‡Р°СЃС‚РёРЅРё" },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      images: [productImagePath],
    },
    robots: {
      index: true,
      follow: true,
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

  const lookupKeys = Array.from(
    new Set([product.article.trim(), product.code.trim(), resolvedCode].filter(Boolean))
  );

  const euroRatePromise = fetchEuroRate();
  const [priceEuro, descriptionFromApi, euroRate] = await Promise.all([
    getFirstResolvedValue(lookupKeys, fetchPriceEuro),
    getFirstResolvedValue(lookupKeys, fetchProductDescription),
    euroRatePromise,
  ]);

  const priceUah = toPriceUah(priceEuro, euroRate);
  const hasPrice = priceUah != null;
  const description =
    (descriptionFromApi || "").trim() ||
    "РћРїРёСЃ С‚РёРјС‡Р°СЃРѕРІРѕ РІС–РґСЃСѓС‚РЅС–Р№. РќР°РґС–С€Р»С–С‚СЊ Р·Р°РїРёС‚ Сѓ С‡Р°С‚, С– РјРµРЅРµРґР¶РµСЂ РїС–РґР±РµСЂРµ С‚РѕРІР°СЂ С‚Р° СѓС‚РѕС‡РЅРёС‚СЊ С…Р°СЂР°РєС‚РµСЂРёСЃС‚РёРєРё.";

  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const canonicalCode = encodeURIComponent(product.code || resolvedCode);
  const canonicalUrl = `${siteUrl}/product/${canonicalCode}`;
  const productImagePath = getProductImagePath(product.code || resolvedCode);
  const productImageUrl = `${siteUrl}${productImagePath}`;
  const jsonLd = buildProductJsonLd({
    name: product.name,
    description,
    code: product.code,
    article: product.article,
    producer: product.producer,
    quantity: product.quantity,
    priceUah,
    canonicalUrl,
    imageUrl: productImageUrl,
  });
  const breadcrumbJsonLd = buildProductBreadcrumbJsonLd({
    siteUrl,
    canonicalUrl,
    name: product.name,
  });

  return (
    <div
      className={isModalView ? "min-h-screen bg-white text-slate-900" : "min-h-screen text-slate-900"}
      style={isModalView ? undefined : pageBackground}
    >
      <div className={isModalView ? "mx-auto w-full max-w-[980px] px-4 py-4" : "mx-auto w-full max-w-[1060px] px-4 py-10"}>
        {!isModalView && (
          <Link
            href="/katalog"
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-800"
          >
            в†ђ РџРѕРІРµСЂРЅСѓС‚РёСЃСЏ РІ РєР°С‚Р°Р»РѕРі
          </Link>
        )}

        <article className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.12)] backdrop-blur-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 py-6 text-white sm:px-8">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-300">РљР°СЂС‚РєР° С‚РѕРІР°СЂСѓ</p>
            <h1 className="mt-2 text-xl font-semibold leading-tight sm:text-2xl">{product.name}</h1>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_290px]">
            <section className="space-y-5">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
                <img
                  src={productImagePath}
                  alt={`Р¤РѕС‚Рѕ С‚РѕРІР°СЂСѓ ${product.name}`}
                  width={640}
                  height={640}
                  loading="eager"
                  decoding="async"
                  className="mx-auto h-[300px] w-full rounded-xl bg-slate-50 object-contain sm:h-[340px]"
                />
              </div>

              <div className="grid gap-2.5 text-sm sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">РљРѕРґ</p>
                  <p className="mt-1 font-semibold text-slate-800">{product.code || "-"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">РђСЂС‚РёРєСѓР»</p>
                  <p className="mt-1 font-semibold text-slate-800">{product.article || "-"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Р’РёСЂРѕР±РЅРёРє</p>
                  <p className="mt-1 font-semibold text-slate-800">{product.producer || "-"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">РќР°СЏРІРЅС–СЃС‚СЊ</p>
                  <p className="mt-1 font-semibold text-slate-800">{formatQuantity(product.quantity)}</p>
                </div>
              </div>

              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">РћРїРёСЃ</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{description}</p>
              </section>
            </section>

            <aside className="h-fit rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-sky-700">Р¦С–РЅР°</p>
              <p className={`mt-2 text-2xl font-bold ${hasPrice ? "text-sky-700" : "text-slate-600"}`}>
                {formatPriceUah(priceUah)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {hasPrice
                  ? "РћСЃС‚Р°С‚РѕС‡РЅР° РІР°СЂС‚С–СЃС‚СЊ РјРѕР¶Рµ Р·РјС–РЅСЋРІР°С‚РёСЃСЊ Р·Р°Р»РµР¶РЅРѕ РІС–Рґ РїРѕСЃС‚Р°С‡Р°Р»СЊРЅРёРєР°."
                  : "Р”Р»СЏ С†СЊРѕРіРѕ С‚РѕРІР°СЂСѓ С†С–РЅР° РґРѕСЃС‚СѓРїРЅР° Р·Р° Р·Р°РїРёС‚РѕРј Сѓ С‡Р°С‚С–."}
              </p>

              <a
                href="/katalog"
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Р”Рѕ РєР°С‚Р°Р»РѕРіСѓ
              </a>
            </aside>
          </div>
        </article>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </div>
  );
}








