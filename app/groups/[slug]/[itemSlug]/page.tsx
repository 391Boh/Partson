import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import {
  directoryCardClass,
  directoryHeaderClass,
  directoryMetricAccentClass,
  directoryMetricClass,
  directoryPanelClass,
  directoryPrimaryButtonClass,
  directorySecondaryButtonClass,
} from "app/components/catalog-directory-styles";
import SmartLink from "app/components/SmartLink";
import {
  getCatalogSeoFacets,
  type SeoProducerFacet,
} from "app/lib/catalog-seo";
import {
  buildCatalogCategoryPath,
  buildCatalogProducerPath,
  buildGroupItemPath,
  buildManufacturerPath,
} from "app/lib/catalog-links";
import { getCategoryIconPath } from "app/lib/category-icons";
import { buildSeoGroupLookup, resolveGroupSeoCounts } from "app/lib/group-seo";
import { getProductTreeDataset } from "app/lib/product-tree";
import { buildVisibleProductName } from "app/lib/product-url";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
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
  groupLegacySlug?: string;
  label: string;
  itemSlug: string;
  parentSubgroupLabel: string;
  parentSubgroupSlug?: string;
  productCount: number;
  producersCount: number;
  catalogPath: string;
  producerSplit: Array<{
    label: string;
    slug: string;
    productCount: number;
    catalogPath: string;
    manufacturerPath: string;
  }>;
  children: Array<{
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

const normalizeLookupKey = (value: string | null | undefined) =>
  normalizeValue(value).toLocaleLowerCase("uk-UA");

const buildFacetLookupKeys = (value: string | null | undefined) => {
  const normalized = normalizeValue(value);
  if (!normalized) return [] as string[];

  return Array.from(
    new Set([
      normalizeLookupKey(normalized),
      normalizeLookupKey(buildPlainSeoSlug(normalized)),
    ])
  );
};

const facetMatches = (
  candidate: { label: string; slug?: string },
  targetKeys: Set<string>
) =>
  [
    ...buildFacetLookupKeys(candidate.label),
    normalizeLookupKey(candidate.slug),
  ].some((key) => key && targetKeys.has(key));

const buildGroupItemProducerSplit = (options: {
  producers: SeoProducerFacet[];
  groupLabel: string;
  itemLabels: string[];
}) => {
  const groupKeys = new Set(buildFacetLookupKeys(options.groupLabel));
  const itemKeys = new Set(options.itemLabels.flatMap((label) => buildFacetLookupKeys(label)));
  if (groupKeys.size === 0 || itemKeys.size === 0) return [];

  return options.producers
    .map((producer) => {
      const matchedGroup = (producer.topGroups ?? []).find((group) =>
        facetMatches(group, groupKeys)
      );
      if (!matchedGroup) return null;

      const productCount = (matchedGroup.subgroups ?? []).reduce((sum, subgroup) => {
        if (!facetMatches(subgroup, itemKeys)) return sum;
        const value = Number(subgroup.productCount);
        return Number.isFinite(value) && value > 0 ? sum + Math.floor(value) : sum;
      }, 0);
      if (productCount <= 0) return null;

      return {
        label: producer.label,
        slug: producer.slug,
        productCount,
        catalogPath: buildCatalogProducerPath(
          producer.label,
          options.groupLabel,
          options.itemLabels[0]
        ),
        manufacturerPath: buildManufacturerPath(producer.slug || producer.label),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => {
      if (right.productCount !== left.productCount) {
        return right.productCount - left.productCount;
      }
      return left.label.localeCompare(right.label, "uk", { sensitivity: "base" });
    });
};

const getGroupItemBySlugs = cache(
  async (groupSlug: string, itemSlug: string): Promise<GroupItemPageData | null> => {
    const [dataset, seoFacets] = await Promise.all([
      getProductTreeDataset().catch(() => null),
      getCatalogSeoFacets().catch(() => ({ groups: [], producers: [], generatedAt: "" })),
    ]);
    const group = dataset?.groups.find(
      (entry) => entry.slug === groupSlug || entry.legacySlug === groupSlug
    );
    if (!group) return null;
    const counts = resolveGroupSeoCounts(group, buildSeoGroupLookup(seoFacets.groups));

    const subgroup = group.subgroups.find(
      (entry) => entry.slug === itemSlug || entry.legacySlug === itemSlug
    );
    if (subgroup) {
      const children = subgroup.children.map((child) => ({
        ...child,
        productCount: counts.childProductCounts.get(child.slug) ?? 0,
      }));
      const producerSplit = buildGroupItemProducerSplit({
        producers: seoFacets.producers,
        groupLabel: group.label,
        itemLabels: [subgroup.label, ...children.map((child) => child.label)],
      });
      const producerProductCount = producerSplit.reduce(
        (sum, producer) => sum + producer.productCount,
        0
      );

      return {
        groupLabel: group.label,
        groupSlug: group.slug,
        groupLegacySlug: group.legacySlug,
        label: subgroup.label,
        itemSlug: subgroup.slug,
        parentSubgroupLabel: "",
        parentSubgroupSlug: undefined,
        productCount: Math.max(
          counts.subgroupProductCounts.get(subgroup.slug) ?? 0,
          producerProductCount
        ),
        producersCount: producerSplit.length,
        catalogPath: buildCatalogCategoryPath(group.label, subgroup.label),
        producerSplit,
        children,
      };
    }

    for (const entry of group.subgroups) {
      const child = entry.children.find(
        (candidate) => candidate.slug === itemSlug || candidate.legacySlug === itemSlug
      );
      if (!child) continue;
      const producerSplit = buildGroupItemProducerSplit({
        producers: seoFacets.producers,
        groupLabel: group.label,
        itemLabels: [child.label],
      });
      const producerProductCount = producerSplit.reduce(
        (sum, producer) => sum + producer.productCount,
        0
      );

      return {
        groupLabel: group.label,
        groupSlug: group.slug,
        groupLegacySlug: group.legacySlug,
        label: child.label,
        itemSlug: child.slug,
        parentSubgroupLabel: entry.label,
        parentSubgroupSlug: entry.slug,
        productCount: Math.max(
          counts.childProductCounts.get(child.slug) ?? 0,
          producerProductCount
        ),
        producersCount: producerSplit.length,
        catalogPath: buildCatalogCategoryPath(entry.label, child.label),
        producerSplit,
        children: [],
      };
    }

    return null;
  }
);

const buildGroupItemDescription = (item: GroupItemPageData) => {
  const visibleLabel = buildVisibleProductName(item.label);
  const visibleGroupLabel = buildVisibleProductName(item.groupLabel);
  const visibleParentLabel = buildVisibleProductName(item.parentSubgroupLabel);

  if (item.parentSubgroupLabel) {
    return `Сторінка категорії ${visibleLabel} у групі ${visibleGroupLabel}${visibleParentLabel ? `, підгрупа ${visibleParentLabel}` : ""} каталогу PartsON. Швидкий перехід до товарів і підбір автозапчастин з доставкою по Україні.`;
  }

  return `Сторінка підгрупи ${visibleLabel} у групі ${visibleGroupLabel} каталогу PartsON. Перейдіть до каталогу або відкрийте пов'язані кінцеві категорії автозапчастин.`;
};

const buildGroupPagePath = (groupSlug: string) => `/groups/${encodeURIComponent(groupSlug)}`;
const buildGroupItemTitle = (item: GroupItemPageData) => {
  const visibleLabel = buildVisibleProductName(item.label);
  const visibleGroupLabel = buildVisibleProductName(item.groupLabel);

  return item.parentSubgroupLabel
    ? `${visibleLabel} - ${visibleGroupLabel} | Каталог автозапчастин`
    : `${visibleLabel} - підгрупа ${visibleGroupLabel} | Каталог автозапчастин`;
};

export async function generateStaticParams() {
  try {
    const dataset = await getProductTreeDataset();
    const limit = parsePositiveInt(process.env.SEO_GROUP_ITEM_STATIC_PARAMS_LIMIT, 0);
    if (limit <= 0) return [];

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

  const title = buildGroupItemTitle(item);
  const categoryIconPath = getCategoryIconPath(item.groupLabel);

  return buildPageMetadata({
    title,
    description: buildGroupItemDescription(item),
    canonicalPath: buildGroupItemPath(item.groupSlug, item.itemSlug),
    keywords: [
      item.label,
      `${item.label} автозапчастини`,
      `купити ${item.label}`,
      `${item.label} львів`,
      `${item.label} ціна`,
      `${item.label} доставка україна`,
      item.groupLabel,
      `каталог ${item.label}`,
      `виробники ${item.label}`,
    ],
    openGraphTitle: `${title} | PartsON`,
    image: {
      url: categoryIconPath,
      width: 512,
      height: 512,
      alt: `${title} | PartsON`,
    },
    icons: {
      icon: [{ url: categoryIconPath, type: "image/png" }],
    },
  });
}

export default async function GroupItemPage({ params }: GroupItemPageProps) {
  const { slug, itemSlug } = await params;
  const item = await getGroupItemBySlugs(slug, itemSlug);
  if (!item) notFound();
  if (slug !== item.groupSlug || itemSlug !== item.itemSlug) {
    permanentRedirect(buildGroupItemPath(item.groupSlug, item.itemSlug));
  }

  const siteUrl = getSiteUrl();
  const pagePath = buildGroupItemPath(item.groupSlug, item.itemSlug);
  const groupPagePath = buildGroupPagePath(item.groupSlug);
  const canonicalPageUrl = `${siteUrl}${pagePath}`;
  const categoryIconPath = getCategoryIconPath(item.groupLabel);
  const categoryIconUrl = `${siteUrl}${categoryIconPath}`;
  const visibleLabel = buildVisibleProductName(item.label);
  const visibleGroupLabel = buildVisibleProductName(item.groupLabel);
  const visibleParentLabel = buildVisibleProductName(item.parentSubgroupLabel);
  const pageDescription = item.parentSubgroupLabel
    ? `Кінцева категорія ${visibleLabel} у підгрупі ${visibleParentLabel} групи ${visibleGroupLabel}. Сторінка веде прямо в каталог цієї категорії та допомагає швидко перейти до потрібних товарів.`
    : `Підгрупа ${visibleLabel} у групі ${visibleGroupLabel} з прямим переходом у каталог автозапчастин і навігацією по суміжних розділах.`;
  const pageStats =
    item.productCount > 0
      ? `${item.productCount.toLocaleString("uk-UA")} товарів у розділі`
      : item.children.length > 0
        ? `${item.children.length} підкатегорій у розділі`
      : "Прямий перехід у каталог";
  const producerProductsTotal = item.producerSplit.reduce(
    (sum, producer) => sum + producer.productCount,
    0
  );
  const topProducerSplit = item.producerSplit.slice(0, 24);
  const hasProducerSplit = topProducerSplit.length > 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${canonicalPageUrl}#collection-page`,
    name: buildGroupItemTitle(item),
    url: canonicalPageUrl,
    description: buildGroupItemDescription(item),
    image: categoryIconUrl,
    inLanguage: "uk-UA",
    about: [
      { "@type": "Thing", name: item.groupLabel },
      { "@type": "Thing", name: item.label },
    ],
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
        item: `${siteUrl}${groupPagePath}`,
      },
  ];

  if (item.parentSubgroupLabel) {
    breadcrumbItems.push(
      {
        "@type": "ListItem",
        position: 4,
        name: item.parentSubgroupLabel,
        item: `${siteUrl}${buildGroupItemPath(
          item.groupSlug,
          item.parentSubgroupSlug || item.itemSlug
        )}`,
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
          href={groupPagePath}
          className="transition hover:text-slate-800"
        >
          {visibleGroupLabel}
        </Link>
        <span>/</span>
        <span className="text-slate-700">{visibleLabel}</span>
      </nav>

      <Link
        href={groupPagePath}
        className="mt-3 inline-flex text-sm font-medium text-sky-700 hover:text-sky-900"
      >
        &larr; До групи {visibleGroupLabel}
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
                {item.parentSubgroupLabel ? "Кінцева категорія" : "Підгрупа"}
              </span>
              <span className="inline-flex rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600">
                {pageStats}
              </span>
              {item.producersCount > 0 ? (
                <span className="inline-flex rounded-full border border-cyan-100 bg-cyan-50/90 px-3 py-1 text-[11px] font-semibold text-cyan-800">
                  {item.producersCount.toLocaleString("uk-UA")} виробників
                </span>
              ) : null}
            </div>

            <h1 className="font-display-italic mt-4 text-3xl tracking-[-0.048em] text-slate-900 sm:text-[2.2rem]">
              {visibleLabel}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-[15px]">
              {pageDescription}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <CatalogPrefetchLink
                href={item.catalogPath}
                prefetchCatalogOnViewport
                className={directoryPrimaryButtonClass}
              >
                Перейти в каталог
              </CatalogPrefetchLink>
              <SmartLink
                href={groupPagePath}
                className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
              >
                До групи {visibleGroupLabel}
              </SmartLink>
            </div>
          </div>
        </div>
      </section>

      <section className={`${directoryPanelClass} mt-8`}>
        <div className={directoryHeaderClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800">
                Розподіл за виробниками
              </p>
              <h2 className="font-display mt-1 text-xl font-[780] tracking-normal text-slate-950 sm:text-2xl">
                Виробники у категорії {visibleLabel}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Лічильники рахуються по товарах цієї кінцевої категорії і допомагають одразу перейти до потрібного бренду у каталозі.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={directoryMetricAccentClass}>
                {item.producersCount.toLocaleString("uk-UA")} виробників
              </span>
              <span className={directoryMetricClass}>
                {(producerProductsTotal || item.productCount).toLocaleString("uk-UA")} товарів
              </span>
            </div>
          </div>
        </div>

        {hasProducerSplit ? (
          <div className="grid gap-2.5 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
            {topProducerSplit.map((producer) => {
              return (
                <article
                  key={producer.slug || producer.label}
                  className={`${directoryCardClass} border-l-4 border-l-teal-100 p-3 hover:border-l-teal-300`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                        Виробник
                      </p>
                      <Link
                        href={producer.manufacturerPath}
                        className="mt-1 block truncate text-[15px] font-extrabold text-slate-950 transition hover:text-teal-800"
                      >
                        {producer.label}
                      </Link>
                    </div>
                    <span className="shrink-0 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-800">
                      {producer.productCount.toLocaleString("uk-UA")}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                    <p className="text-xs font-semibold text-slate-500">
                      товарів у розділі
                    </p>
                    <CatalogPrefetchLink
                      href={producer.catalogPath}
                      prefetchCatalogOnViewport
                      className="inline-flex rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-900 transition hover:border-teal-300 hover:bg-teal-100"
                    >
                      В каталог
                    </CatalogPrefetchLink>
                  </div>

                  <Link
                    href={producer.manufacturerPath}
                    className="mt-2 inline-flex text-xs font-bold text-slate-500 transition hover:text-teal-800"
                  >
                    Сторінка виробника
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 px-4 py-5 text-sm leading-6 text-slate-600">
              Для цієї категорії ще немає готового розподілу за виробниками. Перейдіть у каталог, щоб побачити актуальні товари і фільтри.
              <div className="mt-3">
                <CatalogPrefetchLink
                  href={item.catalogPath}
                  prefetchCatalogOnViewport
                  className={directoryPrimaryButtonClass}
                >
                  Перейти в каталог
                </CatalogPrefetchLink>
              </div>
            </div>
          </div>
        )}
      </section>

      {item.children.length > 0 ? (
        <section className="mt-8 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <h2 className="font-display-italic text-lg tracking-[-0.046em] text-slate-800">
            Підкатегорії
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {item.children.map((child) => (
              <li key={child.slug}>
                <CatalogPrefetchLink
                  href={buildGroupItemPath(item.groupSlug, child.slug)}
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
