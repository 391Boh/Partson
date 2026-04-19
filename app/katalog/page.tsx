import type { Metadata } from "next";

import KatalogPageShell from "app/katalog/KatalogPageShell";
import { buildCatalogQuerySignature } from "app/lib/catalog-query-signature";
import {
  buildCatalogCategoryPath,
  buildCatalogProducerPath,
  buildGroupPath,
  buildManufacturerPath,
} from "app/lib/catalog-links";
import { fetchCatalogProductsByQuery } from "app/lib/catalog-server";
import { buildPageMetadata } from "app/lib/seo-metadata";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { getSiteUrl } from "app/lib/site-url";

const INITIAL_CATALOG_PAGE_LIMIT = 12;
const INITIAL_CATALOG_SSR_TIMEOUT_MS = 650;
const INITIAL_CATALOG_SSR_TIMEOUT_MS_FILTERED = 180;

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
  const initialPagePayload: InitialCatalogPagePayload | null = await resolveWithTimeout(
    () =>
      fetchCatalogProductsByQuery({
        page: 1,
        limit: INITIAL_CATALOG_PAGE_LIMIT,
        selectedCars: [],
        selectedCategories: [],
        searchQuery: state.searchQuery,
        searchFilter:
          state.searchFilter === "article" ||
          state.searchFilter === "name" ||
          state.searchFilter === "code" ||
          state.searchFilter === "producer"
            ? state.searchFilter
            : "all",
        group: state.group || null,
        subcategory: state.subcategory || null,
        producer: state.producer || null,
        sortOrder: "none",
        timeoutMs: Math.max(220, initialCatalogTimeoutMs - 70),
        retries: 0,
        retryDelayMs: 120,
        cacheTtlMs: 1000 * 20,
      }).then((result) => ({
        items: result.items,
        prices: buildInlinePrices(result.items),
        images: {},
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
        cursorField: result.cursorField || "",
      })),
    null,
    initialCatalogTimeoutMs
  );
  const collectionJsonLd = buildCatalogCollectionJsonLd(siteUrl, state);
  const breadcrumbJsonLd = buildCatalogBreadcrumbJsonLd(siteUrl, state);

  return (
    <>
      <h1 className="sr-only">{state.title}</h1>
      <KatalogPageShell
        initialPagePayload={initialPagePayload}
        initialQuerySignature={initialQuerySignature}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </>
  );
}
