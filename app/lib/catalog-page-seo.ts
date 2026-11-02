import {
  buildAutoBrandPath, buildCatalogCategoryPath, buildCatalogProducerPath,
  buildGroupPath, buildManufacturerPathFromLabel,
} from "app/lib/catalog-links";
import type { CatalogSeoFacets } from "app/lib/catalog-seo";
import { appendSeoContact, trimSeoDescription } from "app/lib/seo-metadata";
import { buildSeoSlug } from "app/lib/seo-slug";

export type CatalogSeoState = {
  tab: string;
  group: string;
  subcategory: string;
  producer: string;
  brand: string;
  searchQuery: string;
  searchFilter: string;
  resetFlag: string;
  expandHierarchy: boolean;
  promoOnly: boolean;
  // Identity of this listing, separate from its preferred clean landing.
  pagePath: string;
  canonicalPath: string;
  title: string;
  description: string;
  indexable: boolean;
  // False only when the SEO facets were loaded and the producer has no
  // /manufacturers page (no catalog products) — e.g. ?producer=QH. The
  // canonical and breadcrumb must not point at a URL that 404s.
  producerHasPage: boolean;
};

const pickFirstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] || "" : value || "";

export const normalizeValue = (value: string | string[] | undefined) =>
  pickFirstValue(value).replace(/\s+/g, " ").trim();

const buildGroupLandingPath = (group: string) => {
  const path = buildGroupPath(group);
  return path !== "/groups" ? path : buildCatalogCategoryPath(group);
};

const buildManufacturerLandingPath = (producer: string, hasPage = true) => {
  if (!hasPage) return buildCatalogProducerPath(producer);
  const path = buildManufacturerPathFromLabel(producer);
  return path !== "/manufacturers" ? path : buildCatalogProducerPath(producer);
};

const normalizeFacetPair = (group: string, subcategory: string) => {
  if (!group || !subcategory) return { group, subcategory };
  return group.toLowerCase() === subcategory.toLowerCase()
    ? { group, subcategory: "" }
    : { group, subcategory };
};

// Attribution does not change the products. Do not combine a clean canonical
// with noindex just because an ad or Merchant Center added a click ID.
const ATTRIBUTION_KEY = /^(?:utm_(?:source|medium|campaign|term|content|id|source_platform|creative_format|marketing_tactic)|gclid|gbraid|wbraid|fbclid|msclkid|dclid|srsltid)$/i;

export const resolveCatalogSeoState = (
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
  const promoOnly = normalizeValue(searchParams.promo) === "1";
  const { group, subcategory } = normalizeFacetPair(
    normalizedGroup,
    normalizedSubcategory
  );

  const usedKeys = Object.entries(searchParams)
    .filter(([, value]) => normalizeValue(value).length > 0)
    .map(([key]) => key)
    .filter((key) => !ATTRIBUTION_KEY.test(key));
  const pageQuery = new URLSearchParams();
  for (const key of [...usedKeys].sort()) {
    pageQuery.set(key, pickFirstValue(searchParams[key]).trim());
  }
  const pagePath = pageQuery.size ? `/katalog?${pageQuery}` : "/katalog";

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
    title = `${producer}: ${group} — каталог автозапчастин`;
    description = appendSeoContact(
      `${producer} у групі ${group}: автозапчастини за артикулом, категорією, ціною й наявністю в PartsON, консультація та доставка по Україні.`
    );
  } else if (producer) {
    canonicalPath = buildManufacturerLandingPath(producer);
    title = `${producer} — виробник автозапчастин`;
    description = appendSeoContact(
      `Автозапчастини ${producer} у PartsON: сторінка виробника, пошук за артикулом, категорією і наявністю, підбір сумісних деталей та доставка по Україні.`
    );
  } else if (group && subcategory) {
    canonicalPath = buildCatalogCategoryPath(group, subcategory, {
      expandHierarchy,
    });
    title = `${subcategory} — ${group} | Каталог автозапчастин`;
    description = appendSeoContact(
      `${subcategory} у групі ${group}: каталог автозапчастин PartsON з виробниками, цінами, наявністю, підбором за артикулом і доставкою по Україні.`
    );
  } else if (group) {
    canonicalPath = buildGroupLandingPath(group);
    title = `${group} — група автозапчастин`;
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
    title = `${brand} — підбір автозапчастин по авто`;
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

  if (promoOnly) {
    title = producer
      ? `Акційні автозапчастини ${producer}`
      : group
        ? `${subcategory || group}: акційні запчастини`
        : "Акційні автозапчастини — ціни та знижки";
    description = appendSeoContact(
      `Акційні автозапчастини${producer ? ` ${producer}` : ""}${group ? ` у категорії «${subcategory || group}»` : ""} у PartsON: ціни зі знижкою, пошук за артикулом, підбір за VIN і доставка по Україні.`
    );
  }

  if (searchQuery) {
    title = `Пошук у каталозі: ${searchQuery}`;
    description = appendSeoContact(
      `Пошук "${searchQuery}" у каталозі PartsON: перевірте автозапчастини за артикулом, назвою, виробником або кодом товару.`
    );
  }

  // Only the unfiltered catalog (including attribution-only URLs) is indexable.
  // Every other query-string variant is either
  // a duplicate of a clean landing page (?group= → /groups/…, ?producer= →
  // /manufacturers/…, ?tab=auto&brand= → /auto/…, which canonicalPath above
  // already points at) or a producer×group×subcategory combination — an
  // open-ended space (and any arbitrary value like ?group=x still rendered
  // 200) that previously got "index" + a self-referencing query canonical,
  // inviting thousands of near-empty duplicates into the index. These stay
  // crawlable (noindex,follow — not blocked in robots.txt) so Google can
  // see the noindex and still follow the product links on them.
  const indexable = usedKeys.length === 0;

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
    promoOnly,
    pagePath,
    canonicalPath,
    title,
    description,
    indexable,
    producerHasPage: true,
  };
};

