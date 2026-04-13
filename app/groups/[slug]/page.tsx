import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import {
  buildCatalogCategoryPath,
  buildGroupItemPath,
} from "app/lib/catalog-links";
import { getProductTreeDataset } from "app/lib/product-tree";
import { buildVisibleProductName } from "app/lib/product-url";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

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
  subgroups: Array<{
    label: string;
    slug: string;
    children: Array<{
      label: string;
      slug: string;
    }>;
  }>;
};

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const getGroupBySlug = cache(async (slug: string): Promise<GroupPageData | null> => {
  const dataset = await getProductTreeDataset().catch(() => null);
  const group = dataset?.groups.find(
    (item) => item.slug === slug || item.legacySlug === slug
  );
  if (!group) return null;

  return {
    label: group.label,
    slug: group.slug,
    legacySlug: group.legacySlug,
    subgroups: group.subgroups.map((subgroup) => ({
      label: subgroup.label,
      slug: subgroup.slug,
      children: (Array.isArray(subgroup.children) ? subgroup.children : []).map((child) => ({
        label: child.label,
        slug: child.slug,
      })),
    })),
  };
});

const buildGroupTitle = (label: string) =>
  `Каталог автозапчастин ${buildVisibleProductName(label)}`;

const buildGroupDescription = (label: string) =>
  `Каталог автозапчастин групи ${buildVisibleProductName(label)} в PartsON з підгрупами, швидким переходом у потрібний розділ і доставкою по Україні.`;

const buildGroupPagePath = (slug: string) => `/groups/${encodeURIComponent(slug)}`;

export async function generateStaticParams() {
  try {
    const dataset = await getProductTreeDataset();
    const limit = parsePositiveInt(process.env.SEO_GROUP_STATIC_PARAMS_LIMIT, 4000);
    return dataset.groups.slice(0, limit).map((group) => ({ slug: group.slug }));
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

  const description = buildGroupDescription(group.label);
  const canonicalPath = buildGroupPagePath(group.slug);

  return buildPageMetadata({
    title: buildGroupTitle(group.label),
    description,
    canonicalPath,
    keywords: [
      group.label,
      `${group.label} автозапчастини`,
      `купити ${group.label}`,
      `каталог ${group.label}`,
      "групи автозапчастин",
    ],
    openGraphTitle: `Каталог автозапчастин ${group.label} | PartsON`,
    image: {
      url: "/Car-parts-fullwidth.png",
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
  const catalogLink = buildCatalogCategoryPath(group.label);
  const canonicalPageUrl = `${siteUrl}${pagePath}`;
  const visibleGroupLabel = buildVisibleProductName(group.label);
  const hasSubgroups = group.subgroups.length > 0;
  const description = buildGroupDescription(group.label);
  const pageTitle = buildGroupTitle(group.label);
  const pageDescription = hasSubgroups
    ? `На цій сторінці зібрані основні підгрупи для категорії ${visibleGroupLabel}. Використовуйте її як швидкий перехід у каталог автозапчастин або для навігації по суміжних товарних напрямках.`
    : `Це окрема SEO-сторінка групи ${visibleGroupLabel}. Вона веде у відповідний розділ каталогу і дає чистий постійний URL без довгих query-параметрів.`;
  const pageBadge = hasSubgroups ? "Група каталогу" : "Окрема група";
  const pageStats = hasSubgroups
    ? `${group.subgroups.length} підгруп у розділі`
    : "Прямий перехід у каталог";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: pageTitle,
    url: canonicalPageUrl,
    description,
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-800">
            {pageBadge}
          </span>
          <span className="inline-flex rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600">
            {pageStats}
          </span>
        </div>

        <h1 className="font-display-italic mt-4 text-3xl tracking-[-0.048em] text-slate-900 sm:text-[2.2rem]">
          {pageTitle}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-[15px]">
          {pageDescription}
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
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                    {subgroup.children.length} підгруп
                  </span>
                </div>
                <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {subgroup.children.map((child) => (
                    <li key={child.slug}>
                      <CatalogPrefetchLink
                        href={buildGroupItemPath(group.slug, child.slug)}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
                      >
                        <span>{buildVisibleProductName(child.label)}</span>
                        <span className="text-slate-400">
                          &rarr;
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
                  <span className="text-slate-400">&rarr;</span>
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
