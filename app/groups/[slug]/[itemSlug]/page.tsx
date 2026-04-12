import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import SmartLink from "app/components/SmartLink";
import { buildCatalogCategoryPath, buildGroupItemPath } from "app/lib/catalog-links";
import { getProductTreeDataset } from "app/lib/product-tree";
import { buildVisibleProductName } from "app/lib/product-url";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 3600;

interface GroupItemPageParams {
  slug: string;
  itemSlug: string;
}

interface GroupItemPageProps {
  params: Promise<GroupItemPageParams>;
}

type GroupItemPageData = {
  groupLabel: string;
  groupSlug: string;
  label: string;
  itemSlug: string;
  parentSubgroupLabel: string;
  catalogPath: string;
  children: Array<{
    label: string;
    slug: string;
  }>;
};

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const getGroupItemBySlugs = cache(
  async (groupSlug: string, itemSlug: string): Promise<GroupItemPageData | null> => {
    const dataset = await getProductTreeDataset().catch(() => null);
    const group = dataset?.groups.find((entry) => entry.slug === groupSlug);
    if (!group) return null;

    const subgroup = group.subgroups.find(
      (entry) => entry.slug === itemSlug || entry.legacySlug === itemSlug
    );
    if (subgroup) {
      return {
        groupLabel: group.label,
        groupSlug: group.slug,
        label: subgroup.label,
        itemSlug: subgroup.slug,
        parentSubgroupLabel: "",
        catalogPath: buildCatalogCategoryPath(group.label, subgroup.label),
        children: subgroup.children,
      };
    }

    for (const entry of group.subgroups) {
      const child = entry.children.find(
        (candidate) => candidate.slug === itemSlug || candidate.legacySlug === itemSlug
      );
      if (!child) continue;

      return {
        groupLabel: group.label,
        groupSlug: group.slug,
        label: child.label,
        itemSlug: child.slug,
        parentSubgroupLabel: entry.label,
        catalogPath: buildCatalogCategoryPath(group.label, child.label),
        children: [],
      };
    }

    return null;
  }
);

const buildGroupItemDescription = (item: GroupItemPageData) => {
  if (item.parentSubgroupLabel) {
    return `Сторінка категорії ${item.label} у групі ${item.groupLabel} каталогу PartsON. Швидкий перехід до товарів і підбір автозапчастин з доставкою по Україні.`;
  }

  return `Сторінка підгрупи ${item.label} у групі ${item.groupLabel} каталогу PartsON. Перейдіть до каталогу або відкрийте пов'язані кінцеві категорії автозапчастин.`;
};

