import { isAbortLikeError } from "app/lib/catalog-request-lifecycle";
import { CATALOG_PAGE_CACHE_VERSION } from "app/lib/catalog-client-cache";
import { buildProductImagePath } from "app/lib/product-image-path";
import { type CatalogSortOrder } from "app/lib/catalog-sort";

// --- Types ---
interface DataProps {
  selectedCars: string[];
  selectedCategories: string[];
  sortOrder: CatalogSortOrder;
  pricedOnly?: boolean;
  priceFrom?: number | null;
  priceTo?: number | null;
  inStock?: boolean;
  withPhoto?: boolean;
  initialPagePayload?: CatalogPagePayload | null;
  initialQuerySignature?: string | null;
  initialTotalCount?: number | null;
  viewMode?: "grid" | "list";
  onViewModeChange?: (mode: "grid" | "list") => void;
  pageBatchSize?: number;
  onPageBatchSizeChange?: (size: number) => void;
}

export interface Product {
  raw?: Record<string, unknown>;
  code: string;
  article: string;
  name: string;
  producer: string;
  description?: string;
  quantity: number;
  priceEuro?: number | null;
  costPriceEuro?: number | null;
  group?: string;
  subGroup?: string;
  category?: string;
  hasPhoto?: boolean;
  hasPrice?: boolean;
}

// --- Constants ---
// Keep pages small to avoid overloading 1C and shorten perceived waits.
// Keep the client page boundary identical to the server-rendered catalog
// snapshot. A 12/16 mismatch made the first response and the next cursor refer
// to different windows, while also leaving the last SSR row to appear late.
const ITEMS_PER_PAGE = 16;

const CATALOG_PAGE_ROUTE = "/api/catalog-page";

const CATALOG_PRICE_BATCH_ROUTE = "/api/catalog-prices";

const PRICE_CACHE_PREFIX = "partson:v12:price:";

const PRICE_CACHE_TTL_MS = 1000 * 60 * 10;

const PRICE_PERSISTED_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

const PRICE_STALE_POSITIVE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const PRICE_NEGATIVE_CACHE_TTL_MS = 1000 * 60;

const PRICE_REVALIDATE_AFTER_NULL_MS = 1000 * 30;

const PRICE_PAGE_BATCH_SIZE = ITEMS_PER_PAGE * 8;

const VISIBLE_PRICE_PREFETCH_CHUNK_SIZE = ITEMS_PER_PAGE * 2;

const PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS = 1000 * 12;

const MEMORY_CACHE_TTL_MS_FIRST_PAGE = 1000 * 60 * 4;

const MEMORY_CACHE_TTL_MS_NEXT_PAGES = 1000 * 60 * 4;

const PAGE_MEMORY_CACHE_MAX_ENTRIES = 48;

const PAGE_SESSION_CACHE_MAX_ENTRIES = 64;

const PAGE_SESSION_CACHE_INDEX_KEY = `${CATALOG_PAGE_CACHE_VERSION}:index`;

// Bumped from 1: with numbered pagination + jump-ahead now common (not just
// linear scrolling), prefetching 2 pages ahead keeps a plain "next" click
// instant across a wider range instead of only the very next page.
const BACKGROUND_PAGE_PREFETCH_DEPTH = 2;

const BACKGROUND_PAGE_PREFETCH_DELAY_MS = 220;

const BACKGROUND_PAGE_PREFETCH_MAX_LOAD_WAIT_MS = 4000;

// Each prefetched page also pulls 16 thumbnails and a price batch. On a
// data-saver or 2G-class connection that traffic delays what the user is
// actually looking at, so prefetch less (or nothing) there.
const getBackgroundPagePrefetchDepth = () => {
  if (typeof navigator === "undefined") return BACKGROUND_PAGE_PREFETCH_DEPTH;
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!connection) return BACKGROUND_PAGE_PREFETCH_DEPTH;
  if (connection.saveData) return 0;
  if (connection.effectiveType === "slow-2g" || connection.effectiveType === "2g") return 0;
  if (connection.effectiveType === "3g") return 1;
  return BACKGROUND_PAGE_PREFETCH_DEPTH;
};

// Start only the actual LCP candidate at high priority. A small first row may
// still load eagerly, while the rest of the page is resolved by one batch.
const IMAGE_HIGH_PRIORITY_ITEMS_COUNT = 1;