export const applyProducerPageAvailability = (
  state: CatalogSeoState,
  facets: CatalogSeoFacets
): CatalogSeoState => {
  // Empty facets mean 1C and the snapshot were both unavailable — keep the
  // manufacturer canonical rather than guess a page is missing.
  if (!state.producer || facets.producers.length === 0) return state;
  const producerSlug = buildSeoSlug(state.producer);
  if (facets.producers.some((producer) => producer.slug === producerSlug)) return state;

  const isProducerLanding = !state.group && !state.subcategory && !state.searchQuery;
  return {
    ...state,
    producerHasPage: false,
    canonicalPath: isProducerLanding
      ? buildCatalogProducerPath(state.producer)
      : state.canonicalPath,
  };
};

export const buildCatalogBreadcrumbJsonLd = (siteUrl: string, state: CatalogSeoState) => {
  const { group, producer, subcategory, tab } = state;
  const currentUrl = `${siteUrl}${state.pagePath}`;
  const itemListElement: Array<{ "@type": "ListItem"; position: number; name: string; item: string }> = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Головна",
      item: siteUrl,
    },
  ];

  if (state.searchQuery || state.promoOnly) {
    itemListElement.push(
      { "@type": "ListItem", position: 2, name: "Каталог", item: `${siteUrl}/katalog` },
      { "@type": "ListItem", position: 3,
        name: state.searchQuery ? `Пошук: ${state.searchQuery}` : "Акційні запчастини", item: currentUrl }
    );
  } else if (producer && group && subcategory) {
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
        item: `${siteUrl}${buildManufacturerLandingPath(producer, state.producerHasPage)}`,
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
        item: `${siteUrl}${buildManufacturerLandingPath(producer, state.producerHasPage)}`,
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
  } else if (tab === "auto") {
    itemListElement.push({ "@type": "ListItem", position: 2, name: "Авто", item: `${siteUrl}/auto` });
    if (state.brand) itemListElement.push({ "@type": "ListItem", position: 3, name: state.brand, item: currentUrl });
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

export const buildCatalogCollectionJsonLd = (siteUrl: string, state: CatalogSeoState, hasProducts = false) => {
  const { title, description, group, producer, subcategory } = state;
  const currentUrl = `${siteUrl}${state.pagePath}`;

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${currentUrl}#collection-page`,
    url: currentUrl,
    name: title,
    description: trimSeoDescription(description),
    inLanguage: "uk-UA",
    breadcrumb: { "@id": `${currentUrl}#breadcrumb` },
    ...(hasProducts ? { mainEntity: { "@id": `${currentUrl}#catalog-products` } } : {}),
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

