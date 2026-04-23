import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import {
  getCatalogSeoFacetsWithTimeout,
} from "app/lib/catalog-seo";
import {
  buildCatalogCategoryPath,
  buildGroupItemPath,
} from "app/lib/catalog-links";
import { getCategoryIconPath } from "app/lib/category-icons";
import { buildSeoGroupLookup, resolveGroupSeoCounts } from "app/lib/group-seo";
import { getProductTreeDataset } from "app/lib/product-tree";
import { buildVisibleProductName } from "app/lib/product-url";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;
const GROUP_STATIC_PARAMS_LIMIT_DEFAULT = 200;
const GROUP_STATIC_PARAMS_FALLBACK_TIMEOUT_MS = 4500;
const GROUP_PAGE_SEO_FACETS_TIMEOUT_MS = 2500;

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
};

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const getGroupBySlug = cache(async (slug: string): Promise<GroupPageData | null> => {
  const [dataset, seoFacets] = await Promise.all([
    getProductTreeDataset().catch(() => null),
    getCatalogSeoFacetsWithTimeout(GROUP_PAGE_SEO_FACETS_TIMEOUT_MS),
  ]);
  const group = dataset?.groups.find(
    (item) => item.slug === slug || item.legacySlug === slug
  );
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
  };
});

const buildGroupTitle = (label: string) =>
  `Каталог автозапчастин ${buildVisibleProductName(label)}`;

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
      ? ` і ${subgroupsCount.toLocaleString("uk-UA")} підгруп`
      : "";

  return `Каталог автозапчастин групи ${visibleLabel} в PartsON: ${productLabel}${subgroupLabel}. Швидкий перехід у потрібний розділ і доставка по Україні.`;
};

const buildGroupHeroDescription = (
  label: string,
  productCount: number,
  subgroupsCount: number,
  hasSubgroups: boolean
) => {
  const visibleLabel = buildVisibleProductName(label);

  if (hasSubgroups) {
    return `У групі ${visibleLabel} зібрано ${productCount.toLocaleString("uk-UA")} товарів і ${subgroupsCount.toLocaleString("uk-UA")} підгруп для швидкого переходу в потрібний розділ каталогу автозапчастин.`;
  }

  if (productCount > 0) {
    return `У групі ${visibleLabel} доступний прямий перехід до каталогу з ${productCount.toLocaleString("uk-UA")} товарними позиціями та швидкою навігацією по суміжних напрямках.`;
  }

  return `Сторінка групи ${visibleLabel} веде прямо у відповідний розділ каталогу автозапчастин і допомагає швидко перейти до потрібних товарів.`;
};

const buildGroupHeroDetails = (
  label: string,
  hasSubgroups: boolean
) => {
  const visibleLabel = buildVisibleProductName(label);

  if (hasSubgroups) {
    return `Оберіть підгрупу для точнішого підбору або відкрийте весь каталог групи ${visibleLabel} одним кліком.`;
  }

  return `Цей розділ зібраний як окрема сторінка групи ${visibleLabel}, щоб відкривати каталог без зайвих параметрів у посиланні.`;
};

const buildGroupPagePath = (slug: string) => `/groups/${encodeURIComponent(slug)}`;

