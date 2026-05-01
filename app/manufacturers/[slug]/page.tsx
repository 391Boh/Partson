import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import { brands } from "app/components/brandsData";
import {
  catalogPageBackgroundClass,
  directoryBadgeClass,
  directoryCompactMetricAccentClass,
  directoryCompactMetricClass,
  directoryDescriptionClass,
  directoryHeaderClass,
  directoryHeroClass,
  directoryIconTileClass,
  directoryListCardClass,
  directoryPanelClass,
  directoryPrimaryButtonClass,
  directorySecondaryButtonClass,
  directoryTitleClass,
} from "app/components/catalog-directory-styles";
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
import { fetchCatalogProductsByQuery } from "app/lib/catalog-server";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { getProducerSeoCopy } from "app/lib/seo-copy";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { buildSeoSlug } from "app/lib/seo-slug";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 21600;
export const dynamicParams = true;
const MANUFACTURER_STATIC_PARAMS_LIMIT_DEFAULT = 0;
const MANUFACTURER_SEO_LOOKUP_TIMEOUT_MS = 1800;
const MANUFACTURER_FALLBACK_COUNT_LIMIT = 120;
const MANUFACTURER_FALLBACK_STATS_TIMEOUT_MS = 2400;
const MANUFACTURER_FALLBACK_MAX_PAGES_DEFAULT = 40;
const MANUFACTURER_FALLBACK_MAX_ITEMS_DEFAULT = 4800;
const isProductionBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PRIVATE_BUILD_WORKER === "1" ||
  process.env.npm_lifecycle_event === "build";

interface ManufacturerPageParams {
  slug: string;
}

interface ManufacturerPageProps {
  params: Promise<ManufacturerPageParams>;
}

