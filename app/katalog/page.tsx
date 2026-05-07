import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
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
import { fetchCatalogProductsByQuery } from "app/lib/catalog-server";
import { buildProductPath } from "app/lib/product-url";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { buildSeoSlug } from "app/lib/seo-slug";
import { getSiteUrl } from "app/lib/site-url";

export const revalidate = 300;

const INITIAL_CATALOG_PAGE_LIMIT = 12;
const INITIAL_CATALOG_SSR_TIMEOUT_MS = 1200;
const INITIAL_CATALOG_SSR_TIMEOUT_MS_FILTERED = 1600;
const CATALOG_SEO_FACETS_TIMEOUT_MS = 450;

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
    if (price === undefined) continue;

    const resolvedPrice =
      typeof price === "number" && Number.isFinite(price) && price > 0
        ? price
        : null;

    const code = typeof item.code === "string" ? item.code.trim() : "";
    const article = typeof item.article === "string" ? item.article.trim() : "";

    if (code && prices[code] === undefined) prices[code] = resolvedPrice;
    if (article && prices[article] === undefined) prices[article] = resolvedPrice;
  }

  return prices;
};

type CatalogSeoSnapshotQuery = {
  searchQuery: string;
  searchFilter: string;
  group: string | null;
  subcategory: string | null;
  producer: string | null;
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
  };
};

