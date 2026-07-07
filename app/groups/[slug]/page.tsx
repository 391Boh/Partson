import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import {
  directoryCompactMetricAccentClass,
  directoryCompactMetricClass,
  directoryHeaderClass,
  directoryHeroClass,
  directoryIconTileClass,
  directoryListCardClass,
  directoryPanelClass,
  directoryPrimaryButtonClass,
  directorySecondaryButtonClass,
} from "app/components/catalog-directory-styles";
import {
  getCatalogSeoFacetsWithTimeout,
} from "app/lib/catalog-seo";
import {
  buildCatalogCategoryPath,
  buildGroupItemPath,
  buildManufacturerPath,
} from "app/lib/catalog-links";
import { getBrandLogoMap, getProducerInitials, resolveProducerLogo } from "app/lib/brand-logo";
import { resolveCatalogSeoFacetsWithFallback } from "app/lib/catalog-count-fallback";
import { getCategoryIconPath } from "app/lib/category-icons";
import { buildSeoGroupLookup, resolveGroupSeoCounts } from "app/lib/group-seo";
import { getAllProductSitemapEntries } from "app/lib/product-sitemap";
import { getProductTreeDataset } from "app/lib/product-tree";
import { buildVisibleProductName } from "app/lib/product-url";
import { getGroupSeoCopy } from "app/lib/seo-copy";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";

export const revalidate = 3600;
export const dynamicParams = true;
const GROUP_STATIC_PARAMS_LIMIT_DEFAULT = Number.MAX_SAFE_INTEGER;
const GROUP_STATIC_PARAMS_FALLBACK_TIMEOUT_MS = 4500;
const GROUP_PAGE_SEO_FACETS_TIMEOUT_MS = 500;
const isProductionBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PRIVATE_BUILD_WORKER === "1" ||
  process.env.npm_lifecycle_event === "build";
interface GroupPageParams {
  slug: string;
}

interface GroupPageProps {
  params: Promise<GroupPageParams>;
}

type GroupPageData = {
  label: string;
  slug: string;
  legacySlug?: string;
  productCount: number;
  subgroupsCount: number;
  subgroups: Array<{
    label: string;
    slug: string;
    productCount: number;
    children: Array<{
      label: string;
      slug: string;
      productCount: number;
    }>;
  }>;
  topProducers: Array<{ label: string; slug: string }>;
};

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const formatCount = (value: number) =>
  Number.isFinite(value) && value > 0 ? value.toLocaleString("uk-UA") : "0";

const getGroupBySlug = cache(async (slug: string): Promise<GroupPageData | null> => {
  const dataset = await getProductTreeDataset().catch(() => null);
  const seoFacets = await resolveCatalogSeoFacetsWithFallback(
    await getCatalogSeoFacetsWithTimeout(GROUP_PAGE_SEO_FACETS_TIMEOUT_MS),
    getAllProductSitemapEntries
  );
  const group = dataset?.groups.find(
    (item) => item.slug === slug || item.legacySlug === slug
  );
  const resolveTopProducers = (resolvedSlug: string, legacySlug?: string) =>
    seoFacets.producers
      .flatMap((producer) => {
        const matchingGroup = producer.topGroups?.find(
          (pg) =>
            pg.slug === resolvedSlug ||
            (legacySlug && pg.slug === legacySlug) ||
            buildPlainSeoSlug(pg.label) === resolvedSlug
        );
        if (!matchingGroup) return [];
        return [{ label: producer.label, slug: producer.slug, _count: matchingGroup.productCount }];
      })
      .sort((a, b) => b._count - a._count)
      .slice(0, 28)
      .map(({ label, slug: producerSlug }) => ({ label, slug: producerSlug }));

  if (!group) {
    const seoGroup = seoFacets.groups.find(
      (item) => item.slug === slug || buildPlainSeoSlug(item.label) === slug
    );
    if (!seoGroup) return null;

    return {
      label: seoGroup.label,
      slug: seoGroup.slug,
      legacySlug: undefined,
      productCount: seoGroup.productCount,
      subgroupsCount: seoGroup.subgroups.length,
      subgroups: seoGroup.subgroups.map((subgroup) => ({
        label: subgroup.label,
        slug: subgroup.slug,
        productCount: subgroup.productCount,
        children: [],
      })),
      topProducers: resolveTopProducers(seoGroup.slug),
    };
  }

  const counts = resolveGroupSeoCounts(group, buildSeoGroupLookup(seoFacets.groups));

  return {
    label: group.label,
    slug: group.slug,
    legacySlug: group.legacySlug,
    productCount: counts.productCount,
    subgroupsCount: counts.subgroupsCount,
    subgroups: group.subgroups.map((subgroup) => ({
      label: subgroup.label,
      slug: subgroup.slug,
      productCount: counts.subgroupProductCounts.get(subgroup.slug) ?? 0,
      children: (Array.isArray(subgroup.children) ? subgroup.children : []).map((child) => ({
        label: child.label,
        slug: child.slug,
        productCount: counts.childProductCounts.get(child.slug) ?? 0,
      })),
    })),
    topProducers: resolveTopProducers(group.slug, group.legacySlug),
  };
});

