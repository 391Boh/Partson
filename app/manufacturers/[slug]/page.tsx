import DirectoryCollection from "app/components/DirectoryCollection";
import CatalogSectionNav from "app/components/CatalogSectionNav";
import HeroTitleText from "app/components/HeroTitleText";
import DirectoryHeroBackdrop from "app/components/DirectoryHeroBackdrop";
import { cache } from "react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowRight, ChevronRight, Info, Layers3, PackageSearch, Search, ShoppingBag } from "lucide-react";

import CatalogPrefetchLink from "app/components/CatalogPrefetchLink";
import CatalogSeoTextSection from "app/components/CatalogSeoTextSection";
import ManufacturerCatalogProducts from "app/manufacturers/[slug]/ManufacturerCatalogProducts";
import { brands } from "app/components/brandsData";
import { resolveRenamedProducerRedirect } from "app/lib/producer-rename-redirects";
import {
  catalogPageBackgroundClass,
  directoryBadgeClass,
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
  resolveProducerSocialImage,
} from "app/lib/brand-logo";
import {
  findSeoProducerByPlainSlug,
  findSeoProducerBySlug,
  type SeoProducerFacet,
} from "app/lib/catalog-seo";
import {
  fetchCatalogProductsByQuery,
  fetchConfirmedEuroRate,
  fetchEuroRate,
  type CatalogProduct,
} from "app/lib/catalog-server";
import ManufacturerProductIndexFilter from "app/manufacturers/[slug]/ManufacturerProductIndexFilter";
import { resolveProductCategoryHierarchy } from "app/lib/catalog-hierarchy";
import {
  buildCatalogSeoFacetsFromSitemapEntries,
  readCatalogSeoFacetsSnapshot,
} from "app/lib/catalog-count-fallback";
import {
  getAllProductSitemapEntries,
  getAllProductSitemapSnapshotEntries,
  type ProductSitemapEntry,
} from "app/lib/product-sitemap";
import { fixCatalogSpelling, formatCatalogLabel } from "app/lib/catalog-label-format";
import { getFullManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { shortenRevalidateForIncompleteRender } from "app/lib/isr-retry";
import { fetchProductImageBase64Batch } from "app/lib/product-image";
import {
  buildProductImageBatchKey,
  buildProductImagePath,
} from "app/lib/product-image-path";
import { buildProductPhotoPath } from "app/lib/product-image-variant-path";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { isPublicCatalogProduct, withoutCostPrice } from "app/lib/public-catalog-product";
import { getProducerSeoCopy, isIndexableManufacturerPage } from "app/lib/seo-copy";
import {
  appendSeoContact,
  buildFirstFittingSeoTitle,
  buildPageMetadata,
  lowerFirstSeoWord,
  pickFittingSeoDescription,
} from "app/lib/seo-metadata";
import { buildSeoSlug } from "app/lib/seo-slug";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";
import ManufacturerGroupSampleImage from "app/manufacturers/[slug]/ManufacturerGroupSampleImage";
import { getCategoryIconPath } from "app/lib/category-icons";
import { getGroupProductPreview } from "app/lib/group-product-image";
import PartTypeIcon from "app/components/PartTypeIcon";
import { pluralizeUk } from "app/lib/pluralize-uk";

export const revalidate = 21600;
export const dynamicParams = true;
// Default covers the real manufacturer page count (312, see .env.example)
// plus headroom, so every manufacturer page in the sitemap pre-renders at
// build by default.
const MANUFACTURER_STATIC_PARAMS_LIMIT_DEFAULT = 350;
const MANUFACTURER_SEO_LOOKUP_TIMEOUT_MS = 500;
const MANUFACTURER_FALLBACK_COUNT_LIMIT = 120;
const MANUFACTURER_FALLBACK_STATS_TIMEOUT_MS = 4000;
const MANUFACTURER_FALLBACK_MAX_PAGES_DEFAULT = 40;
const MANUFACTURER_FALLBACK_MAX_ITEMS_DEFAULT = 4800;
const MANUFACTURER_TOP_PRODUCTS_LIMIT = 48;
const MANUFACTURER_VISIBLE_PRODUCTS_LIMIT = 6;
// ISR serves the previous HTML while a page regenerates, so this wait is
// almost never on a visitor's critical path — but too short a wait is what
// left brand pages cached without products (and product photos) for Googlebot.
const MANUFACTURER_TOP_PRODUCTS_TIMEOUT_MS = 2600;
const MANUFACTURER_TOP_PRODUCTS_FETCH_TIMEOUT_MS = 2400;
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

const formatCountedWord = (value: number, one: string, few: string, many: string) =>
  `${formatCount(value)} ${pluralizeUk(value, one, few, many)}`;

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

const SEO_DESCRIPTION_TAILS = [
  ". Ціни, наявність у Львові, підбір за артикулом і VIN, доставка по Україні.",
  ". Ціни, наявність у Львові, підбір за VIN, доставка по Україні.",
  ". Ціни й наявність у Львові, доставка по Україні.",
  ". Ціни й наявність у Львові.",
] as const;

type ManufacturerSeoGroup = { label: string; productCount: number };

const rankManufacturerSeoGroups = (groups: ManufacturerSeoGroup[]) =>
  Array.from(
    new Map(
      [...groups]
        .filter((group) => group.productCount > 0)
        .sort((a, b) => b.productCount - a.productCount)
        .map((group) => {
          const visible = lowerFirstSeoWord(formatCatalogLabel(buildVisibleProductName(normalizeValue(group.label))));
          return [visible.toLocaleLowerCase("uk-UA"), visible] as const;
        })
        .filter(([key]) => Boolean(key))
    ).values()
  );

// Brand searches are usually brand + part ("abe колодки", "febi важіль"), so
// the <title> names the brand's biggest groups when they fit. Some producer
// labels run long (e.g. "INTERNATIONAL RADIATORS", 23 chars) —
// buildFirstFittingSeoTitle steps down to shorter tails rather than risk a
// Google-truncated title once the layout's " | PartsON" template is added.
const buildManufacturerTitle = (label: string, groups: ManufacturerSeoGroup[] = []) => {
  const name = normalizeValue(label);
  const [first, second] = rankManufacturerSeoGroups(groups);
  // Brand searches read "caffaro каталог", "continental інтернет магазин":
  // the word "каталог" leads, the biggest groups follow when they fit.
  const tails = [
    ...(first && second ? [` — каталог: ${first}, ${second}`] : []),
    ...(first ? [` — каталог запчастин: ${first}`, ` — каталог: ${first}`] : []),
    " — каталог запчастин, ціни у Львові",
    " — каталог запчастин",
  ];
  return buildFirstFittingSeoTitle(name, tails);
};

const buildManufacturerDescription = (
  label: string,
  productCount: number,
  groups: ManufacturerSeoGroup[],
  groupsCount: number
) => {
  const normalizedLabel = normalizeValue(label);
  const productCountLabel =
    productCount > 0
      ? formatCountedWord(productCount, "товар", "товари", "товарів")
      : "товари виробника";
  const rankedGroups = rankManufacturerSeoGroups(groups);
  // groups may be a trimmed list; groupsCount is the brand's full total.
  const totalGroups = Math.max(groupsCount, rankedGroups.length);
  const buildGroupsClause = (namedCount: number) => {
    const named = rankedGroups.slice(0, namedCount);
    if (!named.length) return "";
    const restCount = totalGroups - named.length;
    return ` — ${named.join(", ")}${restCount > 0 ? ` та ще ${formatCountedWord(restCount, "група", "групи", "груп")}` : ""}`;
  };

  return pickFittingSeoDescription(
    [3, 2, 1, 0].flatMap((namedCount) =>
      SEO_DESCRIPTION_TAILS.map(
        (tail) => `${normalizedLabel} у PartsON: ${productCountLabel}${buildGroupsClause(namedCount)}${tail}`
      )
    )
  );
};

// topGroups can be empty when only the 3-level (Категорія → Группа) data
// resolved; the groups inside topCategories carry the same names and counts.
const getManufacturerSeoGroups = (producer: ManufacturerPageData): ManufacturerSeoGroup[] =>
  producer.topGroups.length
    ? producer.topGroups
    : (producer.topCategories ?? []).flatMap((category) => category.groups);

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
    timeoutMs: MANUFACTURER_TOP_PRODUCTS_FETCH_TIMEOUT_MS,
    retries: 0,
    retryDelayMs: 100,
    cacheTtlMs: 1000 * 60 * 30,
  });

  const items = result.items.filter((item) => Boolean(item.code) && Boolean(item.name));
  // A 1C timeout surfaces as an empty list. Throwing keeps unstable_cache from
  // storing it for 30 minutes; the page falls back to [] and retries soon.
  if (items.length === 0) throw new Error("Manufacturer top products unavailable");
  return items;
};

