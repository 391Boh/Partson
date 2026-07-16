import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import {
  ArrowUpRight,
  BadgeCheck,
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
import KatalogPageShell from "app/katalog/KatalogPageShell";
import { resolvePersistentCatalogImageMap } from "app/lib/catalog-persistent-images";
import { buildCatalogQuerySignature } from "app/lib/catalog-query-signature";
import {
  buildAutoBrandPath,
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
import { buildManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";
import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";
import { buildProductImagePath } from "app/lib/product-image-path";
import { buildProductPath, buildVisibleProductName } from "app/lib/product-url";
import { appendSeoContact, buildPageMetadata } from "app/lib/seo-metadata";
import { getProductTreeDataset } from "app/lib/product-tree";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { buildSeoSlug } from "app/lib/seo-slug";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";

export const revalidate = 900;

const INITIAL_CATALOG_PAGE_LIMIT = 16;
const INITIAL_CATALOG_SSR_TIMEOUT_MS = 250;
const INITIAL_CATALOG_SSR_TIMEOUT_MS_FILTERED = 350;
const CATALOG_SEO_FACETS_TIMEOUT_MS = 200;
const CATALOG_PRODUCT_TREE_TIMEOUT_MS = 200;
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
  ["catalog-seo-snapshot-v3-photo-flag-only"],
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
        item.hasPhoto === true
          ? buildProductImagePath(item.code, item.article)
          : PRODUCT_IMAGE_FALLBACK_PATH;

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

type CatalogSeoDiscoveryItem = { label: string; slug: string };
type CatalogSeoGroupDiscoveryItem = CatalogSeoDiscoveryItem & { href: string };

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
  const isSearchState = Boolean(state.searchQuery);
  const hasExactCount = typeof totalCount === "number" && totalCount >= 0;
  const initialFilteredCount = hasExactCount ? totalCount : visibleItemsCount;
  const showDiscovery = topGroups.length > 0 || topProducers.length > 0;


  const seoHeading = state.searchQuery
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

  const seoText = state.searchQuery
    ? `Пошук «${state.searchQuery}» у каталозі PartsON: підбір за артикулом, кодом OEM, назвою або виробником. Перевірка сумісності за VIN-номером. Актуальна наявність та ціни онлайн — самовивіз у Львові або доставка Новою Поштою по всій Україні.`
    : state.producer && state.group && state.subcategory
      ? `${state.producer} ${state.subcategory} у групі «${state.group}»: оригінальні та аналогові запчастини за артикулом і кодом OEM, актуальна наявність і ціни в PartsON. Перевірка сумісності за VIN. Самовивіз — Львів, вул. Перфецького, 8. Доставка Новою Поштою по всій Україні.`
      : state.producer && state.group
        ? `${state.producer} у категорії «${state.group}»: підбір запчастин за артикулом і кодом OEM, оригінали та сертифіковані аналоги, перевірка сумісності за VIN, актуальна наявність та ціни онлайн у PartsON, Львів. Доставка Новою Поштою.`
        : state.producer
          ? `Автозапчастини ${state.producer} у PartsON: пошук за артикулом і кодом OEM, перевірка сумісності за VIN, підбір аналогів і оригінальних деталей, ціни та наявність онлайн. Самовивіз у Львові (вул. Перфецького, 8) або доставка Новою Поштою по Україні.`
          : state.group && state.subcategory
            ? `${state.subcategory} — запчастини в категорії «${state.group}»: підбір за артикулом, VIN-номером і кодом OEM, оригінали та аналоги провідних виробників, актуальна наявність і ціни онлайн у PartsON. Самовивіз у Львові або доставка Новою Поштою.`
            : state.group
              ? `${state.group}: пошук запчастин за артикулом, кодом та виробником, перевірка сумісності за VIN, оригінали й аналоги у наявності, актуальні ціни в PartsON. Самовивіз — Львів, вул. Перфецького, 8, доставка Новою Поштою по Україні.`
              : `Каталог автозапчастин PartsON у Львові: пошук за артикулом, кодом OEM, назвою та виробником. Оригінальні та аналогові деталі від перевірених постачальників. Підбір за VIN-номером, перевірка сумісності, актуальні ціни та наявність онлайн. Самовивіз — вул. Перфецького, 8 або доставка Новою Поштою по всій Україні.`;

  const seoText2 = state.searchQuery
    ? `PartsON — магазин автозапчастин у Львові: консультація спеціалістів, широкий асортимент оригінальних і аналогових деталей, швидке оформлення замовлення. Оплата готівкою, карткою або онлайн. Режим роботи: пн–сб 08:00–18:00, нд 08:00–16:00.`
    : state.producer
      ? `PartsON — магазин автозапчастин у Львові. Консультація з підбору ${state.producer}, перевірка OEM-сумісності, оплата готівкою та карткою. Режим роботи: пн–сб 08:00–18:00, нд 08:00–16:00.`
      : state.group
        ? `PartsON — магазин автозапчастин на вул. Перфецького, 8 у Львові. Консультація з підбору ${state.group}, допомога у визначенні артикулу, оплата готівкою та карткою. Пн–сб 08:00–18:00, нд 08:00–16:00.`
        : `PartsON — офіційний магазин автозапчастин на вул. Перфецького, 8 у Львові. Консультація спеціалістів з підбору деталей, допомога з визначенням артикулу та OEM-коду. Оплата готівкою, карткою або онлайн через LiqPay. Режим роботи: пн–сб 08:00–18:00, нд 08:00–16:00.`;

  const countLabel = hasExactCount
    ? "Позицій у фільтрі"
    : isSearchState
      ? "Знайдено"
      : "У вибірці";

  const renderFilteredCount = (className = "text-slate-950") => (
    <CatalogShownCountClient
      initialCount={initialFilteredCount}
      className={className}
      eventName="filtered"
    />
  );
  const renderSearchTotalCount = (className = "text-slate-950") => (
    <CatalogSearchTotalCountClient
      initialOpenCount={visibleItemsCount}
      className={className}
    />
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
      className="mx-auto mt-5 w-full max-w-7xl px-3 pb-10 sm:mt-6 sm:px-4 lg:px-6"
    >
      <div className="overflow-hidden rounded-[24px] border border-slate-200/70 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.07)]">

        {/* ── Верхня секція: заголовок + лічильник ─────────────────────── */}
        <div className="border-b border-slate-100/80 bg-[linear-gradient(135deg,#f5f9ff_0%,#edf5ff_50%,#f8fbff_100%)] px-4 py-5 sm:px-6 sm:py-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_230px] lg:items-start">

            {/* Ліва колонка — тексти */}
            <div className="min-w-0">
              {/* Хлібні крихти-бейдж */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-100 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-600 shadow-sm">
                  <PackageSearch size={11} aria-hidden />
                  Каталог PartsON
                </span>
                {breadcrumbParts.length > 0 && (
                  <span className="inline-flex min-w-0 flex-wrap items-center gap-1 text-[11px] font-semibold text-slate-400">
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
                className="mt-3 max-w-3xl font-display text-[1.35rem] font-black leading-[1.1] tracking-[-0.025em] text-slate-900 sm:text-[1.75rem]"
              >
                {seoHeading}
              </h2>

              {/* H3 — підзаголовок з ключовими словами (не дублює h2) */}
              {seoSubheading && (
                <h3 className="mt-1.5 max-w-2xl text-[13px] font-bold text-sky-600 sm:text-[14px]">
                  {seoSubheading}
                </h3>
              )}

              {/* Основний SEO-текст */}
              <p className="mt-2.5 max-w-3xl text-[13.5px] leading-[1.7] text-slate-600">
                {seoText}
              </p>
              <p className="mt-1.5 max-w-3xl text-[12.5px] leading-[1.7] text-slate-500">
                {seoText2}
              </p>

              {/* Піктограми-контакти */}
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <a
                  href="tel:+380634211851"
                  aria-label={`Подзвонити в магазин PartsON: ${STORE_PHONE_DISPLAY}`}
                  className="group inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-sky-100 bg-white px-3 text-[12px] font-bold text-slate-700 shadow-sm transition-[border-color,background-color,color] duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-sky-100 text-sky-600">
                    <Phone size={14} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[9.5px] font-black uppercase tracking-[0.12em] text-slate-400">Консультація</span>
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
                    <span className="block text-[9.5px] font-black uppercase tracking-[0.12em] text-slate-400">Магазин</span>
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
                    <span className="block text-[9.5px] font-black uppercase tracking-[0.12em] text-slate-400">Доставка</span>
                    Нова Пошта
                  </span>
                </Link>
                <VinOpenButton />
              </div>
            </div>

            {/* ── Лічильник — світлий варіант ─────────────────────────── */}
            <div
              className="rounded-[20px] border border-sky-200/70 bg-gradient-to-br from-sky-50 via-white to-blue-50/60 p-4 shadow-[0_8px_28px_rgba(14,165,233,0.10)] ring-1 ring-sky-100/50"
              data-nosnippet
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9.5px] font-black uppercase tracking-[0.16em] text-sky-500">
                    {countLabel}
                  </p>
                  <p className="mt-1 font-display text-[2.1rem] font-black leading-none text-slate-900">
                    {isSearchState
                      ? renderSearchTotalCount("text-slate-900")
                      : renderFilteredCount("text-slate-900")}
                  </p>
                </div>
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-sky-100 text-sky-600 ring-1 ring-sky-200/60">
                  <Tags size={17} aria-hidden />
                </span>
              </div>

              <div className="mt-3.5 rounded-[14px] border border-sky-100 bg-white/70 px-3 py-2.5">
                <p className="text-[12px] font-semibold leading-[1.6] text-slate-600">
                  Відкрито зараз:{" "}
                  <span className="font-black text-sky-700">
                    {renderShownCount("text-sky-700")}
                  </span>
                </p>
                {hasMore && !hasExactCount ? (
                  <p className="mt-0.5 text-[11px] text-slate-400">
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

        {/* ── Список товарів для SEO ────────────────────────────────────── */}
        {visibleItems.length > 0 && (
          <div className="px-4 py-5 sm:px-6" data-nosnippet>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                Позиції каталогу
              </p>
              <Link
                href="/katalog"
                className="inline-flex h-8 items-center gap-1.5 rounded-[11px] border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 shadow-sm transition-[border-color,color,background-color] duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
              >
                Увесь каталог
                <ArrowUpRight size={12} aria-hidden />
              </Link>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {visibleItems.slice(0, 16).map((item) => {
                const visibleName = buildVisibleProductName(item.name);
                return (
                  <li key={item.code}>
                    <a
                      href={buildSeoProductPath(item)}
                      className="group flex min-h-[58px] flex-col justify-center rounded-[13px] border border-slate-200/70 bg-slate-50/60 px-3 py-2.5 transition-[border-color,background-color,box-shadow,color] duration-200 hover:border-sky-200 hover:bg-white hover:shadow-[0_8px_20px_rgba(14,165,233,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                    >
                      <span className="line-clamp-2 text-[12.5px] font-bold leading-[1.45] text-slate-800 group-hover:text-sky-700">
                        {visibleName}
                      </span>
                      <span className="mt-1 line-clamp-1 text-[11px] font-medium text-slate-400">
                        {[item.producer, item.article].filter(Boolean).join(" · ")}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* ── Навігація: групи та виробники ────────────────────────────── */}
        {showDiscovery && (
          <nav
            aria-label="Розділи каталогу"
            className="border-t border-slate-100/80 bg-slate-50/50 px-4 py-5 sm:px-6"
          >
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
              {topGroups.length > 0 && (
                <div className="rounded-[16px] border border-slate-200/60 bg-white/80 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                      <ListTree size={12} aria-hidden />
                      Групи запчастин
                    </h3>
                    <Link
                      href="/groups"
                      className="inline-flex items-center gap-1 text-[12px] font-bold text-sky-600 transition hover:text-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                    >
                      Усі групи
                      <ArrowUpRight size={12} aria-hidden />
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {topGroups.map((group) => (
                      <a
                        key={`group-${group.slug}`}
                        href={group.href}
                        aria-label={`Категорія запчастин: ${group.label}`}
                        className="inline-flex min-h-7 items-center rounded-[10px] border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-[border-color,background-color,color] duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                      >
                        {group.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {topProducers.length > 0 && (
                <div className="rounded-[16px] border border-slate-200/60 bg-white/80 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                      <Tags size={12} aria-hidden />
                      Виробники
                    </h3>
                    <Link
                      href="/manufacturers"
                      className="inline-flex items-center gap-1 text-[12px] font-bold text-sky-600 transition hover:text-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                    >
                      Усі виробники
                      <ArrowUpRight size={12} aria-hidden />
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {topProducers.map((producer) => (
                      <a
                        key={`producer-${producer.slug}`}
                        href={buildManufacturerPath(producer.slug)}
                        aria-label={`Виробник автозапчастин: ${producer.label}`}
                        className="inline-flex min-h-7 items-center rounded-[10px] border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-[border-color,background-color,color] duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                      >
                        {producer.label}
                      </a>
                    ))}
                  </div>
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
      url: "/og-image.png",
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
  const [rawInitialPagePayload, rawSeoFacets, productTreeDataset] = await Promise.all([
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
  const initialPagePayload = rawInitialPagePayload
    ? {
      ...rawInitialPagePayload,
        images: await resolvePersistentCatalogImageMap(
          rawInitialPagePayload.items
        ),
      }
    : null;
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
  const seoFallbackGroups = seoFacets.groups.slice(0, 30).map((g) => ({
    label: g.label,
    slug: g.slug,
    href: buildGroupPath(g.slug || g.label),
  }));
  const catalogNavigationGroups =
    topGroups.length > 0 ? topGroups : seoFallbackGroups;
  const topProducers = seoFacets.producers
    .slice(0, 42)
    .map((p) => ({ label: p.label, slug: p.slug }));
  // Reuses the seoFacets already fetched above (no extra 1C round-trip) so
  // the producer picker in the filter sidebar renders with real logos/counts
  // on first paint — no static-seed-then-live-swap flicker, no client fetch.
  const manufacturersDirectoryData = await buildManufacturersDirectoryData(seoFacets).catch(
    () => null
  );
  const initialProducerBrands = (manufacturersDirectoryData?.clientProducers ?? []).map(
    (producer) => ({
      name: producer.label,
      logo: producer.logoPath,
      productCount: producer.productCount,
    })
  );

  return (
    <>
      <h1 className="sr-only">{state.title}</h1>
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