const buildGroupTitle = (label: string) =>
  `${buildVisibleProductName(label)} — купити у Львові`;

const buildGroupDescription = (
  label: string,
  productCount: number,
  subgroupsCount: number
) => {
  const visibleLabel = buildVisibleProductName(label);
  const productLabel =
    productCount > 0
      ? `${productCount.toLocaleString("uk-UA")} товарних позицій`
      : "товари групи";
  const subgroupLabel =
    subgroupsCount > 0
      ? ` і ${subgroupsCount.toLocaleString("uk-UA")} підгруп каталогу`
      : "";

  return appendSeoContact(
    `${visibleLabel} у PartsON: ${productLabel}${subgroupLabel}. Каталог із цінами, наявністю, підбором за назвою, артикулом і VIN.`
  );
};

const buildGroupHeroDescription = (
  label: string,
  productCount: number,
  subgroupsCount: number,
  hasSubgroups: boolean
) => {
  const visibleLabel = buildVisibleProductName(label);

  if (hasSubgroups) {
    return `У групі ${visibleLabel} зібрано ${productCount.toLocaleString("uk-UA")} товарів і ${subgroupsCount.toLocaleString("uk-UA")} підгруп каталогу. Оберіть напрямок, щоб перейти до запчастин з актуальною ціною, брендами й доставкою по Україні.`;
  }

  if (productCount > 0) {
    return `У групі ${visibleLabel} доступний прямий перехід до каталогу з ${productCount.toLocaleString("uk-UA")} товарними позиціями, підбором за артикулом і перевіркою сумісності.`;
  }

  return `Сторінка групи ${visibleLabel} веде у відповідний розділ каталогу PartsON і допомагає швидко знайти потрібні автозапчастини у Львові з доставкою по Україні.`;
};

const buildGroupHeroDetails = (
  label: string,
  hasSubgroups: boolean
) => {
  const visibleLabel = buildVisibleProductName(label);

  if (hasSubgroups) {
    return `Оберіть підгрупу для точнішого підбору або відкрийте весь каталог групи ${visibleLabel}, щоб порівняти товари, бренди, наявність і аналоги.`;
  }

  return `Цей розділ зібраний як окрема сторінка групи ${visibleLabel}, щоб каталог відкривався напряму за зрозумілим посиланням.`;
};

const buildGroupHeroSupportLabel = (label: string, hasSubgroups: boolean) => {
  const visibleLabel = buildVisibleProductName(label);

  return hasSubgroups
    ? `${visibleLabel}: назви підгруп і кінцевих категорій`
    : `${visibleLabel}: прямий перехід у каталог групи`;
};

const buildSubgroupLead = (options: {
  groupLabel: string;
  subgroupLabel: string;
  productCount: number;
  childCount: number;
}) => {
  const visibleSubgroupLabel = buildVisibleProductName(options.subgroupLabel);
  const visibleGroupLabel = buildVisibleProductName(options.groupLabel);
  const productCountLabel =
    options.productCount > 0
      ? `${options.productCount.toLocaleString("uk-UA")} товарів`
      : "актуальні позиції каталогу";

  if (options.childCount > 0) {
    return `Підгрупа ${visibleSubgroupLabel} у групі ${visibleGroupLabel} об'єднує ${productCountLabel} і ${options.childCount.toLocaleString("uk-UA")} кінцевих категорій для точнішого підбору автозапчастин.`;
  }

  return `Розділ ${visibleSubgroupLabel} веде прямо до каталогу товарів групи ${visibleGroupLabel} і допомагає швидко знайти потрібні автозапчастини за назвою, артикулом або брендом.`;
};

const buildGroupPagePath = (slug: string) => `/groups/${encodeURIComponent(slug)}`;