// Start visible grid photos directly: 2 on phones, up to 8 on desktops.
// The catalog HTML uses matching media queries for its preload hints.
const IMAGE_EAGER_ITEMS_COUNT = 8;

const getGridImageEagerCount = (width: number) =>
  width < 640 ? 2 : width < 1024 ? 4 : width < 1280 ? 6 : IMAGE_EAGER_ITEMS_COUNT;

// List rows are much shorter than a grid card, so more of them sit in the
// first viewport — list view eager-loads this many up front instead of
// IMAGE_EAGER_ITEMS_COUNT. Every "how many images get to skip the shared
// batch and start their own request immediately" computation must use this
// per-viewMode count consistently, or the extra list rows it covers end up
// eager (rendered as if visible) but still gated behind the batch response,
// which is exactly what made list view's first portion of images slow.
const IMAGE_EAGER_ITEMS_COUNT_LIST = 12;

// Resolve the whole first page in one batch call. A smaller chunk here leaves
// most first-page cards "unqueued" long enough to trip ProductCardImage's
// deferDirectLoad fallback (see DEFERRED_DIRECT_LOAD_DELAY_MS), so instead of
// one shared batch request they each fire an individual direct image request
// in parallel — more concurrent requests and raggedy pop-in, not less.
const VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE = ITEMS_PER_PAGE;

const VISIBLE_IMAGE_DEEP_RECOVERY_CHUNK_SIZE = 4;

const VISIBLE_IMAGE_DEEP_RECOVERY_DELAY_MS = 60;

const NEXT_PAGE_LOADER_MIN_VISIBLE_MS = 40;

// Matches ProductCard's actual h-[320px] plus CATALOG_GRID_CLASS's
// gap-3/sm:gap-5/lg:gap-4 (332 below 640px, ~336-340 at sm/lg) — kept in sync
// with the non-virtualized fallback below (both feed virtualRowHeightPx) so
// crossing the VIRTUALIZATION_MIN_ITEMS threshold via "load more" doesn't
// swap from one guess to a different guess before the real ResizeObserver
// measurement lands a frame later — that mismatch was a visible row-jump.
const VIRTUAL_ROW_ESTIMATED_HEIGHT_PX = 338;

// Keep only a small, generous window mounted once the catalog grows beyond
// three API pages. This prevents images, card effects and React reconciliation
// for old pages from competing with the browser's scroll frame.
const VIRTUALIZATION_MIN_ITEMS = ITEMS_PER_PAGE * 3;

// Rows of cards kept mounted just outside the viewport on each side. The
// window only recomputes once per animation frame (see scheduleUpdate
// below), so on a fast fling/flick — real momentum scrolling can cross a
// 3-row buffer within a single frame on a tall grid — cards used to become
// visible before their row entered the mounted window, reading as a visible
// pop-in right at the viewport edge instead of already being there.
const VIRTUAL_OVERSCAN_ROWS = 5;

// Shift the mounted window in small row groups instead of reconciling the
// product grid every time a single row crosses the viewport boundary.
const VIRTUAL_WINDOW_STEP_ROWS = 2;

const SERVICE_UNAVAILABLE_SOFT_RETRY_COUNT = 2;

const SERVICE_UNAVAILABLE_SOFT_RETRY_DELAY_MS = 520;

const DEFAULT_EURO_RATE = 50;

// Backend field aliases (use escapes to stay ASCII-friendly)
const NAME_FIELDS = [
  "\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435", // РќРѕРјРµРЅРєР»Р°С‚СѓСЂР°РќР°РёРјРµРЅРѕРІР°РЅРёРµ
  "\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435", // РќР°РёРјРµРЅРѕРІР°РЅРёРµ
  "\u041d\u0430\u0439\u043c\u0435\u043d\u0443\u0432\u0430\u043d\u043d\u044f", // РќР°Р№РјРµРЅСѓРІР°РЅРЅСЏ
  "name",
];

const CODE_FIELDS = [
  "\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430\u041a\u043e\u0434", // РќРѕРјРµРЅРєР»Р°С‚СѓСЂР°РљРѕРґ
  "\u041a\u043e\u0434", // РљРѕРґ
  "code",
  "ID",
  "Id",
];

