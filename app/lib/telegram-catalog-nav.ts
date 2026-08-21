import "server-only";

import { getProductTreeDataset } from "app/lib/product-tree";
import { getCategoryIconPath } from "app/lib/category-icons";
import { getGroupSeoCopy, getGroupItemSeoCopy } from "app/lib/seo-copy";
import { carBrands, type CarBrand } from "app/components/carBrands";
import { resolveCarBrandSocialImage } from "app/lib/car-brand-social-image";
import {
  findCarBrandBySlug,
  getModelGroupBreakdown,
  getModelsForBrand,
} from "app/lib/auto-directory-data";
import { getFullManufacturersDirectoryData } from "app/lib/manufacturers-directory-data";
import {
  buildAutoBrandPath,
  buildAutoModelPath,
  buildGroupItemPath,
  buildGroupPath,
  buildManufacturerPath,
} from "app/lib/catalog-links";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { escapeTelegramHtml } from "app/lib/telegram-order-message";

// Every level here mirrors a real site page/section — see the plan doc for
// the exact data source each pulls from. callback_data stays well under
// Telegram's 64-byte cap by addressing subgroups/children/models by small
// numeric index within their parent (re-resolved server-side from the
// group/brand slug) instead of repeating full slug chains.
export type NavButton = { text: string; callback_data: string } | { text: string; url: string };
export type NavMenu = { caption: string; imageUrl: string | null; keyboard: NavButton[][] };

const PAGE_SIZE = 8;
const RASTER_IMAGE_PATTERN = /\.(png|jpe?g|webp|gif)(\?.*)?$/i;

// Telegram's sendPhoto fetches the URL itself and can't render SVG — most
// car/producer logos in this codebase are SVG (see car-brand-social-image.ts,
// which already solves this for OG images). Reuse that resolver for brands;
// for producer logos (no existing raster resolver) just skip the photo
// rather than send a broken image.
export const isRasterImagePath = (path: string | null | undefined) =>
  Boolean(path && RASTER_IMAGE_PATTERN.test(path));

const paginate = <T,>(items: T[], page: number, pageSize = PAGE_SIZE) => {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(Math.max(0, page), totalPages - 1);
  const start = clampedPage * pageSize;
  return { pageItems: items.slice(start, start + pageSize), page: clampedPage, totalPages };
};

const buildPagerRow = (prefix: string, page: number, totalPages: number): NavButton[] => {
  if (totalPages <= 1) return [];
  const row: NavButton[] = [];
  if (page > 0) row.push({ text: "⬅️", callback_data: `${prefix}:${page - 1}` });
  row.push({ text: `${page + 1}/${totalPages}`, callback_data: "noop" });
  if (page < totalPages - 1) row.push({ text: "➡️", callback_data: `${prefix}:${page + 1}` });
  return row;
};

const backRow = (callbackData: string, label = "⬅️ Назад"): NavButton[] => [
  { text: label, callback_data: callbackData },
];

const siteLinkButton = (siteUrl: string, path: string, label = "🔗 Переглянути на сайті"): NavButton => ({
  text: label,
  url: `${siteUrl}${path}`,
});

export const buildTopMenu = (): NavMenu => ({
  caption: [
    "<b>🗂 Каталог PartsON</b>",
    "Автозапчастини за категорією, маркою авто або виробником.",
    "",
    "Оберіть розділ:",
  ].join("\n"),
  imageUrl: null,
  keyboard: [
    [{ text: "📂 Групи товарів", callback_data: "g" }],
    [
      { text: "🚗 Марки авто", callback_data: "a:0" },
      { text: "🏭 Виробники", callback_data: "p:0" },
    ],
    [
      { text: "💬 Написати менеджеру", callback_data: "support:start" },
      { text: "📍 Контакти", callback_data: "contacts" },
    ],
  ],
});

// Two columns keep a ~14-item list on one screen instead of a long single
// column the user has to scroll through — same grid style already used for
// the brand and producer lists below.
const chunkIntoPairs = <T,>(items: T[]): T[][] =>
  items.reduce<T[][]>((rows, item, i) => {
    if (i % 2 === 0) rows.push([item]);
    else rows[rows.length - 1].push(item);
    return rows;
  }, []);

