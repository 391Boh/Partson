import { cache } from "react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { notFound, permanentRedirect } from "next/navigation";

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
  type SeoProducerFacet,
} from "app/lib/catalog-seo";
import { fetchCatalogProductsByQuery, type CatalogProduct } from "app/lib/catalog-server";
import {
  buildCatalogSeoFacetsFromSitemapEntries,
  readCatalogSeoFacetsSnapshot,
} from "app/lib/catalog-count-fallback";
import { getAllProductSitemapEntries } from "app/lib/product-sitemap";
import { getFullManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { fetchProductImageBase64Batch } from "app/lib/product-image";
import { buildProductImagePath } from "app/lib/product-image-path";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { getProducerSeoCopy } from "app/lib/seo-copy";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { buildSeoSlug } from "app/lib/seo-slug";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 21600;
export const dynamicParams = true;
const MANUFACTURER_STATIC_PARAMS_LIMIT_DEFAULT = Number.MAX_SAFE_INTEGER;
const MANUFACTURER_SEO_LOOKUP_TIMEOUT_MS = 1800;
const MANUFACTURER_BUILD_SEO_LOOKUP_TIMEOUT_MS = 6000;
const MANUFACTURER_FALLBACK_COUNT_LIMIT = 120;
const MANUFACTURER_FALLBACK_STATS_TIMEOUT_MS = 2400;
const MANUFACTURER_FALLBACK_MAX_PAGES_DEFAULT = 40;
const MANUFACTURER_FALLBACK_MAX_ITEMS_DEFAULT = 4800;
const MANUFACTURER_TOP_PRODUCTS_LIMIT = 48;
const MANUFACTURER_VISIBLE_PRODUCTS_LIMIT = 12;
const MANUFACTURER_TOP_PRODUCTS_TIMEOUT_MS = 1500;
const MANUFACTURER_GROUP_SAMPLE_LIMIT = 2;
const MANUFACTURER_GROUP_SAMPLE_CANDIDATE_LIMIT = 24;
const MANUFACTURER_GROUP_SAMPLE_FETCH_CONCURRENCY = 4;
const MANUFACTURER_GROUP_SAMPLE_FETCH_TIMEOUT_MS = 1500;
const MANUFACTURER_GROUP_SAMPLE_IMAGE_MAX_KEYS = 800;
const DEBUG_MANUFACTURER_PAGE =
  process.env.DEBUG_MANUFACTURER_PAGE === "1" ||
  process.env.NEXT_PUBLIC_DEBUG_MANUFACTURER_PAGE === "1";
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

type ManufacturerTopGroup = ManufacturerPageData["topGroups"][number];
type ManufacturerGroupProductSample = CatalogProduct & {
  imageSrc: string;
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

const formatCount = (value: number) =>
  Number.isFinite(value) && value > 0 ? value.toLocaleString("uk-UA") : "0";

const formatManufacturerProductCount = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? `${Math.floor(value).toLocaleString("uk-UA")} шт`
    : "за запитом";

const buildManufacturerProductMeta = (
  product: Pick<CatalogProduct, "group" | "subGroup" | "category">
) =>
  Array.from(
    new Set(
      [product.subGroup, product.group || product.category]
        .map(normalizeValue)
        .filter(Boolean)
    )
  )
    .slice(0, 2);

const buildManufacturerGroupSampleKey = (value: string | null | undefined) =>
  normalizeValue(value).toLowerCase();

const isAvailableCatalogProduct = (product: CatalogProduct) =>
  Boolean(product.code) &&
  Boolean(product.name) &&
  typeof product.quantity === "number" &&
  product.quantity > 0;

const productBelongsToManufacturerGroup = (
  product: CatalogProduct,
  group: ManufacturerTopGroup
) => {
  const groupKeys = new Set(
    [group.filterValue, group.label].map(buildManufacturerGroupSampleKey).filter(Boolean)
  );
  if (groupKeys.size === 0) return false;

  const productGroupKey = buildManufacturerGroupSampleKey(product.group);
  return Boolean(productGroupKey && groupKeys.has(productGroupKey));
};

const buildProductImageLookupKeys = (product: CatalogProduct) =>
  Array.from(
    new Set([product.article, product.code].map(normalizeValue).filter(Boolean))
  );

const productHasVerifiedImage = (
  product: CatalogProduct,
  resolvedImages: Record<string, string>
) =>
  buildProductImageLookupKeys(product).some(
    (lookupKey) => Boolean(resolvedImages[lookupKey.toLowerCase()])
  );

const buildVerifiedProductImageMap = async (
  products: CatalogProduct[],
  options?: {
    maxKeys?: number;
    timeoutMs?: number;
    allowUrlDownload?: boolean;
  }
) => {
  const lookupKeys = new Set<string>();
  for (const product of products) {
    for (const lookupKey of buildProductImageLookupKeys(product)) {
      lookupKeys.add(lookupKey);
      if (lookupKeys.size >= (options?.maxKeys || 80)) break;
    }
    if (lookupKeys.size >= (options?.maxKeys || 80)) break;
  }

  if (lookupKeys.size === 0) {
    return new Map<string, string>();
  }

  const resolvedImages = await fetchProductImageBase64Batch(Array.from(lookupKeys), {
    timeoutMs: options?.timeoutMs || 650,
    retries: 0,
    retryDelayMs: 80,
    cacheTtlMs: 1000 * 60 * 60,
    missCacheTtlMs: 1000 * 60 * 8,
    allowUrlDownload: options?.allowUrlDownload !== false,
    batchConcurrency: 8,
    maxKeys: options?.maxKeys || 80,
  }).catch(() => ({} as Record<string, string>));

  const imageMap = new Map<string, string>();
  for (const product of products) {
    if (!productHasVerifiedImage(product, resolvedImages)) continue;

    const dedupeKey = buildProductDedupeKey(product);
    if (!dedupeKey) continue;

    imageMap.set(
      dedupeKey,
      buildProductImagePath(product.code, product.article, {
        catalog: true,
        noFallback: true,
      })
    );
  }

  return imageMap;
};

const pushGroupSampleCandidate = (
  candidates: CatalogProduct[],
  product: CatalogProduct
) => {
  if (candidates.length >= MANUFACTURER_GROUP_SAMPLE_CANDIDATE_LIMIT) return;
  const dedupeKey = buildProductDedupeKey(product);
  if (!dedupeKey || candidates.some((item) => buildProductDedupeKey(item) === dedupeKey)) {
    return;
  }
  candidates.push(product);
};

const buildManufacturerTitle = (label: string) =>
  `${normalizeValue(label)} - каталог автозапчастин`;

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

  return appendSeoContact(
    `${normalizedLabel} у PartsON: ${productCountLabel}${groupLabel}. Каталог бренду з цінами, наявністю, підбором за артикулом, VIN і доставкою по Україні.`
  );
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

const buildManufacturerHeroSupportLabel = (label: string) =>
  `Каталог бренду ${normalizeValue(label)} з переходом до груп і категорій`;

const buildManufacturerGroupLead = (options: {
  producerLabel: string;
  groupLabel: string;
  subgroupCount: number;
  productCount: number;
  sampleNames?: string[];
}) => {
  const producerLabel = normalizeValue(options.producerLabel);
  const groupLabel = normalizeValue(options.groupLabel);
  const productCountLabel =
    options.productCount > 0
      ? `${options.productCount.toLocaleString("uk-UA")} товарних позицій`
      : "товари цієї групи";
  const sampleNames = (options.sampleNames || []).slice(
    0,
    MANUFACTURER_GROUP_SAMPLE_LIMIT
  );
  const sampleText =
    sampleNames.length > 0
      ? ` На прев'ю показані доступні позиції з цієї групи: ${sampleNames.join(", ")}.`
      : "";

  if (options.subgroupCount > 0) {
    return `Група ${groupLabel} бренду ${producerLabel}: ${productCountLabel} у ${options.subgroupCount.toLocaleString("uk-UA")} категоріях каталогу. Відкрийте групу, щоб швидко перейти до потрібних запчастин.${sampleText}`;
  }

  return `Група ${groupLabel} відкриває ${productCountLabel} бренду ${producerLabel} без додаткового налаштування фільтрів.${sampleText}`;
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
      preferLegacySource: false,
      forceAllgoodsSource: true,
      timeoutMs: 1400,
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

const manufacturerGroupHasCatalogResults = async (
  producerLabel: string,
  group: ManufacturerTopGroup
) => {
  const normalizedProducer = normalizeValue(producerLabel);
  const normalizedGroup = normalizeValue(group.filterValue || group.label);
  if (!normalizedProducer || !normalizedGroup) return true;

  const legacyResult = await resolveWithTimeout(
    () =>
      fetchCatalogProductsByQuery({
        page: 1,
        limit: 1,
        producer: normalizedProducer,
        group: normalizedGroup,
        sortOrder: "none",
        preferLegacySource: true,
        forceAllgoodsSource: false,
        timeoutMs: 650,
        retries: 0,
        retryDelayMs: 80,
        cacheTtlMs: 1000 * 60 * 20,
      }),
    null,
    900
  ).catch(() => null);

  if (legacyResult === null) return true;
  if (Array.isArray(legacyResult.items) && legacyResult.items.length > 0) {
    return true;
  }

  const allgoodsResult = await resolveWithTimeout(
    () =>
      fetchCatalogProductsByQuery({
        page: 1,
        limit: 1,
        producer: normalizedProducer,
        group: normalizedGroup,
        sortOrder: "none",
        preferLegacySource: false,
        forceAllgoodsSource: true,
        timeoutMs: 900,
        retries: 0,
        retryDelayMs: 80,
        cacheTtlMs: 1000 * 60 * 20,
      }),
    null,
    1000
  ).catch(() => null);

  if (allgoodsResult === null) return true;
  return Array.isArray(allgoodsResult.items) && allgoodsResult.items.length > 0;
};

const filterManufacturerGroupsWithCatalogResults = async (
  producerLabel: string,
  groups: ManufacturerTopGroup[]
) => {
  if (isProductionBuildPhase || groups.length === 0) return groups;

  const checks = await Promise.all(
    groups.map(async (group) => ({
      group,
      hasResults: await manufacturerGroupHasCatalogResults(producerLabel, group),
    }))
  );

  return checks
    .filter((entry) => {
      if (entry.hasResults) return true;
      if (DEBUG_MANUFACTURER_PAGE) {
        console.info(JSON.stringify({
          type: "manufacturer-group-excluded",
          producer: producerLabel,
          groupLabel: entry.group.label,
          groupFilterValue: entry.group.filterValue,
          groupSlug: entry.group.slug,
          reason: "catalog validation returned 0 products",
          ts: Date.now(),
        }));
      }
      return false;
    })
    .map((entry) => entry.group);
};

const fetchManufacturerTopProductsUncached = async (
  producerLabel: string
): Promise<CatalogProduct[]> => {
  const normalizedProducer = normalizeValue(producerLabel);
  if (!normalizedProducer) return [];

  const result = await fetchCatalogProductsByQuery({
    page: 1,
    limit: MANUFACTURER_TOP_PRODUCTS_LIMIT,
    producer: normalizedProducer,
    sortOrder: "none",
    includePriceEnrichment: false,
    preferLegacySource: true,
    forceAllgoodsSource: false,
    timeoutMs: 1400,
    retries: 0,
    retryDelayMs: 100,
    cacheTtlMs: 1000 * 60 * 30,
  }).catch(() => ({ items: [] as CatalogProduct[] }));

  return result.items.filter((item) => Boolean(item.code) && Boolean(item.name));
};

const getManufacturerTopProductsCached = unstable_cache(
  fetchManufacturerTopProductsUncached,
  ["manufacturer:top-products:v2"],
  { revalidate: 60 * 30 }
);

const getManufacturerTopProducts = cache(getManufacturerTopProductsCached);

const fetchManufacturerGroupSampleCandidates = async (
  producerLabel: string,
  groups: ManufacturerTopGroup[]
) => {
  const normalizedProducer = normalizeValue(producerLabel);
  if (!normalizedProducer || groups.length === 0) {
    return new Map<string, CatalogProduct[]>();
  }

  const candidatesByGroup = new Map<string, CatalogProduct[]>();
  let cursor = 0;
  const workerCount = Math.min(
    MANUFACTURER_GROUP_SAMPLE_FETCH_CONCURRENCY,
    groups.length
  );

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < groups.length) {
      const currentIndex = cursor;
      cursor += 1;

      const group = groups[currentIndex];
      const groupKey = buildManufacturerGroupSampleKey(group.filterValue || group.label);
      if (!groupKey) continue;

      const products = await resolveWithTimeout(
        () =>
          fetchCatalogProductsByQuery({
            page: 1,
            limit: MANUFACTURER_GROUP_SAMPLE_CANDIDATE_LIMIT,
            producer: normalizedProducer,
            group: group.filterValue || group.label,
            sortOrder: "none",
            includePriceEnrichment: false,
            preferLegacySource: true,
            forceAllgoodsSource: false,
            timeoutMs: 900,
            retries: 0,
            retryDelayMs: 80,
            cacheTtlMs: 1000 * 60 * 30,
          }),
        { items: [] as CatalogProduct[], hasMore: false, nextCursor: "" },
        MANUFACTURER_GROUP_SAMPLE_FETCH_TIMEOUT_MS
      ).catch(() => ({ items: [] as CatalogProduct[] }));

      const candidates = candidatesByGroup.get(groupKey) || [];
      for (const product of products.items || []) {
        if (!isAvailableCatalogProduct(product)) continue;
        if (!productBelongsToManufacturerGroup(product, group)) continue;
        pushGroupSampleCandidate(candidates, product);
      }
      candidatesByGroup.set(groupKey, candidates);
    }
  });

  await Promise.allSettled(workers);
  return candidatesByGroup;
};

