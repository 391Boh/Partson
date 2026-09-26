import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { notFound, permanentRedirect } from "next/navigation";
import { CarFront, Factory, PackageSearch } from "lucide-react";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import CatalogSeoTextSection from "app/components/CatalogSeoTextSection";
import GroupItemProducerList from "app/components/GroupItemProducerList";
// Despite the name, this is a plain "grid of ProductCards for a product
// list" component with no manufacturer-specific logic (see its own props:
// products/images/euroRate) — reused here instead of duplicating its
// cart/price/image wiring for what was previously a bare text-only list.
import ManufacturerCatalogProducts from "app/manufacturers/[slug]/ManufacturerCatalogProducts";
import {
  directoryCompactMetricAccentClass,
  directoryCompactMetricClass,
  directoryHeaderClass,
  directoryListCardClass,
  directoryPanelClass,
  directoryPrimaryButtonClass,
} from "app/components/catalog-directory-styles";
import SmartLink from "app/components/SmartLink";
import {
  EMPTY_CATALOG_SEO_FACETS,
  getCatalogSeoFacetsWithTimeout,
  type SeoProducerFacet,
} from "app/lib/catalog-seo";
import {
  fetchCatalogProductsByQuery,
  fetchEuroRate,
  toPriceUah,
  type CatalogProduct,
} from "app/lib/catalog-server";
import {
  buildCatalogCategoryPath,
  buildCatalogProducerPath,
  buildGroupItemPath,
  buildManufacturerPath,
} from "app/lib/catalog-links";
import { resolveCatalogSeoFacetsWithFallback } from "app/lib/catalog-count-fallback";
import { getBrandLogoMap, getProducerInitials, resolveProducerLogo } from "app/lib/brand-logo";
import { producerDescriptions } from "app/lib/producer-descriptions";
import { getCategoryIconPath } from "app/lib/category-icons";
import { pluralizeCategories, pluralizeManufacturers, pluralizeProducts } from "app/lib/pluralize-uk";
import { buildSeoGroupLookup, resolveGroupSeoCounts } from "app/lib/group-seo";
import { getGroupProductPreview } from "app/lib/group-product-image";
import { getAllProductSitemapEntries } from "app/lib/product-sitemap";
import { getProductTreeDataset } from "app/lib/product-tree";
import { buildProductSeoImagePath } from "app/lib/product-image-path";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { getGroupItemSeoCopy } from "app/lib/seo-copy";
import { appendSeoContactLast, buildAdaptiveSeoTitle, buildPageMetadata } from "app/lib/seo-metadata";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";

