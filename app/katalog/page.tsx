import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import {
  ArrowUpRight,
  BadgeCheck,
  Car,
  CreditCard,
  ListTree,
  MapPin,
  PackageSearch,
  Phone,
  Tags,
  Truck,
} from "lucide-react";
import CatalogSearchTotalCountClient from "app/components/CatalogSearchTotalCountClient";
import VinOpenButton from "app/katalog/VinOpenButton";
import CatalogShownCountClient from "app/components/CatalogShownCountClient";
import CatalogSeoFilterSummaryClient from "app/katalog/CatalogSeoFilterSummaryClient";
import KatalogPageShell from "app/katalog/KatalogPageShell";
import { buildCatalogQuerySignature } from "app/lib/catalog-query-signature";
import {
  buildAutoBrandPath,
  buildAutoModelPath,
  buildCatalogCategoryPath,
  buildCatalogProducerPath,
  buildGroupPath,
  buildManufacturerPath,
} from "app/lib/catalog-links";
import {
  EMPTY_CATALOG_SEO_FACETS,
  getCatalogSeoFacetsWithTimeout,
  type CatalogSeoFacets,
} from "app/lib/catalog-seo";
import { resolveCatalogSeoFacetsWithFallback } from "app/lib/catalog-count-fallback";
import { getVerifiedAutoModelKeys } from "app/lib/auto-directory-data";
import { fetchCatalogProductsByQuery, fetchEuroRate, toPriceUah } from "app/lib/catalog-server";
import { buildManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";
import { buildProductImagePath, buildProductSeoImagePath } from "app/lib/product-image-path";
import { buildProductPath } from "app/lib/product-url";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { getProductTreeDataset } from "app/lib/product-tree";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { buildSeoSlug } from "app/lib/seo-slug";
import { homeSeoContent } from "app/lib/seo-copy";
import { getCategoryIconPath, inferCategoryForGroupLabel } from "app/lib/category-icons";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";

export const revalidate = 900;

const INITIAL_CATALOG_PAGE_LIMIT = 16;
// Measured against real (not degraded) 1C: the plain unfiltered "browse
// everything" snapshot (allgoods feed, 1C's cheapest query shape) reliably
// resolves well inside the old 250ms budget once healthy — bumping it a bit
// gives it more margin without risking a real delay on the highest-traffic
// case (a bare /katalog visit).
// Filtered/search snapshots are a different story: measured live, they
// consistently take 1.1-3.9s even on a healthy 1C (1C search/text scans are
// just slow), so raising this budget only made the page wait longer for the
// exact same null fallback — reverted to the original fail-fast value.
// Both stay well short of the route's own 3.6-5.2s 1C timeout budget
// (app/api/catalog-page/route.ts) so a genuinely degraded 1C still fails
// fast into the null fallback instead of holding up the page for seconds.
const INITIAL_CATALOG_SSR_TIMEOUT_MS = 450;
const INITIAL_CATALOG_SSR_TIMEOUT_MS_FILTERED = 350;
const CATALOG_SEO_FACETS_TIMEOUT_MS = 200;
const CATALOG_PRODUCT_TREE_TIMEOUT_MS = 200;
const MANUFACTURERS_DIRECTORY_TIMEOUT_MS = 300;
const STORE_PHONE_DISPLAY = "+38 (063) 421-18-51";
const STORE_ADDRESS = "Львів, вул. Перфецького, 8";

// Shared across "Популярні моделі авто" / "Категорії товарів" / "Виробники" —
// one consistent header + "Усі ..." CTA style instead of each section having
// its own (previously the model-list CTA was a bordered pill while the
// group/producer CTAs were bare text links).
const CATALOG_SEO_SECTION_HEADING_CLASS =
  "inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500";
const CATALOG_SEO_SECTION_CTA_CLASS =
  "inline-flex h-8 items-center gap-1.5 rounded-[11px] border border-sky-200 bg-sky-50 px-3 text-[12px] font-extrabold text-sky-700 shadow-sm transition-[border-color,color,background-color,box-shadow] duration-200 hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800 hover:shadow-[0_6px_14px_rgba(14,165,233,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70";

type InitialCatalogPagePayload = {
  items: Array<{
    code: string;
    article: string;
    name: string;
    producer: string;
    quantity: number;
    priceEuro?: number | null;
    group?: string;
    subGroup?: string;
    category?: string;
    hasPhoto?: boolean;
  }>;
  prices: Record<string, number | null>;
  images: Record<string, string>;
  hasMore: boolean;
  nextCursor: string;
  cursorField?: string;
  totalCount?: number | null;
  serviceUnavailable?: boolean;
  message?: string;
};

type CatalogSeoProduct = InitialCatalogPagePayload["items"][number];

const buildInlinePrices = (
  items: Array<{ code?: string; article?: string; priceEuro?: number | null }>
) => {
  const prices: Record<string, number | null> = {};

  for (const item of items) {
    const price = item?.priceEuro;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      continue;
    }

    const code = typeof item.code === "string" ? item.code.trim() : "";
    const article = typeof item.article === "string" ? item.article.trim() : "";

    if (code && prices[code] === undefined) prices[code] = price;
    if (article && prices[article] === undefined) prices[article] = price;
  }

  return prices;
};

type CatalogSeoSnapshotQuery = {
  searchQuery: string;
  searchFilter: string;
  group: string | null;
  subcategory: string | null;
  producer: string | null;
  expandHierarchy?: boolean;
};

const toCatalogSeoSnapshotQuery = (value: unknown): CatalogSeoSnapshotQuery | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const readString = (key: keyof CatalogSeoSnapshotQuery) =>
    typeof record[key] === "string" ? (record[key] as string).trim() : "";

  return {
    searchQuery: readString("searchQuery"),
    searchFilter: readString("searchFilter") || "all",
    group: readString("group") || null,
    subcategory: readString("subcategory") || null,
    producer: readString("producer") || null,
    expandHierarchy: record.expandHierarchy === true,
  };
};

const buildCatalogSeoSnapshotCacheKey = (query: CatalogSeoSnapshotQuery) =>
  JSON.stringify({
    searchQuery: query.searchQuery,
    searchFilter: query.searchFilter,
    group: query.group || "",
    subcategory: query.subcategory || "",
    producer: query.producer || "",
    expandHierarchy: query.expandHierarchy === true,
  });

