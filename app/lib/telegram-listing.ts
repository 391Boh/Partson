import "server-only";

import { carBrands } from "app/components/carBrands";
import { getCategoryEmoji } from "app/lib/category-icons";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { normalizeSearchQuery } from "app/lib/catalog-search";
import {
  fetchCatalogProductsByQuery,
  fetchEuroRate,
  listCatalogFromSnapshot,
  toPriceUah,
  type CatalogProduct,
} from "app/lib/catalog-server";
import { getProductTreeDataset } from "app/lib/product-tree";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { resolveBrandModels } from "app/lib/telegram-catalog-nav";
import { escapeTelegramHtml, formatOrderMoney } from "app/lib/telegram-order-message";
import { buildVisibleProductName } from "app/lib/product-url";
import { readVehicleSelection, type VehicleSelection } from "app/lib/vehicle-fitment";

// One message per listing: the filters live in Firestore per chat, so a
// callback only carries a short action and any combination of car, category
// and search text fits Telegram's 64-byte callback_data limit.
export const LISTING_PAGE_SIZE = 6;
const BRAND_PAGE_SIZE = 15;
const MODEL_PAGE_SIZE = 12;

type Button = { text: string; callback_data: string };
export type TelegramView = { text: string; keyboard: Button[][] };

export type BotListing = {
  id: string;
  query: string;
  vehicle: VehicleSelection | null;
  vehicleLabel: string;
  group: string;
  subcategory: string;
  categoryLabel: string;
  expandHierarchy: boolean;
  producer: string;
  inStock: boolean;
  sort: "none" | "asc" | "desc";
  page: number;
};

export type ListingPage = {
  items: CatalogProduct[];
  totalCount: number | null;
  hasMore: boolean;
  euroRate: number | null;
};

export const createListing = (fields: Partial<BotListing> = {}): BotListing => ({
  id: Date.now().toString(36).slice(-6),
  query: "",
  vehicle: null,
  vehicleLabel: "",
  group: "",
  subcategory: "",
  categoryLabel: "",
  expandHierarchy: false,
  producer: "",
  inStock: false,
  sort: "none",
  page: 1,
  ...fields,
});

export const hasListingFilters = (listing: BotListing) =>
  Boolean(listing.query || listing.vehicle || listing.group || listing.subcategory || listing.producer);

const sessionRef = (chatId: string) =>
  getFirebaseAdminDb().collection("telegramBotSessions").doc(chatId);

export const loadListing = async (chatId: string): Promise<BotListing | null> => {
  const snap = await sessionRef(chatId).get();
  const listing = snap.exists ? snap.data()?.listing : null;
  return listing && typeof listing.id === "string" ? (listing as BotListing) : null;
};

export const saveListing = async (chatId: string, listing: BotListing) => {
  await sessionRef(chatId).set({ listing, updatedAt: new Date().toISOString() });
};

// The site's precedence for the active car: avto.selection first, then the
// legacy top-level field. Only a car with both brand and model can filter.
export const readSavedVehicle = (data: Record<string, unknown> | null | undefined) => {
  if (!data) return null;
  const avto = data.avto && typeof data.avto === "object" ? (data.avto as Record<string, unknown>) : null;
  const selection = (avto?.selection ?? data.selectedCarSelection) as Record<string, unknown> | null | undefined;
  const vehicle = readVehicleSelection(selection);
  if (!vehicle) return null;
  const label = typeof selection?.label === "string" && selection.label.trim()
    ? selection.label.trim()
    : `${vehicle.brand} ${vehicle.model}`;
  return { vehicle, label };
};

const fetchListingProducts = async (listing: BotListing) => {
  const searchQuery = normalizeSearchQuery(listing.query);
  const snapshot = await listCatalogFromSnapshot({
    searchQuery,
    searchFilter: "all",
    group: listing.group,
    subcategory: listing.subcategory,
    producer: listing.producer,
    selectedCategories: [],
    expandHierarchy: listing.expandHierarchy,
    vehicle: listing.vehicle,
    sortOrder: listing.sort,
    nameSort: "none",
    pricedOnly: false,
    withPhoto: false,
    inStock: listing.inStock,
    priceFrom: null,
    priceTo: null,
    offset: (listing.page - 1) * LISTING_PAGE_SIZE,
    limit: LISTING_PAGE_SIZE,
  }).catch(() => null);
  // An empty search may be a product created since the last scan, or a query
  // typed in the wrong keyboard layout: only 1C can answer those.
  if (snapshot && !(searchQuery && snapshot.totalCount === 0)) {
    return { items: snapshot.items, totalCount: snapshot.totalCount, hasMore: snapshot.hasMore };
  }

  const result = await fetchCatalogProductsByQuery({
    page: listing.page,
    limit: LISTING_PAGE_SIZE,
    searchQuery: listing.query,
    searchFilter: "all",
    group: listing.group || null,
    subcategory: listing.subcategory || null,
    producer: listing.producer || null,
    vehicle: listing.vehicle,
    expandHierarchy: listing.expandHierarchy,
    onlyInStock: listing.inStock,
    sortOrder: listing.sort,
    forceAllgoodsSource: true,
    includePriceEnrichment: false,
    preferLegacySource: false,
    timeoutMs: 4500,
    retries: 1,
    retryDelayMs: 200,
    cacheTtlMs: 1000 * 60 * 5,
  });
  return { items: result.items, totalCount: result.totalCount ?? null, hasMore: result.hasMore };
};