const ARTICLE_FIELDS = [
  "\u041d\u043e\u043c\u0435\u0440\u041f\u043e\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0443", // РќРѕРјРµСЂРџРѕРљР°С‚Р°Р»РѕРіСѓ
  "\u0410\u0440\u0442\u0438\u043a\u0443\u043b", // РђСЂС‚РёРєСѓР»
  "article",
];

const PRODUCER_FIELDS = [
  "\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435", // РџСЂРѕРёР·РІРѕРґРёС‚РµР»СЊРќР°РёРјРµРЅРѕРІР°РЅРёРµ
  "\u0412\u0438\u0440\u043e\u0431\u043d\u0438\u043a", // Р’РёСЂРѕР±РЅРёРє
  "\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c", // РџСЂРѕРёР·РІРѕРґРёС‚РµР»СЊ
  "\u0411\u0440\u0435\u043d\u0434", // Р‘СЂРµРЅРґ
  "producer",
];

const DESCRIPTION_FIELDS = [
  "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435",
  "\u041e\u043f\u0438\u0441",
  "Description",
  "description",
  "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u044b",
  "\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435",
  "\u0422\u0435\u043a\u0441\u0442\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u044f",
];

const QTY_FIELDS = [
  "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e", // РљРѕР»РёС‡РµСЃС‚РІРѕ
  "\u041a\u0456\u043b\u044c\u043a\u0456\u0441\u0442\u044c", // РљС–Р»СЊРєС–СЃС‚СЊ
  "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e\u0421\u0432\u043e\u0431\u043e\u0434\u043d\u043e", // РљРѕР»РёС‡РµСЃС‚РІРѕРЎРІРѕР±РѕРґРЅРѕ
  "\u041e\u0441\u0442\u0430\u0442\u043e\u043a", // РћСЃС‚Р°С‚РѕРє
  "quantity",
  "Quantity",
];

const GROUP_FIELDS = [
  "\u0413\u0440\u0443\u043f\u043f\u0430", // Р“СЂСѓРїРїР°
  "\u0420\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435", // Р РѕРґРёС‚РµР»СЊРќР°РёРјРµРЅРѕРІР°РЅРёРµ
  "group",
];

const SUBGROUP_FIELDS = [
  "\u041f\u043e\u0434\u0433\u0440\u0443\u043f\u043f\u0430", // РџРѕРґРіСЂСѓРїРїР°
  "\u0420\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u0420\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435", // Р РѕРґРёС‚РµР»СЊР РѕРґРёС‚РµР»СЊРќР°РёРјРµРЅРѕРІР°РЅРёРµ
  "Subcategory",
  "subGroup",
];

const CATEGORY_FIELDS = [
  "\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f",
  "Category",
  "category",
];
 // РљР°С‚РµРіРѕСЂРёСЏ
const PRICE_VALUE_FIELDS = [
  "priceEuro",
  "price_euro",
  "PriceEuro",
  "\u0426\u0456\u043d\u0430\u041f\u0440\u043e\u0434", // Р¦С–РЅР°РџСЂРѕРґ
  "\u0426\u0435\u043d\u0430\u041f\u0440\u043e\u0434", // Р¦РµРЅР°РџСЂРѕРґ
  "\u0426\u0456\u043d\u0430\u041f\u0440\u043e\u0434\u0430\u0436\u0443",
  "\u0426\u0435\u043d\u0430\u041f\u0440\u043e\u0434\u0430\u0436\u0438",
  "\u0426\u0456\u043d\u0430\u0421\u0430\u0439\u0442",
  "\u0426\u0435\u043d\u0430\u0421\u0430\u0439\u0442",
  "\u0426\u0456\u043d\u0430\u0420\u043e\u0437\u0434\u0440\u0456\u0431",
  "\u0426\u0435\u043d\u0430\u0420\u043e\u0437\u043d\u0438\u0446\u0430",
  "\u0420\u043e\u0437\u043d\u0438\u0447\u043d\u0430\u044f\u0426\u0435\u043d\u0430",
  "\u0426\u0435\u043d\u0430", // Р¦РµРЅР°
  "\u0426\u0456\u043d\u0430", // Р¦С–РЅР°
  "price",
  "Price",
  "cost",
  "Cost",
];