export const revalidate = 3600;
export const dynamicParams = true;
// Default covers the real subgroup/leaf page count (151, see .env.example)
// plus headroom, so every group-item page in the sitemap pre-renders at
// build by default.
const GROUP_ITEM_STATIC_PARAMS_LIMIT_DEFAULT = 200;
const GROUP_ITEM_STATIC_PARAMS_FALLBACK_TIMEOUT_MS = 4500;
const GROUP_ITEM_PAGE_SEO_FACETS_TIMEOUT_MS = 400;
const GROUP_ITEM_PRODUCER_SPLIT_PAGE_SIZE = 220;
const GROUP_ITEM_PRODUCER_SPLIT_MAX_PAGES = 2;
const GROUP_ITEM_PRODUCER_SPLIT_TIMEOUT_MS = 700;
const CATEGORY_TOP_PRODUCTS_LIMIT = 10;
const CATEGORY_TOP_PRODUCTS_TIMEOUT_MS = 500;
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
    logoPath?: string | null;
    initials?: string;
    description?: string | null;
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
  if (!Number.isFinite(numeric) || numeric < 0) return fallbackValue;
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
  // True 1C "Категорія" — needed separately from groupLabel (Група tier,
  // used for facet matching) because a direct-group match still has to link
  // into the catalog as (group=Категорія, subcategory=Група): 1C's exact-
  // match filters expect that pairing for a "promoted" 2-tier item, not
  // (group=Група) alone — see the analogous comment in
  // resolveGroupFilterParams (app/lib/auto-directory-data.ts).
  categoryLabel: string;
  groupLabel: string;
  itemLabels: string[];
}): GroupItemProducerEntry[] => {
  const groupKeys = new Set(buildFacetLookupKeys(options.groupLabel));
  const itemKeys = new Set(options.itemLabels.flatMap((label) => buildFacetLookupKeys(label)));
  if (itemKeys.size === 0) return [];

  return options.producers
    .map((producer) => {
      // The same leaf category can land at different tiers per producer in
      // 1C's own data — some producers report it as their own top-level
      // Група directly (2-tier item, no real subdivision below it), others
      // nest it as a Підгруппа under a different parent Група (3-tier item).
      // Try the direct-group match first (cheaper, and the common case for
      // producers with sparse categorization), then fall back to searching
      // inside the matched parent group's own subgroups.
      const directGroup = (producer.topGroups ?? []).find((group) =>
        facetMatches(group, itemKeys)
      );
      if (directGroup) {
        const value = Number(directGroup.productCount);
        const productCount = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
        if (productCount <= 0) return null;

        return {
          label: producer.label,
          slug: producer.slug,
          productCount,
          catalogPath: buildCatalogProducerPath(
            producer.label,
            options.categoryLabel,
            directGroup.label,
            { expandHierarchy: true }
          ),
          manufacturerPath: buildManufacturerPath(producer.slug || producer.label),
        };
      }

      if (groupKeys.size === 0) return null;

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
          options.itemLabels[0],
          { expandHierarchy: true }
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
        expandHierarchy: true,
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
          normalizedSubcategory,
          { expandHierarchy: true }
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
  ["group-item:producer-split:v3"],
  { revalidate: 60 * 30 }
);

const collectDirectGroupItemProducerSplit = cache(
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
    expandHierarchy: true,
    timeoutMs: 1400,
    retries: 0,
    retryDelayMs: 100,
    cacheTtlMs: 1000 * 60 * 30,
  }).catch(() => ({ items: [] as CatalogProduct[] }));

  return result.items.filter((item) => Boolean(item.code) && Boolean(item.name));
};

const getCategoryTopProductsCached = unstable_cache(
  fetchCategoryTopProductsUncached,
  ["group-item:top-products:v2"],
  { revalidate: 60 * 30 }
);

const getCategoryTopProducts = cache(getCategoryTopProductsCached);