/** Null means the catalog could not answer, as opposed to an empty result. */
export const fetchListingPage = async (listing: BotListing): Promise<ListingPage | null> => {
  const [products, euroRate] = await Promise.all([
    fetchListingProducts(listing).catch(() => null),
    fetchEuroRate().catch(() => null),
  ]);
  return products ? { ...products, euroRate } : null;
};

const shorten = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;

const chunk = <T,>(items: T[], size: number): T[][] => {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size));
  return rows;
};

const buildFilterSummary = (listing: BotListing) =>
  [
    listing.vehicle ? `🚗 ${escapeTelegramHtml(listing.vehicleLabel)}` : "",
    listing.categoryLabel ? `📂 ${escapeTelegramHtml(listing.categoryLabel)}` : "",
    listing.producer ? `🏭 ${escapeTelegramHtml(listing.producer)}` : "",
    listing.query ? `🔤 «${escapeTelegramHtml(listing.query)}»` : "",
  ].filter(Boolean).join("\n");

const formatListingItem = (product: CatalogProduct, index: number, euroRate: number | null) => {
  const priceUah = euroRate != null ? toPriceUah(product.priceEuro ?? null, euroRate) : null;
  const details = [
    product.producer && product.producer !== "-" ? escapeTelegramHtml(product.producer) : "",
    `<code>${escapeTelegramHtml(product.article || product.code)}</code>`,
  ].filter(Boolean).join(" · ");
  const stock = product.quantity > 0 ? `✅ ${product.quantity} шт.` : "🕓 Під замовлення";
  const price = priceUah != null ? `<b>${formatOrderMoney(priceUah)}</b>` : "ціна за запитом";
  return [
    `<b>${index + 1}. ${escapeTelegramHtml(shorten(buildVisibleProductName(product.name), 70))}</b>`,
    details,
    `${stock} · ${price}`,
  ].join("\n");
};

const SORT_LABELS = { none: "↕️ За ціною", asc: "⬆️ Спочатку дешевші", desc: "⬇️ Спочатку дорожчі" } as const;

const buildFilterRows = (listing: BotListing): Button[][] => {
  const rows: Button[][] = [
    [
      { text: listing.vehicle ? `🚗 ${shorten(listing.vehicleLabel, 20)}` : "🚗 Обрати авто", callback_data: "f:a:0" },
      { text: listing.categoryLabel ? `📂 ${shorten(listing.categoryLabel, 20)}` : "📂 Категорія", callback_data: "f:g" },
    ],
  ];
  if (hasListingFilters(listing)) {
    rows.push([
      { text: listing.inStock ? "✅ Лише в наявності" : "▫️ Лише в наявності", callback_data: `l:${listing.id}:s` },
      { text: SORT_LABELS[listing.sort], callback_data: `l:${listing.id}:r` },
    ]);
    rows.push([{ text: "✖️ Скинути фільтри", callback_data: `l:${listing.id}:x` }]);
  }
  return rows;
};

const NAV_ROW: Button[] = [
  { text: "⌂ Меню", callback_data: "home:menu" },
  { text: "🛒 Кошик", callback_data: "cart" },
];

const countTotalPages = (listing: BotListing, page: ListingPage) =>
  page.totalCount != null
    ? Math.max(1, Math.ceil(page.totalCount / LISTING_PAGE_SIZE))
    : listing.page + (page.hasMore ? 1 : 0);

export const buildListingComposer = (listing: BotListing): TelegramView => ({
  text: [
    "<b>🔎 Підбір запчастин</b>",
    "",
    "Оберіть авто, категорію або обидва фільтри разом.",
    "Можна просто написати назву чи артикул.",
  ].join("\n"),
  keyboard: [...buildFilterRows(listing), NAV_ROW],
});