const PURCHASE_PRICE_FIELDS = [
  "costPriceEuro",
  "purchasePrice",
  "purchase_price",
  "\u0426\u0456\u043d\u0430\u0417\u0430\u043a\u0443\u043f", // ЦінаЗакуп
  "ЦінаЗакупівлі",
  "ЦінаЗакупки",
  "ЦенаЗакупки",
  "ЦінаЗак",
  "ЦенаЗак",
  "Себестоимость",
  "Собівартість",
  "ЦінаПостачальника",
  "ЦенаПоставщика",
];

const PHOTO_FIELDS = [
  "\u0415\u0441\u0442\u044c\u0424\u043e\u0442\u043e",
  "\u0415\u0441\u0442\u044c\u0444\u043e\u0442\u043e",
  "\u0404\u0441\u0442\u044c\u0424\u043e\u0442\u043e",
  "\u0404\u0441\u0442\u044c\u0444\u043e\u0442\u043e",
  "\u0415\u0441\u0442\u044c\u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435",
  "\u0404\u0417\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u043d\u044f",
  "\u0415\u0441\u0442\u044c\u041a\u0430\u0440\u0442\u0438\u043d\u043a\u0430",
  "\u0404\u041a\u0430\u0440\u0442\u0438\u043d\u043a\u0430",
  "hasPhoto",
  "HasPhoto",
  "has_photo",
  "hasImage",
  "HasImage",
  "has_image",
];

const HAS_PRICE_FIELDS = [
  "\u0415\u0441\u0442\u044c\u0426\u0435\u043d\u0430", // \u0415\u0441\u0442\u044c\u0426\u0435\u043d\u0430
  "\u0404\u0441\u0442\u044c\u0426\u0456\u043d\u0430", // \u0404\u0441\u0442\u044c\u0426\u0456\u043d\u0430
  "hasPrice",
  "HasPrice",
  "has_price",
];

const readFirstString = (
  source: Record<string, unknown>,
  keys: readonly string[],
  fallback = ""
) => {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return fallback;
};

const readFirstNumber = (
  source: Record<string, unknown>,
  keys: readonly string[],
  fallback = 0
) => {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const cleaned = value
        .replace(/\s+/g, "")
        .replace(",", ".")
        .replace(/[^\d.+-]/g, ""); // handle "1 200", "1,5", "123 EUR"
      const num = Number(cleaned);
      if (Number.isFinite(num)) return num;
    }
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return fallback;
};

const readFirstBoolean = (
  source: Record<string, unknown>,
  keys: readonly string[],
  fallback = false
) => {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (!normalized) continue;
      if (["true", "1", "yes", "y", "так", "да", "истина", "істина"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "no", "n", "ні", "нет", "ложь", "хибність"].includes(normalized)) {
        return false;
      }
    }
  }
  return fallback;
};

const sanitizeUiErrorMessage = (value: string | null | undefined) => {
  const raw = (value || "").trim();
  if (!raw || isAbortLikeError(raw)) return "";

  const looksLikeHtml =
    /<\s*html|<\s*!doctype|<\s*script|<\s*meta|<\s*body/i.test(raw);
  if (looksLikeHtml) return "";

  const stripped = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return "";

  return stripped.length > 220 ? `${stripped.slice(0, 220)}...` : stripped;
};

const toPriceUAH = (euro: number | null | undefined, euroRate: number) => {
  if (typeof euro !== "number" || !Number.isFinite(euro) || euro <= 0) return null;
  return Math.round(euro * euroRate);
};

const normalizePriceKey = (value: string | null | undefined) => {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
};

const getProductPriceStateKey = (item: Pick<Product, "code" | "article">) =>
  normalizePriceKey(item.code || item.article);

const getProductPriceLookupKeys = (item: Pick<Product, "code" | "article">) =>
  Array.from(
    new Set(
      [(item.article || ""), (item.code || "")]
        .map(normalizePriceKey)
        .filter(Boolean)
    )
  );

type CatalogSortedEntry = {
  item: Product;
  index: number;
  code: string;
  stableKey: string;
  priceKey: string;
  priceUAH: number | null;
  priceResolved: boolean;
};