const buildManufacturerGroupProductSamples = async (
  producerLabel: string,
  groups: ManufacturerTopGroup[],
  manufacturerProducts: CatalogProduct[]
) => {
  if (groups.length === 0 || isProductionBuildPhase) {
    return new Map<string, ManufacturerGroupProductSample[]>();
  }

  const candidatesByGroup = new Map<string, CatalogProduct[]>();
  for (const group of groups) {
    const groupKey = buildManufacturerGroupSampleKey(group.filterValue || group.label);
    if (!groupKey) continue;

    const candidates = candidatesByGroup.get(groupKey) || [];
    for (const product of manufacturerProducts) {
      if (!isAvailableCatalogProduct(product)) continue;
      if (!productBelongsToManufacturerGroup(product, group)) continue;
      pushGroupSampleCandidate(candidates, product);
    }
    candidatesByGroup.set(groupKey, candidates);
  }

  const groupsNeedingMore = groups.filter((group) => {
    const groupKey = buildManufacturerGroupSampleKey(group.filterValue || group.label);
    return (
      groupKey &&
      (candidatesByGroup.get(groupKey)?.length || 0) <
        MANUFACTURER_GROUP_SAMPLE_CANDIDATE_LIMIT
    );
  });

  const fetchedCandidates = await fetchManufacturerGroupSampleCandidates(
    producerLabel,
    groupsNeedingMore
  );
  for (const [groupKey, products] of fetchedCandidates.entries()) {
    const candidates = candidatesByGroup.get(groupKey) || [];
    for (const product of products) {
      pushGroupSampleCandidate(candidates, product);
    }
    candidatesByGroup.set(groupKey, candidates);
  }

  const imageMap = await buildVerifiedProductImageMap(
    Array.from(candidatesByGroup.values()).flat(),
    {
      maxKeys: MANUFACTURER_GROUP_SAMPLE_IMAGE_MAX_KEYS,
      timeoutMs: 700,
      allowUrlDownload: true,
    }
  );

  const samplesByGroup = new Map<string, ManufacturerGroupProductSample[]>();
  for (const [groupKey, candidates] of candidatesByGroup.entries()) {
    const samples: ManufacturerGroupProductSample[] = [];
    for (const product of candidates) {
      const imageSrc = imageMap.get(buildProductDedupeKey(product));
      if (!imageSrc) continue;
      samples.push({
        ...product,
        imageSrc,
      });
      if (samples.length >= MANUFACTURER_GROUP_SAMPLE_LIMIT) break;
    }

    if (samples.length > 0) {
      samplesByGroup.set(groupKey, samples);
    }
  }

  return samplesByGroup;
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

const findFallbackProducerBySlug = cache(async (slug: string) => {
  const snapshot = await readCatalogSeoFacetsSnapshot();
  const facets = snapshot || buildCatalogSeoFacetsFromSitemapEntries(
    await getAllProductSitemapEntries().catch(() => [])
  );
  const normalizedSlug = normalizeValue(slug);

  return (
    facets.producers.find(
      (producer) =>
        producer.slug === normalizedSlug ||
        buildSeoSlug(producer.label) === normalizedSlug
    ) || null
  );
});

const getManufacturerBySlug = cache(
  async (slug: string): Promise<ManufacturerPageData | null> => {
    const fallbackBrand =
      brands.find((brand) => buildSeoSlug(brand.name) === slug) || null;
    const producer = await resolveWithTimeout<SeoProducerFacet | null>(
      () => findSeoProducerBySlug(slug),
      null,
      isProductionBuildPhase
        ? MANUFACTURER_BUILD_SEO_LOOKUP_TIMEOUT_MS
        : MANUFACTURER_SEO_LOOKUP_TIMEOUT_MS
    ).catch(() => null) || await findFallbackProducerBySlug(slug);
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
      if (DEBUG_MANUFACTURER_PAGE) {
        console.info(JSON.stringify({
          type: "manufacturer-group-excluded",
          producer: label,
          groupLabel: group.label,
          groupFilterValue: group.filterValue,
          groupSlug: group.slug,
          reason: "productCount is 0 — stale facet entry skipped",
          ts: Date.now(),
        }));
      }
      return false;
    });

    const validatedTopGroups = await filterManufacturerGroupsWithCatalogResults(
      label,
      safeTopGroups
    );

    return {
      label,
      slug: canonicalSlug,
      description,
      logoPath,
      initials: getProducerInitials(label),
      productCount: Math.max(productCount, fallbackCounts?.productCount || 0),
      groupsCount: validatedTopGroups.length,
      categoriesCount: validatedTopGroups.reduce(
        (sum, group) => sum + group.subgroups.length,
        0
      ),
      topGroups: validatedTopGroups,
    };
  }
);