const dedupeStaticParams = <T extends { slug: string; itemSlug?: string }>(
  params: T[]
) => {
  const seen = new Set<string>();
  return params.filter((entry) => {
    const key = entry.itemSlug ? `${entry.slug}/${entry.itemSlug}` : entry.slug;
    if (!entry.slug || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildStaticSlugCandidates = (
  ...values: Array<string | null | undefined>
) =>
  Array.from(
    new Set(values.map((value) => normalizeValue(value)).filter(Boolean))
  );

export async function generateStaticParams() {
  const limit = isProductionBuildPhase
    ? GROUP_STATIC_PARAMS_LIMIT_DEFAULT
    : parsePositiveInt(
        process.env.SEO_GROUP_STATIC_PARAMS_LIMIT,
        GROUP_STATIC_PARAMS_LIMIT_DEFAULT
      );
  if (limit <= 0) return [];

  const dataset = await getProductTreeDataset().catch(() => null);
  const treeParams =
    dataset?.groups.flatMap((group) =>
      buildStaticSlugCandidates(
        group.slug,
        group.legacySlug,
        buildPlainSeoSlug(group.label)
      ).map((slug) => ({ slug }))
    ) ?? [];

  try {
    const seoFacets = await getCatalogSeoFacetsWithTimeout(
      GROUP_STATIC_PARAMS_FALLBACK_TIMEOUT_MS
    );
    return dedupeStaticParams(
      [
        ...treeParams,
        ...seoFacets.groups.flatMap((group) => [
          { slug: group.slug },
          { slug: buildPlainSeoSlug(group.label) },
        ]),
      ]
    ).slice(0, limit);
  } catch {
    return dedupeStaticParams(treeParams).slice(0, limit);
  }
}

export async function generateMetadata({ params }: GroupPageProps): Promise<Metadata> {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);

  if (!group) {
    return {
      title: "Групу не знайдено",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const description = buildGroupDescription(
    group.label,
    group.productCount,
    group.subgroupsCount
  );
  const canonicalPath = buildGroupPagePath(group.slug);
  const categoryIconPath = getCategoryIconPath(group.label);

  return buildPageMetadata({
    title: buildGroupTitle(group.label),
    description,
    canonicalPath,
    keywords: [
      group.label,
      `${group.label} автозапчастини`,
      `купити ${group.label}`,
      `каталог ${group.label}`,
      `запчастини ${group.label} львів`,
      `${group.label} доставка україна`,
      `підбір ${group.label}`,
      `ціна ${group.label}`,
      "групи автозапчастин",
    ],
    openGraphTitle: `${buildVisibleProductName(group.label)} - купити автозапчастини | PartsON`,
    image: {
      url: categoryIconPath,
      width: 512,
      height: 512,
      alt: `Каталог автозапчастин ${group.label} | PartsON`,
    },
  });
}

export default async function GroupDetailPage({ params }: GroupPageProps) {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  if (!group) notFound();
  if (slug !== group.slug) {
    permanentRedirect(buildGroupPagePath(group.slug));
  }

  const siteUrl = getSiteUrl();
  const pagePath = buildGroupPagePath(group.slug);
  const catalogLink = buildCatalogCategoryPath(group.label, null, {
    expandHierarchy: true,
  });

  const logoMap = group.topProducers.length > 0
    ? await getBrandLogoMap().catch(() => new Map<string, string>())
    : new Map<string, string>();
  const producersWithLogos = group.topProducers.map((producer) => ({
    ...producer,
    logoPath: resolveProducerLogo(producer.label, logoMap) ?? null,
    initials: getProducerInitials(producer.label),
  }));
  const canonicalPageUrl = `${siteUrl}${pagePath}`;
  const categoryIconPath = getCategoryIconPath(group.label);
  const categoryIconUrl = `${siteUrl}${categoryIconPath}`;
  const visibleGroupLabel = buildVisibleProductName(group.label);
  const hasSubgroups = group.subgroups.length > 0;
  const description = buildGroupDescription(
    group.label,
    group.productCount,
    group.subgroupsCount
  );
  const pageTitle = buildGroupTitle(group.label);
  const pageDescription = buildGroupHeroDescription(
    group.label,
    group.productCount,
    group.subgroupsCount,
    hasSubgroups
  );
  const pageDetails = buildGroupHeroDetails(group.label, hasSubgroups);
  const pageBadge = hasSubgroups ? "Група каталогу" : "Окрема група";
  const seoCopy = getGroupSeoCopy(group.label, group.productCount);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${canonicalPageUrl}#collection-page`,
    name: pageTitle,
    url: canonicalPageUrl,
    description,
    image: categoryIconUrl,
    inLanguage: "uk-UA",
    about: {
      "@type": "Thing",
      name: group.label,
    },
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: group.subgroups.slice(0, 120).map((subgroup, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: subgroup.label,
        url: `${siteUrl}${buildGroupItemPath(group.slug, subgroup.slug)}`,
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
        name: "Групи товарів",
        item: `${siteUrl}/groups`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: group.label,
        item: canonicalPageUrl,
      },
    ],
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: pageTitle,
    url: canonicalPageUrl,
    description,
    inLanguage: "uk-UA",
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: categoryIconUrl,
      name: `Іконка категорії ${visibleGroupLabel}`,
    },
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    about: {
      "@type": "Thing",
      name: group.label,
    },
  };

  const offerCatalogJsonLd = {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    name: `Каталог групи ${visibleGroupLabel}`,
    url: canonicalPageUrl,
    itemListElement: group.subgroups.slice(0, 120).map((subgroup, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: subgroup.label,
      url: `${siteUrl}${buildGroupItemPath(group.slug, subgroup.slug)}`,
    })),
  };

  return (
    <main className="page-shell-inline py-6 sm:py-8">
      <nav aria-label="Навігаційні хлібні крихти">
        <ol className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
          <li className="inline-flex items-center gap-2">
            <Link href="/" className="transition hover:text-slate-800">Головна</Link>
          </li>
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true">/</span>
            <Link href="/groups" className="transition hover:text-slate-800">Групи товарів</Link>
          </li>
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true">/</span>
            <span className="text-slate-700">{visibleGroupLabel}</span>
          </li>
        </ol>
      </nav>

      <Link href="/groups" className="mt-3 inline-flex text-sm font-semibold text-teal-800 hover:text-teal-900">
        &larr; Усі групи
      </Link>

      <section className={`mt-4 ${directoryHeroClass}`}>
        <div className="flex items-start gap-4">
          <div className={directoryIconTileClass}>
            <Image
              src={categoryIconPath}
              alt={`Іконка категорії ${visibleGroupLabel}`}
              width={48}
              height={48}
              sizes="48px"
              className="h-12 w-12 object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800">
                {pageBadge}
              </span>
              <span className={directoryCompactMetricClass}>
                {buildGroupHeroSupportLabel(group.label, hasSubgroups)}
              </span>
              <span className={directoryCompactMetricAccentClass}>
                Пошук за назвою, брендом і артикулом
              </span>
            </div>

            <h1 className="font-display-italic mt-4 text-3xl tracking-[-0.048em] text-slate-900 sm:text-[2.2rem]">
              {pageTitle}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-[15px]">
              {pageDescription}
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 sm:text-[15px]">
              {pageDetails}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <CatalogPrefetchLink
                href={catalogLink}
                prefetchCatalogOnViewport
                className={directoryPrimaryButtonClass}
              >
                Перейти в каталог
              </CatalogPrefetchLink>
              <Link
                href="/groups"
                className={directorySecondaryButtonClass}
              >
                Усі групи
              </Link>
            </div>
          </div>
        </div>
      </section>

      {producersWithLogos.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/96 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100/80 px-4 py-3 sm:px-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-teal-700">
                Виробники цієї групи
              </p>
              <h2 className="mt-0.5 text-[15px] font-extrabold tracking-tight text-slate-900">
                Бренди {visibleGroupLabel}
              </h2>
            </div>
            <span className={directoryCompactMetricAccentClass}>
              {producersWithLogos.length} виробників
            </span>
          </div>
          <div className="flex flex-wrap gap-2 p-4 sm:p-5">
            {producersWithLogos.map((producer) => (
              <Link
                key={producer.slug}
                href={buildManufacturerPath(producer.slug)}
                className="group/brand inline-flex items-center gap-2 rounded-[14px] border border-slate-200/80 bg-white px-3 py-2 shadow-[0_2px_8px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-[2px] hover:border-teal-300/80 hover:bg-gradient-to-b hover:from-teal-50/60 hover:to-white hover:shadow-[0_6px_18px_rgba(13,148,136,0.14)]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white shadow-sm">
                  {producer.logoPath ? (
                    <Image
                      src={producer.logoPath}
                      alt=""
                      aria-hidden
                      width={32}
                      height={32}
                      sizes="32px"
                      className="h-5 w-auto max-w-[26px] object-contain"
                      style={{ imageRendering: "auto" }}
                      unoptimized={producer.logoPath.endsWith(".svg")}
                    />
                  ) : (
                    <span className="text-[9px] font-black leading-none text-slate-500">
                      {producer.initials}
                    </span>
                  )}
                </span>
                <span className="text-[12px] font-semibold text-slate-700 transition-colors duration-200 group-hover/brand:text-teal-700">
                  {producer.label}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={`${directoryPanelClass} mt-6`}>
        <div className={directoryHeaderClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800">
                Опис групи
              </p>
              <h2 className="font-display mt-1 text-xl font-[780] tracking-normal text-slate-950 sm:text-2xl">
                {visibleGroupLabel} в каталозі автозапчастин PartsON
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {seoCopy.intro}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className={directoryCompactMetricClass}>
                Опис, назви і структура групи
              </span>
              <span className={directoryCompactMetricAccentClass}>
                Навігація до каталогу
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.95fr)]">
          <div className="space-y-3 text-sm leading-6 text-slate-600">
            {seoCopy.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <aside className="rounded-lg border border-teal-100/80 bg-[linear-gradient(165deg,rgba(240,253,250,0.94),rgba(239,246,255,0.92),rgba(255,255,255,0.98))] p-4 shadow-[0_16px_34px_rgba(13,148,136,0.08)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800">
              Що входить у групу
            </p>
            <ul className="mt-3 space-y-2.5 text-sm leading-6 text-slate-700">
              {seoCopy.highlights.map((highlight) => (
                <li
                  key={highlight}
                  className="flex items-start gap-2 border-b border-white/70 pb-2 last:border-b-0 last:pb-0"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      {group.subgroups.length > 0 && (
        <section className="mt-6 space-y-3">
          {group.subgroups.map((subgroup) =>
            subgroup.children.length > 0 ? (
              <div key={subgroup.slug} className={directoryPanelClass}>
                <div className={`${directoryHeaderClass} flex items-center justify-between gap-3`}>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-800">
                      Підгрупа
                    </p>
                    <h3 className="mt-1 text-base font-extrabold leading-snug tracking-normal text-slate-950">
                      {buildVisibleProductName(subgroup.label)}
                    </h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      {buildSubgroupLead({
                        groupLabel: group.label,
                        subgroupLabel: subgroup.label,
                        productCount: subgroup.productCount,
                        childCount: subgroup.children.length,
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {subgroup.productCount > 0 ? (
                      <span className={directoryCompactMetricClass}>
                        <span>{formatCount(subgroup.productCount)}</span>
                        <span className="font-semibold text-slate-500">товарів</span>
                      </span>
                    ) : null}
                    <span className={directoryCompactMetricAccentClass}>
                      {formatCount(subgroup.children.length)} категорій
                    </span>
                  </div>
                </div>
                <ul className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-2 sm:p-4">
                  {subgroup.children.map((child) => (
                    <li key={child.slug}>
                      <CatalogPrefetchLink
                        href={buildGroupItemPath(group.slug, child.slug)}
                        className={`${directoryListCardClass} flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-slate-700`}
                      >
                        <span className="min-w-0 font-semibold leading-snug">
                          {buildVisibleProductName(child.label)}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {child.productCount > 0 ? (
                            <span className={directoryCompactMetricClass}>
                              <span>{formatCount(child.productCount)}</span>
                              <span className="font-semibold text-slate-500">товарів</span>
                            </span>
                          ) : null}
                          <span className="text-teal-700">&rarr;</span>
                        </span>
                      </CatalogPrefetchLink>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div key={subgroup.slug} className={directoryListCardClass}>
                <CatalogPrefetchLink
                  href={buildGroupItemPath(group.slug, subgroup.slug)}
                  className="flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm text-slate-700"
                >
                  <div className="min-w-0">
                    <span className="block font-semibold leading-snug">
                      {buildVisibleProductName(subgroup.label)}
                    </span>
                    <span className="mt-1 block text-[13px] leading-5 text-slate-500">
                      {buildSubgroupLead({
                        groupLabel: group.label,
                        subgroupLabel: subgroup.label,
                        productCount: subgroup.productCount,
                        childCount: subgroup.children.length,
                      })}
                    </span>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {subgroup.productCount > 0 ? (
                      <span className={directoryCompactMetricClass}>
                        <span>{formatCount(subgroup.productCount)}</span>
                        <span className="font-semibold text-slate-500">товарів</span>
                      </span>
                    ) : null}
                    <span className="text-teal-700">&rarr;</span>
                  </span>
                </CatalogPrefetchLink>
              </div>
            )
          )}
        </section>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(webPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(offerCatalogJsonLd) }}
      />
    </main>
  );
}
