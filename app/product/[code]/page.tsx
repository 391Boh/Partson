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
}) => {
  const { name, description, code, article, producer, quantity, priceUah, canonicalUrl } = options;

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
          url: canonicalUrl,
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    sku: article || undefined,
    mpn: code || undefined,
    brand: producer ? { "@type": "Brand", name: producer } : undefined,
    offers,
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
    article ? `артикул ${article}` : null,
    producer ? `виробник ${producer}` : null,
    quantity > 0 ? `в наявності ${quantity} шт.` : "під замовлення",
  ]
    .filter(Boolean)
    .join(", ");

  return `Купити ${name}. ${details}. Каталог автозапчастин PartsON.`;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { code: rawCode } = await params;
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
  const description = buildProductMetaDescription({
    name: product.name,
    article: product.article,
    producer: product.producer,
    quantity: product.quantity,
  });

  return {
    title: product.name,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "website",
      url: canonicalPath,
      title: product.name,
      description,
      images: [{ url: "/Car-parts-fullwidth.png" }],
    },
    robots: {
      index: true,
      follow: true,
    },
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
    "Опис тимчасово відсутній. Надішліть запит у чат, і менеджер підбере товар та уточнить характеристики.";

  const requestHeaders = await headers();
  const siteUrl = getSiteUrl({ headers: requestHeaders });
  const canonicalCode = encodeURIComponent(product.code || resolvedCode);
  const canonicalUrl = `${siteUrl}/product/${canonicalCode}`;
  const jsonLd = buildProductJsonLd({
    name: product.name,
    description,
    code: product.code,
    article: product.article,
    producer: product.producer,
    quantity: product.quantity,
    priceUah,
    canonicalUrl,
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
            ← Повернутися в каталог
          </Link>
        )}

        <article className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.12)] backdrop-blur-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 py-6 text-white sm:px-8">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Картка товару</p>
            <h1 className="mt-2 text-xl font-semibold leading-tight sm:text-2xl">{product.name}</h1>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_290px]">
            <section className="space-y-5">
              <div className="grid gap-2.5 text-sm sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Код</p>
                  <p className="mt-1 font-semibold text-slate-800">{product.code || "-"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Артикул</p>
                  <p className="mt-1 font-semibold text-slate-800">{product.article || "-"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Виробник</p>
                  <p className="mt-1 font-semibold text-slate-800">{product.producer || "-"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Наявність</p>
                  <p className="mt-1 font-semibold text-slate-800">{formatQuantity(product.quantity)}</p>
                </div>
              </div>

              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Опис</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{description}</p>
              </section>
            </section>

            <aside className="h-fit rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-sky-700">Ціна</p>
              <p className={`mt-2 text-2xl font-bold ${hasPrice ? "text-sky-700" : "text-slate-600"}`}>
                {formatPriceUah(priceUah)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {hasPrice
                  ? "Остаточна вартість може змінюватись залежно від постачальника."
                  : "Для цього товару ціна доступна за запитом у чаті."}
              </p>

              <a
                href="/katalog"
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                До каталогу
              </a>
            </aside>
          </div>
        </article>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}