export const buildListingView = (listing: BotListing, page: ListingPage): TelegramView => {
  const summary = buildFilterSummary(listing);
  if (page.items.length === 0) {
    return {
      text: [
        "😕 <b>Нічого не знайдено</b>",
        summary,
        "",
        listing.inStock
          ? "Спробуйте показати товари під замовлення або змінити фільтри."
          : "Спробуйте іншу назву, артикул або змініть фільтри.",
      ].filter((line) => line !== "" || summary).join("\n"),
      keyboard: [...buildFilterRows(listing), NAV_ROW],
    };
  }

  const totalPages = countTotalPages(listing, page);
  const found = page.totalCount != null
    ? `Знайдено: <b>${page.totalCount}</b> · стор. ${listing.page} з ${totalPages}`
    : `Сторінка ${listing.page}`;
  const offset = (listing.page - 1) * LISTING_PAGE_SIZE;
  const pager: Button[] = [];
  if (listing.page > 1) pager.push({ text: "◀️", callback_data: `l:${listing.id}:p:${listing.page - 1}` });
  pager.push({ text: `${listing.page}/${totalPages}`, callback_data: "noop" });
  if (page.hasMore) pager.push({ text: "▶️", callback_data: `l:${listing.id}:p:${listing.page + 1}` });

  return {
    text: [
      "<b>🔎 Підбір запчастин</b>",
      summary,
      found,
      "",
      page.items.map((item, index) => formatListingItem(item, offset + index, page.euroRate)).join("\n\n"),
    ].filter((line, index) => line !== "" || index === 3).join("\n"),
    keyboard: [
      ...chunk(
        page.items.map((_, index) => ({
          text: `${offset + index + 1}`,
          callback_data: `l:${listing.id}:o:${index}`,
        })),
        3
      ),
      ...(pager.length > 1 ? [pager] : []),
      ...buildFilterRows(listing),
      NAV_ROW,
    ],
  };
};

export const buildCardNavRows = (listing: BotListing, index: number, itemCount: number): Button[][] => {
  const nav: Button[] = [];
  if (index > 0) nav.push({ text: "◀️", callback_data: `l:${listing.id}:o:${index - 1}` });
  nav.push({ text: `${index + 1}/${itemCount}`, callback_data: "noop" });
  if (index < itemCount - 1) nav.push({ text: "▶️", callback_data: `l:${listing.id}:o:${index + 1}` });
  return [...(nav.length > 1 ? [nav] : []), [{ text: "⬅️ До списку", callback_data: `l:${listing.id}:b` }]];
};

const paginate = <T,>(items: T[], page: number, size: number) => {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(0, page), totalPages - 1);
  return { pageItems: items.slice(current * size, (current + 1) * size), current, totalPages };
};

const buildPickerPager = (prefix: string, current: number, totalPages: number): Button[][] => {
  if (totalPages <= 1) return [];
  const row: Button[] = [];
  if (current > 0) row.push({ text: "◀️", callback_data: `${prefix}:${current - 1}` });
  row.push({ text: `${current + 1}/${totalPages}`, callback_data: "noop" });
  if (current < totalPages - 1) row.push({ text: "▶️", callback_data: `${prefix}:${current + 1}` });
  return [row];
};

const BACK_TO_LIST: Button = { text: "⬅️ До результатів", callback_data: "f:l" };

export const buildBrandPicker = (page: number, listing: BotListing, savedLabel: string | null): TelegramView => {
  const { pageItems, current, totalPages } = paginate(carBrands, page, BRAND_PAGE_SIZE);
  return {
    text: "<b>🚗 Оберіть марку авто</b>",
    keyboard: [
      ...(savedLabel && savedLabel !== listing.vehicleLabel
        ? [[{ text: `⭐ ${shorten(savedLabel, 40)}`, callback_data: "f:me" }]]
        : []),
      ...chunk(
        pageItems.map((brand) => ({ text: brand.name, callback_data: `f:ab:${buildPlainSeoSlug(brand.name)}:0` })),
        3
      ),
      ...buildPickerPager("f:a", current, totalPages),
      ...(listing.vehicle ? [[{ text: "✖️ Без авто", callback_data: "f:xv" }]] : []),
      [BACK_TO_LIST],
    ],
  };
};