export const buildGroupsListMenu = async (): Promise<NavMenu> => {
  const dataset = await getProductTreeDataset();
  const rows: NavButton[][] = chunkIntoPairs(dataset.groups).map((pair) =>
    pair.map((group) => ({ text: group.label, callback_data: `g:${group.slug}` }))
  );
  rows.push(backRow("m"));

  return {
    caption: `<b>📂 Групи товарів</b> (${dataset.groups.length})\n\nОберіть категорію:`,
    imageUrl: null,
    keyboard: rows,
  };
};

export const buildGroupMenu = async (siteUrl: string, groupSlug: string): Promise<NavMenu | null> => {
  const dataset = await getProductTreeDataset();
  const group = dataset.groups.find((entry) => entry.slug === groupSlug);
  if (!group) return null;

  const copy = getGroupSeoCopy(group.label, 0);
  const imageUrl = `${siteUrl}${getCategoryIconPath(group.label)}`;
  const caption = `<b>📂 ${escapeTelegramHtml(group.label)}</b>\n\n${escapeTelegramHtml(copy.intro)}`;

  if (group.subgroups.length === 0) {
    return {
      caption,
      imageUrl,
      keyboard: [[siteLinkButton(siteUrl, buildGroupPath(group.slug))], backRow("g")],
    };
  }

  const rows: NavButton[][] = group.subgroups.map((sub, idx) => [
    { text: sub.label, callback_data: `gs:${group.slug}:${idx}` },
  ]);
  rows.push([siteLinkButton(siteUrl, buildGroupPath(group.slug), "🔗 Уся група на сайті")]);
  rows.push(backRow("g"));

  return { caption, imageUrl, keyboard: rows };
};

export const buildSubgroupMenu = async (
  siteUrl: string,
  groupSlug: string,
  subIndex: number
): Promise<NavMenu | null> => {
  const dataset = await getProductTreeDataset();
  const group = dataset.groups.find((entry) => entry.slug === groupSlug);
  const sub = group?.subgroups[subIndex];
  if (!group || !sub) return null;

  const imageUrl = `${siteUrl}${getCategoryIconPath(sub.label)}`;
  const backCallback = `g:${group.slug}`;
  const header = `<b>${escapeTelegramHtml(sub.label)}</b>\n<i>${escapeTelegramHtml(group.label)}</i>`;

  if (sub.children.length === 0) {
    const copy = getGroupItemSeoCopy({
      label: sub.label,
      groupLabel: group.label,
      productCount: 0,
      producersCount: 0,
      childrenCount: 0,
    });
    return {
      caption: `${header}\n\n${escapeTelegramHtml(copy.intro)}`,
      imageUrl,
      keyboard: [
        [{ text: "📦 Показати товари", callback_data: `gp:${group.slug}:${subIndex}` }],
        [siteLinkButton(siteUrl, buildGroupItemPath(group.slug, sub.slug))],
        backRow(backCallback),
      ],
    };
  }

  const rows: NavButton[][] = sub.children.map((child, idx) => [
    { text: child.label, callback_data: `gc:${group.slug}:${subIndex}:${idx}` },
  ]);
  rows.push([siteLinkButton(siteUrl, buildGroupItemPath(group.slug, sub.slug), "🔗 Уся підгрупа на сайті")]);
  rows.push(backRow(backCallback));

  return {
    caption: `${header}\n\nОберіть категорію (${sub.children.length}):`,
    imageUrl,
    keyboard: rows,
  };
};

export const buildChildMenu = async (
  siteUrl: string,
  groupSlug: string,
  subIndex: number,
  childIndex: number
): Promise<NavMenu | null> => {
  const dataset = await getProductTreeDataset();
  const group = dataset.groups.find((entry) => entry.slug === groupSlug);
  const sub = group?.subgroups[subIndex];
  const child = sub?.children[childIndex];
  if (!group || !sub || !child) return null;

  const copy = getGroupItemSeoCopy({
    label: child.label,
    groupLabel: group.label,
    parentSubgroupLabel: sub.label,
    productCount: 0,
    producersCount: 0,
    childrenCount: 0,
  });

  return {
    caption: [
      `<b>${escapeTelegramHtml(child.label)}</b>`,
      `<i>${escapeTelegramHtml(group.label)} → ${escapeTelegramHtml(sub.label)}</i>`,
      "",
      escapeTelegramHtml(copy.intro),
    ].join("\n"),
    imageUrl: `${siteUrl}${getCategoryIconPath(child.label)}`,
    keyboard: [
      [
        {
          text: "📦 Показати товари",
          callback_data: `gp:${group.slug}:${subIndex}:${childIndex}`,
        },
      ],
      [siteLinkButton(siteUrl, buildGroupItemPath(group.slug, child.slug))],
      backRow(`gs:${group.slug}:${subIndex}`),
    ],
  };
};

