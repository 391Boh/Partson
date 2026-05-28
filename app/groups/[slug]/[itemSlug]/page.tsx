import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { notFound, permanentRedirect } from "next/navigation";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import GroupItemProducerList from "app/components/GroupItemProducerList";
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
import SmartLink from "app/components/SmartLink";
import {
  getCatalogSeoFacetsWithTimeout,
  type SeoProducerFacet,
} from "app/lib/catalog-seo";
import {
  fetchCatalogProductsByQuery,
  type CatalogProduct,
} from "app/lib/catalog-server";
import {
  buildCatalogCategoryPath,
  buildCatalogProducerPath,
  buildGroupItemPath,
  buildManufacturerPath,
} from "app/lib/catalog-links";
import { resolveCatalogSeoFacetsWithFallback } from "app/lib/catalog-count-fallback";
import { getCategoryIconPath } from "app/lib/category-icons";
import { buildSeoGroupLookup, resolveGroupSeoCounts } from "app/lib/group-seo";
import { getAllProductSitemapEntries } from "app/lib/product-sitemap";
import { getProductTreeDataset } from "app/lib/product-tree";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { getGroupItemSeoCopy } from "app/lib/seo-copy";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { getSiteUrl } from "app/lib/site-url";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";

export const revalidate = 3600;
export const dynamicParams = true;
const GROUP_ITEM_STATIC_PARAMS_LIMIT_DEFAULT = Number.MAX_SAFE_INTEGER;
const GROUP_ITEM_STATIC_PARAMS_FALLBACK_TIMEOUT_MS = 4500;
const GROUP_ITEM_PAGE_SEO_FACETS_TIMEOUT_MS = 6000;
const GROUP_ITEM_PRODUCER_SPLIT_PAGE_SIZE = 220;
const GROUP_ITEM_PRODUCER_SPLIT_MAX_PAGES = 3;
const GROUP_ITEM_PRODUCER_SPLIT_TIMEOUT_MS = 2200;
const CATEGORY_TOP_PRODUCTS_LIMIT = 10;
const CATEGORY_TOP_PRODUCTS_TIMEOUT_MS = 1500;
const isProductionBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PRIVATE_BUILD_WORKER === "1" ||
  process.env.npm_lifecycle_event === "build";

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

type GroupItemProducerEntry = GroupItemPageData["producerSplit"][number];

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallbackValue;
  return Math.floor(numeric);
};

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const formatCount = (value: number) =>
  Number.isFinite(value) && value > 0 ? value.toLocaleString("uk-UA") : "0";

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

const buildProductDedupeKey = (item: CatalogProduct) => {
  const code = normalizeLookupKey(item.code);
  const article = normalizeLookupKey(item.article);
  const producer = normalizeLookupKey(item.producer);
  const name = normalizeLookupKey(item.name);

  if (code) return producer ? `code:${code}|producer:${producer}` : `code:${code}`;
  if (article) {
    return producer ? `article:${article}|producer:${producer}` : `article:${article}`;
  }
  if (name) return producer ? `name:${name}|producer:${producer}` : `name:${name}`;
  return "";
};