export async function generateStaticParams() {
  const fromBrands = brands.map((brand) => ({ slug: buildSeoSlug(brand.name) }));
  const limit = isProductionBuildPhase
    ? MANUFACTURER_STATIC_PARAMS_LIMIT_DEFAULT
    : parsePositiveInt(
        process.env.SEO_MANUFACTURER_STATIC_PARAMS_LIMIT,
        MANUFACTURER_STATIC_PARAMS_LIMIT_DEFAULT
      );
  const seen = new Set<string>();
  const directoryData = await getFullManufacturersDirectoryData().catch(() => null);
  const fromDirectory =
    directoryData?.clientProducers.map((producer) => ({ slug: producer.slug })) ?? [];

  return [...fromBrands, ...fromDirectory]
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
    notFound();
  }
  if (slug !== producer.slug) {
    permanentRedirect(buildManufacturerPath(producer.slug));
  }

  const topProducts = isProductionBuildPhase
    ? ([] as CatalogProduct[])
    : await resolveWithTimeout(
        () => getManufacturerTopProducts(producer.label),
        [] as CatalogProduct[],
        MANUFACTURER_TOP_PRODUCTS_TIMEOUT_MS
      );
  const manufacturerProducts = topProducts.filter((p) => Boolean(p.code) && Boolean(p.name));
  const visibleProducts = manufacturerProducts.slice(0, MANUFACTURER_VISIBLE_PRODUCTS_LIMIT);
  const productSamplesByGroup = await buildManufacturerGroupProductSamples(
    producer.label,
    producer.topGroups,
    manufacturerProducts
  );

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
      description: producer.description,
      logo: producer.logoPath ? `${siteUrl}${producer.logoPath}` : undefined,
    },
    mainEntity: producer.topGroups.length > 0
      ? {
          "@type": "ItemList",
          itemListElement: producer.topGroups.slice(0, 24).map((group, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: group.label,
            url: `${siteUrl}${buildCatalogProducerPath(producer.label, group.filterValue)}`,
          })),
        }
      : undefined,
  };

  const productItemListJsonLd = visibleProducts.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "@id": `${canonicalPageUrl}#product-list`,
        name: `Популярні товари бренду ${producer.label}`,
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
              url: `${siteUrl}${productPath}`,
              image:
                product.hasPhoto === true
                  ? `${siteUrl}${buildProductImagePath(product.code, product.article)}`
                  : undefined,
              sku: product.article || undefined,
              mpn: product.code || undefined,
              category:
                product.subGroup || product.group || product.category || undefined,
              brand: { "@type": "Brand", name: producer.label },
            },
          };
        }),
      }
    : null;

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
          <nav aria-label="Навігаційні хлібні крихти">
            <ol className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <li className="inline-flex items-center gap-2">
                <Link href="/" className="transition hover:text-slate-800">Головна</Link>
              </li>
              <li className="inline-flex items-center gap-2">
                <span aria-hidden="true">/</span>
                <Link href="/manufacturers" className="transition hover:text-slate-800">Виробники</Link>
              </li>
              <li className="inline-flex items-center gap-2">
                <span aria-hidden="true">/</span>
                <span className="text-slate-700">{producer.label}</span>
              </li>
            </ol>
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
                {buildManufacturerHeroSupportLabel(producer.label)}
              </span>
              <span className={directoryCompactMetricAccentClass}>
                Пошук по групах, категоріях і товарах
              </span>
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
                      sizes="48px"
                      className="relative z-[1] h-12 w-12 object-contain"
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
                  <div className="mt-4 max-w-3xl rounded-xl border border-sky-100/90 bg-white/72 p-4 shadow-[0_14px_30px_rgba(14,165,233,0.08)] ring-1 ring-white/70">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">
                      Про виробника {producer.label}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-[15px]">
                      {producer.description}
                    </p>
                  </div>
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
                  Опис бренду і популярних напрямків
                </span>
                <span className={directoryCompactMetricAccentClass}>
                  Сторінка бренду з переходом у каталог
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]">
            <div className="rounded-xl border border-slate-200/85 bg-white/92 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.045)]">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-sky-800">
                Коротко про бренд
              </p>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600 sm:text-[15px]">
                <p className="rounded-lg border border-sky-100/80 bg-sky-50/55 px-3.5 py-3 font-semibold text-slate-700">
                  {producer.description}
                </p>
                {seoCopy.paragraphs.slice(0, 2).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>

            <aside className="rounded-xl border border-slate-200/85 bg-[linear-gradient(165deg,rgba(248,250,252,0.98),rgba(240,249,255,0.94),rgba(255,255,255,0.98))] p-4 shadow-[0_14px_30px_rgba(15,23,42,0.045)]">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-700">
                Навігація бренду
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-[13px] border border-slate-200 bg-white/88 px-2 py-2 text-center">
                  <span className="block text-sm font-black text-slate-950">
                    {formatCount(producer.productCount)}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    товари
                  </span>
                </div>
                <div className="rounded-[13px] border border-slate-200 bg-white/88 px-2 py-2 text-center">
                  <span className="block text-sm font-black text-slate-950">
                    {formatCount(producer.groupsCount)}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    групи
                  </span>
                </div>
                <div className="rounded-[13px] border border-slate-200 bg-white/88 px-2 py-2 text-center">
                  <span className="block text-sm font-black text-slate-950">
                    {formatCount(producer.categoriesCount)}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    категорії
                  </span>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                <CatalogPrefetchLink
                  href={catalogPath}
                  prefetchCatalogOnViewport
                  className={directoryPrimaryButtonClass}
                >
                  Відкрити каталог бренду
                </CatalogPrefetchLink>
                <a
                  href="#manufacturer-groups"
                  className={directorySecondaryButtonClass}
                >
                  Перейти до груп
                </a>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Дані структури беруться з каталожного індексу PartsON і ведуть до фільтрів виробника без ручного налаштування.
              </p>
            </aside>
          </div>
        </section>

        <section id="manufacturer-groups" className={directoryPanelClass}>
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
              {producer.topGroups.map((group) => {
                const groupSamples =
                  productSamplesByGroup.get(buildManufacturerGroupSampleKey(group.filterValue)) ||
                  productSamplesByGroup.get(buildManufacturerGroupSampleKey(group.label)) ||
                  [];
                const groupSampleNames = groupSamples.map((sample) =>
                  buildVisibleProductName(sample.name)
                );

                return (
                  <article
                    key={group.slug}
                    className={directoryListCardClass}
                  >
                    <div>
                      <div className="flex flex-col gap-3 border-b border-slate-200/75 px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
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
                          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                            {buildManufacturerGroupLead({
                              producerLabel: producer.label,
                              groupLabel: group.label,
                              subgroupCount: group.subgroups.length,
                              productCount: group.productCount,
                              sampleNames: groupSampleNames,
                            })}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                          {groupSamples.length > 0 ? (
                            <div className="flex items-center gap-2 rounded-[16px] border border-emerald-100 bg-[linear-gradient(135deg,rgba(240,253,244,0.96),rgba(255,255,255,0.96))] px-2.5 py-2 shadow-[0_12px_28px_rgba(16,185,129,0.08)] ring-1 ring-white/70">
                              <span className="hidden flex-col pr-0.5 leading-none sm:flex">
                                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  Є фото
                                </span>
                                <span className="mt-1 text-[10px] font-semibold text-slate-500">
                                  В наявності
                                </span>
                              </span>
                              {groupSamples.map((sample) => {
                                const sampleName = buildVisibleProductName(sample.name);
                                const samplePath = buildProductPath({
                                  code: sample.code,
                                  article: sample.article,
                                  name: sample.name,
                                  producer: sample.producer,
                                  group: sample.group,
                                  subGroup: sample.subGroup,
                                  category: sample.category,
                                });

                                return (
                                  <Link
                                    key={buildProductDedupeKey(sample)}
                                    href={samplePath}
                                    title={sampleName}
                                    className="group/sample inline-flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-[13px] border border-white bg-white shadow-[0_8px_18px_rgba(15,23,42,0.08)] ring-1 ring-emerald-100/80 transition hover:-translate-y-0.5 hover:border-sky-200 hover:ring-sky-100"
                                  >
                                    <Image
                                      src={sample.imageSrc}
                                      alt={`Фото ${sampleName}`}
                                      width={56}
                                      height={56}
                                      sizes="48px"
                                      className="h-11 w-11 object-contain transition duration-300 group-hover/sample:scale-[1.05]"
                                    />
                                  </Link>
                                );
                              })}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <span className={directoryCompactMetricClass}>
                              {formatCount(group.productCount)} товарів
                            </span>
                            {group.subgroups.length > 0 ? (
                              <span className={directoryCompactMetricAccentClass}>
                                {formatCount(group.subgroups.length)} категорій
                              </span>
                            ) : null}
                          </div>
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
                              className="flex items-start justify-between gap-3 rounded-lg border border-slate-200/90 bg-white/90 px-3.5 py-3 text-sm text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:border-teal-200 hover:bg-teal-50/45 hover:text-teal-800"
                            >
                              <span className="min-w-0 pr-3">
                                <span className="block font-medium text-slate-800">
                                  {normalizeValue(subgroup.label)}
                                </span>
                              </span>
                              <span className={directoryCompactMetricAccentClass}>
                                {formatCount(subgroup.productCount)} товарів
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
                );
              })}
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

        {visibleProducts.length > 0 && (
          <section className={directoryPanelClass}>
            <div className={directoryHeaderClass}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className={directoryBadgeClass}>Популярні товари бренду</p>
                  <h2 className={directoryTitleClass}>
                    Товари {producer.label} у каталозі
                  </h2>
                  <p className={directoryDescriptionClass}>
                    Добірка позицій виробника з артикулом, кодом, категорією та швидким переходом на сторінку товару.
                  </p>
                </div>
                <CatalogPrefetchLink
                  href={catalogPath}
                  prefetchCatalogOnViewport
                  className={directorySecondaryButtonClass}
                >
                  Усі товари бренду
                </CatalogPrefetchLink>
              </div>
            </div>
            <ul
              className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3"
              itemScope
              itemType="https://schema.org/ItemList"
            >
              {visibleProducts.map((product, index) => {
                const productPath = buildProductPath({
                  code: product.code,
                  article: product.article,
                  name: product.name,
                  producer: product.producer,
                  group: product.group,
                  subGroup: product.subGroup,
                  category: product.category,
                });
                const productName = buildVisibleProductName(product.name);
                const productMeta = buildManufacturerProductMeta(product);
                const productImageSrc =
                  product.hasPhoto === true
                    ? buildProductImagePath(product.code, product.article, { catalog: true })
                    : "";
                return (
                  <li
                    key={buildProductDedupeKey(product)}
                    itemProp="itemListElement"
                    itemScope
                    itemType="https://schema.org/ListItem"
                  >
                    <meta itemProp="position" content={String(index + 1)} />
                    <Link
                      href={productPath}
                      itemProp="url"
                      className="group/product-card flex h-full min-h-[164px] overflow-hidden rounded-xl border border-slate-200/90 bg-white/92 text-slate-700 shadow-[0_12px_26px_rgba(15,23,42,0.055)] ring-1 ring-white/70 transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white hover:shadow-[0_18px_34px_rgba(14,165,233,0.12)]"
                    >
                      <span className="flex w-[104px] shrink-0 items-center justify-center border-r border-slate-100 bg-[radial-gradient(circle_at_top,rgba(224,242,254,0.72),rgba(255,255,255,0.94)_58%,rgba(241,245,249,0.9))] p-2.5">
                        {productImageSrc ? (
                          <Image
                            src={productImageSrc}
                            alt={`Фото ${productName}`}
                            width={112}
                            height={112}
                            sizes="104px"
                            className="h-[82px] w-[82px] object-contain transition duration-300 group-hover/product-card:scale-[1.04]"
                          />
                        ) : (
                          <span className="inline-flex h-[82px] w-[82px] items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                            <PackageSearch size={34} strokeWidth={1.8} aria-hidden="true" />
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3">
                        <span className="min-w-0">
                          <span
                            itemProp="name"
                            className="line-clamp-2 text-[13px] font-black leading-snug text-slate-950 transition group-hover/product-card:text-sky-800 sm:text-sm"
                          >
                            {productName}
                          </span>
                          {productMeta.length > 0 && (
                            <span className="mt-1.5 flex flex-wrap gap-1">
                              {productMeta.map((meta) => (
                                <span
                                  key={meta}
                                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold leading-4 text-slate-600"
                                >
                                  {meta}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>

                        <span className="grid gap-1 text-[11px] leading-4 text-slate-500">
                          <span className="flex min-w-0 justify-between gap-2">
                            <span>Артикул</span>
                            <span className="min-w-0 truncate font-bold text-slate-700">
                              {product.article || "-"}
                            </span>
                          </span>
                          <span className="flex min-w-0 justify-between gap-2">
                            <span>Код</span>
                            <span className="min-w-0 truncate font-bold text-slate-700">
                              {product.code || "-"}
                            </span>
                          </span>
                          <span className="flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5">
                            <span
                              className={
                                typeof product.quantity === "number" && product.quantity > 0
                                  ? "font-bold text-emerald-700"
                                  : "font-bold text-amber-700"
                              }
                            >
                              {typeof product.quantity === "number" && product.quantity > 0
                                ? "В наявності"
                                : "Під замовлення"}
                            </span>
                            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-700">
                              {formatManufacturerProductCount(product.quantity)}
                            </span>
                          </span>
                        </span>

                        <span className="inline-flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-[0.08em] text-sky-700">
                          Детальніше
                          <span aria-hidden="true" className="transition group-hover/product-card:translate-x-0.5">
                            &rarr;
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
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
      {productItemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productItemListJsonLd) }}
        />
      )}
    </main>
  );
}