export async function generateStaticParams() {
  try {
    const dataset = await getProductTreeDataset();
    const limit = parsePositiveInt(process.env.SEO_GROUP_ITEM_STATIC_PARAMS_LIMIT, 12000);

    return dataset.groups
      .flatMap((group) => [
        ...group.subgroups.map((subgroup) => ({
          slug: group.slug,
          itemSlug: subgroup.slug,
        })),
        ...group.subgroups.flatMap((subgroup) =>
          subgroup.children.map((child) => ({
            slug: group.slug,
            itemSlug: child.slug,
          }))
        ),
      ])
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: GroupItemPageProps): Promise<Metadata> {
  const { slug, itemSlug } = await params;
  const item = await getGroupItemBySlugs(slug, itemSlug);

  if (!item) {
    return {
      title: "Категорію не знайдено",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = item.parentSubgroupLabel
    ? `${item.label} - ${item.groupLabel} | Каталог автозапчастин`
    : `${item.label} - підгрупа ${item.groupLabel} | Каталог автозапчастин`;

  return buildPageMetadata({
    title,
    description: buildGroupItemDescription(item),
    canonicalPath: buildGroupItemPath(item.groupSlug, item.itemSlug),
    keywords: [
      item.label,
      `${item.label} автозапчастини`,
      item.groupLabel,
      `каталог ${item.label}`,
    ],
    openGraphTitle: `${title} | PartsON`,
    image: {
      url: "/Car-parts-fullwidth.png",
      alt: `${title} | PartsON`,
    },
  });
}

export default async function GroupItemPage({ params }: GroupItemPageProps) {
  const { slug, itemSlug } = await params;
  const item = await getGroupItemBySlugs(slug, itemSlug);
  if (!item) notFound();
  if (itemSlug !== item.itemSlug) {
    permanentRedirect(buildGroupItemPath(item.groupSlug, item.itemSlug));
  }
  if (item.children.length === 0) {
    redirect(item.catalogPath);
  }

  const siteUrl = getSiteUrl();
  const pagePath = buildGroupItemPath(item.groupSlug, item.itemSlug);
  const canonicalPageUrl = `${siteUrl}${pagePath}`;
  const visibleLabel = buildVisibleProductName(item.label);
  const visibleGroupLabel = buildVisibleProductName(item.groupLabel);
  const visibleParentLabel = buildVisibleProductName(item.parentSubgroupLabel);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${visibleLabel} - ${visibleGroupLabel}`,
    url: canonicalPageUrl,
    description: buildGroupItemDescription(item),
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
  };

  const breadcrumbItems = [
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
      name: item.groupLabel,
      item: `${siteUrl}/groups/${encodeURIComponent(item.groupSlug)}`,
    },
  ];

  if (item.parentSubgroupLabel) {
    breadcrumbItems.push(
      {
        "@type": "ListItem",
        position: 4,
        name: item.parentSubgroupLabel,
        item: `${siteUrl}${buildCatalogCategoryPath(item.groupLabel, item.parentSubgroupLabel)}`,
      },
      {
        "@type": "ListItem",
        position: 5,
        name: item.label,
        item: canonicalPageUrl,
      }
    );
  } else {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 4,
      name: item.label,
      item: canonicalPageUrl,
    });
  }

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
        <Link
          href={`/groups/${encodeURIComponent(item.groupSlug)}`}
          className="transition hover:text-slate-800"
        >
          {visibleGroupLabel}
        </Link>
        <span>/</span>
        <span className="text-slate-700">{visibleLabel}</span>
      </nav>

      <Link
        href={`/groups/${encodeURIComponent(item.groupSlug)}`}
        className="mt-3 inline-flex text-sm font-medium text-sky-700 hover:text-sky-900"
      >
        &larr; До групи {visibleGroupLabel}
      </Link>

      <h1 className="font-display-italic mt-3 text-3xl tracking-[-0.048em] text-slate-900">
        {visibleLabel}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {`Груп у розділі: ${item.children.length}`}
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        {item.parentSubgroupLabel
          ? `Кінцева категорія ${visibleLabel} у підгрупі ${visibleParentLabel} групи ${visibleGroupLabel}.`
          : `Підгрупа ${visibleLabel} у групі ${visibleGroupLabel} з прямим переходом у каталог автозапчастин.`}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <CatalogPrefetchLink
          href={item.catalogPath}
          prefetchCatalogOnViewport
          className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Відкрити каталог
        </CatalogPrefetchLink>
        <SmartLink
          href={`/groups/${encodeURIComponent(item.groupSlug)}`}
          className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
        >
          Назад до групи
        </SmartLink>
      </div>

      {item.children.length > 0 ? (
        <section className="mt-8 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <h2 className="font-display-italic text-lg tracking-[-0.046em] text-slate-800">
            Підкатегорії
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {item.children.map((child) => (
              <li key={child.slug}>
                <CatalogPrefetchLink
                  href={buildCatalogCategoryPath(item.groupLabel, child.label)}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
                >
                  <span>{buildVisibleProductName(child.label)}</span>
                  <span className="text-slate-400">&rarr;</span>
                </CatalogPrefetchLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: breadcrumbItems,
          }),
        }}
      />
    </main>
  );
}