const fetchCatalogSeoSnapshotPayload = async (
  serializedQuery: string
): Promise<InitialCatalogPagePayload | null> => {
  const query = toCatalogSeoSnapshotQuery(JSON.parse(serializedQuery));
  if (!query) return null;
  const result = await fetchCatalogProductsByQuery({
    page: 1,
    limit: INITIAL_CATALOG_PAGE_LIMIT,
    selectedCars: [],
    selectedCategories: [],
    searchQuery: query.searchQuery,
    searchFilter:
      query.searchFilter === "article" ||
      query.searchFilter === "name" ||
      query.searchFilter === "code" ||
      query.searchFilter === "producer" ||
      query.searchFilter === "description"
        ? query.searchFilter
        : "all",
    group: query.group,
    subcategory: query.subcategory,
    producer: query.producer,
    expandHierarchy: query.expandHierarchy === true,
    sortOrder: "none",
    timeoutMs: INITIAL_CATALOG_SSR_TIMEOUT_MS_FILTERED,
    retries: 1,
    retryDelayMs: 140,
    cacheTtlMs: 1000 * 60 * 15,
    includePriceEnrichment: false,
    preferLegacySource: false,
    forceAllgoodsSource: true,
  });

  // An unfiltered "browse everything" snapshot returning zero items is never
  // a real business state for this catalog (10k+ products) — it only
  // happens when 1C was degraded during this specific request. Throwing
  // here (resolveWithTimeout's caller already treats a rejection as "use
  // the null fallback") keeps unstable_cache from persisting that bad
  // snapshot for its full 15-minute revalidate window — without this, one
  // transient 1C blip made the catalog's first-paint items AND its "total
  // products" counter read empty/wrong for 15 minutes after 1C recovered.
  const isUnfilteredQuery =
    !query.searchQuery && !query.group && !query.subcategory && !query.producer;
  if (result.items.length === 0 && isUnfilteredQuery) {
    throw new Error("Catalog getdata failed: no products returned for unfiltered SEO snapshot");
  }

  return {
    items: result.items,
    prices: buildInlinePrices(result.items),
    images: {},
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
    cursorField: result.cursorField || "",
    totalCount: result.totalCount ?? null,
  };
};

const getCatalogSeoSnapshotPayloadCached = unstable_cache(
  fetchCatalogSeoSnapshotPayload,
  ["catalog-seo-snapshot-v5-all-products"],
  {
    revalidate: 60 * 15,
    tags: ["catalog-seo-snapshot"],
  }
);

interface KatalogPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

type CatalogSeoState = {
  tab: string;
  group: string;
  subcategory: string;
  producer: string;
  brand: string;
  searchQuery: string;
  searchFilter: string;
  resetFlag: string;
  expandHierarchy: boolean;
  canonicalPath: string;
  title: string;
  description: string;
  indexable: boolean;
};

const ALLOWED_SEO_KEYS = new Set([
  "tab",
  "group",
  "subcategory",
  "producer",
  "brand",
  "search",
  "filter",
  "reset",
  "scope",
]);

const pickFirstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] || "" : value || "";

const normalizeValue = (value: string | string[] | undefined) =>
  pickFirstValue(value).replace(/\s+/g, " ").trim();

const buildGroupLandingPath = (group: string) => {
  const path = buildGroupPath(group);
  return path !== "/groups" ? path : buildCatalogCategoryPath(group);
};

const buildManufacturerLandingPath = (producer: string) => {
  const path = buildManufacturerPath(producer);
  return path !== "/manufacturers" ? path : buildCatalogProducerPath(producer);
};

const normalizeFacetPair = (group: string, subcategory: string) => {
  if (!group || !subcategory) return { group, subcategory };
  return group.toLowerCase() === subcategory.toLowerCase()
    ? { group, subcategory: "" }
    : { group, subcategory };
};

