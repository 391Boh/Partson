import { cache } from "react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import ManufacturerCatalogProducts from "app/manufacturers/[slug]/ManufacturerCatalogProducts";
import { brands } from "app/components/brandsData";
import {
  catalogPageBackgroundClass,
  directoryBadgeClass,
  directoryCompactMetricAccentClass,
  directoryCompactMetricClass,
  directoryDescriptionClass,
  directoryHeaderClass,
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
import { resolveProductCategoryHierarchy } from "app/lib/catalog-hierarchy";
import {
  buildCatalogSeoFacetsFromSitemapEntries,
  readCatalogSeoFacetsSnapshot,
} from "app/lib/catalog-count-fallback";
import {
  getAllProductSitemapEntries,
  type ProductSitemapEntry,
} from "app/lib/product-sitemap";
import { getFullManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { fetchProductImageBase64Batch } from "app/lib/product-image";
import {
  buildProductImageBatchKey,
  buildProductImagePath,
} from "app/lib/product-image-path";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { getProducerSeoCopy } from "app/lib/seo-copy";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { buildSeoSlug } from "app/lib/seo-slug";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";
import ManufacturerGroupSampleImage from "app/manufacturers/[slug]/ManufacturerGroupSampleImage";
import { getCategoryIconPath } from "app/lib/category-icons";

export const revalidate = 21600;
export const dynamicParams = true;
const MANUFACTURER_STATIC_PARAMS_LIMIT_DEFAULT = 0;
const MANUFACTURER_SEO_LOOKUP_TIMEOUT_MS = 500;
const MANUFACTURER_FALLBACK_COUNT_LIMIT = 120;
const MANUFACTURER_FALLBACK_STATS_TIMEOUT_MS = 4000;
const MANUFACTURER_FALLBACK_MAX_PAGES_DEFAULT = 40;
const MANUFACTURER_FALLBACK_MAX_ITEMS_DEFAULT = 4800;
const MANUFACTURER_TOP_PRODUCTS_LIMIT = 48;
const MANUFACTURER_VISIBLE_PRODUCTS_LIMIT = 6;
const MANUFACTURER_TOP_PRODUCTS_TIMEOUT_MS = 550;
const MANUFACTURER_GROUP_SAMPLE_LIMIT = 2;
const MANUFACTURER_GROUP_SAMPLE_CANDIDATE_LIMIT = 24;
const MANUFACTURER_GROUP_SAMPLE_FETCH_CONCURRENCY = 4;
const MANUFACTURER_GROUP_SAMPLE_FETCH_TIMEOUT_MS = 650;
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
  // 3-level hierarchy: Категорія → Группа → Підгруппа
  // Present when category data is available (fallback path or rebuilt SEO snapshot).
  topCategories?: Array<{
    label: string;
    slug: string;
    productCount: number;
    groups: Array<{
      label: string;
      filterValue: string;
      slug: string;
      productCount: number;
      subgroups: Array<{
        label: string;
        slug: string;
        productCount: number;
      }>;
    }>;
  }>;
};

type ManufacturerTopGroup = ManufacturerPageData["topGroups"][number];
type ManufacturerGroupProductSample = CatalogProduct & {
  imageSrc: string;
};

const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallbackValue;
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

const pluralWord = (value: number, one: string, few: string, many: string) => {
  const n = Math.abs(Math.trunc(value));
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
};

const formatCountedWord = (value: number, one: string, few: string, many: string) =>
  `${formatCount(value)} ${pluralWord(value, one, few, many)}`;

const buildManufacturerGroupSampleKey = (value: string | null | undefined) =>
  normalizeValue(value).toLowerCase();

const isAvailableCatalogProduct = (product: CatalogProduct) =>
  Boolean(product.code) &&
  Boolean(product.name) &&
  typeof product.quantity === "number" &&
  product.quantity > 0;

const sitemapEntryToCatalogProduct = (
  entry: ProductSitemapEntry
): CatalogProduct | null => {
  const code = normalizeValue(entry.code);
  const name = normalizeValue(entry.name);
  if (!code || !name) return null;

  return {
    code,
    article: normalizeValue(entry.article),
    name,
    producer: normalizeValue(entry.producer),
    quantity:
      typeof entry.quantity === "number" && Number.isFinite(entry.quantity)
        ? Math.max(0, entry.quantity)
        : 0,
    priceEuro:
      typeof entry.priceEuro === "number" &&
      Number.isFinite(entry.priceEuro) &&
      entry.priceEuro > 0
        ? entry.priceEuro
        : null,
    hasPhoto: entry.hasPhoto,
    group: normalizeValue(entry.group),
    subGroup: normalizeValue(entry.subGroup),
    category: normalizeValue(entry.category),
  };
};

const productMatchesProducer = (
  product: Pick<CatalogProduct, "producer">,
  producerLabel: string
) =>
  normalizeValue(product.producer).toLocaleLowerCase("uk-UA") ===
  normalizeValue(producerLabel).toLocaleLowerCase("uk-UA");

const productBelongsToManufacturerGroup = (
  product: CatalogProduct,
  group: ManufacturerTopGroup
) => {
  const groupKeys = new Set(
    [group.filterValue, group.label].map(buildManufacturerGroupSampleKey).filter(Boolean)
  );
  if (groupKeys.size === 0) return false;

  const productGroupKeys = [product.group, product.category, product.subGroup]
    .map(buildManufacturerGroupSampleKey)
    .filter(Boolean);

  return productGroupKeys.some((productGroupKey) => groupKeys.has(productGroupKey));
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
  `${normalizeValue(label)} — купити запчастини у Львові`;

const buildManufacturerDescription = (
  label: string,
  productCount: number,
  groupsCount: number
) => {
  const normalizedLabel = normalizeValue(label);
  const productCountLabel =
    productCount > 0
      ? `${formatCountedWord(productCount, "товарна позиція", "товарні позиції", "товарних позицій")}`
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

const buildUniqueTextBlocks = (...blocks: Array<string | null | undefined>) => {
  const seen = new Set<string>();

  return blocks
    .map(normalizeValue)
    .filter((block) => {
      if (!block) return false;
      const key = block.toLocaleLowerCase("uk-UA");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};


const collectProducerFallbackStats = cache(async (producerLabel: string) => {
  const normalizedProducerLabel = normalizeValue(producerLabel);
  if (!normalizedProducerLabel) {
    return {
      productCount: 0,
      groupsCount: 0,
      categoriesCount: 0,
      topGroups: [] as ManufacturerPageData["topGroups"],
      topCategories: [] as NonNullable<ManufacturerPageData["topCategories"]>,
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

  // 3-level hierarchy: Категорія → Группа → Підгруппа
  const categoryCounts = new Map<string, {
    label: string;
    productCount: number;
    groups: Map<string, {
      label: string;
      productCount: number;
      subgroups: Map<string, { label: string; productCount: number }>;
    }>;
  }>();

  // Flat group map — used for topGroups / product sample lookups by group slug
  const flatGroupCounts = new Map<string, {
    label: string;
    productCount: number;
    subgroups: Map<string, { label: string; productCount: number }>;
  }>();

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
      timeoutMs: 2500,
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

      // Resolve through the same hierarchy logic the SEO facet snapshot uses
      // (app/lib/catalog-hierarchy.ts), so the live fallback never disagrees
      // with the precomputed snapshot about what's a category vs. a group.
      const resolved = resolveProductCategoryHierarchy(item);
      const categoryLabel = resolved.category;
      const groupLabel = resolved.group;
      const subgroupLabel = resolved.subgroup;

      if (!categoryLabel && !groupLabel) continue;

      // --- 3-level: register under Категорія → Группа → Підгруппа ---
      if (categoryLabel) {
        const catSlug = buildSeoSlug(categoryLabel);
        if (catSlug) {
          let catEntry = categoryCounts.get(catSlug);
          if (!catEntry) {
            catEntry = { label: categoryLabel, productCount: 0, groups: new Map() };
            categoryCounts.set(catSlug, catEntry);
          }
          catEntry.productCount += 1;

          if (groupLabel) {
            const groupSlug = buildSeoSlug(groupLabel);
            if (groupSlug) {
              let grpEntry = catEntry.groups.get(groupSlug);
              if (!grpEntry) {
                grpEntry = { label: groupLabel, productCount: 0, subgroups: new Map() };
                catEntry.groups.set(groupSlug, grpEntry);
              }
              grpEntry.productCount += 1;

              if (subgroupLabel) {
                const subSlug = buildSeoSlug(subgroupLabel);
                if (subSlug) {
                  const subEntry = grpEntry.subgroups.get(subSlug);
                  if (!subEntry) {
                    grpEntry.subgroups.set(subSlug, { label: subgroupLabel, productCount: 1 });
                  } else {
                    subEntry.productCount += 1;
                  }
                }
              }
            }
          }
        }
      }

      // --- Flat groups: register under Группа → Підгруппа (for topGroups / samples) ---
      if (groupLabel) {
        const groupSlug = buildSeoSlug(groupLabel);
        if (groupSlug) {
          let flatGrp = flatGroupCounts.get(groupSlug);
          if (!flatGrp) {
            flatGrp = { label: groupLabel, productCount: 0, subgroups: new Map() };
            flatGroupCounts.set(groupSlug, flatGrp);
          }
          flatGrp.productCount += 1;

          if (subgroupLabel) {
            const subSlug = buildSeoSlug(subgroupLabel);
            if (subSlug) {
              const subEntry = flatGrp.subgroups.get(subSlug);
              if (!subEntry) {
                flatGrp.subgroups.set(subSlug, { label: subgroupLabel, productCount: 1 });
              } else {
                subEntry.productCount += 1;
              }
            }
          }
        }
      }
    }

    totalSeen += batch.items.length;
    if (maxItems != null && totalSeen >= maxItems) break;

    const nextCursor = normalizeValue(batch.nextCursor);
    if (!batch.hasMore || !nextCursor || nextCursor === cursor) break;

    cursor = nextCursor;
    cursorField = normalizeValue(batch.cursorField);
  }

  const sortByCount = <T extends { productCount: number; label: string }>(arr: T[]): T[] =>
    arr.sort((a, b) =>
      b.productCount !== a.productCount
        ? b.productCount - a.productCount
        : a.label.localeCompare(b.label, "uk")
    );

  // Build topGroups (flat, for backward compat and product sample lookups)
  const topGroups = sortByCount(
    Array.from(flatGroupCounts.entries()).map(([slug, value]) => ({
      slug,
      label: value.label,
      filterValue: value.label,
      productCount: value.productCount,
      subgroups: sortByCount(
        Array.from(value.subgroups.entries()).map(([subSlug, subValue]) => ({
          slug: subSlug,
          label: subValue.label,
          productCount: subValue.productCount,
        }))
      ),
    }))
  ).slice(0, 25);

  // Build topCategories (3-level: Категорія → Группа → Підгруппа)
  const topCategories = sortByCount(
    Array.from(categoryCounts.entries())
      .map(([catSlug, catValue]) => ({
        slug: catSlug,
        label: catValue.label,
        productCount: catValue.productCount,
        groups: sortByCount(
          Array.from(catValue.groups.entries()).map(([groupSlug, groupValue]) => ({
            slug: groupSlug,
            label: groupValue.label,
            filterValue: groupValue.label,
            productCount: groupValue.productCount,
            subgroups: sortByCount(
              Array.from(groupValue.subgroups.entries()).map(([subSlug, subValue]) => ({
                slug: subSlug,
                label: subValue.label,
                productCount: subValue.productCount,
              }))
            ),
          }))
        ),
      }))
      .filter((cat) => cat.groups.length > 0)
  ).slice(0, 20);

  const categoriesCount = categoryCounts.size;

  return {
    productCount: seenProducts.size,
    groupsCount: flatGroupCounts.size,
    categoriesCount,
    topGroups,
    topCategories,
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

const getManufacturerTopProductsFromSnapshot = cache(
  async (
    producerLabel: string,
    limit = MANUFACTURER_TOP_PRODUCTS_LIMIT
  ): Promise<CatalogProduct[]> => {
    const normalizedProducer = normalizeValue(producerLabel);
    if (!normalizedProducer) return [];

    const products: CatalogProduct[] = [];
    const seen = new Set<string>();
    const entries = await getAllProductSitemapEntries().catch(
      () => [] as ProductSitemapEntry[]
    );

    for (const entry of entries) {
      const product = sitemapEntryToCatalogProduct(entry);
      if (!product) continue;
      if (!productMatchesProducer(product, normalizedProducer)) continue;
      if (!isAvailableCatalogProduct(product)) continue;

      const dedupeKey = buildProductDedupeKey(product);
      if (!dedupeKey || seen.has(dedupeKey)) continue;

      seen.add(dedupeKey);
      products.push(product);
      if (products.length >= limit) break;
    }

    return products;
  }
);

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
  if (groups.length === 0) {
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

  if (isProductionBuildPhase) {
    const snapshotProducts = await getManufacturerTopProductsFromSnapshot(
      producerLabel,
      MANUFACTURER_GROUP_SAMPLE_IMAGE_MAX_KEYS
    );
    for (const group of groups) {
      const groupKey = buildManufacturerGroupSampleKey(group.filterValue || group.label);
      if (!groupKey) continue;

      const candidates = candidatesByGroup.get(groupKey) || [];
      for (const product of snapshotProducts) {
        if (!isAvailableCatalogProduct(product)) continue;
        if (product.hasPhoto !== true) continue;
        if (!productBelongsToManufacturerGroup(product, group)) continue;
        pushGroupSampleCandidate(candidates, product);
      }
      candidatesByGroup.set(groupKey, candidates);
    }

    const samplesByGroup = new Map<string, ManufacturerGroupProductSample[]>();
    for (const [groupKey, candidates] of candidatesByGroup.entries()) {
      const samples = candidates
        .filter((product) => product.hasPhoto === true)
        .slice(0, MANUFACTURER_GROUP_SAMPLE_LIMIT)
        .map<ManufacturerGroupProductSample>((product) => ({
          ...product,
          imageSrc: buildProductImagePath(product.code, product.article, {
            catalog: true,
            noFallback: true,
          }),
        }));

      if (samples.length > 0) {
        samplesByGroup.set(groupKey, samples);
      }
    }

    return samplesByGroup;
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
    // The build already generated a complete local SEO snapshot. Avoid starting
    // a live 1C lookup for every static manufacturer page: timed-out promises
    // continue running in the background and previously exhausted build workers.
    const producer = isProductionBuildPhase
      ? await findFallbackProducerBySlug(slug)
      : await resolveWithTimeout<SeoProducerFacet | null>(
          () => findSeoProducerBySlug(slug),
          null,
          MANUFACTURER_SEO_LOOKUP_TIMEOUT_MS
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
    // topCategories from SEO facet (present in snapshot rebuilt after the fix)
    const seoTopCategories = (producer?.topCategories ?? []).map((cat) => ({
      label: cat.label,
      slug: cat.slug,
      productCount: cat.productCount,
      groups: (cat.groups ?? [])
        .map((g) => ({
          label: g.label,
          filterValue: g.filterValue,
          slug: g.slug,
          productCount: g.productCount,
          subgroups: (g.subgroups ?? []).filter((s) => normalizeValue(s.label).length > 0),
        }))
        .filter((g) => normalizeValue(g.label).length > 0),
    })).filter((cat) => normalizeValue(cat.label).length > 0 && cat.groups.length > 0);
    const shouldUseFallbackCounts =
      !isProductionBuildPhase &&
      !(
        productCount > 0 &&
        groupsCount > 0 &&
        (categoriesCount > 0 || topGroups.length > 0) &&
        seoTopCategories.length > 0
      );
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
    const fallbackTopCategories = fallbackCounts?.topCategories || [];
    // Prefer the fallback (live, hierarchy-resolved) data whenever the snapshot
    // has no groups at all, or its 3-level Категорія→Группа tree is empty while
    // the fallback actually found one — comparing "do we have a category tree"
    // rather than mismatched counts (top-level categories vs. total subgroups).
    const useFallbackGroups =
      fallbackTopGroups.length > 0 &&
      (topGroups.length === 0 ||
        (seoTopCategories.length === 0 && fallbackTopCategories.length > 0));
    const resolvedTopGroups: ManufacturerPageData["topGroups"] = useFallbackGroups
      ? fallbackTopGroups
      : topGroups;
    const resolvedTopCategories: NonNullable<ManufacturerPageData["topCategories"]> =
      useFallbackGroups && fallbackTopCategories.length > 0
        ? fallbackTopCategories
        : seoTopCategories;

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

    // Filter topCategories.groups to only keep groups that passed catalog validation.
    const validatedGroupSlugs = new Set(validatedTopGroups.map((g) => g.slug));
    const validatedTopCategories = resolvedTopCategories
      .map((cat) => ({
        ...cat,
        groups: cat.groups.filter((g) => validatedGroupSlugs.has(g.slug)),
      }))
      .filter((cat) => cat.groups.length > 0);

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
      topCategories: validatedTopCategories.length > 0 ? validatedTopCategories : undefined,
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
      url: "/Car-parts-fullwidth.png",
      alt: `${producer.label} — автозапчастини | PartsON`,
    },
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
    ? await getManufacturerTopProductsFromSnapshot(producer.label)
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
  const visibleProductImages = isProductionBuildPhase
    ? new Map(
        visibleProducts
          .filter((product) => product.hasPhoto === true)
          .map((product) => [
            buildProductDedupeKey(product),
            buildProductImagePath(product.code, product.article, {
              catalog: true,
              noFallback: true,
            }),
          ])
      )
    : await buildVerifiedProductImageMap(visibleProducts, {
        maxKeys: MANUFACTURER_VISIBLE_PRODUCTS_LIMIT * 2,
        timeoutMs: 650,
        allowUrlDownload: true,
      });
  const visibleProductImagePayload = Object.fromEntries(
    visibleProducts.flatMap((product) => {
      const imageKey = buildProductImageBatchKey(product.code, product.article);
      const imageSrc = visibleProductImages.get(buildProductDedupeKey(product));
      return imageKey && imageSrc ? [[imageKey, imageSrc]] : [];
    })
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
  const hasAnySubgroups = producer.topCategories?.length
    ? producer.topCategories.some((cat) => cat.groups.some((g) => g.subgroups.length > 0))
    : producer.topGroups.some((g) => g.subgroups.length > 0);
  const seoTextBlocks = buildUniqueTextBlocks(
    producer.description,
    seoCopy.intro,
    ...seoCopy.paragraphs
  ).slice(0, 4);
  const seoHighlights = buildUniqueTextBlocks(...seoCopy.highlights).slice(0, 4);
  const h1Title = `${producer.label} - каталог автозапчастин виробника`;

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
  const renderManufacturerGroupCard = (
    group: ManufacturerTopGroup,
    groupIndex: number,
    keyPrefix: string,
    showIcon = false
  ) => {
    const groupSamples =
      productSamplesByGroup.get(buildManufacturerGroupSampleKey(group.filterValue)) ||
      productSamplesByGroup.get(buildManufacturerGroupSampleKey(group.label)) ||
      [];
    // Exclude subgroups that duplicate the parent group label — clicking them
    // produces the same URL as the group itself (isSameFacetValue drops subcategory).
    const groupLabelKey = normalizeValue(group.label).toLowerCase();
    const visibleSubgroups = group.subgroups.filter(
      (s) => normalizeValue(s.label).toLowerCase() !== groupLabelKey
    );

    return (
      <article
        key={`${keyPrefix}:${group.slug}:${group.filterValue}:${groupIndex}`}
        className="group/card overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 transition-colors duration-200 hover:border-sky-200"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          {showIcon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-sky-100/80 bg-gradient-to-br from-sky-50 to-white">
              <Image
                src={getCategoryIconPath(group.label)}
                alt=""
                aria-hidden
                width={22}
                height={22}
                sizes="22px"
                className="h-[22px] w-[22px] object-contain"
              />
            </span>
          ) : null}

          <div className="min-w-0 flex-1">
            <CatalogPrefetchLink
              href={buildCatalogProducerPath(producer.label, group.filterValue)}
              prefetchCatalogOnViewport
              className="directory-card-title inline-flex text-[15px] leading-tight text-slate-900 transition-colors duration-200 group-hover/card:text-sky-700"
            >
              {normalizeValue(group.label)}
            </CatalogPrefetchLink>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
              {formatCountedWord(group.productCount, "товар", "товари", "товарів")}
            </span>
            {visibleSubgroups.length > 0 ? (
              <span className="whitespace-nowrap rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-700">
                {formatCountedWord(visibleSubgroups.length, "підгрупа", "підгрупи", "підгруп")}
              </span>
            ) : null}
            {groupSamples.length > 0 ? (
              <div className="hidden items-center -space-x-2 sm:flex">
                {groupSamples.slice(0, 2).map((sample, sampleIndex) => {
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
                      key={`${buildProductDedupeKey(sample)}:${sampleIndex}`}
                      href={samplePath}
                      title={sampleName}
                      className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white shadow-sm ring-1 ring-slate-100 transition-colors duration-200 hover:ring-sky-200"
                    >
                      <ManufacturerGroupSampleImage
                        src={sample.imageSrc}
                        alt={`Фото ${sampleName}`}
                      />
                    </Link>
                  );
                })}
              </div>
            ) : null}
            <CatalogPrefetchLink
              href={buildCatalogProducerPath(producer.label, group.filterValue)}
              prefetchCatalogOnViewport
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-colors duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
              aria-label={`Відкрити групу ${normalizeValue(group.label)}`}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="m9 18 6-6-6-6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </CatalogPrefetchLink>
          </div>
        </div>

        {visibleSubgroups.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            {visibleSubgroups.map((subgroup, subgroupIndex) => (
              <CatalogPrefetchLink
                key={`${keyPrefix}:${group.slug}:${groupIndex}:${subgroup.slug}:${subgroupIndex}`}
                href={buildCatalogProducerPath(
                  producer.label,
                  group.filterValue,
                  subgroup.label
                )}
                prefetchCatalogOnViewport
                className="group/sub inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-slate-50/80 px-2.5 py-1 text-[12px] font-semibold text-slate-600 transition-colors duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
              >
                {normalizeValue(subgroup.label)}
                <span className="whitespace-nowrap rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400 transition-colors duration-200 group-hover/sub:text-sky-600">
                  {formatCountedWord(subgroup.productCount, "товар", "товари", "товарів")}
                </span>
              </CatalogPrefetchLink>
            ))}
          </div>
        ) : null}
      </article>
    );
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

        <section className="relative overflow-hidden rounded-[30px] border border-white/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,249,255,0.94),rgba(236,254,255,0.9))] p-4 shadow-[0_28px_70px_rgba(14,165,233,0.15)] ring-1 ring-sky-100/70 sm:p-5 lg:p-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-sky-200/35 via-cyan-100/25 to-emerald-100/25" />

          <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <div className="flex h-24 w-24 items-center justify-center rounded-[24px] border border-white/90 bg-white/86 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.09)] ring-1 ring-sky-100/80 sm:h-28 sm:w-28">
                {producer.logoPath ? (
                  <Image
                    src={producer.logoPath}
                    alt={producer.label}
                    width={96}
                    height={96}
                    sizes="96px"
                    className="max-h-full max-w-full object-contain"
                    priority
                  />
                ) : (
                  <span className="directory-card-title text-3xl text-slate-700">
                    {producer.initials}
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={directoryBadgeClass}>Сторінка виробника</span>
                  <span className={directoryCompactMetricClass}>
                    {buildManufacturerHeroSupportLabel(producer.label)}
                  </span>
                  <span className={directoryCompactMetricAccentClass}>
                    Групи, підгрупи і товари
                  </span>
                </div>

                <h1 className="directory-heading-hero mt-3 text-[2rem] leading-[1.1] text-slate-950 sm:text-[2.45rem]">
                  {h1Title}
                </h1>
                <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600 sm:text-[15px]">
                  {pageDescription}
                </p>

                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <span className={directoryCompactMetricClass}>
                      Фільтр виробника вже готовий
                    </span>
                    <span className={directoryCompactMetricAccentClass}>
                      Сторінка з товарами і групами
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <CatalogPrefetchLink
                      href={catalogPath}
                      prefetchCatalogOnViewport
                      className={directoryPrimaryButtonClass}
                    >
                      Товари бренду
                    </CatalogPrefetchLink>
                    <a
                      href="#manufacturer-groups"
                      className={directorySecondaryButtonClass}
                    >
                      Групи товарів
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <aside className="grid gap-2.5 rounded-[24px] border border-white/85 bg-white/78 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.08)] ring-1 ring-sky-100/70 sm:grid-cols-3 xl:grid-cols-1">
              {[
                { label: "товарів бренду", value: formatCount(producer.productCount) },
                { label: "груп товарів", value: formatCount(producer.groupsCount) },
                { label: "підгруп", value: formatCount(producer.categoriesCount) },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-[18px] border border-slate-200/85 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(255,255,255,0.96))] px-3.5 py-3"
                >
                  <span className="directory-counter block text-2xl leading-none text-slate-900">
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

        <section className={directoryPanelClass}>
          <div className={directoryHeaderClass}>
            <div className="max-w-4xl">
              <p className={directoryBadgeClass}>
                Про бренд у PartsON
              </p>
              <h2 className={directoryTitleClass}>
                {seoCopy.title}
              </h2>
              <p className={directoryDescriptionClass}>
                {pageDescription}
              </p>
            </div>
          </div>

          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
            <article className="rounded-[22px] border border-slate-200/85 bg-white/94 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.055)] sm:p-5">
              <div className="space-y-3 text-sm leading-6 text-slate-600 sm:text-[15px]">
                {seoTextBlocks.map((paragraph, index) => (
                  <p
                    key={`${index}:${paragraph}`}
                    className={
                      index === 0
                        ? "rounded-[18px] border border-sky-100 bg-sky-50/60 px-4 py-3 font-semibold text-slate-700"
                        : undefined
                    }
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </article>

            <aside className="rounded-[22px] border border-slate-200/85 bg-[linear-gradient(165deg,rgba(248,250,252,0.98),rgba(240,249,255,0.9),rgba(255,255,255,0.98))] p-4 shadow-[0_16px_34px_rgba(15,23,42,0.055)]">
              <p className="directory-kicker text-[11px] uppercase text-sky-800">
                Основні напрямки бренду
              </p>
              <ul className="mt-3 space-y-2.5 text-sm leading-6 text-slate-600">
                {seoHighlights.map((highlight) => (
                  <li
                    key={highlight}
                    className="flex gap-2 rounded-[14px] border border-white/80 bg-white/72 px-3 py-2"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid gap-2">
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
                  {hasAnySubgroups ? "Дивитись групи і підгрупи" : "Дивитись групи товарів"}
                </a>
              </div>
            </aside>
          </div>
        </section>

        <section id="manufacturer-groups" className={directoryPanelClass}>
          <div className={directoryHeaderClass}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className={directoryBadgeClass}>
                  Структура каталогу бренду
                </p>
                <h2 className={directoryTitleClass}>
                  {producer.topCategories?.length
                    ? hasAnySubgroups
                      ? `Категорії, групи та підгрупи ${producer.label}`
                      : `Категорії та групи ${producer.label}`
                    : hasAnySubgroups
                      ? `Групи та підгрупи ${producer.label}`
                      : `Групи товарів ${producer.label}`}
                </h2>
                <p className={directoryDescriptionClass}>
                  {producer.topCategories?.length
                    ? hasAnySubgroups
                      ? "Категорія — загальний напрямок, група веде до основного фільтра, а підгрупи відкривають точніші результати."
                      : "Категорія — загальний напрямок; кожна група веде безпосередньо до відповідного розділу каталогу."
                    : hasAnySubgroups
                      ? "Група веде до основного фільтра каталогу бренду, а підгрупи одразу відкривають точніші результати."
                      : "Кожна група веде безпосередньо до відповідного розділу каталогу цього виробника."}
                </p>
              </div>
              <div className={`grid gap-2 lg:min-w-[25rem] ${producer.topCategories?.length ? (hasAnySubgroups ? "sm:grid-cols-3" : "sm:grid-cols-2") : (hasAnySubgroups ? "sm:grid-cols-2" : "sm:grid-cols-1")}`}>
                {(producer.topCategories?.length
                  ? hasAnySubgroups
                    ? [
                        { label: "Категорія", text: "загальний напрямок" },
                        { label: "Група", text: "основний фільтр" },
                        { label: "Підгрупа", text: "точний результат" },
                      ]
                    : [
                        { label: "Категорія", text: "загальний напрямок" },
                        { label: "Група", text: "перехід до каталогу" },
                      ]
                  : hasAnySubgroups
                    ? [
                        { label: "Група", text: "основний фільтр" },
                        { label: "Підгрупа", text: "точний результат" },
                      ]
                    : [
                        { label: "Група", text: "перехід до каталогу" },
                      ]
                ).map((level) => (
                  <div
                    key={level.label}
                    className="rounded-[16px] border border-slate-200 bg-white/82 px-3 py-2 shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
                  >
                    <span className="block text-xs font-semibold text-slate-900">
                      {level.label}
                    </span>
                    <span className="directory-counter-label mt-1 block text-[10px] uppercase text-slate-500">
                      {level.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {producer.topCategories?.length ? (
            <div className="space-y-5 px-4 py-4 sm:px-5 sm:py-5">
              {producer.topCategories.map((category, categoryIndex) => (
                <article
                  key={`${category.slug}:${categoryIndex}`}
                  className="overflow-hidden rounded-[24px] border border-sky-100/90 bg-[linear-gradient(180deg,rgba(240,249,255,0.92),rgba(255,255,255,0.98)_34%)] shadow-[0_18px_40px_rgba(14,165,233,0.09)] ring-1 ring-white/80"
                >
                  <div className="border-b border-sky-100/80 px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-sky-100/80 bg-gradient-to-br from-sky-50 to-white shadow-[0_2px_8px_rgba(14,165,233,0.10)]">
                          <Image
                            src={getCategoryIconPath(category.label)}
                            alt=""
                            aria-hidden
                            width={28}
                            height={28}
                            sizes="28px"
                            className="h-7 w-7 object-contain"
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="directory-kicker text-[10px] uppercase text-sky-800">
                            Категорія
                          </p>
                          <h3 className="directory-heading mt-0.5 text-xl text-slate-900 sm:text-2xl">
                            {normalizeValue(category.label)}
                          </h3>
                          <p className="mt-1 text-[13px] leading-5 text-slate-500">
                            Запчастини {producer.label} у категорії «{normalizeValue(category.label)}»: оберіть групу нижче.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={directoryCompactMetricClass}>
                          {formatCountedWord(category.groups.length, "група", "групи", "груп")}
                        </span>
                        <span className={directoryCompactMetricAccentClass}>
                          {formatCountedWord(category.productCount, "товар виробника", "товари виробника", "товарів виробника")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 p-2.5 sm:p-3">
                    {category.groups.map((group, groupIndex) =>
                      renderManufacturerGroupCard(
                        group,
                        groupIndex,
                        `${category.slug}:${categoryIndex}`
                      )
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : producer.topGroups.length > 0 ? (
            <div className="space-y-2.5 px-4 py-4 sm:px-5 sm:py-5">
              {producer.topGroups.map((group, groupIndex) =>
                renderManufacturerGroupCard(group, groupIndex, "fallback-groups", true)
              )}
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
            <ManufacturerCatalogProducts
              products={visibleProducts}
              images={visibleProductImagePayload}
            />
          </section>
        )}
      </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
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