const getProductStableListKey = (
  item: Pick<
    Product,
    "code" | "article" | "name" | "producer" | "group" | "subGroup" | "category"
  >
) => {
  const code = (item.code || "").trim();
  const article = (item.article || "").trim();
  const name = (item.name || "").trim().toLowerCase();
  const producer = (item.producer || "").trim().toLowerCase();
  const group = (item.group || "").trim().toLowerCase();
  const subGroup = (item.subGroup || "").trim().toLowerCase();
  const category = (item.category || "").trim().toLowerCase();

  return `${code || "-"}::${article || "-"}::${name || "-"}::${producer || "-"}::${group || "-"}::${subGroup || "-"}::${category || "-"}`;
};

const normalizeProduct = (raw: unknown): Product => {
  const record =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const code = readFirstString(record, CODE_FIELDS);
  const article = readFirstString(record, ARTICLE_FIELDS);
  const name =
    readFirstString(record, NAME_FIELDS) || code || article || "Товар";
  const rawProducer = readFirstString(record, PRODUCER_FIELDS);
  const producer = (() => {
    const trimmed = rawProducer.trim();
    if (!trimmed) return "";
    // Р”РµСЏРєС– Р·Р°РїРёСЃРё РїСЂРёС…РѕРґСЏС‚СЊ Р· "seiken" СЏРє РґРµС„РѕР»С‚РЅРёРј РїРѕСЃС‚Р°С‡Р°Р»СЊРЅРёРєРѕРј вЂ” С…РѕРІР°С”РјРѕ Р№РѕРіРѕ.
    if (trimmed.toLowerCase() === "seiken") return "";
    return trimmed;
  })();
  const quantity = readFirstNumber(record, QTY_FIELDS, 0);
  const priceEuro = readFirstNumber(record, PRICE_VALUE_FIELDS, Number.NaN);
  const rawCostPriceEuro = readFirstNumber(record, PURCHASE_PRICE_FIELDS, Number.NaN);
  const description = readFirstString(record, DESCRIPTION_FIELDS);

  const rawGroup = readFirstString(record, GROUP_FIELDS);
  const rawSubGroup = readFirstString(record, SUBGROUP_FIELDS);
  const rawCategory = readFirstString(record, CATEGORY_FIELDS);
  const shouldPromoteMissingCategory =
    !rawCategory &&
    rawGroup &&
    rawSubGroup &&
    rawGroup.toLocaleLowerCase("uk-UA") !== rawSubGroup.toLocaleLowerCase("uk-UA");
  const category = shouldPromoteMissingCategory ? rawGroup : rawCategory;
  const group = shouldPromoteMissingCategory ? rawSubGroup : rawGroup;
  const subGroup = shouldPromoteMissingCategory ? "" : rawSubGroup;
  const hasPhoto = readFirstBoolean(record, PHOTO_FIELDS, false);
  const hasPriceRaw = readFirstBoolean(record, HAS_PRICE_FIELDS, undefined as unknown as boolean);
  const hasPriceFromValue = Number.isFinite(priceEuro) && priceEuro > 0;
  const hasPrice: boolean | undefined = hasPriceRaw === true ? true : hasPriceRaw === false ? false : hasPriceFromValue ? true : undefined;

  const resolvedCode =
    code ||
    article ||
    readFirstString(record, ["ID", "Id"]) ||
    readFirstString(record, NAME_FIELDS);

  return {
    raw: record,
    code: resolvedCode,
    article,
    name,
    producer,
    description,
    quantity,
    priceEuro: Number.isFinite(priceEuro) && priceEuro > 0 ? priceEuro : null,
    costPriceEuro: Number.isFinite(rawCostPriceEuro) && rawCostPriceEuro > 0 ? rawCostPriceEuro : undefined,
    group,
    subGroup,
    category,
    hasPhoto,
    hasPrice,
  };
};

const getProductIdentity = (item: Product) => {
  const hasAnyIdentityPart = Boolean(
    (item.code || "").trim() ||
      (item.article || "").trim() ||
      (item.name || "").trim() ||
      (item.producer || "").trim()
  );

  if (!hasAnyIdentityPart) return "";
  return `stable:${getProductStableListKey(item)}`;
};

