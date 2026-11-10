import type { Metadata } from "next";
import { applyProducerPageAvailability, buildCatalogBreadcrumbJsonLd, buildCatalogCollectionJsonLd, normalizeValue, resolveCatalogSeoState, type CatalogSeoState } from "app/lib/catalog-page-seo";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import {
  ArrowUpRight,
  BadgeCheck,
  Car,
  CreditCard,
  ListTree,
  MapPin,
  Phone,
  Tags,
  Truck,
} from "lucide-react";
import CatalogCountDigits from "app/components/CatalogCountDigits";
import CatalogSearchTotalCountClient from "app/components/CatalogSearchTotalCountClient";
import VinOpenButton from "app/katalog/VinOpenButton";
import CatalogShownCountClient from "app/components/CatalogShownCountClient";
import CatalogSeoFilterSummaryClient from "app/katalog/CatalogSeoFilterSummaryClient";
import KatalogPageShell from "app/katalog/KatalogPageShell";
import CatalogRestoreInlineScript from "app/katalog/CatalogRestoreInlineScript";
import { buildCatalogQuerySignature } from "app/lib/catalog-query-signature";
import { PRODUCT_PARAMS_QUERY_KEY } from "app/lib/product-params";
import {
  buildAutoModelPath,
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
import { carBrands } from "app/components/carBrands";
import { warmCatalogImages } from "app/lib/catalog-image-batch-server";
import {
  fetchCatalogProductsByQuery,
  fetchConfirmedEuroRate,
  fetchPromoCatalogProducts,
  listCatalogFromSnapshot,
} from "app/lib/catalog-server";
import { buildManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";
import { buildProductImagePath } from "app/lib/product-image-path";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { isPublicCatalogProduct, withoutCostPrice } from "app/lib/public-catalog-product";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { getProductTreeDataset } from "app/lib/product-tree";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { buildSeoSlug } from "app/lib/seo-slug";
import { homeSeoContent } from "app/lib/seo-copy";
import { getCategoryIconPath, inferCategoryForGroupLabel } from "app/lib/category-icons";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";
import {
  CATALOG_RESTORE_STYLE_ID,
  CATALOG_RESULTS_ATTRIBUTE,
  CATALOG_VIEW_MODE_COOKIE,
  detectCatalogRestoreOverride,
} from "app/lib/catalog-restore-override";

export const revalidate = 900;

// Runs during HTML parsing, before the server-rendered grid is painted.
// The server-rendered cards carry guest prices; a signed-in visitor (partner
// prices, admin cost prices) gets them hidden until the client knows who it is.
const CATALOG_RESTORE_INLINE_SCRIPT = `(function(){try{if((${detectCatalogRestoreOverride.toString()})(location.search,window.localStorage)){var s=document.createElement("style");s.id=${JSON.stringify(CATALOG_RESTORE_STYLE_ID)};s.textContent=${JSON.stringify(`[${CATALOG_RESULTS_ATTRIBUTE}]{visibility:hidden}`)};document.head.appendChild(s)}}catch(e){}try{if(window.localStorage.getItem("user_id")){var g=document.createElement("style");g.textContent=${JSON.stringify("[data-guest-price] .catalog-card-price-pill,[data-guest-price] .catalog-list-price-slot{visibility:hidden}")};document.head.appendChild(g)}}catch(e){}})()`;

const INITIAL_CATALOG_PAGE_LIMIT = 16;
// The confirmed rate answers from memory once warm; only a cold or stale
// process waits, and a miss leaves the rate to the client.
const CATALOG_EURO_RATE_TIMEOUT_MS = 300;
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
  euroRate?: number | null;
  hasMore: boolean;
  nextCursor: string;
  cursorField?: string;
  totalCount?: number | null;
  correctedQuery?: string;
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
    // The outer SSR budget controls first paint; shared 1C requests must
    // retain a normal timeout so a 350ms SSR attempt cannot abort live search.
    timeoutMs: 4200,
    retries: 0,
    retryDelayMs: 140,
    cacheTtlMs: query.searchQuery ? 15_000 : 1000 * 60 * 15,
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
  //
  // A text search hits the same failure mode even more reliably: this
  // snapshot's own timeoutMs (INITIAL_CATALOG_SSR_TIMEOUT_MS_FILTERED,
  // 350ms) is far shorter than the 1.1-3.9s a real filtered/search 1C query
  // takes, so the very first visitor for any given search term almost
  // always times out to an empty result here — which would otherwise get
  // cached as "no matches" for 15 minutes for every later visitor typing
  // the same thing, even though the product genuinely exists.
  const isUnfilteredQuery =
    !query.searchQuery && !query.group && !query.subcategory && !query.producer;
  if (result.items.length === 0 && (isUnfilteredQuery || Boolean(query.searchQuery))) {
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
    correctedQuery: result.correctedQuery,
  };
};

// "Акційні товари" (?promo=1): the same precomputed promo list the
// catalog-page API answers promoOnly requests from, sliced the same way, so
// the client can use this first page as-is instead of discarding the regular
// first page (wrong signature) and refetching after hydration.
const fetchPromoCatalogPayload = async (
  state: Pick<CatalogSeoState, "searchQuery" | "searchFilter" | "group" | "subcategory" | "producer" | "expandHierarchy">
): Promise<InitialCatalogPagePayload | null> => {
  // With the URL's other filters applied, like the API: this page shares the
  // client's query signature (search, group, producer), so the full promo
  // list here was shown — and counted — for "?promo=1&search=…" as is.
  const searchFilter = state.searchFilter;
  const listing = await listCatalogFromSnapshot({
    searchQuery: state.searchQuery,
    searchFilter:
      searchFilter === "article" || searchFilter === "name" || searchFilter === "code" ||
      searchFilter === "producer" || searchFilter === "description"
        ? searchFilter
        : "all",
    group: state.group,
    subcategory: state.subcategory,
    producer: state.producer,
    selectedCategories: [],
    expandHierarchy: state.expandHierarchy,
    vehicle: null,
    sortOrder: "none",
    nameSort: "none",
    pricedOnly: false,
    withPhoto: false,
    inStock: false,
    priceFrom: null,
    priceTo: null,
    promoOnly: true,
    offset: 0,
    limit: INITIAL_CATALOG_PAGE_LIMIT,
  }).catch(() => null);
  if (listing) {
    return {
      items: listing.items,
      prices: buildInlinePrices(listing.items),
      images: {},
      hasMore: listing.hasMore,
      nextCursor: "",
      cursorField: "",
      totalCount: listing.totalCount,
    };
  }

  // No snapshot yet: without other filters the precomputed list is right;
  // with them, let the client fetch the filtered page.
  if (state.searchQuery || state.group || state.subcategory || state.producer) return null;
  const { products } = await fetchPromoCatalogProducts();
  if (products.length === 0) return null;
  const items = products.slice(0, INITIAL_CATALOG_PAGE_LIMIT);
  return {
    items,
    prices: buildInlinePrices(items),
    images: {},
    hasMore: INITIAL_CATALOG_PAGE_LIMIT < products.length,
    nextCursor: "",
    cursorField: "",
    totalCount: products.length,
  };
};

const getCatalogSeoSnapshotPayloadCached = unstable_cache(
  fetchCatalogSeoSnapshotPayload,
  ["catalog-seo-snapshot-v6-unified-search"],
  {
    revalidate: 60 * 15,
    tags: ["catalog-seo-snapshot"],
  }
);

interface KatalogPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const loadCatalogSeoFacets = () =>
  getCatalogSeoFacetsWithTimeout(CATALOG_SEO_FACETS_TIMEOUT_MS)
    .catch(() => EMPTY_CATALOG_SEO_FACETS)
    .then((facets) => resolveCatalogSeoFacetsWithFallback(facets));

// The <title>/meta title (state.title) is deliberately terser and
// keyword-first for search snippets. This is the fuller, sentence-style
// heading actually shown on the page as its only <h1> (in CatalogSeoSnapshot).
// An identical sr-only <h1> used to sit above the product grid, which left
// the page with the same heading twice (h1 + h2).
const buildCatalogSeoHeading = (state: CatalogSeoState) =>
  state.searchQuery
    ? `Пошук «${state.searchQuery}» — каталог автозапчастин PartsON`
    : state.promoOnly
      ? `Акційні автозапчастини${state.producer ? ` ${state.producer}` : ""}${state.group ? `: ${state.subcategory || state.group}` : ""} — ціни зі знижкою`
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

const CAR_BRAND_LOGO_BY_NAME_LOWER = new Map(
  carBrands.map((brand) => [brand.name.toLowerCase(), brand.logo])
);

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
const buildPopularAutoModels = async (): Promise<
  Array<{ brand: string; model: string; logo: string | null }>
> => {
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

  const popularModels: Array<{ brand: string; model: string; logo: string | null }> = [];

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

    const logo = CAR_BRAND_LOGO_BY_NAME_LOWER.get(brand.toLowerCase()) ?? null;
    for (const model of picked) {
      popularModels.push({ brand, model, logo });
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

// Product rich results and merchant listings are for single-product pages
// (developers.google.com/search/docs/appearance/structured-data/product-snippet,
// …/merchant-listing); every product page already ships its own full
// Product + Offer. The listing therefore names its products by URL only —
// the same summary-list shape ProductRelatedItemsSection uses — and lists only
// public products, whose pages are indexable.
const buildCatalogItemListJsonLd = (
  siteUrl: string,
  state: CatalogSeoState,
  items: CatalogSeoProduct[]
) => {
  const currentUrl = `${siteUrl}${state.pagePath}`;
  const itemListElement = items
    .filter((item) => item.code && item.name && isPublicCatalogProduct(item))
    .slice(0, INITIAL_CATALOG_PAGE_LIMIT)
    .map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${siteUrl}${buildSeoProductPath(item)}`,
      name: buildVisibleProductName(item.name),
    }));

  if (itemListElement.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${currentUrl}#catalog-products`,
    name: `${state.title} — товари`,
    itemListOrder: "https://schema.org/ItemListUnordered",
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
  const siteUrl = getSiteUrl();
  const breadcrumbs = buildCatalogBreadcrumbJsonLd(siteUrl, state).itemListElement;


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
        ? `${state.producer} у категорії «${state.group}»: підбір запчастин за артикулом і кодом OEM, оригінали та аналоги, перевірка сумісності за VIN, актуальна наявність та ціни онлайн.`
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
      ? `Консультація з підбору ${state.producer}, перевірка OEM-сумісності та допомога з оформленням замовлення.`
      : state.group
        ? `Консультація з підбору «${state.group}», допомога у визначенні артикулу та допомога з оформленням замовлення.`
        : `PartsON — магазин автозапчастин у Львові. Консультація спеціалістів з підбору деталей та допомога з визначенням артикулу чи OEM-коду.`;

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

  const renderTotalCount = () => (
    // useSearchParams() inside CatalogSearchTotalCountClient forces a dynamic
    // bailout all the way up to the nearest Suspense boundary — without one
    // here, that bailout hits this page's `revalidate` (ISR) config and
    // throws DYNAMIC_SERVER_USAGE. The fallback is the plain SSR number so
    // there's no visible flash before the client value hydrates in.
    <Suspense fallback={<CatalogCountDigits count={initialFilteredCount} />}>
      <CatalogSearchTotalCountClient
        initialOpenCount={visibleItemsCount}
        initialFallbackCount={initialFilteredCount}
      />
    </Suspense>
  );
  const renderShownCount = (className = "text-slate-700") => (
    <CatalogShownCountClient initialCount={visibleItemsCount} className={className} />
  );



  return (
    <section
      aria-labelledby="catalog-seo-block-title"
      // page-shell-inline (not max-w-7xl) — this block sits directly below
      // KatalogPageShell's own page-shell-inline grid; a different container
      // system here left its edges narrower than the filters/grid above it.
      className="catalog-seo-section page-shell-inline mt-7 pb-12 sm:mt-9"
    >
      <div className="catalog-seo-shell relative overflow-hidden rounded-[26px] border border-sky-200/80 bg-white ring-1 ring-white">

        {/* ── Верхня секція: заголовок + лічильник ─────────────────────── */}
        <div className="catalog-seo-hero relative overflow-hidden border-b border-sky-100 bg-[radial-gradient(circle_at_8%_0%,rgba(34,211,238,0.16),transparent_32%),radial-gradient(circle_at_92%_18%,rgba(59,130,246,0.13),transparent_34%),linear-gradient(135deg,#f8fcff_0%,#eef8ff_48%,#f8fbff_100%)] px-4 py-6 sm:px-7 sm:py-7">
          <span className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full border-[34px] border-white/40" aria-hidden />
          <div className="catalog-seo-overview grid gap-3.5 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(270px,320px)] lg:items-start xl:grid-cols-[minmax(0,1fr)_335px]">

            {/* Ліва колонка — тексти */}
            <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
              <nav className="catalog-breadcrumbs" aria-label="Хлібні крихти">
                <ol>
                  {breadcrumbs.map((part, index) => (
                    <li key={`${part.item}-${index}`}>
                      {index > 0 && <span aria-hidden="true" className="catalog-breadcrumb-divider">/</span>}
                      {index === breadcrumbs.length - 1 ? (
                        <span aria-current="page">{part.name}</span>
                      ) : (
                        <Link href={part.item.slice(siteUrl.length) || "/"} prefetch={false}>{part.name}</Link>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>

              {/* H1 сторінки — єдиний; товарна сітка вище заголовків не має */}
              <h1
                id="catalog-seo-block-title"
                className="catalog-seo-title mt-3 max-w-4xl text-slate-900"
              >
                {seoHeading}
              </h1>

              {/* Підзаголовок з ключовими словами (не дублює h1). Абзац, а не
                  h3: між h1 і розділами нижче не має бути пропущеного рівня. */}
              {seoSubheading && (
                <p className="catalog-seo-subtitle mt-1.5 max-w-3xl text-sky-700">
                  {seoSubheading}
                </p>
              )}
            </div>

            <div className="order-3 min-w-0 lg:col-span-2 lg:row-start-2">
              {/* Основний SEO-текст */}
              <div className="catalog-seo-copy-grid">
                <section className="catalog-seo-copy-primary" aria-labelledby="catalog-selection-copy-title">
                  <h2 id="catalog-selection-copy-title" className="catalog-seo-copy-heading">
                    Підбір запчастин
                  </h2>
                  <p>{seoText}</p>
                </section>
                <section className="catalog-seo-copy-secondary" aria-labelledby="catalog-service-copy-title">
                  <h2 id="catalog-service-copy-title" className="catalog-seo-copy-heading">
                    Магазин та доставка
                  </h2>
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
                  className="group inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-sky-100 bg-white px-3 text-[12px] font-bold text-sky-900 shadow-sm transition-[border-color,background-color,color] duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-sky-100 text-sky-600">
                    <Phone size={14} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[9.5px] font-black uppercase tracking-[0.12em] text-sky-700">Консультація</span>
                    <span className="block truncate">{STORE_PHONE_DISPLAY}</span>
                  </span>
                </a>
                <Link
                  href="/inform/location"
                  aria-label={`Адреса магазину PartsON: ${STORE_ADDRESS}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-slate-200 bg-white px-3 text-[12px] font-bold text-sky-900 shadow-sm transition-[border-color,background-color,color] duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-slate-100 text-sky-700">
                    <MapPin size={14} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[9.5px] font-black uppercase tracking-[0.12em] text-sky-700">Магазин</span>
                    <span className="block truncate">{STORE_ADDRESS}</span>
                  </span>
                </Link>
                <Link
                  href="/inform/delivery"
                  aria-label="Доставка автозапчастин — умови та тарифи"
                  className="inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-slate-200 bg-white px-3 text-[12px] font-bold text-sky-900 shadow-sm transition-[border-color,background-color,color] duration-200 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-emerald-50 text-emerald-600">
                    <Truck size={14} aria-hidden />
                  </span>
                  <span>
                    <span className="block text-[9.5px] font-black uppercase tracking-[0.12em] text-sky-700">Доставка</span>
                    Нова Пошта
                  </span>
                </Link>
                <VinOpenButton />
              </div>
            </div>

            {/* ── Лічильник ─────────────────────────────────────────────── */}
            <div
              className="catalog-seo-counter order-2 lg:col-start-2 lg:row-start-1"
              data-nosnippet
            >
              <div className="min-w-0">
                <p className="catalog-seo-counter-label">{countLabel}</p>
                <p className="catalog-seo-counter-number">{renderTotalCount()}</p>
              </div>

              <div className="catalog-seo-counter-status">
                <p>
                  Завантажено зараз:{" "}
                  {renderShownCount("font-extrabold text-[#0f2c3d]")}
                </p>
                {hasMore && !hasExactCount ? (
                  <p>список оновлюється під час перегляду</p>
                ) : (
                  <p className="catalog-seo-counter-fresh">
                    <BadgeCheck size={12} aria-hidden />
                    дані актуальні
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Навігація: моделі, групи та виробники ────────────────────── */}
        {(popularModels.length > 0 || showDiscovery) && (
          <nav aria-label="Розділи каталогу" className="catalog-seo-navigation">
            {popularModels.length > 0 && (
              <div className="catalog-seo-rail">
                <div className="catalog-seo-rail-head">
                  <h3 className="catalog-seo-rail-title">
                    <Car size={14} aria-hidden />
                    Популярні моделі авто
                  </h3>
                  <Link href="/auto" className="catalog-seo-rail-all">
                    Усі марки
                    <ArrowUpRight size={12} aria-hidden />
                  </Link>
                </div>
                <ul className="catalog-seo-chips" role="list">
                  {popularModels.map(({ brand, model, logo }) => (
                    <li key={`${brand}-${model}`}>
                      <Link
                        href={buildAutoModelPath(brand, model)}
                        className="catalog-seo-chip"
                        aria-label={`Запчастини для ${brand} ${model}`}
                      >
                        {logo ? (
                          <Image
                            src={logo}
                            alt=""
                            width={28}
                            height={28}
                            sizes="18px"
                            loading="lazy"
                            unoptimized={logo.endsWith(".svg")}
                            className="catalog-seo-chip-icon"
                          />
                        ) : (
                          <Car className="catalog-seo-chip-icon" size={14} aria-hidden />
                        )}
                        <span className="catalog-seo-chip-label">{brand} {model}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {topGroups.length > 0 && (
              <div className="catalog-seo-rail">
                <div className="catalog-seo-rail-head">
                  <h3 className="catalog-seo-rail-title">
                    <ListTree size={14} aria-hidden />
                    Категорії товарів
                  </h3>
                  <Link href="/groups" className="catalog-seo-rail-all">
                    Усі категорії
                    <ArrowUpRight size={12} aria-hidden />
                  </Link>
                </div>
                <ul className="catalog-seo-chips" role="list">
                  {topGroups.map((group) => (
                    <li key={`group-${group.slug}`}>
                      <a
                        href={group.href}
                        aria-label={`Категорія товарів: ${group.label}`}
                        className="catalog-seo-chip"
                      >
                        <Image
                          src={getCategoryIconPath(inferCategoryForGroupLabel(group.label) || group.label)}
                          alt={`Іконка категорії ${group.label}`}
                          width={28}
                          height={28}
                          sizes="18px"
                          loading="lazy"
                          className="catalog-seo-chip-icon"
                        />
                        <span className="catalog-seo-chip-label">{group.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {topProducers.length > 0 && (
              <div className="catalog-seo-rail">
                <div className="catalog-seo-rail-head">
                  <h3 className="catalog-seo-rail-title">
                    <Tags size={14} aria-hidden />
                    Виробники
                  </h3>
                  <Link href="/manufacturers" className="catalog-seo-rail-all">
                    Усі виробники
                    <ArrowUpRight size={12} aria-hidden />
                  </Link>
                </div>
                <ul className="catalog-seo-chips" role="list">
                  {topProducers.map((producer) => (
                    <li key={`producer-${producer.slug}`}>
                      <a
                        href={buildManufacturerPath(producer.slug)}
                        aria-label={`Виробник автозапчастин: ${producer.label}`}
                        className="catalog-seo-chip"
                      >
                        {producer.logoPath && (
                          <Image
                            src={producer.logoPath}
                            alt={`Логотип виробника ${producer.label}`}
                            width={56}
                            height={28}
                            sizes="36px"
                            loading="lazy"
                            unoptimized={producer.logoPath.endsWith(".svg")}
                            className="catalog-seo-chip-logo"
                          />
                        )}
                        <span className="catalog-seo-chip-label">{producer.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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

  const baseState = resolveCatalogSeoState(resolvedSearchParams);
  const { title, description, canonicalPath, indexable } = baseState.producer
    ? applyProducerPageAvailability(baseState, await loadCatalogSeoFacets())
    : baseState;

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
      url: "/opengraph-partson-v3.png",
      alt: `${title} | PartsON`,
    },
    index: indexable,
  });
}

export default async function KatalogPage({ searchParams }: KatalogPageProps) {
  const resolvedSearchParams = await (
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  );
  const initialViewMode =
    (await cookies()).get(CATALOG_VIEW_MODE_COOKIE)?.value === "list" ? "list" : "grid";
  const siteUrl = getSiteUrl();
  const state = resolveCatalogSeoState(resolvedSearchParams);
  const promoOnly = normalizeValue(resolvedSearchParams.promo) === "1";
  // The "Параметри" filter (?params=) needs the whole category loaded and
  // parsed; the SEO snapshot below is unfiltered, so the client fetches the
  // filtered list itself instead of flashing products that don't match.
  const hasParamFilters = Boolean(normalizeValue(resolvedSearchParams[PRODUCT_PARAMS_QUERY_KEY]));
  const initialQuerySignature = buildCatalogQuerySignature({
    normalizedSearch: state.searchQuery,
    searchFilter: state.searchFilter || "all",
    selectedCars: [],
    selectedCategories: [],
    group: state.group || null,
    subcategory: state.subcategory || null,
    producer: state.producer || null,
    expandHierarchy: state.expandHierarchy,
    promoOnly,
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
  const seoFacetsPromise = loadCatalogSeoFacets();
  const manufacturersDirectoryPromise = seoFacetsPromise.then((facets) =>
    resolveWithTimeout(
      () => buildManufacturersDirectoryData(facets),
      null,
      MANUFACTURERS_DIRECTORY_TIMEOUT_MS
    )
  );
  // Lets the first page render its prices in the HTML instead of waiting for
  // the client's /api/proxy?endpoint=euro round trip after hydration.
  const euroRatePromise = resolveWithTimeout(
    () => fetchConfirmedEuroRate(),
    null,
    CATALOG_EURO_RATE_TIMEOUT_MS
  ).catch(() => null);
  const [rawInitialPagePayload, seoFacets, productTreeDataset, manufacturersDirectoryData, initialEuroRate] = await Promise.all([
    resolveWithTimeout(
      () => (hasParamFilters || Boolean(normalizeValue(resolvedSearchParams.vehicle)))
        ? Promise.resolve(null)
        : promoOnly
        ? fetchPromoCatalogPayload(state)
        : state.searchQuery
        ? fetchCatalogSeoSnapshotPayload(snapshotCacheKey)
        : getCatalogSeoSnapshotPayloadCached(snapshotCacheKey),
      null,
      initialCatalogTimeoutMs
    ),
    seoFacetsPromise,
    resolveWithTimeout(
      () => getProductTreeDataset(),
      null,
      CATALOG_PRODUCT_TREE_TIMEOUT_MS
    ).catch(() => null),
    manufacturersDirectoryPromise,
    euroRatePromise,
  ]);
  // Start the first page's 1C photo lookup now, while this HTML streams to the
  // browser, so its image requests find the thumbnails ready or in flight.
  if (rawInitialPagePayload?.items?.length) warmCatalogImages(rawInitialPagePayload.items);
  const initialPagePayload = rawInitialPagePayload
    ? {
      ...rawInitialPagePayload,
        // This payload is serialized into the HTML for every visitor; the
        // purchase price from 1C must not travel with it.
        items: rawInitialPagePayload.items.map(withoutCostPrice),
        // Images warm up client-side in one shared batch. Avoid holding the
        // initial HTML response behind filesystem checks for every card.
        images: {},
        euroRate: initialEuroRate,
      }
    : null;
  // The facet totals describe the whole catalog, not the promo list.
  const seoTotalCount = promoOnly
    ? initialPagePayload?.totalCount ?? null
    : resolveCatalogSeoTotalCount(state, seoFacets);
  const structuredDataState = applyProducerPageAvailability(state, seoFacets);
  const breadcrumbJsonLd = buildCatalogBreadcrumbJsonLd(siteUrl, structuredDataState);
  const catalogItemListJsonLd = buildCatalogItemListJsonLd(
    siteUrl,
    structuredDataState,
    initialPagePayload?.items ?? []
  );
  const collectionJsonLd = buildCatalogCollectionJsonLd(siteUrl, structuredDataState, Boolean(catalogItemListJsonLd));
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

  // The catalog grid only renders after hydration, so without hints the
  // browser can't start any card image before the JS has run (~1.2 s after
  // the first one on the live site). The image URL is a pure function of
  // code+article — the same one ProductCardImage and the image batch use — so
  // preloading the first screen's photos here lets the HTML scanner fetch them
  // while JS loads; the cards then find them in the cache. The first one is
  // the LCP candidate (high priority); the rest stay low so they don't
  // compete with CSS/JS. Media queries match Data.tsx's responsive grid budget.
  const FIRST_SCREEN_IMAGE_PRELOADS = 12;
  const firstScreenImageHrefs = (initialPagePayload?.items ?? [])
    .filter((item) => item.hasPhoto !== false && (item.code || item.article))
    .slice(0, FIRST_SCREEN_IMAGE_PRELOADS)
    .map((item) => buildProductImagePath(item.code, item.article, { catalog: true }))
    .filter(Boolean);

  return (
    <>
      {initialPagePayload?.items?.length ? (
        // The first page is server-rendered with default filters. If this
        // browser's saved sort/car/reset state will change the request, hide
        // those products before first paint; KatalogClientPage then remounts
        // the grid for the restored query (see detectCatalogRestoreOverride).
        <CatalogRestoreInlineScript html={CATALOG_RESTORE_INLINE_SCRIPT} />
      ) : null}
      {firstScreenImageHrefs.map((href, index) => (
        <link
          key={href}
          rel="preload"
          as="image"
          href={href}
          fetchPriority={index === 0 ? "high" : "low"}
          media={
            index < 2 ? undefined
              : index < 4 ? "(min-width: 640px)"
              : index < 6 ? "(min-width: 1024px)"
              : index < 8 ? "(min-width: 1280px)"
              : index < 10 ? "(min-width: 1800px)"
              : "(min-width: 2400px)"
          }
        />
      ))}
      <KatalogPageShell
        initialPagePayload={initialPagePayload}
        initialQuerySignature={initialQuerySignature}
        initialTotalCount={seoTotalCount ?? null}
        initialProducerBrands={initialProducerBrands}
        initialViewMode={initialViewMode}
      />
      <CatalogSeoSnapshot
        state={structuredDataState}
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
