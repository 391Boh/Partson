import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import { brands } from "app/components/brandsData";
import {
  buildCatalogProducerPath,
  buildManufacturerPath,
} from "app/lib/catalog-links";
import {
  getBrandLogoMap,
  getProducerInitials,
  resolveProducerLogo,
} from "app/lib/brand-logo";
import {
  findSeoProducerBySlug,
} from "app/lib/catalog-seo";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { buildSeoSlug } from "app/lib/seo-slug";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 21600;
export const dynamicParams = true;
const MANUFACTURER_STATIC_PARAMS_LIMIT_DEFAULT = 96;
const MANUFACTURER_FACET_LOOKUP_TIMEOUT_MS = 900;

interface ManufacturerPageParams {
  slug: string;
}

interface ManufacturerPageProps {
  params: Promise<ManufacturerPageParams>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

type ManufacturerPageData = {
  label: string;
  slug: string;
  description: string;
  logoPath: string | null;
  initials: string;
  productCount: number;
  topGroups: Array<{
    label: string;
    slug: string;
    productCount: number;
  }>;
};

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const decodeSafe = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const pickFirstSearchParamValue = (
  value: string | string[] | undefined
) => (Array.isArray(value) ? value[0] || "" : value || "");

const buildProducerFallbackLabelFromSlug = (slug: string) =>
  normalizeValue(decodeSafe(slug).replace(/-/g, " "));

const buildManufacturerTitle = (label: string) =>
  `${normalizeValue(label)} - виробник автозапчастин`;

const buildManufacturerDescription = (
  label: string,
  productCount: number,
  topGroupCount: number
) => {
  const normalizedLabel = normalizeValue(label);
  const productCountLabel =
    productCount > 0
      ? `${productCount.toLocaleString("uk-UA")} товарних позицій`
      : "товари виробника";
  const groupLabel =
    topGroupCount > 0
      ? ` і добірка популярних груп (${topGroupCount.toLocaleString("uk-UA")})`
      : "";

  return `Каталог бренду ${normalizedLabel} у PartsON: ${productCountLabel}${groupLabel}. Швидкий перехід у фільтрований каталог виробника з доставкою по Україні.`;
};

const findBrandMeta = (label: string) => {
  const normalizedLabel = normalizeValue(label);
  const labelSlug = buildSeoSlug(normalizedLabel);

  return (
    brands.find(
      (brand) =>
        normalizeValue(brand.name).toLowerCase() === normalizedLabel.toLowerCase() ||
        buildSeoSlug(brand.name) === labelSlug
    ) || null
  );
};

const getManufacturerBySlug = cache(
  async (slug: string): Promise<ManufacturerPageData | null> => {
    const fallbackBrand =
      brands.find((brand) => buildSeoSlug(brand.name) === slug) || null;
    const producer = fallbackBrand
      ? null
      : await resolveWithTimeout(
          () => findSeoProducerBySlug(slug),
          null,
          MANUFACTURER_FACET_LOOKUP_TIMEOUT_MS
        );
    if (!producer && !fallbackBrand) return null;

    const label = producer?.label || fallbackBrand?.name || "";
    const canonicalSlug =
      producer?.slug || (fallbackBrand ? buildSeoSlug(fallbackBrand.name) : "");
    if (!label || !canonicalSlug) return null;

    const brandMeta = findBrandMeta(label);
    const logoMap = await getBrandLogoMap().catch(() => new Map<string, string>());
    const logoPath =
      resolveProducerLogo(label, logoMap) ||
      brandMeta?.logo ||
      fallbackBrand?.logo ||
      null;
    const description =
      brandMeta?.description ||
      fallbackBrand?.description ||
      `Сторінка бренду ${label} з переходом у каталог PartsON, добіркою популярних груп і швидким доступом до товарів виробника.`;

    return {
      label,
      slug: canonicalSlug,
      description,
      logoPath,
      initials: getProducerInitials(label),
      productCount: producer?.productCount ?? 0,
      topGroups: producer?.topGroups ?? [],
    };
  }
);

export async function generateStaticParams() {
  const fromBrands = brands.map((brand) => ({ slug: buildSeoSlug(brand.name) }));
  const limit = parsePositiveInt(
    process.env.SEO_MANUFACTURER_STATIC_PARAMS_LIMIT,
    MANUFACTURER_STATIC_PARAMS_LIMIT_DEFAULT
  );
  const seen = new Set<string>();

  return fromBrands
    .filter((entry) => {
      const normalizedSlug = (entry.slug || "").trim();
      if (!normalizedSlug || seen.has(normalizedSlug)) return false;
      seen.add(normalizedSlug);
      return true;
    })
    .slice(0, limit);
}

export async function generateMetadata({
  params,
}: ManufacturerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const producer = await getManufacturerBySlug(slug);

  if (!producer) {
    return {
      title: "Виробника не знайдено",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = buildManufacturerTitle(producer.label);
  const description = buildManufacturerDescription(
    producer.label,
    producer.productCount,
    producer.topGroups.length
  );

  return buildPageMetadata({
    title,
    description,
    canonicalPath: buildManufacturerPath(producer.slug),
    keywords: [
      producer.label,
      `${producer.label} автозапчастини`,
      `каталог ${producer.label}`,
      `купити ${producer.label}`,
      "автозапчастини львів",
      "магазин запчастин",
      "виробники автозапчастин",
    ],
    openGraphTitle: `${title} | PartsON`,
    image: {
      url: producer.logoPath || "/Car-parts-fullwidth.png",
      alt: `${producer.label} | PartsON`,
    },
  });
}

export default async function ManufacturerDetailPage({
  params,
  searchParams,
}: ManufacturerPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await (
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  );
  const producer = await getManufacturerBySlug(slug);

  if (!producer) {
    const producerHint = normalizeValue(
      pickFirstSearchParamValue(resolvedSearchParams.producer)
    );
    const fallbackProducer =
      producerHint || buildProducerFallbackLabelFromSlug(slug);

    permanentRedirect(buildCatalogProducerPath(fallbackProducer));
  }
  if (slug !== producer.slug) {
    permanentRedirect(buildManufacturerPath(producer.slug));
  }

  const siteUrl = getSiteUrl();
  const pagePath = buildManufacturerPath(producer.slug);
  const catalogPath = buildCatalogProducerPath(producer.label);
  const canonicalPageUrl = `${siteUrl}${pagePath}`;
  const pageTitle = buildManufacturerTitle(producer.label);
  const pageDescription = buildManufacturerDescription(
    producer.label,
    producer.productCount,
    producer.topGroups.length
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: pageTitle,
    url: canonicalPageUrl,
    description: pageDescription,
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    about: {
      "@type": "Brand",
      name: producer.label,
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: producer.topGroups.slice(0, 24).map((group, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: group.label,
        url: `${siteUrl}${buildCatalogProducerPath(producer.label, group.label)}`,
      })),
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Головна",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Виробники",
        item: `${siteUrl}/manufacturers`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: producer.label,
        item: canonicalPageUrl,
      },
    ],
  };

  return (
    <main className="page-shell-inline py-8">
      <nav className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
        <Link href="/" className="transition hover:text-slate-800">
          Головна
        </Link>
        <span>/</span>
        <Link href="/manufacturers" className="transition hover:text-slate-800">
          Виробники
        </Link>
        <span>/</span>
        <span className="text-slate-700">{producer.label}</span>
      </nav>

      <Link
        href="/manufacturers"
        className="mt-3 inline-flex text-sm font-medium text-sky-700 hover:text-sky-900"
      >
        &larr; Усі виробники
      </Link>

      <section className="mt-4 overflow-hidden rounded-[28px] border border-slate-200/90 bg-[radial-gradient(circle_at_top_left,rgba(186,230,253,0.22),transparent_34%),linear-gradient(160deg,#ffffff_0%,#f8fbff_55%,#eef6ff_100%)] p-5 shadow-[0_20px_44px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-800">
            Сторінка бренду
          </span>
          <span className="inline-flex rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600">
            {producer.productCount.toLocaleString("uk-UA")} товарів
          </span>
          {producer.topGroups.length > 0 ? (
            <span className="inline-flex rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600">
              {producer.topGroups.length.toLocaleString("uk-UA")} популярних груп
            </span>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="inline-flex h-[86px] w-[86px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-sky-100 bg-white shadow-[0_12px_28px_rgba(14,165,233,0.1)]">
              {producer.logoPath ? (
                <Image
                  src={producer.logoPath}
                  alt={producer.label}
                  width={68}
                  height={68}
                  className="h-14 w-14 object-contain"
                  unoptimized
                />
              ) : (
                <span className="text-xl font-[760] italic text-slate-700">
                  {producer.initials}
                </span>
              )}
            </div>

            <div className="min-w-0">
              <h1 className="font-display-italic text-3xl tracking-[-0.048em] text-slate-900 sm:text-[2.2rem]">
                {pageTitle}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-[15px]">
                {producer.description}
              </p>
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
            <CatalogPrefetchLink
              href={catalogPath}
              prefetchCatalogOnViewport
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Перейти в каталог бренду
            </CatalogPrefetchLink>
            <Link
              href="/manufacturers"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
            >
              Усі виробники
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700/90">
            Популярні напрямки
          </p>
          <h2 className="font-display-italic mt-1 text-[1.08rem] font-black tracking-[-0.04em] text-slate-900 sm:text-[1.22rem]">
            Каталог {producer.label} за групами
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Відкрийте найпопулярніші розділи бренду або переходьте в загальний каталог виробника з готовим фільтром.
          </p>
        </div>

        {producer.topGroups.length > 0 ? (
          <div className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-2 xl:grid-cols-3">
            {producer.topGroups.map((group) => (
              <CatalogPrefetchLink
                key={group.slug}
                href={buildCatalogProducerPath(producer.label, group.label)}
                prefetchCatalogOnViewport
                className="flex items-center justify-between rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
              >
                <span className="font-medium">{normalizeValue(group.label)}</span>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                  {group.productCount.toLocaleString("uk-UA")}
                </span>
              </CatalogPrefetchLink>
            ))}
          </div>
        ) : (
          <div className="px-4 py-5 sm:px-5">
            <CatalogPrefetchLink
              href={catalogPath}
              prefetchCatalogOnViewport
              className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
            >
              Переглянути всі товари бренду
            </CatalogPrefetchLink>
          </div>
        )}
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </main>
  );
}
