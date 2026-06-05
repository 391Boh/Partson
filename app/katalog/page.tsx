import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import CatalogShownCountClient from "app/components/CatalogShownCountClient";
import KatalogPageShell from "app/katalog/KatalogPageShell";
import { buildCatalogQuerySignature } from "app/lib/catalog-query-signature";
import {
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
import { fetchCatalogProductsByQuery } from "app/lib/catalog-server";
import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";
import { buildProductImagePath } from "app/lib/product-image-path";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { getProductTreeDataset } from "app/lib/product-tree";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { buildSeoSlug } from "app/lib/seo-slug";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 900;

const INITIAL_CATALOG_PAGE_LIMIT = 12;
const INITIAL_CATALOG_SSR_TIMEOUT_MS = 950;
const INITIAL_CATALOG_SSR_TIMEOUT_MS_FILTERED = 1350;
const CATALOG_SEO_FACETS_TIMEOUT_MS = 320;
const CATALOG_PRODUCT_TREE_TIMEOUT_MS = 950;
const STORE_PHONE_DISPLAY = "+38 (063) 421-18-51";
const STORE_ADDRESS = "Львів, вул. Перфецького, 8";

const PartsOnLink = ({ className = "" }: { className?: string }) => (
  <Link
    href="/"
    className={`font-extrabold text-sky-800 underline decoration-sky-300/70 underline-offset-4 transition hover:text-sky-600 hover:decoration-sky-500 ${className}`}
  >
    PartsON
  </Link>
);

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

  return {
    items: result.items,
    prices: buildInlinePrices(result.items),
    images: {},
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
    cursorField: result.cursorField || "",
  };
};