const buildCatalogSeoSnapshotCacheKey = (query: CatalogSeoSnapshotQuery) =>
  JSON.stringify({
    searchQuery: query.searchQuery,
    searchFilter: query.searchFilter,
    group: query.group || "",
    subcategory: query.subcategory || "",
    producer: query.producer || "",
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
    sortOrder: "none",
    timeoutMs: INITIAL_CATALOG_SSR_TIMEOUT_MS_FILTERED,
    retries: 1,
    retryDelayMs: 140,
    cacheTtlMs: 1000 * 60 * 15,
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
  ["catalog-seo-snapshot-v1"],
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
  searchQuery: string;
  searchFilter: string;
  resetFlag: string;
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
  "search",
  "filter",
  "reset",
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
  const searchQuery = normalizeValue(searchParams.search);
  const searchFilter = normalizeValue(searchParams.filter);
  const resetFlag = normalizeValue(searchParams.reset);
  const { group, subcategory } = normalizeFacetPair(
    normalizedGroup,
    normalizedSubcategory
  );

  const usedKeys = Object.entries(searchParams)
    .filter(([, value]) => normalizeValue(value).length > 0)
    .map(([key]) => key);

  const hasUnsupportedParams = usedKeys.some((key) => !ALLOWED_SEO_KEYS.has(key));
  const hasEphemeralParams = Boolean(searchQuery || searchFilter || resetFlag);
  const hasSupportedTab = !tab || tab === "category" || tab === "producer";

  let canonicalPath = "/katalog";
  let title = "Каталог автозапчастин";
  let description =
    "Каталог автозапчастин PartsON у Львові з пошуком за кодом, артикулом, виробником, актуальною наявністю та доставкою по Україні.";

  if (producer && group && subcategory) {
    canonicalPath = buildCatalogProducerPath(producer, group, subcategory);
    title = `${producer}: ${subcategory} - ${group} | Каталог автозапчастин`;
    description =
      `Підбір автозапчастин ${producer} у категорії ${subcategory} групи ${group} в каталозі PartsON у Львові з актуальною наявністю та доставкою по Україні.`;
  } else if (producer && group) {
    canonicalPath = buildCatalogProducerPath(producer, group);
    title = `${producer}: ${group} - каталог автозапчастин`;
    description =
      `Підбір автозапчастин ${producer} у групі ${group} в каталозі PartsON у Львові з актуальною наявністю та доставкою по Україні.`;
  } else if (producer) {
    canonicalPath = buildManufacturerLandingPath(producer);
    title = `${producer} - виробник автозапчастин`;
    description =
      `Каталог автозапчастин виробника ${producer} у PartsON у Львові. Перейдіть до бренду, відкрийте товари з фільтром за виробником і замовляйте з доставкою по Україні.`;
  } else if (group && subcategory) {
    canonicalPath = buildCatalogCategoryPath(group, subcategory);
    title = `${subcategory} - ${group} | Каталог автозапчастин`;
    description =
      `Підбір автозапчастин у підгрупі ${subcategory} групи ${group} в каталозі PartsON у Львові. Доставка по Україні.`;
  } else if (group) {
    canonicalPath = buildGroupLandingPath(group);
    title = `${group} - група автозапчастин`;
    description =
      `Група автозапчастин ${group} у каталозі PartsON у Львові. Доступні підгрупи, швидкий перехід до релевантних товарів і доставка по Україні.`;
  } else if (tab === "category") {
    canonicalPath = "/groups";
    title = "Категорії автозапчастин";
    description =
      "Категорії, групи та підгрупи автозапчастин PartsON у Львові для швидкого переходу до потрібних товарів із доставкою по Україні.";
  } else if (tab === "producer") {
    canonicalPath = "/manufacturers";
    title = "Виробники автозапчастин";
    description =
      "Каталог виробників і брендів автозапчастин PartsON у Львові з переходом до сторінок брендів і фільтрованого каталогу.";
  }

  if (searchQuery) {
    title = `Пошук у каталозі: ${searchQuery}`;
    description =
      `Результати пошуку за запитом "${searchQuery}" у каталозі автозапчастин PartsON. Для індексації використовується канонічна сторінка каталогу без внутрішнього пошуку.`;
  }

  const isRootCatalogPage = !tab && !group && !subcategory && !producer;
  const isDeepFacetPage = Boolean(
    (group && subcategory && !producer) || (producer && group && !subcategory)
  );
  const indexable =
    !hasUnsupportedParams &&
    !hasEphemeralParams &&
    hasSupportedTab &&
    (isRootCatalogPage || isDeepFacetPage);

  return {
    tab,
    group,
    subcategory,
    producer,
    searchQuery,
    searchFilter,
    resetFlag,
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

  if (!state.group && !state.subcategory && !state.producer && !state.tab) {
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

      return {
        "@type": "ListItem",
        position: index + 1,
        url,
        item: {
          "@type": "Product",
          name: item.name,
          sku: item.code,
          mpn: item.article || item.code,
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
  topGroups?: CatalogSeoDiscoveryItem[];
  topProducers?: CatalogSeoDiscoveryItem[];
}) => {
  const visibleItems = items.filter((item) => item.code && item.name);
  const visibleItemsCount = visibleItems.length;
  const foundProductsLabel =
    typeof totalCount === "number" && totalCount > 0
      ? `знайдено ${totalCount.toLocaleString("uk-UA")} товарів`
      : visibleItemsCount > 0
      ? hasMore
        ? `показано перші ${visibleItemsCount.toLocaleString("uk-UA")} товарів, є ще результати`
        : `показано ${visibleItemsCount.toLocaleString("uk-UA")} товарів`
      : "товари не знайдено в первинній вибірці";
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

  const showDiscovery = topGroups.length > 0 || topProducers.length > 0;

  return (
    <section
      aria-labelledby="catalog-seo-products-title"
      className="mx-auto mt-6 w-full max-w-7xl px-3 pb-8 sm:px-4 lg:px-6"
    >
      <div className="rounded-2xl border border-slate-200 bg-white/92 p-4 text-sm leading-6 text-slate-600 shadow-sm sm:p-5">
        <h2
          id="catalog-seo-products-title"
          className="text-lg font-semibold tracking-[-0.03em] text-slate-900 sm:text-xl"
        >
          Каталог автозапчастин PartsON
        </h2>
        <p className="mt-2">
          {state.description} За поточним запитом {foundProductsLabel}. Обрані фільтри:
          {" "}
          <span className="font-semibold text-slate-800">{selectedFiltersLabel}</span>.
        </p>
        <p className="mt-2">
          Для точного підбору використовуйте пошук за артикулом, кодом, назвою або
          виробником, а також фільтри групи й категорії. Якщо потрібна перевірка
          сумісності, менеджер PartsON допоможе підібрати деталь за VIN.
        </p>
        {visibleItems.length > 0 && (
          <ul className="mt-3 grid grid-cols-1 gap-y-1 sm:grid-cols-2">
            {visibleItems.slice(0, 12).map((item) => (
              <li key={item.code}>
                <a
                  href={buildSeoProductPath(item)}
                  className="text-sky-700 hover:underline"
                >
                  {item.name}
                  {item.producer ? ` — ${item.producer}` : ""}
                </a>
              </li>
            ))}
          </ul>
        )}
        {showDiscovery && (
          <nav
            aria-label="Розділи каталогу"
            className="mt-4 border-t border-slate-100 pt-4"
          >
            {topGroups.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Групи запчастин
                </p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {topGroups.map((group) => (
                    <li key={group.slug}>
                      <a
                        href={buildGroupPath(group.slug)}
                        className="text-sky-700 hover:underline"
                      >
                        {group.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {topProducers.length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Виробники
                </p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {topProducers.map((producer) => (
                    <li key={producer.slug}>
                      <a
                        href={buildManufacturerPath(producer.slug)}
                        className="text-sky-700 hover:underline"
                      >
                        {producer.label}
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
  });
  const [initialPagePayload, seoFacets] = await Promise.all([
    resolveWithTimeout(
      () => getCatalogSeoSnapshotPayloadCached(snapshotCacheKey),
      null,
      initialCatalogTimeoutMs
    ),
    getCatalogSeoFacetsWithTimeout(CATALOG_SEO_FACETS_TIMEOUT_MS).catch(
      () => EMPTY_CATALOG_SEO_FACETS
    ),
  ]);
  const seoTotalCount = resolveCatalogSeoTotalCount(state, seoFacets);
  const collectionJsonLd = buildCatalogCollectionJsonLd(siteUrl, state);
  const breadcrumbJsonLd = buildCatalogBreadcrumbJsonLd(siteUrl, state);
  const catalogItemListJsonLd = buildCatalogItemListJsonLd(
    siteUrl,
    state,
    initialPagePayload?.items ?? []
  );
  const topGroups = seoFacets.groups
    .slice(0, 24)
    .map((g) => ({ label: g.label, slug: g.slug }));
  const topProducers = seoFacets.producers
    .slice(0, 24)
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