export async function generateStaticParams() {
  const limit = parsePositiveInt(
    process.env.SEO_GROUP_STATIC_PARAMS_LIMIT,
    GROUP_STATIC_PARAMS_LIMIT_DEFAULT
  );
  if (limit <= 0) return [];

  const dataset = await getProductTreeDataset().catch(() => null);
  const treeParams =
    dataset?.groups
      .filter((group) => group.slug)
      .map((group) => ({ slug: group.slug })) ?? [];
  if (treeParams.length > 0) {
    return treeParams.slice(0, limit);
  }

  try {
    const seoFacets = await getCatalogSeoFacetsWithTimeout(
      GROUP_STATIC_PARAMS_FALLBACK_TIMEOUT_MS
    );
    return seoFacets.groups
      .filter((group) => group.slug)
      .map((group) => ({ slug: group.slug }))
      .slice(0, limit);
  } catch {
    return [];
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
    openGraphTitle: `Каталог автозапчастин ${group.label} | PartsON`,
    image: {
      url: categoryIconPath,
      width: 512,
      height: 512,
      alt: `Каталог автозапчастин ${group.label} | PartsON`,
    },
    icons: {
      icon: [{ url: categoryIconPath, type: "image/png" }],
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
  const catalogLink = buildCatalogCategoryPath(group.label);
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
    <main className="page-shell-inline py-8">
      <nav className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
        <Link href="/" className="transition hover:text-slate-800">
          Головна
        </Link>
        <span>/</span>
        <Link href="/groups" className="transition hover:text-slate-800">
          Групи товарів
        </Link>
        <span>/</span>
        <span className="text-slate-700">{visibleGroupLabel}</span>
      </nav>

      <Link href="/groups" className="mt-3 inline-flex text-sm font-medium text-sky-700 hover:text-sky-900">
        &larr; Усі групи
      </Link>

      <section className="mt-4 overflow-hidden rounded-[28px] border border-slate-200/90 bg-[radial-gradient(circle_at_top_left,rgba(186,230,253,0.22),transparent_34%),linear-gradient(160deg,#ffffff_0%,#f8fbff_55%,#eef6ff_100%)] p-5 shadow-[0_20px_44px_rgba(15,23,42,0.08)]">
        <div className="flex items-start gap-4">
          <div className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border border-sky-100 bg-white/95 shadow-[0_14px_28px_rgba(14,165,233,0.10)]">
            <Image
              src={categoryIconPath}
              alt={`Іконка категорії ${visibleGroupLabel}`}
              width={48}
              height={48}
              className="h-12 w-12 object-contain"
              unoptimized
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-sky-200 bg-sky-50/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-800">
                {pageBadge}
              </span>
              {group.productCount > 0 ? (
                <span className="inline-flex rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600">
                  {group.productCount.toLocaleString("uk-UA")} товарів
                </span>
              ) : null}
              {group.subgroupsCount > 0 ? (
                <span className="inline-flex rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600">
                  {group.subgroupsCount.toLocaleString("uk-UA")} підгруп
                </span>
              ) : null}
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
                className="inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Перейти в каталог
              </CatalogPrefetchLink>
              <Link
                href="/groups"
                className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
              >
                Усі групи
              </Link>
            </div>
          </div>
        </div>
      </section>

      {group.subgroups.length > 0 && (
        <section className="mt-8 space-y-4">
          {group.subgroups.map((subgroup) =>
            subgroup.children.length > 0 ? (
              <div key={subgroup.slug} className="rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display-italic text-base font-[720] tracking-[-0.04em] text-slate-800">
                    {buildVisibleProductName(subgroup.label)}
                  </h2>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {subgroup.productCount > 0 ? (
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                        {subgroup.productCount.toLocaleString("uk-UA")} товарів
                      </span>
                    ) : null}
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                      {subgroup.children.length} підгруп
                    </span>
                  </div>
                </div>
                <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {subgroup.children.map((child) => (
                    <li key={child.slug}>
                      <CatalogPrefetchLink
                        href={buildGroupItemPath(group.slug, child.slug)}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
                      >
                        <span>{buildVisibleProductName(child.label)}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {child.productCount > 0 ? (
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                              {child.productCount.toLocaleString("uk-UA")}
                            </span>
                          ) : null}
                          <span className="text-slate-400">&rarr;</span>
                        </span>
                      </CatalogPrefetchLink>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div key={subgroup.slug} className="rounded-[22px] border border-slate-200/90 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                <CatalogPrefetchLink
                  href={buildGroupItemPath(group.slug, subgroup.slug)}
                  className="flex items-center justify-between rounded-[22px] px-4 py-3.5 text-sm text-slate-700 transition hover:bg-sky-50 hover:text-sky-800"
                >
                  <span className="font-medium">{buildVisibleProductName(subgroup.label)}</span>
                  <span className="flex items-center gap-3">
                    {subgroup.productCount > 0 ? (
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                        {subgroup.productCount.toLocaleString("uk-UA")} товарів
                      </span>
                    ) : null}
                    <span className="text-slate-400">&rarr;</span>
                  </span>
                </CatalogPrefetchLink>
              </div>
            )
          )}
        </section>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(offerCatalogJsonLd) }}
      />
    </main>
  );
}