const resolveGroupItemProducerSplit = async (options: {
  seoProducers: SeoProducerFacet[];
  // True 1C "Категорія" — see the comment on buildGroupItemProducerSplit's
  // categoryLabel field. Usually equal to catalogGroupLabel below, except
  // when catalogGroupLabel is itself a Група (the "child under a subgroup"
  // call site, where the live-query pairing needs Група+Підгруппа but a
  // producer-side promoted match still needs the real Категорія).
  categoryLabel: string;
  seoGroupLabel: string;
  seoItemLabels: string[];
  catalogGroupLabel: string;
  catalogSubcategoryLabel: string;
}) => {
  const seoSplit = buildGroupItemProducerSplit({
    producers: options.seoProducers,
    categoryLabel: options.categoryLabel,
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
    const [dataset, rawGroupSeoFacets] = await Promise.all([
      getProductTreeDataset().catch(() => null),
      getCatalogSeoFacetsWithTimeout(GROUP_ITEM_PAGE_SEO_FACETS_TIMEOUT_MS).catch(
        () => EMPTY_CATALOG_SEO_FACETS
      ),
    ]);
    const seoFacets = await resolveCatalogSeoFacetsWithFallback(
      rawGroupSeoFacets,
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
        categoryLabel: seoGroup.label,
        // producer.topGroups is keyed by the Група tier (seoSubgroup here),
        // not the Категорія tier (seoGroup) — matching seoGroup.label above
        // meant this never found a producer (see the analogous fix on
        // /groups/[slug]/page.tsx's resolveTopProducers).
        seoGroupLabel: seoSubgroup.label,
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
        categoryLabel: group.label,
        // producer.topGroups is keyed by the Група tier (subgroup here), not
        // the Категорія tier (group) — see the analogous fix on
        // /groups/[slug]/page.tsx's resolveTopProducers.
        seoGroupLabel: subgroup.label,
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
        // group (the true Категорія) here, NOT entry — entry is the Група
        // and is correct as catalogGroupLabel below (paired with child.label
        // for the live Група+Підгруппа query), but a direct-group match on
        // the producer side still needs the real Категорія to link into the
        // catalog correctly (see buildGroupItemProducerSplit's comment).
        categoryLabel: group.label,
        // Same Група-tier fix as above — entry is the Група containing this
        // Підгруппа-level child, group is still the Категорія.
        seoGroupLabel: entry.label,
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
      categoryLabel: seoGroup.label,
      // Same Група-tier fix as above.
      seoGroupLabel: seoSubgroup.label,
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
      ? `${item.productCount.toLocaleString("uk-UA")} ${pluralizeProducts(item.productCount)}`
      : "актуальні товари";
  const producersLabel =
    item.producersCount > 0
      ? `${item.producersCount.toLocaleString("uk-UA")} ${pluralizeManufacturers(item.producersCount)}`
      : "бренди й аналоги";

  if (item.parentSubgroupLabel) {
    return appendSeoContactLast(
      `${visibleLabel} у PartsON: ${productCountLabel}, ${producersLabel}, група ${visibleGroupLabel}${visibleParentLabel ? `, підгрупа ${visibleParentLabel}` : ""}. Підбір за артикулом, VIN і доставка по Україні.`
    );
  }

  return appendSeoContactLast(
    `Автозапчастини ${visibleLabel} у групі ${visibleGroupLabel}: ${productCountLabel}, ${producersLabel}, підбір за назвою, кодом і VIN, самовивіз у Львові та доставка по Україні.`
  );
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

// Some category labels run long even after buildVisibleProductName strips
// the parenthetical alt-name — buildAdaptiveSeoTitle drops the decorative
// suffix rather than risk a Google-truncated title once the layout's
// " | PartsON" template is added.
const buildGroupItemTitle = (item: GroupItemPageData) => {
  const visibleLabel = buildVisibleProductName(item.label);
  const visibleContext = buildVisibleProductName(
    item.parentSubgroupLabel || item.groupLabel
  );
  const hasDistinctContext =
    visibleContext.toLocaleLowerCase("uk-UA") !==
    visibleLabel.toLocaleLowerCase("uk-UA");

  if (hasDistinctContext) {
    const contextualTitle = buildAdaptiveSeoTitle(
      visibleLabel,
      ` — ${visibleContext}`
    );
    if (contextualTitle !== visibleLabel) return contextualTitle;
  }

  return buildAdaptiveSeoTitle(visibleLabel, " — купити запчастини");
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
      ? `${options.productCount.toLocaleString("uk-UA")} ${pluralizeProducts(options.productCount)}`
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
  const treeParams =
    dataset?.groups.flatMap((group) => {
      const groupSlugs = buildStaticSlugCandidates(
        group.slug,
        group.legacySlug,
        buildPlainSeoSlug(group.label)
      );

      return group.subgroups.flatMap((subgroup) => {
        const subgroupSlugs = buildStaticSlugCandidates(
          subgroup.slug,
          subgroup.legacySlug,
          buildPlainSeoSlug(subgroup.label)
        );
        const childParams = subgroup.children.flatMap((child) => {
          const childSlugs = buildStaticSlugCandidates(
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
    }) ?? [];

  try {
    const seoFacets = await getCatalogSeoFacetsWithTimeout(
      GROUP_ITEM_STATIC_PARAMS_FALLBACK_TIMEOUT_MS
    );
    return dedupeGroupItemStaticParams(
      [
        ...treeParams,
        ...seoFacets.groups.flatMap((group) =>
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
        ),
      ]
    ).slice(0, limit);
  } catch {
    return dedupeGroupItemStaticParams(treeParams).slice(0, limit);
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
  const productPreview = getGroupProductPreview({
    categoryLabel: item.groupLabel,
    parentLabel: item.parentSubgroupLabel || item.groupLabel,
    itemLabel: item.label,
  });

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
      url: productPreview?.url || categoryIconPath,
      width: productPreview?.width ?? 512,
      height: productPreview?.height ?? 512,
      alt:
        productPreview?.alt ||
        `Категорія автозапчастин «${buildVisibleProductName(item.label)}»`,
    },
    // Use the parent category icon when this group has no product preview and
    // keep the landing page available for search and navigation.
    index: true,
    follow: true,
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
  // Kicked off now and awaited near its first use below (brandLogoMap) — it
  // has no dependency on topProducts/euroRate, so it can run alongside them
  // instead of waiting for that chain plus all the sync work in between.
  const brandLogoMapPromise = getBrandLogoMap().catch(() => new Map<string, string>());
  const topProducts = isProductionBuildPhase
    ? ([] as CatalogProduct[])
    : await resolveWithTimeout(
        () => getCategoryTopProducts(catalogGroupLabel, item.label),
        [] as CatalogProduct[],
        CATEGORY_TOP_PRODUCTS_TIMEOUT_MS
      );
  const visibleProducts = topProducts.filter((p) => Boolean(p.code) && Boolean(p.name));
  const euroRate = visibleProducts.some(
    (product) => typeof product.priceEuro === "number" && product.priceEuro > 0
  )
    ? await resolveWithTimeout(() => fetchEuroRate(), null, 500).catch(() => null)
    : null;

  const siteUrl = getSiteUrl();
  const pagePath = buildGroupItemPath(item.groupSlug, item.itemSlug);
  const groupPagePath = buildGroupPagePath(item.groupSlug);
  const canonicalPageUrl = `${siteUrl}${pagePath}`;
  const categoryIconPath = getCategoryIconPath(item.groupLabel);
  const productPreview = getGroupProductPreview({
    categoryLabel: item.groupLabel,
    parentLabel: item.parentSubgroupLabel || item.groupLabel,
    itemLabel: item.label,
  });
  const primaryImagePath = productPreview?.url || categoryIconPath;
  const primaryImageUrl = `${siteUrl}${primaryImagePath}`;
  const visibleLabel = buildVisibleProductName(item.label);
  const visibleGroupLabel = buildVisibleProductName(item.groupLabel);
  const visibleParentLabel = buildVisibleProductName(item.parentSubgroupLabel);
  const primaryImageAlt =
    productPreview?.alt || `Категорія автозапчастин «${visibleLabel}»`;
  const pageDescription = item.parentSubgroupLabel
    ? `Кінцева категорія ${visibleLabel} у підгрупі ${visibleParentLabel} групи ${visibleGroupLabel}. Тут можна перейти до товарів, брендів, аналогів і перевірити наявність у каталозі.`
    : `Підгрупа ${visibleLabel} у групі ${visibleGroupLabel} з прямим переходом до товарів, виробників і суміжних категорій автозапчастин.`;
  const producerProductsTotal = item.producerSplit.reduce(
    (sum, producer) => sum + producer.productCount,
    0
  );
  const brandLogoMap = await brandLogoMapPromise;
  const topProducerSplit = item.producerSplit.slice(0, 24).map((producer) => ({
    ...producer,
    logoPath: producer.logoPath ?? resolveProducerLogo(producer.label, brandLogoMap),
    initials: producer.initials ?? getProducerInitials(producer.label),
    description: producer.description ?? producerDescriptions[producer.label] ?? null,
  }));
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
    image: {
      "@type": "ImageObject",
      url: primaryImageUrl,
      contentUrl: primaryImageUrl,
      width: productPreview?.width ?? 512,
      height: productPreview?.height ?? 512,
      caption: primaryImageAlt,
    },
    inLanguage: "uk-UA",
    about: [
      { "@type": "Thing", name: item.groupLabel },
      { "@type": "Thing", name: item.label },
    ],
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: primaryImageUrl,
      contentUrl: primaryImageUrl,
      width: productPreview?.width ?? 512,
      height: productPreview?.height ?? 512,
      caption: primaryImageAlt,
    },
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
  };

  // Google requires an `offers` (or review/aggregateRating) block on Product
  // structured data — products with no resolved price can't satisfy that, so
  // they're excluded here even though they still render in the visible list below.
  const pricedSchemaProducts = visibleProducts.filter(
    (product) => typeof product.priceEuro === "number" && product.priceEuro > 0
  );

  const hasValidEuroRate =
    typeof euroRate === "number" && Number.isFinite(euroRate) && euroRate > 0;
  const productItemListJsonLd = pricedSchemaProducts.length > 0 && hasValidEuroRate
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "@id": `${canonicalPageUrl}#product-list`,
        name: `Популярні товари: ${visibleLabel}`,
        numberOfItems: pricedSchemaProducts.length,
        itemListElement: pricedSchemaProducts.map((product, index) => {
          const productPath = buildProductPath({
            code: product.code,
            article: product.article,
            name: product.name,
            producer: product.producer,
            group: product.group,
            subGroup: product.subGroup,
            category: product.category,
          });
          const url = `${siteUrl}${productPath}`;
          const imagePath = product.hasPhoto === true
            ? buildProductSeoImagePath(product.code, product.article)
            : "";

          return {
            "@type": "ListItem",
            position: index + 1,
            url,
            item: {
              "@type": "Product",
              name: buildVisibleProductName(product.name),
              sku: product.article || undefined,
              mpn: product.code || undefined,
              image: imagePath ? `${siteUrl}${imagePath}` : undefined,
              brand: product.producer
                ? { "@type": "Brand", name: product.producer }
                : undefined,
              url,
              offers: {
                "@type": "Offer",
                priceCurrency: "UAH",
                price: toPriceUah(product.priceEuro as number, euroRate),
                availability:
                  product.quantity > 0
                    ? "https://schema.org/InStock"
                    : "https://schema.org/OutOfStock",
                itemCondition: "https://schema.org/NewCondition",
                url,
              },
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
    <main className="catalog-directory-page page-shell-inline py-5 sm:py-7">
      <div key={`${item.groupSlug}/${item.itemSlug}`} className="space-y-4 sm:space-y-5 animate-fadeIn">
        <section className="card-metal relative overflow-hidden rounded-[30px] border border-white/90 bg-[radial-gradient(circle_at_4%_0%,rgba(20,184,166,0.14),transparent_35%),radial-gradient(circle_at_96%_4%,rgba(14,165,233,0.13),transparent_38%),linear-gradient(138deg,rgba(255,255,255,0.99)_0%,rgba(247,251,254,0.97)_56%,rgba(241,249,247,0.94)_100%)] p-4 shadow-[0_30px_72px_rgba(15,23,42,0.10),0_8px_26px_rgba(13,148,136,0.06)] ring-1 ring-slate-200/60 sm:p-5 lg:p-6">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-10 bg-gradient-to-r from-transparent via-teal-300/45 to-transparent blur-xl" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/80 to-transparent" />

          <div className="relative z-[1] mb-4 flex flex-wrap items-center justify-between gap-3">
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
                  <Link href={groupPagePath} className="transition hover:text-slate-800">{visibleGroupLabel}</Link>
                </li>
                <li className="inline-flex items-center gap-2">
                  <span aria-hidden="true">/</span>
                  <span className="text-slate-700">{visibleLabel}</span>
                </li>
              </ol>
            </nav>

            <SmartLink
              href={groupPagePath}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-sky-200 hover:bg-white hover:text-sky-800"
            >
              &larr; До групи {visibleGroupLabel}
            </SmartLink>
          </div>

          <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <div className="flex h-24 w-36 items-center justify-center overflow-hidden rounded-[24px] border border-white/90 bg-white/86 p-2 shadow-[0_18px_42px_rgba(15,23,42,0.09),0_0_0_6px_rgba(20,184,166,0.06)] ring-1 ring-teal-100/80 sm:h-28 sm:w-44 sm:p-3">
                <Image
                  src={primaryImagePath}
                  alt={primaryImageAlt}
                  width={productPreview?.width ?? 48}
                  height={productPreview?.height ?? 48}
                  sizes="(min-width: 640px) 176px, 144px"
                  className="h-full w-full object-contain"
                  unoptimized={Boolean(productPreview)}
                  priority
                />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="directory-kicker inline-flex rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] uppercase text-teal-800">
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

                <h1 className="directory-heading-hero mt-3 text-[2rem] leading-[1.1] text-slate-950 sm:text-[2.45rem]">
                  {visibleLabel}
                </h1>
                <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600 sm:text-[15px]">
                  {pageDescription}
                </p>

                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-col gap-2 sm:flex-row">
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
            </div>

            <aside className="grid gap-2.5 rounded-[24px] border border-white/85 bg-white/78 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.08)] ring-1 ring-teal-100/70 sm:grid-cols-2 xl:grid-cols-1">
              {[
                { label: "товарів", value: item.productCount.toLocaleString("uk-UA"), from: "from-teal-500", to: "to-cyan-500" },
                { label: "виробників", value: item.producersCount.toLocaleString("uk-UA"), from: "from-cyan-500", to: "to-sky-500" },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="group/stat relative overflow-hidden rounded-[18px] border border-slate-200/75 bg-[radial-gradient(circle_at_100%_0%,rgba(186,230,253,0.18),transparent_42%),linear-gradient(145deg,rgba(255,255,255,0.99),rgba(247,250,253,0.96))] px-3.5 py-3 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(13,148,136,0.12)]"
                >
                  <span className={`absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r ${metric.from} ${metric.to} opacity-70 transition-opacity duration-300 group-hover/stat:opacity-100`} />
                  <span className={`directory-counter block bg-gradient-to-br ${metric.from} ${metric.to} bg-clip-text text-2xl leading-none text-transparent`}>
                    {metric.value}
                  </span>
                  <span className="mt-1.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
                    {metric.label}
                  </span>
                </div>
              ))}
            </aside>
          </div>
        </section>
      </div>

      <CatalogSeoTextSection
        contained={false}
        badge={item.parentSubgroupLabel ? "Кінцева категорія" : "Підгрупа товарів"}
        title={`${visibleLabel}: товари, виробники та підбір`}
        lead={seoCopy.intro}
        topics={[
          {
            title: "Товари категорії",
            text: `У каталозі для цієї категорії зібрано ${item.productCount.toLocaleString("uk-UA")} ${pluralizeProducts(item.productCount)} із цінами та актуальними характеристиками.`,
            icon: PackageSearch,
          },
          {
            title: "Виробники й аналоги",
            text: `Порівнюйте пропозиції ${item.producersCount.toLocaleString("uk-UA")} ${pluralizeManufacturers(item.producersCount)} і переходьте одразу до відфільтрованого асортименту.`,
            icon: Factory,
          },
          {
            title: "Перевірка сумісності",
            text: "Перед замовленням звірте артикул і параметри деталі; для точного результату скористайтеся підбором за авто або VIN.",
            icon: CarFront,
          },
        ]}
        paragraphs={seoCopy.paragraphs}
        links={[
          { href: item.catalogPath, label: `Товари ${visibleLabel}` },
          { href: groupPagePath, label: `Група ${visibleGroupLabel}` },
          { href: "/auto", label: "Підбір за авто" },
        ]}
      />

      <section className={`${directoryPanelClass} mt-8`}>
        <div className={directoryHeaderClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="directory-kicker text-[11px] uppercase text-teal-800">
                Розподіл за виробниками
              </p>
              <h2 className="directory-heading mt-1 text-xl text-slate-900 sm:text-2xl">
                Виробники у категорії {visibleLabel}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                На сторінці зібрані бренди, які реально зустрічаються в цій категорії. Це дає змогу перейти або на сторінку виробника, або одразу у вже відфільтрований каталог потрібного бренду.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className={directoryCompactMetricAccentClass}>
                <span>{item.producersCount.toLocaleString("uk-UA")}</span>
                <span className="font-semibold text-teal-700">{pluralizeManufacturers(item.producersCount)}</span>
              </span>
              <span className={directoryCompactMetricClass}>
                <span>{(producerProductsTotal || item.productCount).toLocaleString("uk-UA")}</span>
                <span className="font-semibold text-slate-500">{pluralizeProducts(producerProductsTotal || item.productCount)}</span>
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
                <p className="directory-kicker text-[10px] uppercase text-teal-800">
                  Навігація
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em] text-slate-900">
                  Підкатегорії та типи
                </h2>
              </div>
              <span className={directoryCompactMetricAccentClass}>
                {formatCount(item.children.length)} {pluralizeCategories(item.children.length)}
              </span>
            </div>
          </div>
          <ul className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-2 sm:p-4">
            {item.children.map((child) => {
              const childPreview = getGroupProductPreview({
                categoryLabel: item.groupLabel,
                itemLabel: child.label,
                parentLabel: item.label,
              });

              return (
                <li key={child.slug}>
                  <CatalogPrefetchLink
                    href={buildGroupItemPath(item.groupSlug, child.slug)}
                    className={`${directoryListCardClass} group/row flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-slate-200/80 bg-gradient-to-br from-sky-50 to-teal-50/60">
                      {childPreview ? (
                        <Image
                          src={childPreview.url}
                          alt=""
                          aria-hidden
                          width={44}
                          height={44}
                          sizes="44px"
                          className="h-full w-full object-cover transition duration-300 group-hover/row:scale-105"
                        />
                      ) : (
                        <PackageSearch className="h-4 w-4 text-teal-600/70" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
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
                    <span className="flex shrink-0 items-center gap-1.5 self-start">
                      {child.productCount > 0 ? (
                        <span className={directoryCompactMetricClass}>
                          <span>{formatCount(child.productCount)}</span>
                          <span className="font-semibold text-slate-500">{pluralizeProducts(child.productCount)}</span>
                        </span>
                      ) : null}
                      <span className="text-teal-700 transition-transform duration-300 group-hover/row:translate-x-0.5">&rarr;</span>
                    </span>
                  </CatalogPrefetchLink>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {visibleProducts.length > 0 && (
        <section className={`${directoryPanelClass} mt-6`}>
          <div className={directoryHeaderClass}>
            <p className="directory-kicker text-[11px] uppercase text-teal-800">
              Товари категорії
            </p>
            <h2 className="directory-heading mt-1 text-xl text-slate-900 sm:text-2xl">
              Популярні товари: {visibleLabel}
            </h2>
          </div>
          <div className="p-3 sm:p-4">
            <ManufacturerCatalogProducts
              products={visibleProducts}
              euroRate={euroRate ?? undefined}
            />
          </div>
        </section>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: breadcrumbItems,
          }),
        }}
      />
      {productItemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(productItemListJsonLd) }}
        />
      )}
    </main>
  );
}