// Resolves a "gp:<groupSlug>:<subIndex>[:<childIndex>]" leaf back to the
// exact (group, subcategory) pair fetchCatalogProductsByQuery expects —
// mirrors the site's own resolution in groups/[slug]/[itemSlug]/page.tsx:
// `catalogGroupLabel = item.parentSubgroupLabel || item.groupLabel`,
// `subcategory = item.label`. Kept here since it needs the same
// getProductTreeDataset() lookup the menu builders above already do.
export const resolveGroupProductFilter = async (
  groupSlug: string,
  subIndex: number,
  childIndex?: number
): Promise<{ group: string; subcategory: string } | null> => {
  const dataset = await getProductTreeDataset();
  const group = dataset.groups.find((entry) => entry.slug === groupSlug);
  const sub = group?.subgroups[subIndex];
  if (!group || !sub) return null;

  if (typeof childIndex === "number" && Number.isFinite(childIndex)) {
    const child = sub.children[childIndex];
    if (!child) return null;
    return { group: sub.label, subcategory: child.label };
  }

  return { group: group.label, subcategory: sub.label };
};

export const buildBrandListMenu = (page: number): NavMenu => {
  const { pageItems, page: clampedPage, totalPages } = paginate(carBrands, page);
  const rows: NavButton[][] = chunkIntoPairs(pageItems).map((pair) =>
    pair.map((brand) => ({
      text: brand.name,
      callback_data: `ab:${buildPlainSeoSlug(brand.name)}:0`,
    }))
  );
  const pagerRow = buildPagerRow("a", clampedPage, totalPages);
  if (pagerRow.length) rows.push(pagerRow);
  rows.push(backRow("m"));

  return {
    caption: `<b>🚗 Марки авто</b> (${carBrands.length})\n\nОберіть марку:`,
    imageUrl: null,
    keyboard: rows,
  };
};

const resolveBrandModels = async (brandSlug: string) => {
  const brand = findCarBrandBySlug(brandSlug);
  if (!brand) return null;
  const data = await getModelsForBrand(brand.name);
  return { brand, models: data?.models ?? [] };
};

export const buildBrandModelsMenu = async (
  siteUrl: string,
  brandSlug: string,
  page: number
): Promise<NavMenu | null> => {
  const resolved = await resolveBrandModels(brandSlug);
  if (!resolved) return null;
  const { brand, models } = resolved;

  const social = await resolveCarBrandSocialImage(brand as CarBrand).catch(() => null);
  const { pageItems, page: clampedPage, totalPages } = paginate(models, page);
  const startIndex = clampedPage * PAGE_SIZE;

  const rows: NavButton[][] = pageItems.map((model, i) => [
    { text: model.name, callback_data: `am:${brandSlug}:${startIndex + i}` },
  ]);
  const pagerRow = buildPagerRow(`ab:${brandSlug}`, clampedPage, totalPages);
  if (pagerRow.length) rows.push(pagerRow);
  rows.push([siteLinkButton(siteUrl, buildAutoBrandPath(brand.name), "🔗 Усі моделі на сайті")]);
  rows.push(backRow("a:0"));

  const caption =
    models.length > 0
      ? `<b>🚗 ${escapeTelegramHtml(brand.name)}</b>\n\nОберіть модель (${models.length}):`
      : `<b>🚗 ${escapeTelegramHtml(brand.name)}</b>\n\nМоделі тимчасово недоступні — спробуйте на сайті.`;

  return { caption, imageUrl: social?.url ?? null, keyboard: rows };
};