const getCatalogSeoSnapshotPayloadCached = unstable_cache(
  fetchCatalogSeoSnapshotPayload,
  ["catalog-seo-snapshot-v2-allgoods-inline-price"],
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
  let title = "Каталог автозапчастин";
  let description = appendSeoContact(
    "Каталог PartsON: автозапчастини за артикулом, кодом, виробником і категорією, актуальна наявність, ціни онлайн, VIN-підбір і доставка по Україні."
  );

  if (producer && group && subcategory) {
    canonicalPath = buildCatalogProducerPath(producer, group, subcategory);
    title = `${producer}: ${subcategory} - ${group} | Каталог автозапчастин`;
    description = appendSeoContact(
      `${producer} у категорії ${subcategory}: автозапчастини ${group} у каталозі PartsON, актуальна наявність, перевірка сумісності за VIN та доставка по Україні.`
    );
  } else if (producer && group) {
    canonicalPath = buildCatalogProducerPath(producer, group);
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
    canonicalPath = buildCatalogCategoryPath(group, subcategory);
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
    canonicalPath = `/katalog?tab=auto&brand=${encodeURIComponent(brand)}`;
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
  items: CatalogSeoProduct[]
) => {
  const currentUrl = `${siteUrl}${state.canonicalPath}`;
  const itemListElement = items
    .filter((item) => item.code && item.name)
    .slice(0, INITIAL_CATALOG_PAGE_LIMIT)
    .map((item, index) => {
      const url = `${siteUrl}${buildSeoProductPath(item)}`;
      const imagePath =
        item.hasPhoto === false
          ? PRODUCT_IMAGE_FALLBACK_PATH
          : buildProductImagePath(item.code, item.article);

      return {
        "@type": "ListItem",
        position: index + 1,
        url,
        item: {
          "@type": "Product",
          name: item.name,
          sku: item.code,
          mpn: item.article || item.code,
          image: `${siteUrl}${imagePath}`,
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
                  price: Math.round(item.priceEuro * 50),
                  availability:
                    item.quantity > 0
                      ? "https://schema.org/InStock"
                      : "https://schema.org/BackOrder",
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

type CatalogSeoDiscoveryItem = { label: string; slug: string };
type CatalogSeoGroupDiscoveryItem = CatalogSeoDiscoveryItem & { href: string };

const formatCatalogCount = (count: number) => count.toLocaleString("uk-UA");

const getCatalogProductWord = (count: number) => {
  const abs = Math.abs(count);
  const lastTwo = abs % 100;
  const last = abs % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return "товарів";
  if (last === 1) return "товар";
  if (last >= 2 && last <= 4) return "товари";
  return "товарів";
};

const CatalogSeoSnapshot = ({
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
  const hasExactCount = typeof totalCount === "number" && totalCount > 0;
  const listCountLabel =
    visibleItemsCount > 0
      ? `${formatCatalogCount(visibleItemsCount)} ${getCatalogProductWord(visibleItemsCount)}`
      : "0 товарів";
  const totalCountLabel = hasExactCount
    ? `${formatCatalogCount(totalCount)} ${getCatalogProductWord(totalCount)}`
    : null;
  const displayCountLabel = totalCountLabel || listCountLabel;
  const countCaption = hasExactCount
    ? "точна кількість за поточним каталогом"
    : visibleItemsCount > 0
      ? hasMore
        ? "поточна вибірка, далі є ще товари"
        : "усі товари в поточній вибірці"
      : "у первинній вибірці нічого не знайдено";
  const searchFilterLabels: Record<string, string> = {
    all: "усі поля",
    article: "артикул",
    name: "назва",
    code: "код",
    producer: "виробник",
    description: "опис",
  };
  const selectedFilters = [
    state.searchQuery
      ? `пошук "${state.searchQuery}"${
          state.searchFilter
            ? ` у полі ${searchFilterLabels[state.searchFilter] || state.searchFilter}`
            : ""
        }`
      : null,
    state.producer ? `виробник ${state.producer}` : null,
    state.group ? `група ${state.group}` : null,
    state.subcategory ? `категорія ${state.subcategory}` : null,
  ].filter((item): item is string => Boolean(item));
  const selectedFiltersLabel =
    selectedFilters.length > 0 ? selectedFilters.join(", ") : "без додаткових фільтрів";
  const catalogTips = [
    "пошук за артикулом",
    "фільтр за виробником",
    "категорії запчастин",
    "підбір за VIN",
  ];
  const showDiscovery = topGroups.length > 0 || topProducers.length > 0;

  return (
    <section
      aria-labelledby="catalog-seo-products-title"
      className="mx-auto mt-3 w-full max-w-7xl px-3 pb-10 sm:mt-4 sm:px-4 lg:px-6"
    >
      <div className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(240,249,255,0.95)_48%,rgba(248,250,252,0.98))] shadow-[0_18px_46px_rgba(15,23,42,0.09)] ring-1 ring-white/90">
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(240px,310px)] lg:gap-5">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-700">
              Навігація каталогу
            </p>
            <h2
              id="catalog-seo-products-title"
              className="mt-1 font-display-italic text-[1.18rem] font-black leading-tight text-slate-950 sm:text-[1.42rem]"
            >
              Автозапчастини в каталозі <PartsOnLink />
            </h2>

            <p className="mt-2.5 max-w-4xl text-sm font-medium leading-6 text-slate-600">
              Каталог <PartsOnLink /> допомагає швидко знайти автозапчастини за
              артикулом, кодом, виробником або категорією. Для точного підбору
              можна звірити сумісність за VIN, порівняти доступні позиції та
              перейти до потрібної групи чи бренду. Товари можна замовити з
              доставкою по Україні або забрати у магазині у Львові.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex min-h-8 items-center rounded-[12px] border border-slate-200 bg-white px-3 py-1 text-[12px] font-bold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                Фільтри: {selectedFiltersLabel}
              </span>
              <a
                href="tel:+380634211851"
                aria-label={`Подзвонити в магазин PartsON ${STORE_PHONE_DISPLAY}`}
                className="inline-flex min-h-8 items-center rounded-[12px] border border-sky-200 bg-white px-3 py-1 text-[12px] font-black text-sky-800 shadow-[0_8px_18px_rgba(14,165,233,0.08)] transition hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              >
                {STORE_PHONE_DISPLAY}
              </a>
              <Link
                href="/inform/location"
                aria-label={`Адреса магазину PartsON: ${STORE_ADDRESS}`}
                className="inline-flex min-h-8 items-center rounded-[12px] border border-slate-200 bg-white px-3 py-1 text-[12px] font-bold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:border-sky-200 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              >
                {STORE_ADDRESS}
              </Link>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {catalogTips.map((tip) => (
                <span
                  key={tip}
                  className="rounded-[11px] border border-sky-100 bg-white/86 px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-[0_7px_16px_rgba(15,23,42,0.035)]"
                >
                  {tip}
                </span>
              ))}
            </div>
          </div>

          <div
            className="rounded-[20px] border border-sky-100 bg-white/86 p-4 shadow-[0_14px_30px_rgba(14,165,233,0.1)] ring-1 ring-white"
            data-nosnippet
          >
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-700">
              У каталозі
            </p>
            <p className="mt-1 text-[1.65rem] font-black leading-none text-slate-950">
              {displayCountLabel}
            </p>
            <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-500">
              {countCaption}
            </p>
            {totalCountLabel && totalCountLabel !== listCountLabel ? (
              <p className="mt-3 rounded-[13px] border border-slate-200 bg-slate-50/90 px-3 py-2 text-[11px] font-bold leading-4 text-slate-600">
                Відкрито на сторінці:{" "}
                <CatalogShownCountClient
                  initialCount={visibleItemsCount}
                  className="text-slate-950"
                />
              </p>
            ) : null}
          </div>

          {visibleItems.length > 0 && (
            <div
              className="min-w-0 rounded-[22px] border border-slate-200 bg-white/84 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.06)] lg:col-span-2"
              data-nosnippet
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Відкриті товари на сторінці
                </p>
                <span className="rounded-[10px] border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                  <CatalogShownCountClient initialCount={visibleItemsCount} />
                </span>
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-3">
                {visibleItems.map((item) => {
                  const visibleName = buildVisibleProductName(item.name);

                  return (
                    <li key={item.code}>
                      <a
                        href={buildSeoProductPath(item)}
                        className="block min-h-[52px] rounded-[15px] border border-transparent bg-slate-50/82 px-3 py-2 text-[13px] font-bold leading-5 text-slate-700 transition hover:border-sky-200 hover:bg-white hover:text-sky-700 hover:shadow-[0_10px_22px_rgba(14,165,233,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                      >
                        <span className="min-w-0">
                          <span className="line-clamp-1">{visibleName}</span>
                          {item.producer ? (
                            <span className="mt-0.5 block text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                              {item.producer}
                            </span>
                          ) : null}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {showDiscovery && (
          <nav
            aria-label="Розділи каталогу"
            className="grid gap-3 border-t border-slate-200/80 bg-white/64 px-4 py-4 sm:px-5 lg:grid-cols-2 lg:gap-0"
          >
            {topGroups.length > 0 && (
              <div className="min-w-0 rounded-[18px] bg-white/62 p-3 ring-1 ring-slate-200/70 lg:rounded-l-[18px] lg:rounded-r-none lg:pr-5">
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Категорії запчастин
                  </p>
                  <Link
                    href="/groups"
                    className="inline-flex min-h-8 shrink-0 items-center rounded-[12px] bg-[linear-gradient(135deg,#0f172a,#0369a1)] px-3.5 py-1 text-[11px] font-black text-white shadow-[0_10px_22px_rgba(14,165,233,0.18)] ring-1 ring-white/70 transition hover:-translate-y-0.5 hover:bg-[linear-gradient(135deg,#0369a1,#0284c7)] hover:shadow-[0_14px_28px_rgba(14,165,233,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                  >
                    Усі категорії
                  </Link>
                </div>
                <div className="max-w-full text-[12px] font-bold leading-7 text-slate-600">
                  {topGroups.map((group, index) => (
                    <span key={`group-${group.slug}`}>
                      <a
                        href={group.href}
                        aria-label={`Категорія запчастин ${group.label}`}
                        className="rounded-[7px] px-1 py-0.5 text-slate-700 transition hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                      >
                        {group.label}
                      </a>
                      {index < topGroups.length - 1 ? (
                        <span className="text-slate-300">, </span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {topProducers.length > 0 && (
              <div className="min-w-0 rounded-[18px] bg-white/62 p-3 ring-1 ring-slate-200/70 lg:rounded-l-none lg:rounded-r-[18px] lg:border-l lg:border-slate-300/80 lg:pl-5">
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Виробники
                  </p>
                  <Link
                    href="/manufacturers"
                    className="inline-flex min-h-8 shrink-0 items-center rounded-[12px] bg-[linear-gradient(135deg,#0f172a,#0369a1)] px-3.5 py-1 text-[11px] font-black text-white shadow-[0_10px_22px_rgba(14,165,233,0.18)] ring-1 ring-white/70 transition hover:-translate-y-0.5 hover:bg-[linear-gradient(135deg,#0369a1,#0284c7)] hover:shadow-[0_14px_28px_rgba(14,165,233,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                  >
                    Усі виробники
                  </Link>
                </div>
                <div className="max-w-full text-[12px] font-bold leading-7 text-slate-600">
                  {topProducers.map((producer, index) => (
                    <span key={`producer-${producer.slug}`}>
                      <a
                        href={buildManufacturerPath(producer.slug)}
                        aria-label={`Виробник автозапчастин ${producer.label}`}
                        className="rounded-[7px] px-1 py-0.5 text-slate-700 transition hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                      >
                        {producer.label}
                      </a>
                      {index < topProducers.length - 1 ? (
                        <span className="text-slate-300">, </span>
                      ) : null}
                    </span>
                  ))}
                </div>
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
      url: "/Car-parts-fullwidth.png",
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
  const [initialPagePayload, rawSeoFacets, productTreeDataset] = await Promise.all([
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
  ]);
  const seoFacets = await resolveCatalogSeoFacetsWithFallback(rawSeoFacets);
  const seoTotalCount = resolveCatalogSeoTotalCount(state, seoFacets);
  const collectionJsonLd = buildCatalogCollectionJsonLd(siteUrl, state);
  const breadcrumbJsonLd = buildCatalogBreadcrumbJsonLd(siteUrl, state);
  const catalogItemListJsonLd = buildCatalogItemListJsonLd(
    siteUrl,
    state,
    initialPagePayload?.items ?? []
  );
  const topGroups = (productTreeDataset?.groups ?? []).slice(0, 30).map((g) => ({
    label: g.label,
    slug: g.slug,
    href: buildGroupPath(g.slug || g.label),
  }));
  const topProducers = seoFacets.producers
    .slice(0, 42)
    .map((p) => ({ label: p.label, slug: p.slug }));

  return (
    <>
      <h1 className="sr-only">{state.title}</h1>
      <KatalogPageShell
        initialPagePayload={initialPagePayload}
        initialQuerySignature={initialQuerySignature}
      />
      <CatalogSeoSnapshot
        state={state}
        items={initialPagePayload?.items ?? []}
        hasMore={initialPagePayload?.hasMore}
        totalCount={seoTotalCount}
        topGroups={topGroups}
        topProducers={topProducers}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {catalogItemListJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(catalogItemListJsonLd) }}
        />
      ) : null}
    </>
  );
}