const resolveCatalogSeoState = (
  searchParams: Record<string, string | string[] | undefined>
): CatalogSeoState => {
  const tab = normalizeValue(searchParams.tab).toLowerCase();
  const normalizedGroup = normalizeValue(searchParams.group);
  const normalizedSubcategory = normalizeValue(searchParams.subcategory);
  const producer = normalizeValue(searchParams.producer);
  const brand = normalizeValue(searchParams.brand);
  const searchQuery = normalizeValue(searchParams.search);
  const searchFilter = normalizeValue(searchParams.filter);
  const resetFlag = normalizeValue(searchParams.reset);
  const expandHierarchy = normalizeValue(searchParams.scope) === "hierarchy";
  const { group, subcategory } = normalizeFacetPair(
    normalizedGroup,
    normalizedSubcategory
  );

  const usedKeys = Object.entries(searchParams)
    .filter(([, value]) => normalizeValue(value).length > 0)
    .map(([key]) => key);

  const hasUnsupportedParams = usedKeys.some((key) => !ALLOWED_SEO_KEYS.has(key));
  const hasEphemeralParams = Boolean(searchQuery || searchFilter || resetFlag);
  const hasSupportedTab = !tab || tab === "category" || tab === "producer" || tab === "auto";

  let canonicalPath = "/katalog";
  let title = "Каталог автозапчастин у Львові";
  let description = appendSeoContact(
    "Каталог PartsON: автозапчастини за артикулом, кодом, виробником і категорією, актуальна наявність, ціни онлайн, VIN-підбір і доставка по Україні."
  );

  if (producer && group && subcategory) {
    canonicalPath = buildCatalogProducerPath(producer, group, subcategory, {
      expandHierarchy,
    });
    title = `${producer}: ${subcategory} - ${group} | Каталог автозапчастин`;
    description = appendSeoContact(
      `${producer} у категорії ${subcategory}: автозапчастини ${group} у каталозі PartsON, актуальна наявність, перевірка сумісності за VIN та доставка по Україні.`
    );
  } else if (producer && group) {
    canonicalPath = buildCatalogProducerPath(producer, group, null, {
      expandHierarchy,
    });
    title = `${producer}: ${group} - каталог автозапчастин`;
    description = appendSeoContact(
      `${producer} у групі ${group}: автозапчастини за артикулом, категорією, ціною й наявністю в PartsON, консультація та доставка по Україні.`
    );
  } else if (producer) {
    canonicalPath = buildManufacturerLandingPath(producer);
    title = `${producer} - виробник автозапчастин`;
    description = appendSeoContact(
      `Автозапчастини ${producer} у PartsON: сторінка виробника, пошук за артикулом, категорією і наявністю, підбір сумісних деталей та доставка по Україні.`
    );
  } else if (group && subcategory) {
    canonicalPath = buildCatalogCategoryPath(group, subcategory, {
      expandHierarchy,
    });
    title = `${subcategory} - ${group} | Каталог автозапчастин`;
    description = appendSeoContact(
      `${subcategory} у групі ${group}: каталог автозапчастин PartsON з виробниками, цінами, наявністю, підбором за артикулом і доставкою по Україні.`
    );
  } else if (group) {
    canonicalPath = buildGroupLandingPath(group);
    title = `${group} - група автозапчастин`;
    description = appendSeoContact(
      `${group} у каталозі PartsON: підгрупи автозапчастин, пошук за артикулом і виробником, перевірка сумісності, самовивіз і доставка по Україні.`
    );
  } else if (tab === "category") {
    canonicalPath = "/groups";
    title = "Категорії автозапчастин";
    description = appendSeoContact(
      "Категорії автозапчастин PartsON: зручний перехід до груп і підгруп, пошук деталей за артикулом, виробником, сумісністю та VIN."
    );
  } else if (tab === "producer") {
    canonicalPath = "/manufacturers";
    title = "Виробники автозапчастин";
    description = appendSeoContact(
      "Виробники автозапчастин у PartsON: сторінки брендів, фільтрований каталог, пошук деталей за артикулом, групою товару і підбір за VIN."
    );
  } else if (tab === "auto" && brand) {
    // Canonicalize to the clean /auto/[brand] route rather than
    // self-referencing this query-string facet — both render the same
    // brand-picker content, and pointing here would split the SEO signal
    // between two URLs for the same page instead of consolidating it.
    canonicalPath = buildAutoBrandPath(brand);
    title = `${brand} - підбір автозапчастин по авто`;
    description = appendSeoContact(
      `${brand}: підбір автозапчастин у PartsON за моделлю, модифікацією та VIN, швидкий перехід до сумісних товарів і доставка по Україні.`
    );
  } else if (tab === "auto") {
    canonicalPath = "/auto";
    title = "Підбір автозапчастин по авто";
    description = appendSeoContact(
      "Підбір автозапчастин по авто в PartsON: оберіть марку, модель і модифікацію, щоб відкрити сумісні товари в каталозі."
    );
  }

  if (searchQuery) {
    title = `Пошук у каталозі: ${searchQuery}`;
    description = appendSeoContact(
      `Пошук "${searchQuery}" у каталозі PartsON: перевірте автозапчастини за артикулом, назвою, виробником або кодом товару.`
    );
  }

  const isRootCatalogPage = !tab && !group && !subcategory && !producer && !brand;
  const hasStableFacetPage = Boolean(
    tab === "category" ||
      tab === "producer" ||
      tab === "auto" ||
      group ||
      subcategory ||
      producer ||
      brand
  );
  const indexable =
    !hasUnsupportedParams &&
    !hasEphemeralParams &&
    hasSupportedTab &&
    (isRootCatalogPage || hasStableFacetPage);

  return {
    tab,
    group,
    subcategory,
    producer,
    brand,
    searchQuery,
    searchFilter,
    resetFlag,
    expandHierarchy,
    canonicalPath,
    title,
    description,
    indexable,
  };
};

// The <title>/meta title (state.title) is deliberately terser and
// keyword-first for search snippets. This is the fuller, sentence-style
// heading actually shown on the page — both the visible section heading and
// the page's real (sr-only) <h1> read from this single function so they
// never drift into two differently-worded statements of the same page
// topic again.
const buildCatalogSeoHeading = (state: CatalogSeoState) =>
  state.searchQuery
    ? `Пошук «${state.searchQuery}» — каталог автозапчастин PartsON`
    : state.producer && state.subcategory && state.group
      ? `${state.producer} ${state.subcategory} (${state.group}) — автозапчастини у Львові`
      : state.producer && state.group
        ? `${state.producer}: ${state.group} — автозапчастини в PartsON, Львів`
        : state.producer
          ? `Автозапчастини ${state.producer}: ціни, наявність, доставка`
          : state.group && state.subcategory
            ? `${state.subcategory} — ${state.group}: автозапчастини у Львові`
            : state.group
              ? `${state.group} — каталог автозапчастин PartsON`
              : `Автозапчастини у Львові: каталог, ціни та наявність — PartsON`;

// "Популярні моделі авто" used to link straight into homeSeoContent's
// curated bare model-family names ("Audi A4", "BMW 3 Series"). Those read
// fine as copy but don't exist as routes: /auto/[brand]/[model] only
// resolves an exact, verified GENERATION string (e.g. "A4 I B5") via
// findCarModelInBrand — a bare family name has no match, so every one of
// these links 404'd. Pull real (brand, model) pairs from the same
// verified-model snapshot the /auto route's own generateStaticParams
// trusts (scripts/generate-auto-model-sitemap.ts) instead, while keeping
// the curated brand popularity order and preferring a generation that
// actually belongs to one of the curated model families, so the section
// still reads the same way it always did.
const buildPopularAutoModels = async (): Promise<Array<{ brand: string; model: string }>> => {
  const verifiedKeys = await getVerifiedAutoModelKeys();
  if (!verifiedKeys) return [];

  const modelsByBrandLower = new Map<string, string[]>();
  for (const key of verifiedKeys) {
    const separatorIndex = key.indexOf("::");
    if (separatorIndex <= 0) continue;

    const brand = key.slice(0, separatorIndex).trim();
    const model = key.slice(separatorIndex + 2).trim();
    if (!brand || !model) continue;

    const brandLower = brand.toLowerCase();
    const existing = modelsByBrandLower.get(brandLower);
    if (existing) {
      existing.push(model);
    } else {
      modelsByBrandLower.set(brandLower, [model]);
    }
  }

  const popularModels: Array<{ brand: string; model: string }> = [];

  for (const { brand, models: genericModels } of homeSeoContent.modelGroups) {
    if (popularModels.length >= 12) break;

    const realModels = modelsByBrandLower.get(brand.toLowerCase());
    if (!realModels || realModels.length === 0) continue;

    const picked: string[] = [];
    for (const generic of genericModels) {
      if (picked.length >= 2) break;
      const genericLower = generic.toLowerCase();
      const match = realModels.find(
        (real) => real.toLowerCase().startsWith(genericLower) && !picked.includes(real)
      );
      if (match) picked.push(match);
    }
    for (const real of realModels) {
      if (picked.length >= 2) break;
      if (!picked.includes(real)) picked.push(real);
    }

    for (const model of picked) {
      popularModels.push({ brand, model });
    }
  }

  return popularModels;
};