type ManufacturerPageData = {
  label: string;
  slug: string;
  description: string;
  logoPath: string | null;
  initials: string;
  productCount: number;
  groupsCount: number;
  categoriesCount: number;
  topGroups: Array<{
    label: string;       // human-friendly display label (swap-corrected when applicable)
    filterValue: string; // raw 1C Группа value used in ?group= URL param
    slug: string;
    productCount: number;
    subgroups: Array<{
      label: string;
      slug: string;
      productCount: number;
    }>;
  }>;
};

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const parseOptionalPositiveInt = (value: string | undefined) => {
  if (value == null || value.trim() === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
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

const buildProducerFallbackLabelFromSlug = (slug: string) =>
  normalizeValue(decodeSafe(slug).replace(/-/g, " "));

const buildManufacturerTitle = (label: string) =>
  `${normalizeValue(label)} - купити автозапчастини`;

const buildManufacturerDescription = (
  label: string,
  productCount: number,
  groupsCount: number
) => {
  const normalizedLabel = normalizeValue(label);
  const productCountLabel =
    productCount > 0
      ? `${productCount.toLocaleString("uk-UA")} товарних позицій`
      : "товари виробника";
  const groupLabel =
    groupsCount > 0
      ? ` і добірка популярних груп (${groupsCount.toLocaleString("uk-UA")})`
      : "";

  return `Купити автозапчастини ${normalizedLabel} у PartsON: ${productCountLabel}${groupLabel}. Підбір за артикулом, групою і VIN, самовивіз у Львові та доставка по Україні.`;
};

const buildManufacturerKeywords = (label: string) => {
  const normalizedLabel = normalizeValue(label);
  return Array.from(
    new Set(
      [
        normalizedLabel,
        `${normalizedLabel} автозапчастини`,
        `${normalizedLabel} запчастини`,
        `каталог ${normalizedLabel}`,
        `${normalizedLabel} каталог автозапчастин`,
        `купити ${normalizedLabel}`,
        `купити запчастини ${normalizedLabel}`,
        `${normalizedLabel} виробник`,
        `${normalizedLabel} львів`,
        `${normalizedLabel} доставка україна`,
        `${normalizedLabel} ціна`,
        `оригінальні запчастини ${normalizedLabel}`,
        `аналоги ${normalizedLabel}`,
        `бренд ${normalizedLabel}`,
        "виробники автозапчастин",
        "бренди автозапчастин",
        "магазин запчастин",
        "автозапчастини львів",
      ].filter(Boolean)
    )
  );
};

const buildProductDedupeKey = (item: {
  code?: string;
  article?: string;
  name?: string;
  producer?: string;
}) => {
  const code = normalizeValue(item.code).toLowerCase();
  const article = normalizeValue(item.article).toLowerCase();
  const producer = normalizeValue(item.producer).toLowerCase();
  const name = normalizeValue(item.name).toLowerCase();

  if (code) return producer ? `code:${code}|producer:${producer}` : `code:${code}`;
  if (article) return producer ? `article:${article}|producer:${producer}` : `article:${article}`;
  if (name) return producer ? `name:${name}|producer:${producer}` : `name:${name}`;
  return "";
};


const collectProducerFallbackStats = cache(async (producerLabel: string) => {
  const normalizedProducerLabel = normalizeValue(producerLabel);
  if (!normalizedProducerLabel) {
    return {
      productCount: 0,
      groupsCount: 0,
      categoriesCount: 0,
      topGroups: [] as Array<{
        label: string;
        filterValue: string;
        slug: string;
        productCount: number;
        subgroups: Array<{ label: string; slug: string; productCount: number }>;
      }>,
    };
  }

  let cursor = "";
  let cursorField = "";
  let totalSeen = 0;
  const maxPages =
    parseOptionalPositiveInt(process.env.SEO_MANUFACTURER_FALLBACK_MAX_PAGES) ??
    MANUFACTURER_FALLBACK_MAX_PAGES_DEFAULT;
  const maxItems =
    parseOptionalPositiveInt(process.env.SEO_MANUFACTURER_FALLBACK_MAX_ITEMS) ??
    MANUFACTURER_FALLBACK_MAX_ITEMS_DEFAULT;
  const seenProducts = new Set<string>();
  const groupCounts = new Map<
    string,
    {
      label: string;
      productCount: number;
      subgroups: Map<string, { label: string; productCount: number }>;
    }
  >();

  for (let page = 1; ; page += 1) {
    if (maxPages != null && page > maxPages) break;

    const batch = await fetchCatalogProductsByQuery({
      page: cursor ? 1 : page,
      limit: MANUFACTURER_FALLBACK_COUNT_LIMIT,
      producer: normalizedProducerLabel,
      sortOrder: "none",
      cursor: cursor || undefined,
      cursorField: cursorField || undefined,
      forceAllgoodsSource: true,
      timeoutMs: 900,
      retries: 0,
      retryDelayMs: 100,
      cacheTtlMs: 1000 * 60 * 20,
    }).catch(() => ({
      items: [],
      hasMore: false,
      nextCursor: "",
      cursorField: "",
    }));

    if (batch.items.length === 0) break;

    for (const item of batch.items) {
      const dedupeKey = buildProductDedupeKey(item);
      if (!dedupeKey || seenProducts.has(dedupeKey)) continue;

      seenProducts.add(dedupeKey);
      // Use the original item.group (Группа field from 1C) rather than the
      // swap-corrected result of resolveFacetGroupAndSubgroup.  The group label
      // is passed directly into ?group=X URL params; the catalog filters 1C by
      // Группа=X, so the label must match the actual Группа field stored in 1C.
      // The swap-corrected label (taken from Категорія) causes Группа filter
      // mismatches → empty catalog results on manufacturer group links.
      const groupLabel = normalizeValue(item.group) || normalizeValue(item.category);
      const subgroupLabel = normalizeValue(item.subGroup);
      if (!groupLabel) continue;

      const groupSlug = buildSeoSlug(groupLabel);
      if (!groupSlug) continue;

      const existing = groupCounts.get(groupSlug);
      if (!existing) {
        groupCounts.set(groupSlug, {
          label: groupLabel,
          productCount: 1,
          subgroups: new Map(),
        });
      } else {
        existing.productCount += 1;
      }

      if (!subgroupLabel) continue;

      const subgroupSlug = buildSeoSlug(subgroupLabel);
      if (!subgroupSlug) continue;

      const groupEntry = groupCounts.get(groupSlug);
      if (!groupEntry) continue;

      const subgroupEntry = groupEntry.subgroups.get(subgroupSlug);
      if (!subgroupEntry) {
        groupEntry.subgroups.set(subgroupSlug, {
          label: subgroupLabel,
          productCount: 1,
        });
      } else {
        subgroupEntry.productCount += 1;
      }
    }

    totalSeen += batch.items.length;
    if (maxItems != null && totalSeen >= maxItems) break;

    const nextCursor = normalizeValue(batch.nextCursor);
    if (!batch.hasMore || !nextCursor || nextCursor === cursor) break;

    cursor = nextCursor;
    cursorField = normalizeValue(batch.cursorField);
  }

  const topGroups = Array.from(groupCounts.entries())
    .map(([slug, value]) => ({
      slug,
      label: value.label,
      // Fallback path has no swap-correction data, so filterValue == label.
      // The label is already the raw item.group (Группа field) value, so it
      // matches what 1C filters on.
      filterValue: value.label,
      productCount: value.productCount,
      subgroups: Array.from(value.subgroups.entries())
        .map(([subgroupSlug, subgroupValue]) => ({
          slug: subgroupSlug,
          label: subgroupValue.label,
          productCount: subgroupValue.productCount,
        }))
        .sort((a, b) => {
          if (b.productCount !== a.productCount) return b.productCount - a.productCount;
          return a.label.localeCompare(b.label, "uk");
        }),
    }))
    .sort((a, b) => {
      if (b.productCount !== a.productCount) return b.productCount - a.productCount;
      return a.label.localeCompare(b.label, "uk");
    })
    .slice(0, 25);

  const categoriesCount = Array.from(groupCounts.values()).reduce(
    (sum, group) => sum + group.subgroups.size,
    0
  );

  return {
    productCount: seenProducts.size,
    groupsCount: groupCounts.size,
    categoriesCount,
    topGroups,
  };
});

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
    const producer = await resolveWithTimeout(
      () => findSeoProducerBySlug(slug),
      null,
      MANUFACTURER_SEO_LOOKUP_TIMEOUT_MS
    ).catch(() => null);
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

    const topGroups = (producer?.topGroups ?? [])
      .map((group) => ({
        label: group.label,
        filterValue: group.filterValue,
        slug: group.slug,
        productCount: group.productCount,
        subgroups: (group.subgroups ?? []).filter(
          (subgroup) => normalizeValue(subgroup.label).length > 0
        ),
      }))
      .filter((group) => normalizeValue(group.label).length > 0);
    const facetGroupsCount = Number(producer?.groupsCount ?? 0);
    const groupsCount = Math.max(
      Number.isFinite(facetGroupsCount) && facetGroupsCount > 0
        ? Math.floor(facetGroupsCount)
        : 0,
      topGroups.length
    );
    const topGroupsCategoriesCount = topGroups.reduce(
      (sum, group) => sum + group.subgroups.length,
      0
    );
    const facetCategoriesCount = Number(producer?.categoriesCount ?? 0);
    const categoriesCount = Math.max(
      Number.isFinite(facetCategoriesCount) && facetCategoriesCount > 0
        ? Math.floor(facetCategoriesCount)
        : 0,
      topGroupsCategoriesCount
    );
    const topGroupsProducts = topGroups.reduce((sum, group) => {
      const value = Number(group.productCount);
      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    }, 0);
    const facetProductCount = Number(producer?.productCount ?? 0);
    const productCount = Math.max(
      Number.isFinite(facetProductCount) && facetProductCount > 0
        ? Math.floor(facetProductCount)
        : 0,
      topGroupsProducts
    );
    const shouldUseFallbackCounts =
      !isProductionBuildPhase &&
      !(productCount > 0 && groupsCount > 0 && (categoriesCount > 0 || topGroups.length > 0));
    const fallbackCounts = shouldUseFallbackCounts
      ? await resolveWithTimeout<
          Awaited<ReturnType<typeof collectProducerFallbackStats>> | null
        >(
          () => collectProducerFallbackStats(label),
          null,
          MANUFACTURER_FALLBACK_STATS_TIMEOUT_MS
        )
      : null;
    const fallbackTopGroups = fallbackCounts?.topGroups || [];
    const fallbackCategoriesCount = fallbackCounts?.categoriesCount || 0;
    const resolvedTopGroups: ManufacturerPageData["topGroups"] =
      fallbackTopGroups.length > 0 &&
      (topGroups.length === 0 || fallbackCategoriesCount > topGroupsCategoriesCount)
        ? fallbackTopGroups
        : topGroups;

    // Safety pass: drop any group that has zero products.  This is already
    // guaranteed by toFacetList / collectProducerFallbackStats, but stale
    // cached facets or data gaps can occasionally surface 0-count entries.
    const safeTopGroups = resolvedTopGroups.filter((group) => {
      if (group.productCount > 0) return true;
      console.log(JSON.stringify({
        type: "manufacturer-group-excluded",
        producer: label,
        groupLabel: group.label,
        groupFilterValue: group.filterValue,
        groupSlug: group.slug,
        reason: "productCount is 0 — stale facet entry skipped",
        ts: Date.now(),
      }));
      return false;
    });

    return {
      label,
      slug: canonicalSlug,
      description,
      logoPath,
      initials: getProducerInitials(label),
      productCount: Math.max(productCount, fallbackCounts?.productCount || 0),
      groupsCount: Math.max(groupsCount, fallbackCounts?.groupsCount || 0),
      categoriesCount: Math.max(categoriesCount, fallbackCounts?.categoriesCount || 0),
      topGroups: safeTopGroups,
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
    producer.groupsCount
  );

  return buildPageMetadata({
    title,
    description,
    canonicalPath: buildManufacturerPath(producer.slug),
    keywords: buildManufacturerKeywords(producer.label),
    openGraphTitle: `${title} | PartsON`,
    image: {
      url: producer.logoPath || "/Car-parts-fullwidth.png",
      alt: `${producer.label} | PartsON`,
    },
    icons: producer.logoPath
      ? {
          icon: [{ url: producer.logoPath, type: "image/png" }],
        }
      : undefined,
  });
}

export default async function ManufacturerDetailPage({
  params,
}: ManufacturerPageProps) {
  const { slug } = await params;
  const producer = await getManufacturerBySlug(slug);

  if (!producer) {
    permanentRedirect(buildCatalogProducerPath(buildProducerFallbackLabelFromSlug(slug)));
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
    producer.groupsCount
  );
  const seoCopy = getProducerSeoCopy(producer.label, producer.productCount);
  const h1Title = `${producer.label} - автозапчастини бренду`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${canonicalPageUrl}#collection-page`,
    name: pageTitle,
    url: canonicalPageUrl,
    description: pageDescription,
    inLanguage: "uk-UA",
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
        url: `${siteUrl}${buildCatalogProducerPath(producer.label, group.filterValue)}`,
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
    <main className={`${catalogPageBackgroundClass} min-h-screen py-5 sm:py-7`}>
      <div className="page-shell-inline">
      <div className="space-y-4 sm:space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
            className={directorySecondaryButtonClass}
          >
            &larr; Усі виробники
          </Link>
        </div>

        <section className={directoryHeroClass}>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={directoryBadgeClass}>
                Сторінка бренду
              </span>
              <span className={directoryCompactMetricClass}>
                {producer.productCount.toLocaleString("uk-UA")} тов.
              </span>
              {producer.groupsCount > 0 ? (
                <span className={directoryCompactMetricClass}>
                  {producer.groupsCount.toLocaleString("uk-UA")} груп
                </span>
              ) : null}
              {producer.categoriesCount > 0 ? (
                <span className={directoryCompactMetricAccentClass}>
                  {producer.categoriesCount.toLocaleString("uk-UA")} кат.
                </span>
              ) : null}
            </div>

            <div className="mt-5 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className={directoryIconTileClass}>
                  {producer.logoPath ? (
                    <Image
                      src={producer.logoPath}
                      alt={producer.label}
                      width={68}
                      height={68}
                      className="relative z-[1] h-12 w-12 object-contain"
                      unoptimized
                    />
                  ) : (
                    <span className="relative z-[1] text-xl font-[780] text-slate-700">
                      {producer.initials}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <h1 className="font-display text-3xl font-[780] tracking-normal text-slate-950 sm:text-[2.35rem]">
                    {h1Title}
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-[15px]">
                    {pageDescription}
                  </p>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 sm:text-[15px]">
                    {producer.description}
                  </p>
                </div>
              </div>

              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
                <CatalogPrefetchLink
                  href={catalogPath}
                  prefetchCatalogOnViewport
                  className={directoryPrimaryButtonClass}
                >
                  Перейти в каталог бренду
                </CatalogPrefetchLink>
                <Link
                  href="/manufacturers"
                  className={directorySecondaryButtonClass}
                >
                  Усі виробники
                </Link>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className={directoryCompactMetricClass}>
                Окрема сторінка бренду
              </span>
              <span className={directoryCompactMetricAccentClass}>
                Плавна навігація по групах і категоріях
              </span>
            </div>
          </div>
        </section>

        <section className={directoryPanelClass}>
          <div className={directoryHeaderClass}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className={directoryBadgeClass}>
                  Опис виробника
                </p>
                <h2 className={directoryTitleClass}>
                  Автозапчастини {producer.label} у каталозі PartsON
                </h2>
                <p className={directoryDescriptionClass}>
                  {seoCopy.intro}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className={directoryCompactMetricClass}>
                  {producer.productCount.toLocaleString("uk-UA")} тов.
                </span>
                {producer.groupsCount > 0 ? (
                  <span className={directoryCompactMetricAccentClass}>
                    {producer.groupsCount.toLocaleString("uk-UA")} груп
                  </span>
                ) : null}
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
                Популярні запити бренду
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

        <section className={directoryPanelClass}>
          <div className={directoryHeaderClass}>
            <p className={directoryBadgeClass}>
              Структура каталогу бренду
            </p>
            <h2 className={directoryTitleClass}>
              Категорії {producer.label} за групами
            </h2>
            <p className={directoryDescriptionClass}>
              Спочатку відкрийте потрібну групу, а далі переходьте в конкретну категорію бренду вже з готовим фільтром виробника.
            </p>
          </div>

          {producer.topGroups.length > 0 ? (
            <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
              {producer.topGroups.map((group) => (
                <article
                  key={group.slug}
                  className={directoryListCardClass}
                >
                  <div>
                    <div className="flex flex-col gap-3 border-b border-slate-200/75 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800">
                          Група
                        </p>
                        <CatalogPrefetchLink
                          href={buildCatalogProducerPath(producer.label, group.filterValue)}
                          prefetchCatalogOnViewport
                          className="font-display mt-1 inline-flex text-[18px] font-[760] tracking-normal text-slate-950 transition hover:text-teal-700"
                        >
                          {normalizeValue(group.label)}
                        </CatalogPrefetchLink>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className={directoryCompactMetricClass}>
                          {group.productCount.toLocaleString("uk-UA")} тов.
                        </span>
                        {group.subgroups.length > 0 ? (
                          <span className={directoryCompactMetricAccentClass}>
                            {group.subgroups.length.toLocaleString("uk-UA")} кат.
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {group.subgroups.length > 0 ? (
                      <div className="grid gap-2.5 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
                        {group.subgroups.map((subgroup) => (
                          <CatalogPrefetchLink
                            key={`${group.slug}:${subgroup.slug}`}
                            href={buildCatalogProducerPath(
                              producer.label,
                              group.filterValue,
                              subgroup.label
                            )}
                            prefetchCatalogOnViewport
                            className="flex items-center justify-between rounded-lg border border-slate-200/90 bg-white/90 px-3.5 py-3 text-sm text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:border-teal-200 hover:bg-teal-50/45 hover:text-teal-800"
                          >
                            <span className="pr-3 font-medium">{normalizeValue(subgroup.label)}</span>
                            <span className={directoryCompactMetricAccentClass}>
                              {subgroup.productCount.toLocaleString("uk-UA")} тов.
                            </span>
                          </CatalogPrefetchLink>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-4">
                        <CatalogPrefetchLink
                          href={buildCatalogProducerPath(producer.label, group.filterValue)}
                          prefetchCatalogOnViewport
                          className={directoryPrimaryButtonClass}
                        >
                          Переглянути товари цієї групи
                        </CatalogPrefetchLink>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="px-4 py-5 sm:px-5">
              <CatalogPrefetchLink
                href={catalogPath}
                prefetchCatalogOnViewport
                className={directoryPrimaryButtonClass}
              >
                Переглянути всі товари бренду
              </CatalogPrefetchLink>
            </div>
          )}
        </section>
      </div>
      </div>

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