export const buildModelMenu = async (
  siteUrl: string,
  brandSlug: string,
  modelIndex: number
): Promise<NavMenu | null> => {
  const resolved = await resolveBrandModels(brandSlug);
  const model = resolved?.models[modelIndex];
  if (!resolved || !model) return null;
  const { brand } = resolved;

  const [breakdown, social] = await Promise.all([
    getModelGroupBreakdown(brand.name, model.name),
    resolveCarBrandSocialImage(brand as CarBrand).catch(() => null),
  ]);

  const groupsList = breakdown.groups
    .slice(0, 8)
    .map((group) => `• ${escapeTelegramHtml(group.label)}`)
    .join("\n");

  const caption = [
    `<b>🚗 ${escapeTelegramHtml(brand.name)} ${escapeTelegramHtml(model.name)}</b>`,
    breakdown.totalProducts > 0
      ? `📦 Знайдено товарів: <b>${breakdown.totalProducts}</b>`
      : "Товари для цієї моделі підбираються індивідуально — перевірте на сайті.",
    groupsList ? `\n<b>Групи запчастин:</b>\n${groupsList}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    caption,
    imageUrl: social?.url ?? null,
    keyboard: [
      ...(breakdown.totalProducts > 0
        ? [[{ text: "📦 Показати товари", callback_data: `mp:${brandSlug}:${modelIndex}` }]]
        : []),
      [siteLinkButton(siteUrl, buildAutoModelPath(brand.name, model.name))],
      backRow(`ab:${brandSlug}:0`),
    ],
  };
};

// Reuses getModelGroupBreakdown's own effectiveQuery (the tiered-fallback
// search string it already validated against real results) so the product
// fetch below is guaranteed to match what the model card counted.
export const resolveModelProductQuery = async (
  brandSlug: string,
  modelIndex: number
): Promise<{ searchQuery: string } | null> => {
  const resolved = await resolveBrandModels(brandSlug);
  const model = resolved?.models[modelIndex];
  if (!resolved || !model) return null;

  const breakdown = await getModelGroupBreakdown(resolved.brand.name, model.name);
  if (!breakdown.effectiveQuery) return null;
  return { searchQuery: breakdown.effectiveQuery };
};

export const buildProducersListMenu = async (page: number): Promise<NavMenu> => {
  const { clientProducers } = await getFullManufacturersDirectoryData();
  const { pageItems, page: clampedPage, totalPages } = paginate(clientProducers, page);

  const rows: NavButton[][] = chunkIntoPairs(pageItems).map((pair) =>
    pair.map((producer) => ({ text: producer.label, callback_data: `pd:${producer.slug}` }))
  );
  const pagerRow = buildPagerRow("p", clampedPage, totalPages);
  if (pagerRow.length) rows.push(pagerRow);
  rows.push(backRow("m"));

  return {
    caption: `<b>🏭 Виробники</b> (${clientProducers.length})\n\nОберіть виробника:`,
    imageUrl: null,
    keyboard: rows,
  };
};

export const buildProducerMenu = async (
  siteUrl: string,
  producerSlug: string
): Promise<NavMenu | null> => {
  const { clientProducers } = await getFullManufacturersDirectoryData();
  const producer = clientProducers.find((entry) => entry.slug === producerSlug);
  if (!producer) return null;

  const caption = [
    `<b>🏭 ${escapeTelegramHtml(producer.label)}</b>`,
    producer.description ? `<i>${escapeTelegramHtml(producer.description)}</i>` : "",
    producer.productCount > 0 ? `📦 Товарів у каталозі: <b>${producer.productCount}</b>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    caption,
    imageUrl: isRasterImagePath(producer.logoPath) ? `${siteUrl}${producer.logoPath}` : null,
    keyboard: [
      ...(producer.productCount > 0
        ? [[{ text: "📦 Показати товари", callback_data: `pp:${producer.slug}` }]]
        : []),
      [siteLinkButton(siteUrl, buildManufacturerPath(producer.slug))],
      backRow("p:0"),
    ],
  };
};

export const resolveProducerProductFilter = async (
  producerSlug: string
): Promise<{ producer: string } | null> => {
  const { clientProducers } = await getFullManufacturersDirectoryData();
  const producer = clientProducers.find((entry) => entry.slug === producerSlug);
  return producer ? { producer: producer.label } : null;
};