const normalizeFacetLookup = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

const matchesFacetValue = (candidate: string | undefined, value: string) => {
  const normalizedCandidate = normalizeFacetLookup(candidate || "");
  const normalizedValue = normalizeFacetLookup(value);
  if (!normalizedCandidate || !normalizedValue) return false;

  return (
    normalizedCandidate === normalizedValue ||
    buildSeoSlug(normalizedCandidate) === buildSeoSlug(normalizedValue)
  );
};

const resolveCatalogSeoTotalCount = (
  state: CatalogSeoState,
  facets: CatalogSeoFacets
) => {
  if (state.searchQuery || state.resetFlag) return null;

  if (!state.group && !state.subcategory && !state.producer && !state.brand) {
    return facets.totalProductCount > 0 ? facets.totalProductCount : null;
  }

  if (state.producer) {
    const producerFacet = facets.producers.find(
      (producer) =>
        matchesFacetValue(producer.label, state.producer) ||
        matchesFacetValue(producer.slug, state.producer)
    );
    if (!producerFacet) return null;

    if (!state.group) return producerFacet.productCount || null;

    const groupFacet = producerFacet.topGroups.find(
      (group) =>
        matchesFacetValue(group.filterValue, state.group) ||
        matchesFacetValue(group.label, state.group) ||
        matchesFacetValue(group.slug, state.group)
    );
    if (!groupFacet) return null;

    if (!state.subcategory) return groupFacet.productCount || null;

    const subgroupFacet = groupFacet.subgroups.find(
      (subgroup) =>
        matchesFacetValue(subgroup.label, state.subcategory) ||
        matchesFacetValue(subgroup.slug, state.subcategory)
    );
    return subgroupFacet?.productCount || null;
  }

  if (state.group) {
    const groupFacet = facets.groups.find(
      (group) =>
        matchesFacetValue(group.label, state.group) ||
        matchesFacetValue(group.slug, state.group)
    );
    if (!groupFacet) return null;

    if (!state.subcategory) return groupFacet.productCount || null;

    const subgroupFacet = groupFacet.subgroups.find(
      (subgroup) =>
        matchesFacetValue(subgroup.label, state.subcategory) ||
        matchesFacetValue(subgroup.slug, state.subcategory)
    );
    return subgroupFacet?.productCount || null;
  }

  return null;
};

const buildCatalogBreadcrumbJsonLd = (siteUrl: string, state: CatalogSeoState) => {
  const { canonicalPath, group, producer, subcategory, tab } = state;
  const currentUrl = `${siteUrl}${canonicalPath}`;
  const itemListElement: Array<Record<string, string | number>> = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Головна",
      item: siteUrl,
    },
  ];

  if (producer && group && subcategory) {
    itemListElement.push(
      {
        "@type": "ListItem",
        position: 2,
        name: "Виробники",
        item: `${siteUrl}/manufacturers`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: producer,
        item: `${siteUrl}${buildManufacturerLandingPath(producer)}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: group,
        item: `${siteUrl}${buildCatalogProducerPath(producer, group)}`,
      },
      {
        "@type": "ListItem",
        position: 5,
        name: subcategory,
        item: currentUrl,
      }
    );
  } else if (producer && group) {
    itemListElement.push(
      {
        "@type": "ListItem",
        position: 2,
        name: "Виробники",
        item: `${siteUrl}/manufacturers`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: producer,
        item: `${siteUrl}${buildManufacturerLandingPath(producer)}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: group,
        item: currentUrl,
      }
    );
  } else if (producer) {
    itemListElement.push(
      {
        "@type": "ListItem",
        position: 2,
        name: "Виробники",
        item: `${siteUrl}/manufacturers`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: producer,
        item: currentUrl,
      }
    );
  } else if (group && subcategory) {
    itemListElement.push(
      {
        "@type": "ListItem",
        position: 2,
        name: "Групи",
        item: `${siteUrl}/groups`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: group,
        item: `${siteUrl}${buildGroupLandingPath(group)}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: subcategory,
        item: currentUrl,
      }
    );
  } else if (group) {
    itemListElement.push(
      {
        "@type": "ListItem",
        position: 2,
        name: "Групи",
        item: `${siteUrl}/groups`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: group,
        item: currentUrl,
      }
    );
  } else if (tab === "category") {
    itemListElement.push({
      "@type": "ListItem",
      position: 2,
      name: "Групи",
      item: `${siteUrl}/groups`,
    });
  } else if (tab === "producer") {
    itemListElement.push({
      "@type": "ListItem",
      position: 2,
      name: "Виробники",
      item: `${siteUrl}/manufacturers`,
    });
  } else {
    itemListElement.push({
      "@type": "ListItem",
      position: 2,
      name: "Каталог",
      item: currentUrl,
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${currentUrl}#breadcrumb`,
    itemListElement,
  };
};

const buildCatalogCollectionJsonLd = (siteUrl: string, state: CatalogSeoState) => {
  const { canonicalPath, title, description, group, producer, subcategory } = state;
  const currentUrl = `${siteUrl}${canonicalPath}`;

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${currentUrl}#collection-page`,
    url: currentUrl,
    name: title,
    description,
    inLanguage: "uk-UA",
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    about: [
      producer ? { "@type": "Brand", name: producer } : null,
      group ? { "@type": "Thing", name: group } : null,
      subcategory ? { "@type": "Thing", name: subcategory } : null,
    ].filter(Boolean),
  };
};

const buildSeoProductPath = (item: CatalogSeoProduct) =>
  buildProductPath({
    code: item.code,
    article: item.article,
    name: item.name,
    producer: item.producer,
    group: item.group || item.category,
    subGroup: item.subGroup,
    category: item.category || item.group,
  });