const getManufacturerTopProductsCached = unstable_cache(
  fetchManufacturerTopProductsUncached,
  ["manufacturer:top-products:v2"],
  { revalidate: 60 * 30 }
);

const getManufacturerTopProducts = cache(getManufacturerTopProductsCached);

// Every public product of the brand from the snapshot written at build:
// plain links so Google can reach all of them — the product block shows only
// a few. No 1C request.
const MANUFACTURER_ALL_PRODUCTS_LINK_LIMIT = 300;
const getManufacturerProductLinks = async (producerLabel: string, skipCodes: Set<string>) => {
  const producer = normalizeValue(producerLabel).toLocaleLowerCase("uk-UA");
  if (!producer) return [];
  const entries = await getAllProductSitemapSnapshotEntries().catch(() => [] as ProductSitemapEntry[]);
  return entries
    .filter(
      (entry) =>
        !skipCodes.has(entry.code) &&
        normalizeValue(entry.producer).toLocaleLowerCase("uk-UA") === producer
    )
    .slice(0, MANUFACTURER_ALL_PRODUCTS_LINK_LIMIT);
};

const getManufacturerTopProductsFromSnapshot = cache(
  async (
    producerLabel: string,
    limit = MANUFACTURER_TOP_PRODUCTS_LIMIT
  ): Promise<CatalogProduct[]> => {
    const normalizedProducer = normalizeValue(producerLabel);
    if (!normalizedProducer) return [];

    const products: CatalogProduct[] = [];
    const seen = new Set<string>();
    // At runtime only the snapshot file written at build: this is the
    // fallback for a 1C lookup that already timed out.
    const entries = await (isProductionBuildPhase
      ? getAllProductSitemapEntries()
      : getAllProductSitemapSnapshotEntries()
    ).catch(() => [] as ProductSitemapEntry[]);

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
        buildSeoSlug(producer.label) === normalizedSlug ||
        producer.slug === buildSeoSlug(normalizedSlug)
    ) ||
    findSeoProducerByPlainSlug(facets.producers, normalizedSlug)
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

// producer.productCount counts only the priced, photographed products in the
// SEO snapshot (the index/noindex rule relies on that). Visitors are told the
// same unfiltered total as the manufacturers list and the catalog they land in.
const getManufacturerVisibleTotal = async (producer: ManufacturerPageData) => {
  const directoryEntry = await resolveWithTimeout(
    () =>
      getFullManufacturersDirectoryData().then(
        (data) => data.clientProducers.find((item) => item.slug === producer.slug) ?? null
      ),
    null,
    800
  ).catch(() => null);
  return Math.max(producer.productCount, directoryEntry?.productCount || 0);
};

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

// A producer renamed or replaced in the admin panel keeps its old URL; an
// older collision suffix ("…-f44l35-2", still linked from outside) points at
// the producer that now owns the unsuffixed slug.
async function resolveMissingManufacturerRedirect(slug: string) {
  const renamed = await resolveRenamedProducerRedirect(slug);
  if (renamed) return renamed;
  const base = slug.match(/^(.+)-\d{1,2}$/)?.[1];
  const producer = base ? await getManufacturerBySlug(base) : null;
  return producer ? buildManufacturerPath(producer.slug) : null;
}

export async function generateMetadata({
  params,
}: ManufacturerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const producer = await getManufacturerBySlug(slug);

  if (!producer) {
    const redirectPath = await resolveMissingManufacturerRedirect(slug);
    if (redirectPath) permanentRedirect(redirectPath);
    notFound();
  }

  const title = buildManufacturerTitle(producer.label, getManufacturerSeoGroups(producer));
  const description = appendSeoContact(
    buildManufacturerDescription(
      producer.label,
      await getManufacturerVisibleTotal(producer),
      getManufacturerSeoGroups(producer),
      producer.groupsCount
    )
  );

  // Brand logos are mostly SVG, which Google and social previews don't take
  // as a page image; a real photo of one of the brand's products gives the
  // result a thumbnail instead of the generic site card.
  const productPhoto = resolveProducerSocialImage(producer.label, producer.logoPath)
    ? null
    : (await getManufacturerTopProductsFromSnapshot(producer.label).catch(
        () => [] as CatalogProduct[]
      )).find((product) => product.hasPhoto === true && product.code);
  const producerImage =
    resolveProducerSocialImage(producer.label, producer.logoPath) ??
    (productPhoto
      ? {
          url: buildProductPhotoPath(productPhoto),
          alt: `${buildVisibleProductName(productPhoto.name)} — ${producer.label}`,
        }
      : null);

  return buildPageMetadata({
    title,
    description,
    canonicalPath: buildManufacturerPath(producer.slug),
    // A brand with no products, or only one or two and no brand
    // description, renders a thin page — keep it reachable but out of the
    // index (the manufacturers sitemap applies the same rule).
    index: isIndexableManufacturerPage(producer.label, producer.productCount),
    keywords: buildManufacturerKeywords(producer.label),
    openGraphTitle: `${title} | PartsON`,
    image: producerImage ?? {
      url: "/opengraph-partson-v4.jpg",
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
    const redirectPath = await resolveMissingManufacturerRedirect(slug);
    if (redirectPath) permanentRedirect(redirectPath);
    notFound();
  }
  if (slug !== producer.slug) {
    permanentRedirect(buildManufacturerPath(producer.slug));
  }

  const liveTopProducts = isProductionBuildPhase
    ? []
    : await resolveWithTimeout(
        () => getManufacturerTopProducts(producer.label),
        [] as CatalogProduct[],
        MANUFACTURER_TOP_PRODUCTS_TIMEOUT_MS
      );
  // A slow 1C used to leave brand pages without a single product (ISR then
  // kept that empty render); the build-time snapshot fills them instead.
  const topProducts = liveTopProducts.length > 0
    ? liveTopProducts
    : await getManufacturerTopProductsFromSnapshot(producer.label);
  const manufacturerProducts = topProducts.filter((p) => Boolean(p.code) && Boolean(p.name));
  // No productCount guard: during `next build` and on 1C timeouts the count
  // can be missing too, so it can't tell a slow render from an empty brand.
  // A snapshot-filled render still retries 1C soon for live prices.
  if (manufacturerProducts.length === 0 || (!isProductionBuildPhase && liveTopProducts.length === 0)) {
    await shortenRevalidateForIncompleteRender();
  }
  const visibleProducts = manufacturerProducts.slice(0, MANUFACTURER_VISIBLE_PRODUCTS_LIMIT);
  const manufacturerProductLinks = await getManufacturerProductLinks(
    producer.label,
    new Set(visibleProducts.map((product) => product.code))
  );
  // These two only depend on topProducts/visibleProducts above, not on each
  // other — group sampling and image resolution used to run back-to-back,
  // each paying its own full timeout on the tail case.
  // Same confirmed rate as the product page, so a brand card never shows a
  // price that differs from the product it links to.
  const euroRatePromise = visibleProducts.some(
    (product) => typeof product.priceEuro === "number" && product.priceEuro > 0
  )
    ? resolveWithTimeout(() => fetchConfirmedEuroRate(), null, 1500)
        .then((rate) => rate ?? resolveWithTimeout(() => fetchEuroRate(), null, 500))
        .catch(() => null)
    : Promise.resolve(null);
  const [productSamplesByGroup, visibleProductImages, euroRate] = await Promise.all([
    buildManufacturerGroupProductSamples(
      producer.label,
      producer.topGroups,
      manufacturerProducts
    ),
    isProductionBuildPhase
      ? Promise.resolve(
          new Map(
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
        )
      : buildVerifiedProductImageMap(visibleProducts, {
          maxKeys: MANUFACTURER_VISIBLE_PRODUCTS_LIMIT * 2,
          timeoutMs: 650,
          allowUrlDownload: true,
        }),
    euroRatePromise,
  ]);
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
  const totalProductCount = await getManufacturerVisibleTotal(producer);
  const catalogProducerValue = new URLSearchParams(catalogPath.split("?")[1]).get("producer") || producer.label;
  const canonicalPageUrl = `${siteUrl}${pagePath}`;
  const pageTitle = buildManufacturerTitle(producer.label, getManufacturerSeoGroups(producer));
  const pageDescription = buildManufacturerDescription(
    producer.label,
    totalProductCount,
    getManufacturerSeoGroups(producer),
    producer.groupsCount
  );
  const seoCopy = getProducerSeoCopy(
    producer.label,
    totalProductCount,
    producer.topGroups.map((group) => group.label),
    manufacturerProducts.map((product) => product.name)
  );
  const hasAnySubgroups = producer.topCategories?.length
    ? producer.topCategories.some((cat) => cat.groups.some((g) => g.subgroups.length > 0))
    : producer.topGroups.some((g) => g.subgroups.length > 0);
  const seoTextBlocks = buildUniqueTextBlocks(
    producer.description,
    ...seoCopy.paragraphs
  ).slice(0, 5);
  const seoHighlights = buildUniqueTextBlocks(...seoCopy.highlights).slice(0, 4);
  // Em-dash, matching buildManufacturerTitle above and the site's heading
  // convention elsewhere — was a plain hyphen with an awkward triple-
  // genitive ("каталог автозапчастин виробника"), the only H1 on the site
  // phrased that way. "виробника" was also redundant: the whole page is
  // already about this one producer, so the H1 doesn't need to spell that
  // out again on top of the brand name it already leads with.
  const h1Title = `${producer.label} — каталог автозапчастин`;
  const manufacturerJsonLdGroups = producer.topCategories?.length
    ? producer.topCategories.flatMap((category) =>
        category.groups.map((group) => ({ group, categoryLabel: category.label }))
      )
    : producer.topGroups.map((group) => ({ group, categoryLabel: "" }));

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
    mainEntity: manufacturerJsonLdGroups.length > 0
      ? {
          "@type": "ItemList",
          itemListElement: manufacturerJsonLdGroups.slice(0, 24).map((entry, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: entry.group.label,
            url: `${siteUrl}${
              entry.categoryLabel
                ? buildCatalogProducerPath(
                    producer.label,
                    entry.categoryLabel,
                    entry.group.filterValue,
                    { expandHierarchy: true }
                  )
                : buildCatalogProducerPath(producer.label, entry.group.filterValue)
            }`,
          })),
        }
      : undefined,
  };

  // Product + Offer markup belongs on each product's own page (Google limits
  // product rich results and merchant listings to single-product pages); the
  // brand page lists its products by URL only, and only public products whose
  // pages are indexable.
  const schemaProducts = visibleProducts.filter(isPublicCatalogProduct);
  const productItemListJsonLd = schemaProducts.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "@id": `${canonicalPageUrl}#product-list`,
        name: `Товари бренду ${producer.label}`,
        numberOfItems: schemaProducts.length,
        itemListElement: schemaProducts.map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${siteUrl}${buildProductPath({
            code: product.code,
            article: product.article,
            name: product.name,
            producer: product.producer,
            group: product.group,
            subGroup: product.subGroup,
            category: product.category,
          })}`,
          name: buildVisibleProductName(product.name),
        })),
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
    showIcon = false,
    categoryFilterValue = ""
  ) => {
    const groupSamples =
      productSamplesByGroup.get(buildManufacturerGroupSampleKey(group.filterValue)) ||
      productSamplesByGroup.get(buildManufacturerGroupSampleKey(group.label)) ||
      [];
    // Exclude subgroups that duplicate the parent group label — clicking them
    // produces the same URL as the group itself (isSameFacetValue drops subcategory).
    // This manufacturer's own product photo first; the build-time group
    // preview (another brand's product of the same type) only when there is
    // none; the schematic icon underneath shows when neither loads.
    const groupPreview = groupSamples[0]
      ? null
      : getGroupProductPreview({ categoryLabel: categoryFilterValue, itemLabel: group.label });
    const groupThumb = groupSamples[0]
      ? { src: groupSamples[0].imageSrc, alt: `Фото ${buildVisibleProductName(groupSamples[0].name)}` }
      : groupPreview
        ? { src: groupPreview.url, alt: categoryFilterValue ? groupPreview.alt : `Товар групи «${formatCatalogLabel(normalizeValue(group.label))}»` }
        : null;
    const groupLabelKey = normalizeValue(group.label).toLowerCase();
    const visibleSubgroups = group.subgroups.filter(
      (s) => normalizeValue(s.label).toLowerCase() !== groupLabelKey
    );
    // Start from category → group and expand the hierarchy. This includes
    // both products attached directly to that pair and products nested one
    // level deeper (group → subgroup), so the result matches the card count.
    // Reusing the visible group as the only root parameter makes positive
    // two-level counters open an empty catalog.
    const groupCatalogPath =
      categoryFilterValue
        ? buildCatalogProducerPath(
            producer.label,
            categoryFilterValue,
            group.filterValue,
            { expandHierarchy: true }
          )
        : buildCatalogProducerPath(producer.label, group.filterValue);

    const groupName = formatCatalogLabel(normalizeValue(group.label));

    // The whole row is one link (thumb, name, count, chevron) instead of a
    // card with a small chevron button: one generous target per group.
    return (
      <li key={`${keyPrefix}:${group.slug}:${group.filterValue}:${groupIndex}`} className="mfr-group">
        <CatalogPrefetchLink
          href={groupCatalogPath}
          prefetchCatalogOnViewport
          className="mfr-group-link"
        >
          {showIcon ? (
            <span className="manufacturer-group-thumb" aria-hidden="true">
              <PartTypeIcon label={group.label} parents={[categoryFilterValue]} size={24} />
              {groupThumb ? (
                <ManufacturerGroupSampleImage
                  src={groupThumb.src}
                  alt={groupThumb.alt}
                  size={112}
                  // Build-time group previews are 2:1 with wide margins
                  // around a centred part, so they are cropped to the
                  // square; product photos are shown whole.
                  className={`absolute inset-0 h-full w-full bg-white ${
                    groupThumb.src.startsWith("/group-previews/") ? "object-cover" : "object-contain p-1"
                  }`}
                />
              ) : null}
            </span>
          ) : null}
          <span className="mfr-group-text">
            <span className="mfr-group-name">{groupName}</span>
            <span className="mfr-group-count">
              {formatCountedWord(group.productCount, "товар", "товари", "товарів")}
            </span>
          </span>
          <ChevronRight className="mfr-group-chevron" size={18} strokeWidth={2.4} aria-hidden />
        </CatalogPrefetchLink>

        {visibleSubgroups.length > 0 ? (
          <ul className="mfr-subgroups" aria-label={`Підгрупи групи «${groupName}»`}>
            {visibleSubgroups.map((subgroup, subgroupIndex) => (
              <li key={`${keyPrefix}:${group.slug}:${groupIndex}:${subgroup.slug}:${subgroupIndex}`}>
                <CatalogPrefetchLink
                  href={buildCatalogProducerPath(
                    producer.label,
                    group.filterValue,
                    subgroup.label
                  )}
                  className="mfr-subgroup"
                >
                  {formatCatalogLabel(normalizeValue(subgroup.label))}
                  <span>{formatCount(subgroup.productCount)}</span>
                </CatalogPrefetchLink>
              </li>
            ))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <main className={`${catalogPageBackgroundClass} directory-detail-page min-h-screen py-5 sm:py-7`}>
      <div className="directory-detail-shell">
      <div key={producer.slug} className="space-y-4 sm:space-y-5">
        <section className="manufacturer-hero-section directory-detail-hero relative overflow-hidden rounded-[30px] border border-white/90 bg-[radial-gradient(circle_at_5%_0%,rgba(14,165,233,0.13),transparent_36%),radial-gradient(circle_at_95%_4%,rgba(20,184,166,0.12),transparent_38%),linear-gradient(138deg,rgba(255,255,255,0.99)_0%,rgba(247,251,254,0.97)_56%,rgba(242,249,248,0.94)_100%)] p-4 shadow-[0_30px_72px_rgba(15,23,42,0.10),0_8px_26px_rgba(14,165,233,0.055)] ring-1 ring-slate-200/60 sm:p-5 lg:p-6">
          <DirectoryHeroBackdrop tone="manufacturers" />
          <CatalogSectionNav current="manufacturers" />
          <div className="manufacturer-hero-aurora" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-x-10 top-0 h-10 bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent blur-xl" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />

          {/* Breadcrumb only — the "&larr; Усі виробники" pill that used to
              sit next to it went to the exact same /manufacturers URL as
              the "Виробники" crumb one word to its left. */}
          <nav aria-label="Навігаційні хлібні крихти" className="relative z-[1] mb-4">
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

          <div className="relative grid max-w-4xl gap-5">
            <div className="directory-detail-identity grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <div className="manufacturer-logo-frame flex h-28 w-28 items-center justify-center rounded-[24px] border border-white/90 bg-white/86 p-4 shadow-[0_18px_42px_rgba(15,23,42,0.09),0_0_0_6px_rgba(14,165,233,0.06)] ring-1 ring-sky-100/80 sm:h-32 sm:w-32 lg:h-36 lg:w-36">
                {producer.logoPath ? (
                  <Image
                    src={producer.logoPath}
                    alt={`Логотип виробника автозапчастин ${producer.label}`}
                    width={128}
                    height={128}
                    sizes="(max-width: 640px) 112px, (max-width: 1024px) 128px, 144px"
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
                {/* One identity badge instead of three — the other two
                    ("Каталог бренду {label} з переходом до груп і
                    категорій", "Групи, підгрупи і товари") only restated
                    the H1 right below them and the stat tiles to the
                    right. */}
                <span className={directoryBadgeClass}>Сторінка виробника</span>

                <h1 className="directory-heading-hero mt-3 text-[2rem] leading-[1.1] text-slate-950 sm:text-[2.45rem]">
                  <HeroTitleText title={h1Title} />
                </h1>
                <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600 sm:text-[15px]">
                  У каталозі PartsON —{" "}
                  <strong>
                    {formatCountedWord(totalProductCount, "товар", "товари", "товарів")} {producer.label}
                  </strong>
                  . Знайдіть деталь за назвою чи артикулом
                  {producer.groupsCount > 1
                    ? ` або оберіть одну з ${formatCount(producer.groupsCount)} груп нижче`
                    : " або оберіть групу нижче"}
                  . Перед замовленням звірте артикул і застосування до вашого авто.
                </p>

                {/* A plain GET form into the catalog with this brand already
                    selected: works before hydration and needs no client JS. */}
                <form action="/katalog" method="get" role="search" className="mfr-hero-search">
                  <input type="hidden" name="tab" value="producer" />
                  <input type="hidden" name="producer" value={catalogProducerValue} />
                  <label htmlFor="manufacturer-search" className="sr-only">
                    Пошук серед товарів {producer.label}
                  </label>
                  <Search className="mfr-hero-search-icon" size={18} strokeWidth={2.3} aria-hidden />
                  <input
                    id="manufacturer-search"
                    type="search"
                    name="search"
                    required
                    minLength={2}
                    autoComplete="off"
                    enterKeyHint="search"
                    placeholder={`Назва або артикул ${producer.label}`}
                  />
                  <button type="submit">Знайти</button>
                </form>

                <div className="mfr-hero-actions">
                  <CatalogPrefetchLink
                    href={catalogPath}
                    prefetchCatalogOnViewport
                    className={directoryPrimaryButtonClass}
                  >
                    <ShoppingBag size={16} strokeWidth={2.3} aria-hidden />
                    {totalProductCount > 0
                      ? `Усі ${formatCountedWord(totalProductCount, "товар", "товари", "товарів")}`
                      : "Усі товари бренду"}
                  </CatalogPrefetchLink>
                  <nav aria-label="Швидкий перехід по сторінці" className="mfr-quicknav">
                    <a href="#manufacturer-groups" className="manufacturer-quicknav-pill">
                      <Layers3 size={13} strokeWidth={2.4} aria-hidden />
                      Категорії
                    </a>
                    {visibleProducts.length > 0 ? (
                      <a href="#manufacturer-products" className="manufacturer-quicknav-pill">
                        <PackageSearch size={13} strokeWidth={2.4} aria-hidden />
                        Популярні товари
                      </a>
                    ) : null}
                    <a href="#manufacturer-about" className="manufacturer-quicknav-pill">
                      <Info size={13} strokeWidth={2.4} aria-hidden />
                      Про бренд
                    </a>
                  </nav>
                </div>
              </div>
            </div>

          </div>
        </section>


        <section id="manufacturer-groups" className={`${directoryPanelClass} scroll-mt-24`}>
          <div className={directoryHeaderClass}>
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
                  ? "Відкрийте всю категорію або одразу потрібну групу — каталог покаже лише товари цього виробника."
                  : "Кожна група веде до розділу каталогу лише з товарами цього виробника."}
              </p>
            </div>
          </div>

          {producer.topCategories?.length ? (
            <DirectoryCollection labels={producer.topCategories.map(category => [category.label, ...category.groups.map(group => group.label)].join(" "))} className="mfr-category-grid" placeholder="Пошук у категоріях виробника">
              {producer.topCategories.map((category, categoryIndex) => {
                const categoryName = normalizeValue(category.label);
                return (
                  <article key={`${category.slug}:${categoryIndex}`} className="mfr-category">
                    <header className="mfr-category-head">
                      <span className="mfr-category-icon" aria-hidden="true">
                        <Image
                          src={getCategoryIconPath(category.label)}
                          alt=""
                          width={28}
                          height={28}
                          sizes="28px"
                          className="h-7 w-7 object-contain"
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="mfr-category-title">{categoryName}</h3>
                        <p className="mfr-category-meta">
                          {formatCountedWord(category.productCount, "товар", "товари", "товарів")}
                          {category.groups.length > 1
                            ? ` · ${formatCountedWord(category.groups.length, "група", "групи", "груп")}`
                            : ""}
                        </p>
                      </div>
                      {category.groups.length > 1 ? (
                        <CatalogPrefetchLink
                          href={buildCatalogProducerPath(producer.label, category.label, null, { expandHierarchy: true })}
                          className="mfr-category-all"
                          aria-label={`Усі товари ${producer.label} у категорії «${categoryName}»`}
                        >
                          Усі
                          <ArrowRight size={14} strokeWidth={2.4} aria-hidden />
                        </CatalogPrefetchLink>
                      ) : null}
                    </header>
                    <ul className="mfr-group-list">
                      {category.groups.map((group, groupIndex) =>
                        renderManufacturerGroupCard(
                          group,
                          groupIndex,
                          `${category.slug}:${categoryIndex}`,
                          true,
                          category.label
                        )
                      )}
                    </ul>
                  </article>
                );
              })}
            </DirectoryCollection>
          ) : producer.topGroups.length > 0 ? (
            <DirectoryCollection labels={producer.topGroups.map(group => group.label)} as="ul" className="mfr-group-list mfr-group-list-flat" placeholder="Знайти групу товарів">
              {producer.topGroups.map((group, groupIndex) =>
                renderManufacturerGroupCard(group, groupIndex, "fallback-groups", true)
              )}
            </DirectoryCollection>
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
          <section id="manufacturer-products" className={`${directoryPanelClass} scroll-mt-24`}>
            <div className={directoryHeaderClass}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className={directoryBadgeClass}>Товари бренду</p>
                  <h2 className={directoryTitleClass}>
                    Популярні товари {producer.label}
                  </h2>
                  <p className={directoryDescriptionClass}>
                    Ціна, наявність і артикул — додайте в кошик тут або відкрийте сторінку товару.
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
              products={visibleProducts.map(withoutCostPrice)}
              images={visibleProductImagePayload}
              euroRate={euroRate ?? undefined}
            />
          </section>
        )}
        {manufacturerProductLinks.length > 0 && (
          <section className={directoryPanelClass}>
            <details className="group-all-products mfr-index" id="manufacturer-all-products">
              <summary className="mfr-index-summary">
                <span>
                  {visibleProducts.length > 0 ? "Інші товари" : "Усі товари"} {producer.label}{" "}
                  <span className="mfr-index-count">{formatCount(manufacturerProductLinks.length)}</span>
                </span>
                <span className="mfr-index-toggle" aria-hidden="true">
                  <span className="mfr-index-show">Показати список</span>
                  <span className="mfr-index-hide">Згорнути</span>
                  <ChevronRight size={16} strokeWidth={2.4} />
                </span>
              </summary>
              {manufacturerProductLinks.length > 12 ? (
                <ManufacturerProductIndexFilter
                  listId="manufacturer-product-index"
                  total={manufacturerProductLinks.length}
                  label={`Фільтр товарів ${producer.label} за назвою чи артикулом`}
                />
              ) : null}
              <ul id="manufacturer-product-index" className="mfr-index-list">
                {manufacturerProductLinks.map((entry) => (
                  <li key={entry.code}>
                    <Link
                      href={buildProductPath({
                        code: entry.code,
                        article: entry.article,
                        name: entry.name,
                        producer: entry.producer,
                        group: entry.group,
                        subGroup: entry.subGroup,
                        category: entry.category,
                      })}
                      prefetch={false}
                    >
                      <span>{fixCatalogSpelling(buildVisibleProductName(entry.name || entry.code))}</span>
                      {entry.article ? <small>{entry.article}</small> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}
        <div id="manufacturer-about" className="scroll-mt-24">
        <CatalogSeoTextSection
          contained={false}
          badge="Про виробника"
          title={seoCopy.title}
          lead={seoCopy.intro}
          topics={[
            {
              // Fallback text intentionally names no counts — the exact
              // numbers already live in the hero's stat tiles two sections
              // up; repeating them here read as the same fact stated a
              // second time instead of new information.
              title: "Асортимент бренду",
              text: seoHighlights[0] || `Оригінальні запчастини та перевірені аналоги ${producer.label} — обирайте за ціною, характеристиками й наявністю на складі.`,
              icon: PackageSearch,
            },
            {
              title: "Групи й підгрупи",
              text: seoHighlights[1] || "Каталог розділено на категорії, групи та підгрупи, щоб знайти потрібний розділ без ручного перегляду всього асортименту.",
              icon: Layers3,
            },
            {
              title: "Пошук і порівняння",
              text: seoHighlights[2] || "Скористайтеся готовим фільтром виробника, а далі уточнюйте за групою, артикулом чи кодом деталі.",
              icon: Search,
            },
          ]}
          paragraphs={seoTextBlocks}
          // No links row here — every destination it could offer (товари
          // бренду, групи товарів, усі виробники) is already one of the
          // hero's own CTA buttons, quick-nav pills or breadcrumb, a few
          // hundred pixels above this section.
          links={[]}
        />
        </div>

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