const buildGroupItemProducerSplit = (options: {
  producers: SeoProducerFacet[];
  groupLabel: string;
  itemLabels: string[];
}): GroupItemProducerEntry[] => {
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

const collectDirectGroupItemProducerSplitUncached = async (
  catalogGroupLabel: string,
  catalogSubcategoryLabel: string
): Promise<GroupItemProducerEntry[]> => {
    const normalizedGroup = normalizeValue(catalogGroupLabel);
    const normalizedSubcategory = normalizeValue(catalogSubcategoryLabel);
    if (!normalizedSubcategory) return [];

    const producerProducts = new Map<string, { label: string; productKeys: Set<string> }>();
    let cursor = "";
    let cursorField = "";

    for (let page = 1; page <= GROUP_ITEM_PRODUCER_SPLIT_MAX_PAGES; page += 1) {
      const result = await fetchCatalogProductsByQuery({
        page: cursor ? 1 : page,
        limit: GROUP_ITEM_PRODUCER_SPLIT_PAGE_SIZE,
        group: normalizedGroup || null,
        subcategory: normalizedSubcategory,
        cursor: cursor || undefined,
        cursorField: cursorField || undefined,
        sortOrder: "none",
        includePriceEnrichment: false,
        preferLegacySource: false,
        forceAllgoodsSource: true,
        timeoutMs: GROUP_ITEM_PRODUCER_SPLIT_TIMEOUT_MS,
        retries: 0,
        retryDelayMs: 100,
        cacheTtlMs: 1000 * 60 * 30,
      }).catch(() => ({
        items: [],
        hasMore: false,
        nextCursor: "",
        cursorField: "",
      }));

      for (const item of result.items) {
        const producerLabel = normalizeValue(item.producer);
        if (!producerLabel) continue;

        const productKey = buildProductDedupeKey(item);
        if (!productKey) continue;

        const producerKey = normalizeLookupKey(producerLabel);
        const entry =
          producerProducts.get(producerKey) ||
          {
            label: producerLabel,
            productKeys: new Set<string>(),
          };
        entry.productKeys.add(productKey);
        producerProducts.set(producerKey, entry);
      }

      const nextCursor = normalizeValue(result.nextCursor);
      if (!result.hasMore || !nextCursor || nextCursor === cursor) break;

      cursor = nextCursor;
      cursorField = normalizeValue(result.cursorField);
    }

    return Array.from(producerProducts.values())
      .map((entry) => ({
        label: entry.label,
        slug: buildPlainSeoSlug(entry.label),
        productCount: entry.productKeys.size,
        catalogPath: buildCatalogProducerPath(
          entry.label,
          normalizedGroup || undefined,
          normalizedSubcategory
        ),
        manufacturerPath: buildManufacturerPath(entry.label),
      }))
      .filter((entry) => entry.productCount > 0)
      .sort((left, right) => {
        if (right.productCount !== left.productCount) {
          return right.productCount - left.productCount;
        }
        return left.label.localeCompare(right.label, "uk", { sensitivity: "base" });
      });
};

const collectDirectGroupItemProducerSplitCached = unstable_cache(
  collectDirectGroupItemProducerSplitUncached,
  ["group-item:producer-split:v2"],
  { revalidate: 60 * 30 }
);

export const collectDirectGroupItemProducerSplit = cache(
  collectDirectGroupItemProducerSplitCached
);

const fetchCategoryTopProductsUncached = async (
  groupLabel: string,
  subcategoryLabel: string
): Promise<CatalogProduct[]> => {
  const normalizedGroup = normalizeValue(groupLabel);
  const normalizedSubcategory = normalizeValue(subcategoryLabel);
  if (!normalizedSubcategory) return [];

  const result = await fetchCatalogProductsByQuery({
    page: 1,
    limit: CATEGORY_TOP_PRODUCTS_LIMIT,
    group: normalizedGroup || null,
    subcategory: normalizedSubcategory,
    sortOrder: "none",
    includePriceEnrichment: false,
    preferLegacySource: false,
    forceAllgoodsSource: true,
    timeoutMs: 1400,
    retries: 0,
    retryDelayMs: 100,
    cacheTtlMs: 1000 * 60 * 30,
  }).catch(() => ({ items: [] as CatalogProduct[] }));

  return result.items.filter((item) => Boolean(item.code) && Boolean(item.name));
};

const getCategoryTopProductsCached = unstable_cache(
  fetchCategoryTopProductsUncached,
  ["group-item:top-products:v1"],
  { revalidate: 60 * 30 }
);

const getCategoryTopProducts = cache(getCategoryTopProductsCached);

const resolveGroupItemProducerSplit = async (options: {
  seoProducers: SeoProducerFacet[];
  seoGroupLabel: string;
  seoItemLabels: string[];
  catalogGroupLabel: string;
  catalogSubcategoryLabel: string;
}) => {
  const seoSplit = buildGroupItemProducerSplit({
    producers: options.seoProducers,
    groupLabel: options.seoGroupLabel,
    itemLabels: options.seoItemLabels,
  });
  if (seoSplit.length > 0) return seoSplit;
  if (isProductionBuildPhase) return seoSplit;

  const directSplit = await collectDirectGroupItemProducerSplit(
    options.catalogGroupLabel,
    options.catalogSubcategoryLabel
  ).catch(() => []);

  return directSplit.length > 0 ? directSplit : seoSplit;
};

const getGroupItemBySlugs = cache(
  async (groupSlug: string, itemSlug: string): Promise<GroupItemPageData | null> => {
    const dataset = await getProductTreeDataset().catch(() => null);
    const seoFacets = await resolveCatalogSeoFacetsWithFallback(
      await getCatalogSeoFacetsWithTimeout(GROUP_ITEM_PAGE_SEO_FACETS_TIMEOUT_MS),
      getAllProductSitemapEntries
    );
    const group = dataset?.groups.find(
      (entry) => entry.slug === groupSlug || entry.legacySlug === groupSlug
    );
    if (!group) {
      const groupRouteKeys = new Set([normalizeLookupKey(groupSlug)]);
      const itemRouteKeys = new Set([normalizeLookupKey(itemSlug)]);
      const seoGroup = seoFacets.groups.find((entry) =>
        facetMatches(entry, groupRouteKeys)
      );
      const seoSubgroup = seoGroup?.subgroups.find((entry) =>
        facetMatches(entry, itemRouteKeys)
      );
      if (!seoGroup || !seoSubgroup) return null;

      const producerSplit = await resolveGroupItemProducerSplit({
        seoProducers: seoFacets.producers,
        seoGroupLabel: seoGroup.label,
        seoItemLabels: [seoSubgroup.label],
        catalogGroupLabel: seoGroup.label,
        catalogSubcategoryLabel: seoSubgroup.label,
      });
      const producerProductCount = producerSplit.reduce(
        (sum, producer) => sum + producer.productCount,
        0
      );

      return {
        groupLabel: seoGroup.label,
        groupSlug: seoGroup.slug,
        groupLegacySlug: undefined,
        label: seoSubgroup.label,
        itemSlug: seoSubgroup.slug,
        parentSubgroupLabel: "",
        parentSubgroupSlug: undefined,
        productCount: Math.max(seoSubgroup.productCount, producerProductCount),
        producersCount: producerSplit.length,
        catalogPath: buildCatalogCategoryPath(seoGroup.label, seoSubgroup.label, {
          expandHierarchy: true,
        }),
        producerSplit,
        children: [],
      };
    }
    const counts = resolveGroupSeoCounts(group, buildSeoGroupLookup(seoFacets.groups));

    const subgroup = group.subgroups.find(
      (entry) => entry.slug === itemSlug || entry.legacySlug === itemSlug
    );
    if (subgroup) {
      const children = subgroup.children.map((child) => ({
        ...child,
        productCount: counts.childProductCounts.get(child.slug) ?? 0,
      }));
      const producerSplit = await resolveGroupItemProducerSplit({
        seoProducers: seoFacets.producers,
        seoGroupLabel: group.label,
        seoItemLabels: [subgroup.label, ...children.map((child) => child.label)],
        catalogGroupLabel: group.label,
        catalogSubcategoryLabel: subgroup.label,
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
        catalogPath: buildCatalogCategoryPath(group.label, subgroup.label, {
          expandHierarchy: true,
        }),
        producerSplit,
        children,
      };
    }

    for (const entry of group.subgroups) {
      const child = entry.children.find(
        (candidate) => candidate.slug === itemSlug || candidate.legacySlug === itemSlug
      );
      if (!child) continue;
      const producerSplit = await resolveGroupItemProducerSplit({
        seoProducers: seoFacets.producers,
        seoGroupLabel: group.label,
        seoItemLabels: [child.label],
        catalogGroupLabel: entry.label,
        catalogSubcategoryLabel: child.label,
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
        catalogPath: buildCatalogCategoryPath(entry.label, child.label, {
          expandHierarchy: true,
        }),
        producerSplit,
        children: [],
      };
    }

    const groupKeys = new Set([
      ...buildFacetLookupKeys(group.label),
      normalizeLookupKey(group.slug),
      normalizeLookupKey(group.legacySlug),
    ]);
    const itemRouteKeys = new Set([normalizeLookupKey(itemSlug)]);
    const seoGroup = seoFacets.groups.find((entry) =>
      facetMatches(entry, groupKeys)
    );
    const seoSubgroup = seoGroup?.subgroups.find((entry) =>
      facetMatches(entry, itemRouteKeys)
    );
    if (!seoGroup || !seoSubgroup) return null;

    const producerSplit = await resolveGroupItemProducerSplit({
      seoProducers: seoFacets.producers,
      seoGroupLabel: seoGroup.label,
      seoItemLabels: [seoSubgroup.label],
      catalogGroupLabel: seoGroup.label,
      catalogSubcategoryLabel: seoSubgroup.label,
    });
    const producerProductCount = producerSplit.reduce(
      (sum, producer) => sum + producer.productCount,
      0
    );

    return {
      groupLabel: seoGroup.label,
      groupSlug: group.slug,
      groupLegacySlug: group.legacySlug,
      label: seoSubgroup.label,
      itemSlug: seoSubgroup.slug,
      parentSubgroupLabel: "",
      parentSubgroupSlug: undefined,
      productCount: Math.max(seoSubgroup.productCount, producerProductCount),
      producersCount: producerSplit.length,
      catalogPath: buildCatalogCategoryPath(seoGroup.label, seoSubgroup.label, {
        expandHierarchy: true,
      }),
      producerSplit,
      children: [],
    };
  }
);

const buildGroupItemDescription = (item: GroupItemPageData) => {
  const visibleLabel = buildVisibleProductName(item.label);
  const visibleGroupLabel = buildVisibleProductName(item.groupLabel);
  const visibleParentLabel = buildVisibleProductName(item.parentSubgroupLabel);
  const productCountLabel =
    item.productCount > 0
      ? `${item.productCount.toLocaleString("uk-UA")} товарів`
      : "актуальні товари";
  const producersLabel =
    item.producersCount > 0
      ? `${item.producersCount.toLocaleString("uk-UA")} виробників`
      : "бренди й аналоги";

  if (item.parentSubgroupLabel) {
    return `Купити ${visibleLabel} у PartsON: ${productCountLabel}, ${producersLabel}, група ${visibleGroupLabel}${visibleParentLabel ? `, підгрупа ${visibleParentLabel}` : ""}. Підбір за артикулом і доставка по Україні.`;
  }

  return `Купити автозапчастини ${visibleLabel} у групі ${visibleGroupLabel}: ${productCountLabel}, ${producersLabel}, підбір за назвою, кодом і VIN, самовивіз у Львові та доставка по Україні.`;
};

const buildGroupPagePath = (groupSlug: string) => `/groups/${encodeURIComponent(groupSlug)}`;

const dedupeGroupItemStaticParams = (
  params: Array<{ slug: string; itemSlug: string }>
) => {
  const seen = new Set<string>();
  return params.filter((entry) => {
    const key = `${entry.slug}/${entry.itemSlug}`;
    if (!entry.slug || !entry.itemSlug || seen.has(key)) return false;
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

const buildGroupItemTitle = (item: GroupItemPageData) => {
  const visibleLabel = buildVisibleProductName(item.label);
  const visibleGroupLabel = buildVisibleProductName(item.groupLabel);

  return item.parentSubgroupLabel
    ? `${visibleLabel} - купити автозапчастини | ${visibleGroupLabel}`
    : `${visibleLabel} - купити запчастини | ${visibleGroupLabel}`;
};

const buildChildCategoryLead = (options: {
  groupLabel: string;
  parentLabel: string;
  label: string;
  productCount: number;
}) => {
  const visibleLabel = buildVisibleProductName(options.label);
  const visibleParentLabel = buildVisibleProductName(options.parentLabel);
  const visibleGroupLabel = buildVisibleProductName(options.groupLabel);
  const productCountLabel =
    options.productCount > 0
      ? `${options.productCount.toLocaleString("uk-UA")} товарів`
      : "товари каталогу";

  return `Категорія ${visibleLabel} у підгрупі ${visibleParentLabel} групи ${visibleGroupLabel} відкриває ${productCountLabel} і веде до точнішого підбору автозапчастин за брендом, назвою або артикулом.`;
};

export async function generateStaticParams() {
  const limit = parsePositiveInt(
    process.env.SEO_GROUP_ITEM_STATIC_PARAMS_LIMIT,
    GROUP_ITEM_STATIC_PARAMS_LIMIT_DEFAULT
  );
  if (limit <= 0) return [];

  const dataset = await getProductTreeDataset().catch(() => null);
  const treeParams = dedupeGroupItemStaticParams(
    dataset?.groups.flatMap((group) => {
      const groupSlugs = isProductionBuildPhase
        ? buildStaticSlugCandidates(group.slug)
        : buildStaticSlugCandidates(
            group.slug,
            group.legacySlug,
            buildPlainSeoSlug(group.label)
          );

      return group.subgroups.flatMap((subgroup) => {
        const subgroupSlugs = isProductionBuildPhase
          ? buildStaticSlugCandidates(subgroup.slug)
          : buildStaticSlugCandidates(
              subgroup.slug,
              subgroup.legacySlug,
              buildPlainSeoSlug(subgroup.label)
            );
        const childParams = subgroup.children.flatMap((child) => {
          const childSlugs = isProductionBuildPhase
            ? buildStaticSlugCandidates(child.slug)
            : buildStaticSlugCandidates(
                child.slug,
                child.legacySlug,
                buildPlainSeoSlug(child.label)
              );

          return groupSlugs.flatMap((slug) =>
            childSlugs.map((itemSlug) => ({ slug, itemSlug }))
          );
        });

        return [
          ...groupSlugs.flatMap((slug) =>
            subgroupSlugs.map((itemSlug) => ({ slug, itemSlug }))
          ),
          ...childParams,
        ];
      });
    }) ?? []
  );
  if (treeParams.length > 0) {
    return treeParams.slice(0, limit);
  }

  try {
    const seoFacets = await getCatalogSeoFacetsWithTimeout(
      GROUP_ITEM_STATIC_PARAMS_FALLBACK_TIMEOUT_MS
    );
    return dedupeGroupItemStaticParams(
      seoFacets.groups.flatMap((group) =>
        (Array.isArray(group.subgroups) ? group.subgroups : []).flatMap((subgroup) => [
          {
            slug: group.slug,
            itemSlug: subgroup.slug,
          },
          {
            slug: buildPlainSeoSlug(group.label),
            itemSlug: buildPlainSeoSlug(subgroup.label),
          },
        ])
      )
    )
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

  // Effective catalog group filter: for child items use the parent subgroup label,
  // for top-level subgroup items use the group label.
  const catalogGroupLabel = item.parentSubgroupLabel || item.groupLabel;
  const topProducts = isProductionBuildPhase
    ? ([] as CatalogProduct[])
    : await resolveWithTimeout(
        () => getCategoryTopProducts(catalogGroupLabel, item.label),
        [] as CatalogProduct[],
        CATEGORY_TOP_PRODUCTS_TIMEOUT_MS
      );
  const visibleProducts = topProducts.filter((p) => Boolean(p.code) && Boolean(p.name));

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
    ? `Кінцева категорія ${visibleLabel} у підгрупі ${visibleParentLabel} групи ${visibleGroupLabel}. Тут можна перейти до товарів, брендів, аналогів і перевірити наявність у каталозі.`
    : `Підгрупа ${visibleLabel} у групі ${visibleGroupLabel} з прямим переходом до товарів, виробників і суміжних категорій автозапчастин.`;
  const producerProductsTotal = item.producerSplit.reduce(
    (sum, producer) => sum + producer.productCount,
    0
  );
  const topProducerSplit = item.producerSplit.slice(0, 24);
  const seoCopy = getGroupItemSeoCopy({
    label: item.label,
    groupLabel: item.groupLabel,
    parentSubgroupLabel: item.parentSubgroupLabel,
    productCount: item.productCount,
    producersCount: item.producersCount,
    childrenCount: item.children.length,
  });

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

  const productItemListJsonLd = visibleProducts.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "@id": `${canonicalPageUrl}#product-list`,
        name: `Популярні товари: ${visibleLabel}`,
        numberOfItems: visibleProducts.length,
        itemListElement: visibleProducts.map((product, index) => {
          const productPath = buildProductPath({
            code: product.code,
            article: product.article,
            name: product.name,
            producer: product.producer,
            group: product.group,
            subGroup: product.subGroup,
            category: product.category,
          });
          return {
            "@type": "ListItem",
            position: index + 1,
            url: `${siteUrl}${productPath}`,
            item: {
              "@type": "Product",
              name: buildVisibleProductName(product.name),
              sku: product.article || undefined,
              mpn: product.code || undefined,
              brand: product.producer
                ? { "@type": "Brand", name: product.producer }
                : undefined,
            },
          };
        }),
      }
    : null;

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
    <main className="page-shell-inline py-6 sm:py-8">
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
        className="mt-3 inline-flex text-sm font-semibold text-teal-800 hover:text-teal-900"
      >
        &larr; До групи {visibleGroupLabel}
      </Link>

      <section className={`mt-4 ${directoryHeroClass}`}>
        <div className="flex items-start gap-4">
          <div className={directoryIconTileClass}>
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
              <span className="inline-flex rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800">
                {item.parentSubgroupLabel ? "Кінцева категорія" : "Підгрупа"}
              </span>
              <span className={directoryCompactMetricClass}>
                {item.parentSubgroupLabel
                  ? `Підгрупа ${visibleParentLabel}`
                  : `Група ${visibleGroupLabel}`}
              </span>
              <span className={directoryCompactMetricAccentClass}>
                Пошук за брендом, артикулом і назвою
              </span>
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
                className={directorySecondaryButtonClass}
              >
                До групи {visibleGroupLabel}
              </SmartLink>
            </div>
          </div>
        </div>
      </section>

      <section className={`${directoryPanelClass} mt-6`}>
        <div className={directoryHeaderClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800">
                Опис категорії
              </p>
              <h2 className="font-display mt-1 text-xl font-[780] tracking-normal text-slate-950 sm:text-2xl">
                {visibleLabel} в каталозі PartsON
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {seoCopy.intro}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className={directoryCompactMetricClass}>
                Категорія з SEO-описом і переходом у каталог
              </span>
              <span className={directoryCompactMetricAccentClass}>
                Виробники, бренди та аналоги
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
              {seoCopy.highlightsTitle}
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
                На сторінці зібрані бренди, які реально зустрічаються в цій категорії. Це дає змогу перейти або на сторінку виробника, або одразу у вже відфільтрований каталог потрібного бренду.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className={directoryCompactMetricAccentClass}>
                <span>{item.producersCount.toLocaleString("uk-UA")}</span>
                <span className="font-semibold text-teal-700">виробників</span>
              </span>
              <span className={directoryCompactMetricClass}>
                <span>{(producerProductsTotal || item.productCount).toLocaleString("uk-UA")}</span>
                <span className="font-semibold text-slate-500">товарів</span>
              </span>
            </div>
          </div>
        </div>

        <GroupItemProducerList
          initialItems={topProducerSplit}
          groupLabel={item.groupLabel}
          catalogGroupLabel={catalogGroupLabel}
          categoryLabel={item.label}
          catalogPath={item.catalogPath}
        />
      </section>

      {item.children.length > 0 ? (
        <section className={`${directoryPanelClass} mt-6`}>
          <div className={directoryHeaderClass}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-800">
                  Навігація
                </p>
                <h2 className="mt-1 text-lg font-extrabold tracking-normal text-slate-950">
                  Кінцеві підкатегорії
                </h2>
              </div>
              <span className={directoryCompactMetricAccentClass}>
                {formatCount(item.children.length)} категорій
              </span>
            </div>
          </div>
          <ul className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-2 sm:p-4">
            {item.children.map((child) => (
              <li key={child.slug}>
                <CatalogPrefetchLink
                  href={buildGroupItemPath(item.groupSlug, child.slug)}
                  className={`${directoryListCardClass} flex items-start justify-between gap-3 px-3 py-2.5 text-sm text-slate-700`}
                >
                  <div className="min-w-0">
                    <span className="block font-semibold leading-snug">
                      {buildVisibleProductName(child.label)}
                    </span>
                    <span className="mt-1 block text-[13px] leading-5 text-slate-500">
                      {buildChildCategoryLead({
                        groupLabel: item.groupLabel,
                        parentLabel: item.label,
                        label: child.label,
                        productCount: child.productCount,
                      })}
                    </span>
                  </div>
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
        </section>
      ) : null}

      {visibleProducts.length > 0 && (
        <section className={`${directoryPanelClass} mt-6`}>
          <div className={directoryHeaderClass}>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800">
              Товари категорії
            </p>
            <h2 className="font-display mt-1 text-xl font-[780] tracking-normal text-slate-950 sm:text-2xl">
              Популярні товари: {visibleLabel}
            </h2>
          </div>
          <ul className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 sm:p-4">
            {visibleProducts.map((product) => {
              const productPath = buildProductPath({
                code: product.code,
                article: product.article,
                name: product.name,
                producer: product.producer,
                group: product.group,
                subGroup: product.subGroup,
                category: product.category,
              });
              return (
                <li key={product.code}>
                  <Link
                    href={productPath}
                    className={`${directoryListCardClass} flex flex-col gap-0.5 px-3 py-2.5`}
                  >
                    <span className="text-sm font-semibold leading-snug text-slate-800">
                      {buildVisibleProductName(product.name)}
                    </span>
                    <span className="text-xs leading-snug text-slate-500">
                      {[product.producer, product.article].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
      {productItemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productItemListJsonLd) }}
        />
      )}
    </main>
  );
}