const mergeUniqueProducts = (current: Product[], incoming: Product[]) => {
  if (incoming.length === 0) return current;

  const map = new Map<string, Product>();
  for (const item of current) {
    const key = getProductIdentity(item);
    if (!key || map.has(key)) continue;
    map.set(key, item);
  }

  for (const item of incoming) {
    const key = getProductIdentity(item);
    if (!key || map.has(key)) continue;
    map.set(key, item);
  }

  return Array.from(map.values());
};

const CATALOG_GRID_CLASS =
  "mx-auto mt-1 grid w-full grid-cols-1 gap-3 sm:mt-2 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4";

const CATALOG_ADMIN_GRID_CLASS =
  "mx-auto mt-1 grid w-full grid-cols-1 gap-3 sm:mt-2 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4";

const CATALOG_LIST_CLASS = "mx-auto mt-1 grid w-full grid-cols-1 gap-2 sm:mt-2";

type CatalogPagePayload = {
  items: Product[];
  prices?: Record<string, number | null>;
  images?: Record<string, string>;
  euroRate?: number | null;
  hasMore?: boolean;
  nextCursor?: string;
  cursorField?: string;
  totalCount?: number | null;
  correctedQuery?: string;
  serviceUnavailable?: boolean;
  message?: string;
};

type PageCacheEntry = {
  payload: CatalogPagePayload;
  expiresAt: number;
  lastAccessedAt: number;
};

type PageSessionCacheIndexEntry = {
  key: string;
  expiresAt: number;
  lastAccessedAt: number;
};

// --- Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ РІРµР»РёРєРѕС— РєР°СЂС‚РёРЅРєРё ---
async function fetchImageBase64(
  productCode: string,
  articleHint?: string
): Promise<string | null> {
  const src = buildProductImagePath(productCode, articleHint);
  return src || null;
}

export { PRICE_CACHE_PREFIX, PRICE_NEGATIVE_CACHE_TTL_MS, PRICE_CACHE_TTL_MS, PRICE_PERSISTED_CACHE_TTL_MS, PRICE_STALE_POSITIVE_CACHE_TTL_MS, getProductPriceStateKey, getProductPriceLookupKeys, toPriceUAH, PAGE_MEMORY_CACHE_MAX_ENTRIES, normalizePriceKey, ITEMS_PER_PAGE, PAGE_SESSION_CACHE_INDEX_KEY, MEMORY_CACHE_TTL_MS_NEXT_PAGES, PAGE_SESSION_CACHE_MAX_ENTRIES, normalizeProduct, DEFAULT_EURO_RATE, NEXT_PAGE_LOADER_MIN_VISIBLE_MS, PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS, PRICE_PAGE_BATCH_SIZE, CATALOG_PRICE_BATCH_ROUTE, PRICE_REVALIDATE_AFTER_NULL_MS, VISIBLE_IMAGE_PREFETCH_CHUNK_SIZE, VISIBLE_IMAGE_DEEP_RECOVERY_CHUNK_SIZE, VISIBLE_IMAGE_DEEP_RECOVERY_DELAY_MS, CATALOG_PAGE_ROUTE, MEMORY_CACHE_TTL_MS_FIRST_PAGE, mergeUniqueProducts, sanitizeUiErrorMessage, getProductStableListKey, IMAGE_EAGER_ITEMS_COUNT_LIST, getGridImageEagerCount, SERVICE_UNAVAILABLE_SOFT_RETRY_COUNT, SERVICE_UNAVAILABLE_SOFT_RETRY_DELAY_MS, getBackgroundPagePrefetchDepth, BACKGROUND_PAGE_PREFETCH_DELAY_MS, BACKGROUND_PAGE_PREFETCH_MAX_LOAD_WAIT_MS, fetchImageBase64, VIRTUAL_ROW_ESTIMATED_HEIGHT_PX, VIRTUALIZATION_MIN_ITEMS, IMAGE_HIGH_PRIORITY_ITEMS_COUNT, VIRTUAL_OVERSCAN_ROWS, VISIBLE_PRICE_PREFETCH_CHUNK_SIZE, VIRTUAL_WINDOW_STEP_ROWS, CATALOG_LIST_CLASS, CATALOG_ADMIN_GRID_CLASS, CATALOG_GRID_CLASS };

export type { PageCacheEntry, CatalogPagePayload, PageSessionCacheIndexEntry, DataProps, CatalogSortedEntry };