export const buildModelPicker = async (brandSlug: string, page: number): Promise<TelegramView | null> => {
  const resolved = await resolveBrandModels(brandSlug);
  if (!resolved) return null;
  const { pageItems, current, totalPages } = paginate(resolved.models, page, MODEL_PAGE_SIZE);
  const offset = current * MODEL_PAGE_SIZE;
  return {
    text: resolved.models.length > 0
      ? `<b>🚗 ${escapeTelegramHtml(resolved.brand.name)}</b>\nОберіть модель (${resolved.models.length}):`
      : `<b>🚗 ${escapeTelegramHtml(resolved.brand.name)}</b>\nМоделі тимчасово недоступні.`,
    keyboard: [
      ...chunk(
        pageItems.map((model, index) => ({ text: model.name, callback_data: `f:am:${brandSlug}:${offset + index}` })),
        2
      ),
      ...buildPickerPager(`f:ab:${brandSlug}`, current, totalPages),
      [{ text: "⬅️ Марки", callback_data: "f:a:0" }],
    ],
  };
};

export const resolveModelVehicle = async (brandSlug: string, modelIndex: number) => {
  const resolved = await resolveBrandModels(brandSlug);
  const model = resolved?.models[modelIndex];
  if (!resolved || !model) return null;
  const vehicle = readVehicleSelection({ brand: resolved.brand.name, model: model.name });
  return vehicle ? { vehicle, label: `${resolved.brand.name} ${model.name}` } : null;
};

export const buildGroupPicker = async (listing: BotListing): Promise<TelegramView> => {
  const { groups } = await getProductTreeDataset();
  return {
    text: "<b>📂 Оберіть категорію</b>",
    keyboard: [
      ...chunk(
        groups.map((group) => ({
          text: `${getCategoryEmoji(group.label)} ${group.label}`,
          callback_data: `f:gd:${group.slug}`,
        })),
        2
      ),
      ...(listing.categoryLabel ? [[{ text: "✖️ Без категорії", callback_data: "f:xc" }]] : []),
      [BACK_TO_LIST],
    ],
  };
};

export const buildSubgroupPicker = async (groupSlug: string): Promise<TelegramView | null> => {
  const { groups } = await getProductTreeDataset();
  const group = groups.find((entry) => entry.slug === groupSlug);
  if (!group) return null;
  return {
    text: `<b>📂 ${escapeTelegramHtml(group.label)}</b>\nОберіть підгрупу:`,
    keyboard: [
      [{ text: "✅ Уся група", callback_data: `f:c:${group.slug}` }],
      ...group.subgroups.map((sub, index) => [
        {
          text: `${getCategoryEmoji(sub.label)} ${sub.label}`,
          callback_data: sub.children.length > 0 ? `f:gs:${group.slug}:${index}` : `f:c:${group.slug}:${index}`,
        },
      ]),
      [{ text: "⬅️ Категорії", callback_data: "f:g" }],
    ],
  };
};

export const buildChildPicker = async (groupSlug: string, subIndex: number): Promise<TelegramView | null> => {
  const { groups } = await getProductTreeDataset();
  const group = groups.find((entry) => entry.slug === groupSlug);
  const sub = group?.subgroups[subIndex];
  if (!group || !sub) return null;
  return {
    text: `<b>📂 ${escapeTelegramHtml(sub.label)}</b>\n<i>${escapeTelegramHtml(group.label)}</i>`,
    keyboard: [
      [{ text: "✅ Уся підгрупа", callback_data: `f:c:${group.slug}:${subIndex}` }],
      ...sub.children.map((child, index) => [
        {
          text: `${getCategoryEmoji(child.label)} ${child.label}`,
          callback_data: `f:c:${group.slug}:${subIndex}:${index}`,
        },
      ]),
      [{ text: "⬅️ Назад", callback_data: `f:gd:${group.slug}` }],
    ],
  };
};

// Same (group, subcategory) mapping as resolveGroupProductFilter; a whole
// group needs the hierarchy expanded so its nested subgroups are included.
export const resolveCategoryFilter = async (groupSlug: string, subIndex?: number, childIndex?: number) => {
  const { groups } = await getProductTreeDataset();
  const group = groups.find((entry) => entry.slug === groupSlug);
  if (!group) return null;
  if (subIndex === undefined) {
    return { group: group.label, subcategory: "", categoryLabel: group.label, expandHierarchy: true };
  }
  const sub = group.subgroups[subIndex];
  if (!sub) return null;
  if (childIndex === undefined) {
    return { group: group.label, subcategory: sub.label, categoryLabel: sub.label, expandHierarchy: true };
  }
  const child = sub.children[childIndex];
  return child
    ? { group: sub.label, subcategory: child.label, categoryLabel: child.label, expandHierarchy: true }
    : null;
};