const buildCatalogItemListJsonLd = (
  siteUrl: string,
  state: CatalogSeoState,
  items: CatalogSeoProduct[],
  euroRate: number | null
) => {
  if (euroRate == null || !Number.isFinite(euroRate) || euroRate <= 0) return null;
  const currentUrl = `${siteUrl}${state.canonicalPath}`;
  const itemListElement = items
    .filter(
      (item) =>
        item.code &&
        item.name &&
        typeof item.priceEuro === "number" &&
        item.priceEuro > 0
    )
    .slice(0, INITIAL_CATALOG_PAGE_LIMIT)
    .map((item, index) => {
      const url = `${siteUrl}${buildSeoProductPath(item)}`;
      const imagePath = item.hasPhoto === true
        ? buildProductSeoImagePath(item.code, item.article)
        : "";

      return {
        "@type": "ListItem",
        position: index + 1,
        url,
        item: {
          "@type": "Product",
          name: item.name,
          sku: item.code,
          mpn: item.article || item.code,
          image: imagePath ? `${siteUrl}${imagePath}` : undefined,
          brand: item.producer
            ? {
                "@type": "Brand",
                name: item.producer,
              }
            : undefined,
          url,
          offers:
            typeof item.priceEuro === "number" && item.priceEuro > 0
              ? {
                  "@type": "Offer",
                  priceCurrency: "UAH",
                  price: toPriceUah(item.priceEuro, euroRate),
                  availability:
                    item.quantity > 0
                      ? "https://schema.org/InStock"
                      : "https://schema.org/OutOfStock",
                  itemCondition: "https://schema.org/NewCondition",
                  url,
                }
              : undefined,
        },
      };
    });

  if (itemListElement.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${currentUrl}#catalog-products`,
    name: `${state.title} - товари`,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: itemListElement.length,
    itemListElement,
  };
};

type CatalogSeoDiscoveryItem = { label: string; slug: string; logoPath?: string | null };
type CatalogSeoGroupDiscoveryItem = CatalogSeoDiscoveryItem & { href: string };

const CatalogSeoSnapshot = async ({
  state,
  items,
  hasMore,
  totalCount,
  topGroups = [],
  topProducers = [],
}: {
  state: CatalogSeoState;
  items: CatalogSeoProduct[];
  hasMore?: boolean;
  totalCount?: number | null;
  topGroups?: CatalogSeoGroupDiscoveryItem[];
  topProducers?: CatalogSeoDiscoveryItem[];
}) => {
  const visibleItems = items.filter((item) => item.code && item.name);
  const visibleItemsCount = visibleItems.length;
  const isSearchState = Boolean(state.searchQuery);
  const hasExactCount = typeof totalCount === "number" && totalCount >= 0;
  const initialFilteredCount = hasExactCount ? totalCount : visibleItemsCount;
  const showDiscovery = topGroups.length > 0 || topProducers.length > 0;
  const popularModels = await buildPopularAutoModels();


  const seoHeading = buildCatalogSeoHeading(state);

  const seoSubheading = state.searchQuery
    ? null
    : state.producer && state.group
      ? `${state.producer}: ${state.group} в наявності, підбір за артикулом і VIN`
      : state.producer
        ? `Оригінали та аналоги ${state.producer} в наявності`
        : state.group && state.subcategory
          ? `${state.subcategory} у групі «${state.group}»: ціни та наявність онлайн`
          : state.group
            ? `Деталі та агрегати ${state.group}: підбір, ціни, доставка`
            : `Пошук за артикулом, VIN, кодом та виробником`;

  // Deliberately no shop/delivery info here (address, hours, self-pickup,
  // Nova Poshta) — that used to be repeated in nearly every branch and then
  // restated a second time in seoText2 below. This block stays focused on
  // the one thing it's actually titled for: how to find and pick a part.
  const seoText = state.searchQuery
    ? `Пошук «${state.searchQuery}» у каталозі PartsON: підбір за артикулом, кодом OEM, назвою або виробником. Перевірка сумісності за VIN-номером. Актуальна наявність та ціни відображаються одразу в картці товару.`
    : state.producer && state.group && state.subcategory
      ? `${state.producer} ${state.subcategory} у групі «${state.group}»: оригінальні та аналогові запчастини за артикулом і кодом OEM, актуальна наявність і ціни в PartsON. Перевірка сумісності за VIN-номером перед замовленням.`
      : state.producer && state.group
        ? `${state.producer} у категорії «${state.group}»: підбір запчастин за артикулом і кодом OEM, оригінали та сертифіковані аналоги, перевірка сумісності за VIN, актуальна наявність та ціни онлайн.`
        : state.producer
          ? `Автозапчастини ${state.producer} у PartsON: пошук за артикулом і кодом OEM, перевірка сумісності за VIN, підбір аналогів і оригінальних деталей, ціни та наявність онлайн.`
          : state.group && state.subcategory
            ? `${state.subcategory} — запчастини в категорії «${state.group}»: підбір за артикулом, VIN-номером і кодом OEM, оригінали та аналоги провідних виробників, актуальна наявність і ціни онлайн.`
            : state.group
              ? `${state.group}: пошук запчастин за артикулом, кодом та виробником, перевірка сумісності за VIN, оригінали й аналоги у наявності, актуальні ціни в PartsON.`
              : `Каталог автозапчастин PartsON: пошук за артикулом, кодом OEM, назвою та виробником. Оригінальні та аналогові деталі від перевірених постачальників. Підбір за VIN-номером, перевірка сумісності, актуальні ціни та наявність онлайн.`;

  // Address/phone are already real links in the .catalog-seo-contacts row
  // below, so this block covers what isn't shown there — payment and
  // fulfilment — as its own real links (see catalogSeoServiceLinks) instead
  // of restating the same address/hours copy as plain text a second time.
  const seoText2 = state.searchQuery
    ? `PartsON — магазин автозапчастин у Львові: консультація спеціалістів, широкий асортимент оригінальних і аналогових деталей, швидке оформлення замовлення.`
    : state.producer
      ? `Консультація з підбору ${state.producer}, перевірка OEM-сумісності та відправка замовлення день у день.`
      : state.group
        ? `Консультація з підбору «${state.group}», допомога у визначенні артикулу та відправка замовлення день у день.`
        : `PartsON — офіційний магазин автозапчастин у Львові. Консультація спеціалістів з підбору деталей та допомога з визначенням артикулу чи OEM-коду.`;

  const catalogSeoServiceLinks: Array<{ href: string; label: string; icon: typeof MapPin }> = [
    { href: "/inform/location", label: "Самовивіз у Львові", icon: MapPin },
    { href: "/inform/delivery", label: "Доставка Новою Поштою", icon: Truck },
    { href: "/inform/payment", label: "Оплата та розрахунок", icon: CreditCard },
  ];

  const countLabel = hasExactCount
    ? "Усього за фільтром"
    : isSearchState
      ? "Знайдено"
      : "Усього товарів";

  const renderTotalCount = (className = "text-slate-900") => (
    // useSearchParams() inside CatalogSearchTotalCountClient forces a dynamic
    // bailout all the way up to the nearest Suspense boundary — without one
    // here, that bailout hits this page's `revalidate` (ISR) config and
    // throws DYNAMIC_SERVER_USAGE. The fallback is the plain SSR number so
    // there's no visible flash before the client value hydrates in.
    <Suspense fallback={<span className={className}>{initialFilteredCount.toLocaleString("uk-UA")}</span>}>
      <CatalogSearchTotalCountClient
        initialOpenCount={visibleItemsCount}
        initialFallbackCount={initialFilteredCount}
        className={className}
      />
    </Suspense>
  );
  const renderShownCount = (className = "text-slate-700") => (
    <CatalogShownCountClient initialCount={visibleItemsCount} className={className} />
  );

  const breadcrumbParts = [
    state.producer,
    state.group,
    state.subcategory,
  ].filter(Boolean) as string[];

  return (
    <section
      aria-labelledby="catalog-seo-block-title"
      className="catalog-seo-section mx-auto mt-7 w-full max-w-7xl px-3 pb-12 sm:mt-9 sm:px-4 lg:px-6"
    >
      <div className="catalog-seo-shell relative overflow-hidden rounded-[26px] border border-sky-200/80 bg-white ring-1 ring-white">

        {/* ── Верхня секція: заголовок + лічильник ─────────────────────── */}
        <div className="catalog-seo-hero relative overflow-hidden border-b border-sky-100 bg-[radial-gradient(circle_at_8%_0%,rgba(34,211,238,0.16),transparent_32%),radial-gradient(circle_at_92%_18%,rgba(59,130,246,0.13),transparent_34%),linear-gradient(135deg,#f8fcff_0%,#eef8ff_48%,#f8fbff_100%)] px-4 py-6 sm:px-7 sm:py-7">
          <span className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full border-[34px] border-white/40" aria-hidden />
          <div className="catalog-seo-overview grid gap-3.5 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(270px,320px)] lg:items-start xl:grid-cols-[minmax(0,1fr)_335px]">

            {/* Ліва колонка — тексти */}
            <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
              {/* Хлібні крихти-бейдж */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-100 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-700 shadow-sm">
                  <PackageSearch size={11} aria-hidden />
                  Каталог PartsON
                </span>
                {breadcrumbParts.length > 0 && (
                  <span className="inline-flex min-w-0 flex-wrap items-center gap-1 text-[11px] font-semibold text-slate-500">
                    {breadcrumbParts.map((part, i) => (
                      <span key={part} className="inline-flex min-w-0 items-center gap-1">
                        {i > 0 && <span className="text-slate-300" aria-hidden>/</span>}
                        <span className="max-w-[180px] truncate sm:max-w-[260px]">{part}</span>
                      </span>
                    ))}
                  </span>
                )}
              </div>

              {/* H2 — основний SEO-заголовок */}
              <h2
                id="catalog-seo-block-title"
                className="catalog-seo-title mt-3 max-w-4xl text-slate-900"
              >
                {seoHeading}
              </h2>

              {/* H3 — підзаголовок з ключовими словами (не дублює h2) */}
              {seoSubheading && (
                <h3 className="catalog-seo-subtitle mt-1.5 max-w-3xl text-sky-700">
                  {seoSubheading}
                </h3>
              )}
            </div>

            <div className="order-3 min-w-0 lg:col-span-2 lg:row-start-2">
              {/* Основний SEO-текст */}
              <div className="catalog-seo-copy-grid">
                <section className="catalog-seo-copy-primary" aria-labelledby="catalog-selection-copy-title">
                  <h4 id="catalog-selection-copy-title" className="catalog-seo-copy-heading">
                    Підбір запчастин
                  </h4>
                  <p>{seoText}</p>
                </section>
                <section className="catalog-seo-copy-secondary" aria-labelledby="catalog-service-copy-title">
                  <h4 id="catalog-service-copy-title" className="catalog-seo-copy-heading">
                    Магазин та доставка
                  </h4>
                  <p>{seoText2}</p>
                  <ul className="catalog-seo-copy-links">
                    {catalogSeoServiceLinks.map(({ href, label, icon: LinkIcon }) => (
                      <li key={href}>
                        <Link href={href}>
                          <LinkIcon size={12} aria-hidden />
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <CatalogSeoFilterSummaryClient
                producer={state.producer}
                group={state.group}
                subcategory={state.subcategory}
                searchQuery={state.searchQuery}
              />

              {/* Піктограми-контакти */}
              <div className="catalog-seo-contacts mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <a
                  href="tel:+380634211851"
                  aria-label={`Подзвонити в магазин PartsON: ${STORE_PHONE_DISPLAY}`}
                  className="group inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-sky-100 bg-white px-3 text-[12px] font-bold text-slate-700 shadow-sm transition-[border-color,background-color,color] duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-sky-100 text-sky-600">
                    <Phone size={14} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[9.5px] font-black uppercase tracking-[0.12em] text-slate-500">Консультація</span>
                    <span className="block truncate">{STORE_PHONE_DISPLAY}</span>
                  </span>
                </a>
                <Link
                  href="/inform/location"
                  aria-label={`Адреса магазину PartsON: ${STORE_ADDRESS}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 shadow-sm transition-[border-color,background-color,color] duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-slate-100 text-slate-500">
                    <MapPin size={14} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[9.5px] font-black uppercase tracking-[0.12em] text-slate-500">Магазин</span>
                    <span className="block truncate">{STORE_ADDRESS}</span>
                  </span>
                </Link>
                <Link
                  href="/inform/delivery"
                  aria-label="Доставка автозапчастин — умови та тарифи"
                  className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 shadow-sm transition-[border-color,background-color,color] duration-200 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-emerald-50 text-emerald-600">
                    <Truck size={14} aria-hidden />
                  </span>
                  <span>
                    <span className="block text-[9.5px] font-black uppercase tracking-[0.12em] text-slate-500">Доставка</span>
                    Нова Пошта
                  </span>
                </Link>
                <VinOpenButton />
              </div>
            </div>

            {/* ── Лічильник — світлий варіант ─────────────────────────── */}
            <div
              className="catalog-seo-counter order-2 relative overflow-hidden rounded-[20px] border border-sky-300/75 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(235,248,255,0.94))] p-4 ring-1 ring-white/90 lg:col-start-2 lg:row-start-1"
              data-nosnippet
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9.5px] font-black uppercase tracking-[0.16em] text-sky-700">
                    {countLabel}
                  </p>
                  <p className="catalog-seo-counter-number mt-1 font-black">
                    {renderTotalCount("text-slate-900 tabular-nums")}
                  </p>
                </div>
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-[0_8px_18px_rgba(14,165,233,0.24)] ring-1 ring-white/80">
                  <Tags size={17} aria-hidden />
                </span>
              </div>

              <div className="catalog-seo-counter-status mt-3.5 rounded-[14px] border border-white bg-white/80 px-3 py-2.5 shadow-[0_5px_15px_rgba(15,23,42,0.05)]">
                <p className="text-[12px] font-semibold leading-[1.6] text-slate-600">
                  Завантажено зараз:{" "}
                  <span className="font-black text-sky-700">
                    {renderShownCount("text-sky-700")}
                  </span>
                </p>
                {hasMore && !hasExactCount ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    список оновлюється під час перегляду
                  </p>
                ) : (
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                    <BadgeCheck size={11} aria-hidden />
                    дані актуальні
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Популярні моделі авто для SEO-навігації ───────────────────── */}
        {popularModels.length > 0 && (
          <div className="catalog-seo-products bg-[linear-gradient(180deg,#ffffff,#fbfdff)] px-4 py-6 sm:px-7">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className={CATALOG_SEO_SECTION_HEADING_CLASS}>
                <Car size={12} aria-hidden />
                Популярні моделі авто
              </h3>
              <Link href="/auto" className={CATALOG_SEO_SECTION_CTA_CLASS}>
                Усі марки
                <ArrowUpRight size={12} aria-hidden />
              </Link>
            </div>
            <ul className="catalog-seo-model-list" role="list">
              {popularModels.map(({ brand, model }) => (
                  <li key={`${brand}-${model}`}>
                    <Link
                      href={buildAutoModelPath(brand, model)}
                      className="catalog-seo-model-link group"
                      aria-label={`Запчастини для ${brand} ${model}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[11.5px] font-extrabold text-slate-800 group-hover:text-sky-700">
                          {brand} {model}
                        </span>
                        <span className="block text-[9.5px] font-semibold text-slate-400">Підібрати запчастини</span>
                      </span>
                      <ArrowUpRight className="shrink-0 text-sky-500" size={12} aria-hidden />
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* ── Навігація: групи та виробники ────────────────────────────── */}
        {showDiscovery && (
          <nav
            aria-label="Розділи каталогу"
            className="catalog-seo-navigation border-t border-sky-100 bg-[linear-gradient(145deg,#f8fbff,#eef8ff_55%,#f8fcff)] px-4 py-6 sm:px-7"
          >
            <div className="grid gap-3.5">
              {topGroups.length > 0 && (
                <div className="rounded-[18px] border border-white bg-white/85 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.055)] ring-1 ring-sky-100/80">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className={CATALOG_SEO_SECTION_HEADING_CLASS}>
                      <ListTree size={12} aria-hidden />
                      Категорії товарів
                    </h3>
                    <Link href="/groups" className={CATALOG_SEO_SECTION_CTA_CLASS}>
                      Усі категорії
                      <ArrowUpRight size={12} aria-hidden />
                    </Link>
                  </div>
                  <ul className="catalog-seo-link-list" role="list">
                    {topGroups.map((group) => (
                      <li key={`group-${group.slug}`}>
                        <a
                          href={group.href}
                          aria-label={`Категорія товарів: ${group.label}`}
                          className="catalog-seo-facet-link"
                        >
                          <span className="catalog-seo-facet-icon">
                            <Image
                              src={getCategoryIconPath(inferCategoryForGroupLabel(group.label) || group.label)}
                              alt={`Іконка категорії ${group.label}`}
                              width={28}
                              height={28}
                              sizes="28px"
                              loading="lazy"
                              className="h-5 w-5 object-contain"
                            />
                          </span>
                          <span className="min-w-0 line-clamp-2">{group.label}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {topProducers.length > 0 && (
                <div className="rounded-[18px] border border-white bg-white/85 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.055)] ring-1 ring-sky-100/80">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className={CATALOG_SEO_SECTION_HEADING_CLASS}>
                      <Tags size={12} aria-hidden />
                      Виробники
                    </h3>
                    <Link href="/manufacturers" className={CATALOG_SEO_SECTION_CTA_CLASS}>
                      Усі виробники
                      <ArrowUpRight size={12} aria-hidden />
                    </Link>
                  </div>
                  <ul className="catalog-seo-link-list" role="list">
                    {topProducers.map((producer) => (
                      <li key={`producer-${producer.slug}`}>
                        <a
                          href={buildManufacturerPath(producer.slug)}
                          aria-label={`Виробник автозапчастин: ${producer.label}`}
                          className="catalog-seo-facet-link"
                        >
                          <span className="catalog-seo-brand-logo">
                            {producer.logoPath ? (
                              <Image
                                src={producer.logoPath}
                                alt={`Логотип виробника ${producer.label}`}
                                width={56}
                                height={28}
                                sizes="46px"
                                loading="lazy"
                                unoptimized={producer.logoPath.endsWith(".svg")}
                                className="h-5 w-10 object-contain"
                              />
                            ) : (
                              <span>{producer.label.slice(0, 2).toUpperCase()}</span>
                            )}
                          </span>
                          <span className="min-w-0 truncate">{producer.label}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </nav>
        )}
      </div>
    </section>
  );
};

export async function generateMetadata({ searchParams }: KatalogPageProps): Promise<Metadata> {
  const resolvedSearchParams = await (
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  );

  const { title, description, canonicalPath, indexable } =
    resolveCatalogSeoState(resolvedSearchParams);

  return buildPageMetadata({
    title,
    description,
    canonicalPath,
    keywords: [
      title,
      "автозапчастини львів",
      "магазин автозапчастин львів",
      "каталог автозапчастин",
      "пошук запчастин за артикулом",
      "пошук запчастин за кодом",
      "підбір автозапчастин за vin",
      "наявність автозапчастин",
      "ціни на автозапчастини",
    ],
    openGraphTitle: `${title} | PartsON`,
    image: {
      url: "/opengraph-partson-v2.png",
      alt: `${title} | PartsON`,
    },
    index: indexable,
  });
}

export default async function KatalogPage({ searchParams }: KatalogPageProps) {
  const resolvedSearchParams = await (
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  );
  const siteUrl = getSiteUrl();
  const state = resolveCatalogSeoState(resolvedSearchParams);
  const initialQuerySignature = buildCatalogQuerySignature({
    normalizedSearch: state.searchQuery,
    searchFilter: state.searchFilter || "all",
    selectedCars: [],
    selectedCategories: [],
    group: state.group || null,
    subcategory: state.subcategory || null,
    producer: state.producer || null,
    expandHierarchy: state.expandHierarchy,
    sortOrder: "none",
  });
  const shouldUseTighterInitialTimeout = Boolean(
    state.searchQuery || state.group || state.subcategory || state.producer
  );
  const initialCatalogTimeoutMs = shouldUseTighterInitialTimeout
    ? INITIAL_CATALOG_SSR_TIMEOUT_MS_FILTERED
    : INITIAL_CATALOG_SSR_TIMEOUT_MS;
  const snapshotCacheKey = buildCatalogSeoSnapshotCacheKey({
    searchQuery: state.searchQuery,
    searchFilter: state.searchFilter || "all",
    group: state.group || null,
    subcategory: state.subcategory || null,
    producer: state.producer || null,
    expandHierarchy: state.expandHierarchy,
  });
  const [rawInitialPagePayload, rawSeoFacets, productTreeDataset, euroRate] = await Promise.all([
    resolveWithTimeout(
      () => getCatalogSeoSnapshotPayloadCached(snapshotCacheKey),
      null,
      initialCatalogTimeoutMs
    ),
    getCatalogSeoFacetsWithTimeout(CATALOG_SEO_FACETS_TIMEOUT_MS).catch(
      () => EMPTY_CATALOG_SEO_FACETS
    ),
    resolveWithTimeout(
      () => getProductTreeDataset(),
      null,
      CATALOG_PRODUCT_TREE_TIMEOUT_MS
    ).catch(() => null),
    resolveWithTimeout(() => fetchEuroRate(), null, 500).catch(() => null),
  ]);
  const initialPagePayload = rawInitialPagePayload
    ? {
      ...rawInitialPagePayload,
        // Images warm up client-side in one shared batch. Avoid holding the
        // initial HTML response behind filesystem checks for every card.
        images: {},
      }
    : null;
  const seoFacets = await resolveCatalogSeoFacetsWithFallback(rawSeoFacets);
  const seoTotalCount = resolveCatalogSeoTotalCount(state, seoFacets);
  const collectionJsonLd = buildCatalogCollectionJsonLd(siteUrl, state);
  const breadcrumbJsonLd = buildCatalogBreadcrumbJsonLd(siteUrl, state);
  const catalogItemListJsonLd = buildCatalogItemListJsonLd(
    siteUrl,
    state,
    initialPagePayload?.items ?? [],
    euroRate
  );
  const topGroups = (productTreeDataset?.groups ?? []).slice(0, 16).map((g) => ({
    label: g.label,
    slug: g.slug,
    href: buildGroupPath(g.slug || g.label),
  }));
  const seoFallbackGroups = seoFacets.groups.slice(0, 30).map((g) => ({
    label: g.label,
    slug: g.slug,
    href: buildGroupPath(g.slug || g.label),
  }));
  const catalogNavigationGroups =
    topGroups.length > 0 ? topGroups : seoFallbackGroups;
  // Reuses the seoFacets already fetched above (no extra 1C round-trip) so
  // the producer picker in the filter sidebar renders with real logos/counts
  // on first paint — no static-seed-then-live-swap flicker, no client fetch.
  const manufacturersDirectoryData = await resolveWithTimeout(
    () => buildManufacturersDirectoryData(seoFacets),
    null,
    MANUFACTURERS_DIRECTORY_TIMEOUT_MS
  ).catch(() => null);
  const initialProducerBrands = (manufacturersDirectoryData?.clientProducers ?? []).map(
    (producer) => ({
      name: producer.label,
      logo: producer.logoPath,
      productCount: producer.productCount,
    })
  );
  const producerLogoByLabel = new Map(
    (manufacturersDirectoryData?.clientProducers ?? []).map((producer) => [
      producer.label.trim().toLocaleLowerCase("uk-UA"),
      producer.logoPath,
    ])
  );
  const topProducers = seoFacets.producers.slice(0, 16).map((producer) => ({
    label: producer.label,
    slug: producer.slug,
    logoPath:
      producerLogoByLabel.get(producer.label.trim().toLocaleLowerCase("uk-UA")) ?? null,
  }));

  // The LCP candidate is the first card's image, but the initial payload's own
  // `images` map is deliberately empty (see above — no per-card filesystem
  // checks in SSR). The image URL itself needs no lookup though: it's a pure
  // function of code+article, the same one ProductCardImage computes on mount.
  // Preloading it here lets the browser's HTML scanner start the request
  // while parsing, well before hydration runs that mount effect.
  const lcpImageItem = initialPagePayload?.items?.[0];
  const lcpImageHref =
    lcpImageItem && lcpImageItem.hasPhoto !== false
      ? buildProductImagePath(lcpImageItem.code, lcpImageItem.article, { catalog: true })
      : null;

  return (
    <>
      {lcpImageHref ? (
        <link rel="preload" as="image" href={lcpImageHref} fetchPriority="high" />
      ) : null}
      {/* The <title> tag (state.title) stays terser/keyword-first for search
          snippets — this sr-only h1 instead matches the sentence-style
          heading actually shown on the page (CatalogSeoSnapshot's visible
          heading), so what's announced as the page's h1 doesn't say
          something different from what's on screen. */}
      <h1 className="sr-only">{buildCatalogSeoHeading(state)}</h1>
      <KatalogPageShell
        initialPagePayload={initialPagePayload}
        initialQuerySignature={initialQuerySignature}
        initialTotalCount={seoTotalCount ?? null}
        initialProducerBrands={initialProducerBrands}
      />
      <CatalogSeoSnapshot
        state={state}
        items={initialPagePayload?.items ?? []}
        hasMore={initialPagePayload?.hasMore}
        totalCount={seoTotalCount ?? initialPagePayload?.totalCount ?? null}
        topGroups={catalogNavigationGroups}
        topProducers={topProducers}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(collectionJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      {catalogItemListJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(catalogItemListJsonLd) }}
        />
      ) : null}
    </>
  );
}
