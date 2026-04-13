import "server-only";

import { oneCRequest } from "app/api/_lib/oneC";

export interface CatalogProduct {
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
}

export interface CatalogQueryPageResult {
  items: CatalogProduct[];
  hasMore: boolean;
  nextCursor: string;
  cursorField?: string | null;
}

export type CatalogSearchFilter =
  | "all"
  | "article"
  | "name"
  | "code"
  | "producer";

const PAGE_FIELD = "\u041d\u043e\u043c\u0435\u0440\u0421\u0442\u0440\u0430\u043d\u0438\u0446\u044b";
const OFFSET_FIELD = "\u0421\u043c\u0435\u0449\u0435\u043d\u0438\u0435";
const LIMIT_FIELD = "\u041b\u0438\u043c\u0438\u0442";
const PRICE_CODE_FIELD = "\u041a\u043e\u0434";

const NAME_FIELDS = [
  "\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435",
  "\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435",
  "\u041d\u0430\u0439\u043c\u0435\u043d\u0443\u0432\u0430\u043d\u043d\u044f",
  "name",
];
const CODE_FIELDS = [
  "\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430\u041a\u043e\u0434",
  "\u041a\u043e\u0434",
  "code",
  "ID",
  "Id",
];
const ARTICLE_FIELDS = [
  "\u041d\u043e\u043c\u0435\u0440\u041f\u043e\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0443",
  "\u0410\u0440\u0442\u0438\u043a\u0443\u043b",
  "article",
];
const PRODUCER_FIELDS = [
  "\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435",
  "\u0412\u0438\u0440\u043e\u0431\u043d\u0438\u043a",
  "\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c",
  "\u0411\u0440\u0435\u043d\u0434",
  "producer",
];
const QTY_FIELDS = [
  "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e",
  "\u041a\u0456\u043b\u044c\u043a\u0456\u0441\u0442\u044c",
  "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e\u0421\u0432\u043e\u0431\u043e\u0434\u043d\u043e",
  "\u041e\u0441\u0442\u0430\u0442\u043e\u043a",
  "quantity",
  "Quantity",
];
const GROUP_FIELDS = [
  "\u0413\u0440\u0443\u043f\u043f\u0430",
  "\u0420\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435",
  "Category",
];
const SUBGROUP_FIELDS = [
  "\u041f\u043e\u0434\u0433\u0440\u0443\u043f\u043f\u0430",
  "\u0420\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u0420\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435",
  "Subcategory",
];
const CATEGORY_FIELDS = ["\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f", "Category"];
const PRICE_FIELDS = [
  "\u0426\u0456\u043d\u0430\u041f\u0440\u043e\u0434",
  "\u0426\u0435\u043d\u0430\u041f\u0440\u043e\u0434",
  "\u0426\u0435\u043d\u0430",
  "\u0426\u0456\u043d\u0430",
  "price",
];
const PHOTO_FIELDS = [
  "\u0415\u0441\u0442\u044c\u0424\u043e\u0442\u043e",
  "\u0404\u0441\u0442\u044c\u0424\u043e\u0442\u043e",
  "hasPhoto",
  "HasPhoto",
];
const ALLGOODS_LIMIT_FIELD = "\u041b\u0438\u043c\u0438\u0442";
const ALLGOODS_CURSOR_FIELD = "\u041f\u043e\u0441\u043b\u0435\u041a\u043e\u0434\u0430";
const ALLGOODS_NAME_FIELD = "\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435";
const ALLGOODS_CODE_FIELD = "\u041a\u043e\u0434";
const ALLGOODS_ARTICLE_FIELD = "\u041d\u043e\u043c\u0435\u0440\u041f\u043e\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0443";
const ALLGOODS_PRODUCER_FIELD = "\u041f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435";
const ALLGOODS_GROUP_FIELD = "\u0413\u0440\u0443\u043f\u043f\u0430";
const ALLGOODS_SUBGROUP_FIELD = "\u041f\u043e\u0434\u0433\u0440\u0443\u043f\u043f\u0430";
const ALLGOODS_SORT_PRICE_FIELD = "\u0421\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u043a\u0430\u041f\u043e\u0426\u0435\u043d\u0435";
const ALLGOODS_INCLUDE_DESCRIPTION_FIELD = "\u0412\u043a\u043b\u044e\u0447\u0430\u0442\u044c\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435";
const INFO_ARTICLE_FIELD = "\u041d\u043e\u043c\u0435\u0440\u041f\u043e\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0443";
const INFO_DESC_FIELDS = ["\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435", "\u041e\u043f\u0438\u0441"];

const PRIVAT_URL =
  "https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5";
let cachedEuroRate = 50;
let lastEuroFetchAt = 0;
let euroRateRefreshPromise: Promise<number> | null = null;
const EURO_RATE_TTL_MS = 1000 * 60 * 30;

const maybeFixMojibake = (input: string) => {
  const value = input.trim();
  if (!value || !/(?:Р.|С.){2,}/.test(value)) return value;

  try {
    const decoded = Buffer.from(value, "latin1").toString("utf8").trim();
    if (!decoded) return value;

    const score = (sample: string) =>
      (sample.match(/[A-Za-zА-Яа-яІіЇїЄєҐґ0-9]/g) || []).length;

    return score(decoded) >= score(value) ? decoded : value;
  } catch {
    return value;
  }
};

const readFirstString = (
  source: Record<string, unknown>,
  keys: readonly string[],
  fallback = ""
) => {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return maybeFixMojibake(trimmed);
  }
  return fallback;
};

const readFirstNumber = (
  source: Record<string, unknown>,
  keys: readonly string[],
  fallback = Number.NaN
) => {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const cleaned = value.replace(/\s+/g, "").replace(",", ".");
      const numberValue = Number(cleaned);
      if (Number.isFinite(numberValue)) return numberValue;
    }
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
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
      if (["true", "1", "yes", "y", "так", "да"].includes(normalized)) return true;
      if (["false", "0", "no", "n", "ні", "нет"].includes(normalized)) return false;
    }
  }
  return fallback;
};

const normalizeProduct = (raw: unknown): CatalogProduct => {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const code = readFirstString(record, CODE_FIELDS);
  const article = readFirstString(record, ARTICLE_FIELDS);
  const name = readFirstString(record, NAME_FIELDS) || code || article || "Товар";
  const producer = readFirstString(record, PRODUCER_FIELDS);
  const quantity = readFirstNumber(record, QTY_FIELDS, 0);
  const priceEuro = readFirstNumber(record, PRICE_FIELDS, Number.NaN);
  const group = readFirstString(record, GROUP_FIELDS);
  const subGroup = readFirstString(record, SUBGROUP_FIELDS);
  const category = readFirstString(record, CATEGORY_FIELDS);
  const hasPhoto = readFirstBoolean(record, PHOTO_FIELDS, true);
  const resolvedCode = code || article || readFirstString(record, ["ID", "Id"]) || name;

  return {
    code: resolvedCode,
    article,
    name,
    producer,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    priceEuro: Number.isFinite(priceEuro) && priceEuro > 0 ? priceEuro : null,
    group,
    subGroup,
    category,
    hasPhoto,
  };
};

const parseItemsFromText = (payload: string) => {
  try {
    const parsed = JSON.parse(payload) as unknown;
    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { items?: unknown[] })?.items)
      ? (parsed as { items: unknown[] }).items
      : [];

    return records.map(normalizeProduct);
  } catch {
    return [] as CatalogProduct[];
  }
};

const parseAllgoodsPayload = (payload: string) => {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const records = Array.isArray(parsed?.items) ? parsed.items : [];
    const nextCursor =
      typeof parsed?.next_cursor === "string" ? parsed.next_cursor.trim() : "";
    const hasMore =
      parsed?.has_more === true ||
      parsed?.has_more === 1 ||
      parsed?.has_more === "true" ||
      Boolean(nextCursor && records.length > 0);

    return {
      items: records.map(normalizeProduct),
      hasMore,
      nextCursor,
    };
  } catch {
    return {
      items: parseItemsFromText(payload),
      hasMore: false,
      nextCursor: "",
    };
  }
};

const sortCatalogProductsByPricePriority = (
  items: CatalogProduct[],
  sortOrder: "asc" | "desc"
) =>
  items
    .map((item, index) => ({
      item,
      index,
      price: typeof item.priceEuro === "number" && item.priceEuro > 0 ? item.priceEuro : null,
    }))
    .sort((a, b) => {
      const aHasPrice = a.price != null ? 0 : 1;
      const bHasPrice = b.price != null ? 0 : 1;
      if (aHasPrice !== bHasPrice) return aHasPrice - bHasPrice;

      if (a.price != null && b.price != null) {
        if (sortOrder === "asc" && a.price !== b.price) return a.price - b.price;
        if (sortOrder === "desc" && a.price !== b.price) return b.price - a.price;
      }

      return a.index - b.index;
    })
    .map(({ item }) => item);

const extractResponseErrorDetails = (responseText: string) => {
  try {
    const parsed = JSON.parse(responseText) as { details?: unknown; error?: unknown };
    return typeof parsed?.details === "string"
      ? parsed.details
      : typeof parsed?.error === "string"
        ? parsed.error
        : "";
  } catch {
    return "";
  }
};

const fetchAllgoodsProductsPageDetailed = async (options: {
  page?: number;
  limit?: number;
  body?: Record<string, unknown>;
  cursor?: string | null;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  cacheTtlMs?: number;
}): Promise<CatalogQueryPageResult> => {
  const page =
    Number.isFinite(options.page) && (options.page || 0) > 0
      ? Math.floor(options.page as number)
      : 1;
  const limit =
    Number.isFinite(options.limit) && (options.limit || 0) > 0
      ? Math.min(Math.floor(options.limit as number), 500)
      : 10;
  const requestBodyBase = { ...(options.body || {}) };
  const isPriceSorted = typeof requestBodyBase[ALLGOODS_SORT_PRICE_FIELD] === "string";
  const requestedCursor =
    typeof options.cursor === "string" ? options.cursor.trim() : "";

  if (!Object.prototype.hasOwnProperty.call(requestBodyBase, ALLGOODS_INCLUDE_DESCRIPTION_FIELD)) {
    requestBodyBase[ALLGOODS_INCLUDE_DESCRIPTION_FIELD] = false;
  }

  if (isPriceSorted) {
    const start = (page - 1) * limit;
    const sortDirection =
      String(requestBodyBase[ALLGOODS_SORT_PRICE_FIELD]).toUpperCase() === "ASC"
        ? "asc"
        : "desc";
    let requestedLimit = Math.min(Math.max(page * limit + 1, limit * 8), 500);
    let parsed = {
      items: [] as CatalogProduct[],
      hasMore: false,
      nextCursor: "",
    };

    while (true) {
      const response = await oneCRequest("allgoods", {
        method: "POST",
        body: {
          ...requestBodyBase,
          [ALLGOODS_LIMIT_FIELD]: requestedLimit,
        },
        timeoutMs: options.timeoutMs,
        retries: options.retries ?? 1,
        retryDelayMs: options.retryDelayMs ?? 250,
        cacheTtlMs:
          options.cacheTtlMs ??
          (page === 1 ? 1000 * 20 : 1000 * 15),
      });

      if (response.status < 200 || response.status >= 300) {
        const details = extractResponseErrorDetails(response.text);
        throw new Error(
          details
            ? `Catalog allgoods failed: ${response.status} ${details}`
            : `Catalog allgoods failed: ${response.status}`
        );
      }

      parsed = parseAllgoodsPayload(response.text);
      const pricedCount = parsed.items.reduce(
        (count, item) => (typeof item.priceEuro === "number" && item.priceEuro > 0 ? count + 1 : count),
        0
      );

      if (pricedCount >= start + limit || !parsed.hasMore || requestedLimit >= 500) {
        break;
      }

      requestedLimit = Math.min(
        500,
        Math.max(requestedLimit + limit * 6, Math.ceil(requestedLimit * 1.5))
      );
    }

    const sortedItems = sortCatalogProductsByPricePriority(parsed.items, sortDirection);
    return {
      items: sortedItems.slice(start, start + limit),
      hasMore: sortedItems.length > start + limit || parsed.hasMore,
      nextCursor: "",
    };
  }

  if (requestedCursor) {
    const response = await oneCRequest("allgoods", {
      method: "POST",
      body: {
        ...requestBodyBase,
        [ALLGOODS_LIMIT_FIELD]: limit,
        [ALLGOODS_CURSOR_FIELD]: requestedCursor,
      },
      timeoutMs: options.timeoutMs,
      retries: options.retries ?? 1,
      retryDelayMs: options.retryDelayMs ?? 250,
      cacheTtlMs: options.cacheTtlMs,
    });

    if (response.status < 200 || response.status >= 300) {
      const details = extractResponseErrorDetails(response.text);
      throw new Error(
        details
          ? `Catalog allgoods failed: ${response.status} ${details}`
          : `Catalog allgoods failed: ${response.status}`
      );
    }

    const parsed = parseAllgoodsPayload(response.text);
    return {
      items: parsed.items.slice(0, limit),
      hasMore: parsed.hasMore,
      nextCursor: parsed.nextCursor,
    };
  }

  let cursor = "";
  for (let currentPage = 1; currentPage <= page; currentPage += 1) {
    const body: Record<string, unknown> = {
      ...requestBodyBase,
      [ALLGOODS_LIMIT_FIELD]: limit,
    };
    if (cursor) {
      body[ALLGOODS_CURSOR_FIELD] = cursor;
    }

    const response = await oneCRequest("allgoods", {
      method: "POST",
      body,
      timeoutMs: options.timeoutMs,
      retries: options.retries ?? 1,
      retryDelayMs: options.retryDelayMs ?? 250,
      cacheTtlMs: options.cacheTtlMs,
    });

    if (response.status < 200 || response.status >= 300) {
      const details = extractResponseErrorDetails(response.text);
      throw new Error(
        details
          ? `Catalog allgoods failed: ${response.status} ${details}`
          : `Catalog allgoods failed: ${response.status}`
      );
    }

    const parsed = parseAllgoodsPayload(response.text);
    if (currentPage === page) {
      return {
        items: parsed.items.slice(0, limit),
        hasMore: parsed.hasMore,
        nextCursor: parsed.nextCursor,
      };
    }

    if (!parsed.hasMore || !parsed.nextCursor || parsed.items.length < limit) {
      return {
        items: [] as CatalogProduct[],
        hasMore: false,
        nextCursor: "",
      };
    }

    cursor = parsed.nextCursor;
  }

  return {
    items: [] as CatalogProduct[],
    hasMore: false,
    nextCursor: "",
  };
};

const fetchAllgoodsProductsPage = async (options: {
  page?: number;
  limit?: number;
  body?: Record<string, unknown>;
  cursor?: string | null;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  cacheTtlMs?: number;
}) => (await fetchAllgoodsProductsPageDetailed(options)).items;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeFacetValue = (value: string | null | undefined) =>
  maybeFixMojibake((value || "").replace(/\s+/g, " ").trim()).toLowerCase();

const parseLoosePayloadText = (input: string): unknown => {
  let current: unknown = (input || "").trim();
  if (!current || current === '""') return null;

  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== "string") return current;
    const trimmed = current.trim();
    if (!trimmed || trimmed === '""') return null;

    try {
      current = JSON.parse(trimmed) as unknown;
    } catch {
      return depth === 0 ? null : current;
    }
  }

  return current;
};

const buildCatalogPriceLookupMap = (
  payload: unknown,
  lookupKeys?: readonly string[]
) => {
  const requested =
    Array.isArray(lookupKeys) && lookupKeys.length > 0
      ? new Set(
          lookupKeys
            .map((key) => normalizeFacetValue(key))
            .filter(Boolean)
        )
      : null;
  const prices = new Map<string, number>();
  const seenRecords = new WeakSet<Record<string, unknown>>();

  const addCandidate = (rawKey: string, price: number) => {
    const normalizedKey = normalizeFacetValue(rawKey);
    if (!normalizedKey) return;
    if (requested && !requested.has(normalizedKey)) return;
    if (!prices.has(normalizedKey)) {
      prices.set(normalizedKey, price);
    }
  };

  const visit = (value: unknown, depth = 0) => {
    if (depth > 6 || value == null) return;

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }

    const record = asRecord(value);
    if (!record || seenRecords.has(record)) return;
    seenRecords.add(record);

    const product = normalizeProduct(record);
    if (
      typeof product.priceEuro === "number" &&
      Number.isFinite(product.priceEuro) &&
      product.priceEuro > 0
    ) {
      addCandidate(product.code, product.priceEuro);
      addCandidate(product.article, product.priceEuro);
      addCandidate(readFirstString(record, [PRICE_CODE_FIELD, ...CODE_FIELDS]), product.priceEuro);
      addCandidate(readFirstString(record, ARTICLE_FIELDS), product.priceEuro);
    }

    for (const [entryKey, nested] of Object.entries(record)) {
      const directNumericPrice =
        typeof nested === "number"
          ? nested
          : typeof nested === "string"
            ? Number(nested.replace(/\s+/g, "").replace(",", "."))
            : Number.NaN;
      if (Number.isFinite(directNumericPrice) && directNumericPrice > 0) {
        addCandidate(entryKey, directNumericPrice);
      }

      visit(nested, depth + 1);
    }
  };

  visit(payload);
  return prices;
};

export const toPriceUah = (priceEuro: number | null, euroRate: number) => {
  if (typeof priceEuro !== "number" || !Number.isFinite(priceEuro) || priceEuro <= 0) {
    return null;
  }
  return Math.round(priceEuro * euroRate);
};

const enrichProductsWithAllgoodsPrices = async (
  items: CatalogProduct[],
  options?: {
    timeoutMs?: number;
    cacheTtlMs?: number;
    maxKeys?: number;
  }
) => {
  if (!Array.isArray(items) || items.length === 0) return items;

  const lookupKeys = Array.from(
    new Set(
      items
        .flatMap((item) => [item.article, item.code])
        .map((value) => normalizeFacetValue(value))
        .filter(Boolean)
    )
  ).slice(0, options?.maxKeys && options.maxKeys > 0 ? options.maxKeys : 120);

  if (lookupKeys.length === 0) return items;

  const lookupPrices = await fetchPriceEuroMapByLookupKeys(lookupKeys, {
    sourceTimeoutMs: options?.timeoutMs,
    sourceCacheTtlMs: options?.cacheTtlMs,
    timeoutMs: options?.timeoutMs,
    retries: 0,
    retryDelayMs: 120,
    cacheTtlMs: options?.cacheTtlMs ?? 1000 * 60 * 5,
    includeDirectLookup: true,
    includePricesPost: false,
    directConcurrency: 6,
    maxKeys: lookupKeys.length,
  }).catch(() => ({} as Record<string, number>));

  if (Object.keys(lookupPrices).length === 0) return items;

  return items.map((item) => {
    if (
      typeof item.priceEuro === "number" &&
      Number.isFinite(item.priceEuro) &&
      item.priceEuro > 0
    ) {
      return item;
    }

    const articleKey = normalizeFacetValue(item.article);
    const codeKey = normalizeFacetValue(item.code);
    const resolvedPrice =
      (articleKey ? lookupPrices[articleKey] : undefined) ??
      (codeKey ? lookupPrices[codeKey] : undefined);

    if (typeof resolvedPrice !== "number" || !Number.isFinite(resolvedPrice) || resolvedPrice <= 0) {
      return item;
    }

    return {
      ...item,
      priceEuro: resolvedPrice,
    };
  });
};

export const fetchCatalogProductsPage = async (options: {
  page: number;
  limit?: number;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  cacheTtlMs?: number;
}) => {
  const page = Number.isFinite(options.page) && options.page > 0 ? options.page : 1;
  const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0
    ? options.limit
    : 50;

  const body: Record<string, unknown> = {
    [PAGE_FIELD]: page,
    page,
    [OFFSET_FIELD]: (page - 1) * limit,
    [LIMIT_FIELD]: limit,
  };

  const response = await oneCRequest("getdata", {
    method: "POST",
    body,
    timeoutMs: options.timeoutMs,
    retries: options.retries ?? 1,
    retryDelayMs: options.retryDelayMs ?? 250,
    cacheTtlMs:
      options.cacheTtlMs ??
      (page === 1 ? 1000 * 20 : 1000 * 15),
  });

  if (response.status < 200 || response.status >= 300) return [];
  return await enrichProductsWithAllgoodsPrices(parseItemsFromText(response.text), {
    timeoutMs: options.timeoutMs,
    cacheTtlMs: options.cacheTtlMs,
    maxKeys: limit * 2,
  });
};

export const fetchCatalogProductsByQuery = async (options: {
  page?: number;
  limit?: number;
  selectedCars?: string[];
  selectedCategories?: string[];
  searchQuery?: string;
  searchFilter?: CatalogSearchFilter;
  group?: string | null;
  subcategory?: string | null;
  producer?: string | null;
  sortOrder?: "none" | "asc" | "desc";
  cursor?: string | null;
  cursorField?: string | null;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  cacheTtlMs?: number;
}): Promise<CatalogQueryPageResult> => {
  const page =
    Number.isFinite(options.page) && (options.page || 0) > 0
      ? Math.floor(options.page as number)
      : 1;
  const limit =
    Number.isFinite(options.limit) && (options.limit || 0) > 0
      ? Math.floor(options.limit as number)
      : 10;
  const selectedCars = Array.isArray(options.selectedCars)
    ? options.selectedCars.filter((value) => typeof value === "string")
    : [];
  const selectedCategories = Array.isArray(options.selectedCategories)
    ? options.selectedCategories.filter((value) => typeof value === "string")
    : [];
  const searchFilter = options.searchFilter || "all";
  const searchQuery = (options.searchQuery || "").replace(/\s+/g, " ").trim();
  const group = (options.group || "").trim();
  const subcategory = (options.subcategory || "").trim();
  const producer = (options.producer || "").trim();
  const sortOrder = options.sortOrder || "none";
  const cursor = typeof options.cursor === "string" ? options.cursor.trim() : "";
  const cursorField = typeof options.cursorField === "string" ? options.cursorField.trim() : "";
  const canUseAllgoods = selectedCars.length === 0;

  const baseBody: Record<string, unknown> = {
    selectedCars,
    selectedCategories,
    [PAGE_FIELD]: page,
    page,
    [OFFSET_FIELD]: (page - 1) * limit,
    [LIMIT_FIELD]: limit,
  };

  const normalizeForFilter = (value: string) => value.replace(/\s+/g, " ").trim();
  const producerName = normalizeForFilter(
    producer || (searchFilter === "producer" ? searchQuery : "")
  );

  if (producerName) {
    for (const key of PRODUCER_FIELDS) baseBody[key] = producerName;
  }

  let primaryKeys: string[] | null = null;
  let fallbackKeys: string[] | null = null;

  if (searchQuery) {
    if (searchFilter === "name") {
      primaryKeys = [...NAME_FIELDS];
    } else if (searchFilter === "code") {
      primaryKeys = [...CODE_FIELDS];
    } else if (searchFilter === "article") {
      primaryKeys = [...ARTICLE_FIELDS];
    } else if (searchFilter === "producer") {
      primaryKeys = [...PRODUCER_FIELDS];
    } else {
      primaryKeys = [...NAME_FIELDS];
      fallbackKeys = [...ARTICLE_FIELDS, ...CODE_FIELDS];
    }
  }

  const applySearchKeys = (
    body: Record<string, unknown>,
    keys: string[],
    value: string
  ) => {
    for (const key of keys) body[key] = value;
  };

  if (group && !subcategory) {
    for (const key of SUBGROUP_FIELDS) baseBody[key] = group;
    for (const key of GROUP_FIELDS) baseBody[key] = group;
  } else if (subcategory) {
    for (const key of GROUP_FIELDS) baseBody[key] = group;
    for (const key of SUBGROUP_FIELDS) baseBody[key] = subcategory;
  } else if (selectedCategories.length > 0) {
    const picked = selectedCategories[0];
    for (const key of SUBGROUP_FIELDS) baseBody[key] = picked;
  }

  if (canUseAllgoods) {
    const allgoodsBaseBody: Record<string, unknown> = {};
    allgoodsBaseBody[ALLGOODS_INCLUDE_DESCRIPTION_FIELD] = false;

    if (producerName) {
      allgoodsBaseBody[ALLGOODS_PRODUCER_FIELD] = producerName;
    }

    if (sortOrder === "asc") {
      allgoodsBaseBody[ALLGOODS_SORT_PRICE_FIELD] = "ASC";
    } else if (sortOrder === "desc") {
      allgoodsBaseBody[ALLGOODS_SORT_PRICE_FIELD] = "DESC";
    }

    if (group && !subcategory) {
      allgoodsBaseBody[ALLGOODS_GROUP_FIELD] = group;
    } else if (subcategory) {
      if (group) allgoodsBaseBody[ALLGOODS_GROUP_FIELD] = group;
      allgoodsBaseBody[ALLGOODS_SUBGROUP_FIELD] = subcategory;
    } else if (selectedCategories.length > 0) {
      allgoodsBaseBody[ALLGOODS_SUBGROUP_FIELD] = selectedCategories[0];
    }

    const allgoodsSearchKeys = (() => {
      if (!searchQuery) return [] as string[];
      if (searchFilter === "name") return [ALLGOODS_NAME_FIELD];
      if (searchFilter === "code") return [ALLGOODS_CODE_FIELD];
      if (searchFilter === "article") return [ALLGOODS_ARTICLE_FIELD];
      if (searchFilter === "producer") return [ALLGOODS_PRODUCER_FIELD];
      return [ALLGOODS_NAME_FIELD, ALLGOODS_ARTICLE_FIELD, ALLGOODS_CODE_FIELD];
    })();

    const runAllgoods = async (searchKey?: string) => {
      const body: Record<string, unknown> = { ...allgoodsBaseBody };
      if (searchQuery && searchKey) {
        body[searchKey] = searchQuery;
      }
      return fetchAllgoodsProductsPageDetailed({
        page,
        limit,
        body,
        cursor,
        timeoutMs: options.timeoutMs,
        retries: options.retries,
        retryDelayMs: options.retryDelayMs,
        cacheTtlMs:
          options.cacheTtlMs ??
          (page === 1 ? 1000 * 20 : 1000 * 15),
      });
    };

    try {
      const effectiveAllgoodsSearchKeys =
        searchQuery && cursor && cursorField && allgoodsSearchKeys.includes(cursorField)
          ? [cursorField]
          : allgoodsSearchKeys;

      if (effectiveAllgoodsSearchKeys.length === 0) {
        const pageResult = await runAllgoods();
        return {
          ...pageResult,
          cursorField: null,
        };
      }

      for (const searchKey of effectiveAllgoodsSearchKeys) {
        const pageResult = await runAllgoods(searchKey);
        if (pageResult.items.length > 0 || cursor) {
          return {
            ...pageResult,
            cursorField: searchKey,
          };
        }
      }
    } catch {
      // Fall back to the legacy getdata integration below.
    }
  }

  const makeBody = (keys: string[] | null) => {
    const body = { ...baseBody };
    if (searchQuery && keys) {
      applySearchKeys(body, keys, searchQuery);
    }
    return body;
  };

  const runRequest = async (keys: string[] | null) => {
    const response = await oneCRequest("getdata", {
      method: "POST",
      body: makeBody(keys),
      timeoutMs: options.timeoutMs,
      retries: options.retries ?? 1,
      retryDelayMs: options.retryDelayMs ?? 250,
      cacheTtlMs:
        options.cacheTtlMs ??
        (page === 1 ? 1000 * 20 : 1000 * 15),
    });

    if (response.status < 200 || response.status >= 300) {
      let details = "";
      try {
        const parsed = JSON.parse(response.text) as { details?: unknown; error?: unknown };
        details =
          typeof parsed?.details === "string"
            ? parsed.details
            : typeof parsed?.error === "string"
              ? parsed.error
              : "";
      } catch {}

      throw new Error(
        details
          ? `Catalog getdata failed: ${response.status} ${details}`
          : `Catalog getdata failed: ${response.status}`
      );
    }
    const items = await enrichProductsWithAllgoodsPrices(parseItemsFromText(response.text), {
      timeoutMs: options.timeoutMs,
      cacheTtlMs:
        options.cacheTtlMs ??
        (page === 1 ? 1000 * 20 : 1000 * 15),
      maxKeys: limit * 2,
    });
    return {
      items,
      hasMore: items.length >= limit,
      nextCursor: "",
      cursorField: null,
    };
  };

  let normalized = await runRequest(primaryKeys);
  if (normalized.items.length === 0 && fallbackKeys) {
    normalized = await runRequest(fallbackKeys);
  }

  return normalized;
};

export const fetchCatalogProductsByFacet = async (options: {
  group?: string;
  subGroup?: string;
  producer?: string;
  page?: number;
  limit?: number;
}) => {
  const page = Number.isFinite(options.page) && options.page && options.page > 0
    ? options.page
    : 1;
  const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0
    ? options.limit
    : 24;
  const group = (options.group || "").trim();
  const subGroup = (options.subGroup || "").trim();
  const producer = (options.producer || "").trim();

  const body: Record<string, unknown> = {
    [PAGE_FIELD]: page,
    page,
    [OFFSET_FIELD]: (page - 1) * limit,
    [LIMIT_FIELD]: limit,
  };

  if (producer) {
    for (const key of PRODUCER_FIELDS) body[key] = producer;
  }

  if (group && !subGroup) {
    for (const key of SUBGROUP_FIELDS) body[key] = group;
    for (const key of GROUP_FIELDS) body[key] = group;
  } else if (subGroup) {
    for (const key of GROUP_FIELDS) body[key] = group;
    for (const key of SUBGROUP_FIELDS) body[key] = subGroup;
  }

  const allgoodsBody: Record<string, unknown> = {};
  if (producer) {
    allgoodsBody[ALLGOODS_PRODUCER_FIELD] = producer;
  }
  if (group && !subGroup) {
    allgoodsBody[ALLGOODS_GROUP_FIELD] = group;
  } else if (subGroup) {
    if (group) allgoodsBody[ALLGOODS_GROUP_FIELD] = group;
    allgoodsBody[ALLGOODS_SUBGROUP_FIELD] = subGroup;
  }

  try {
    return await fetchAllgoodsProductsPage({
      page,
      limit,
      body: allgoodsBody,
      retries: 1,
      retryDelayMs: 200,
      cacheTtlMs: 1000 * 60 * 3,
    });
  } catch {
    // Fall back to the legacy getdata source below.
  }

  const response = await oneCRequest("getdata", {
    method: "POST",
    body,
    retries: 1,
    retryDelayMs: 200,
    cacheTtlMs: 1000 * 60 * 3,
  });

  if (response.status < 200 || response.status >= 300) return [];
  return parseItemsFromText(response.text);
};

export const findCatalogProductByCode = async (
  inputCode: string,
  options?: {
    lookupLimit?: number;
    fallbackPages?: number;
    pageSize?: number;
    timeoutMs?: number;
    retries?: number;
    retryDelayMs?: number;
    cacheTtlMs?: number;
  }
) => {
  const normalizedInput = safeDecode(inputCode || "").trim();
  const targetCode = normalizedInput.toLowerCase();
  if (!normalizedInput) return null;
  const lookupLimit =
    Number.isFinite(options?.lookupLimit) && (options?.lookupLimit || 0) > 0
      ? Math.floor(options?.lookupLimit as number)
      : 50;
  const fallbackPages =
    Number.isFinite(options?.fallbackPages) && (options?.fallbackPages || 0) > 0
      ? Math.floor(options?.fallbackPages as number)
      : 8;
  const pageSize =
    Number.isFinite(options?.pageSize) && (options?.pageSize || 0) > 0
      ? Math.floor(options?.pageSize as number)
      : 80;

  // Fast path: query getdata by code aliases.
  const lookupBody: Record<string, unknown> = {
    [PAGE_FIELD]: 1,
    page: 1,
    [OFFSET_FIELD]: 0,
    [LIMIT_FIELD]: lookupLimit,
  };
  for (const key of CODE_FIELDS) lookupBody[key] = normalizedInput;

  const lookupResponse = await oneCRequest("getdata", {
    method: "POST",
    body: lookupBody,
    timeoutMs: options?.timeoutMs,
    retries: options?.retries ?? 1,
    retryDelayMs: options?.retryDelayMs ?? 250,
    cacheTtlMs: options?.cacheTtlMs ?? 1000 * 30,
  });

  if (lookupResponse.status >= 200 && lookupResponse.status < 300) {
    const candidates = await enrichProductsWithAllgoodsPrices(
      parseItemsFromText(lookupResponse.text),
      {
        timeoutMs: options?.timeoutMs,
        cacheTtlMs: options?.cacheTtlMs ?? 1000 * 30,
        maxKeys: lookupLimit * 2,
      }
    );
    const exact = candidates.find((item) => item.code.trim().toLowerCase() === targetCode);
    if (exact) return exact;
    const byArticle = candidates.find(
      (item) => item.article.trim().toLowerCase() === targetCode
    );
    if (byArticle) return byArticle;
    if (candidates.length > 0) return candidates[0];
  }

  // Fallback: scan first pages in case backend ignores search fields.
  for (let page = 1; page <= fallbackPages; page += 1) {
    const batch = await fetchCatalogProductsPage({
      page,
      limit: pageSize,
      timeoutMs: options?.timeoutMs,
      retries: options?.retries ?? 1,
      retryDelayMs: options?.retryDelayMs ?? 200,
      cacheTtlMs: options?.cacheTtlMs ?? 1000 * 20,
    });
    if (batch.length === 0) break;

    const exact = batch.find((item) => item.code.trim().toLowerCase() === targetCode);
    if (exact) return exact;

    const byArticle = batch.find((item) => item.article.trim().toLowerCase() === targetCode);
    if (byArticle) return byArticle;
  }

  return null;
};

interface OneCLookupOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  cacheTtlMs?: number;
}

export const fetchPriceEuro = async (
  codeOrArticle: string,
  options?: OneCLookupOptions
) => {
  const normalized = (codeOrArticle || "").trim();
  if (!normalized) return null;
  const timeoutMs = options?.timeoutMs;
  const retries = options?.retries ?? 1;
  const retryDelayMs = options?.retryDelayMs ?? 200;
  const cacheTtlMs = options?.cacheTtlMs ?? 1000 * 60 * 3;

  const allgoodsBodies: Array<Record<string, unknown>> = [
    {
      [ALLGOODS_LIMIT_FIELD]: 1,
      [ALLGOODS_CODE_FIELD]: normalized,
    },
    {
      [ALLGOODS_LIMIT_FIELD]: 1,
      [ALLGOODS_ARTICLE_FIELD]: normalized,
    },
  ];

  const seenBodies = new Set<string>();
  for (const body of allgoodsBodies) {
    const serializedBody = JSON.stringify(body);
    if (seenBodies.has(serializedBody)) continue;
    seenBodies.add(serializedBody);

    const response = await oneCRequest("allgoods", {
      method: "POST",
      body,
      timeoutMs,
      retries,
      retryDelayMs,
      cacheTtlMs,
      cacheKey: JSON.stringify({
        endpoint: "allgoods",
        body,
        timeoutMs: timeoutMs ?? null,
        retries,
        retryDelayMs,
      }),
    });

    if (response.status < 200 || response.status >= 300) {
      continue;
    }

    const { items } = parseAllgoodsPayload(response.text);
    const directMatch = items.find((item) => {
      const normalizedCode = normalizeFacetValue(item.code);
      const normalizedArticle = normalizeFacetValue(item.article);
      const target = normalizeFacetValue(normalized);
      return normalizedCode === target || normalizedArticle === target;
    });
    const matchedItem = directMatch || items[0] || null;
    if (!matchedItem) continue;

    const price =
      typeof matchedItem.priceEuro === "number" && Number.isFinite(matchedItem.priceEuro)
        ? matchedItem.priceEuro
        : Number.NaN;

    if (Number.isFinite(price) && price > 0) {
      return price;
    }
  }

  const response = await oneCRequest("prices", {
    method: "POST",
    body: { [PRICE_CODE_FIELD]: normalized },
    timeoutMs,
    retries,
    retryDelayMs,
    cacheTtlMs,
    cacheKey: JSON.stringify({
      endpoint: "prices",
      code: normalized,
      timeoutMs: timeoutMs ?? null,
      retries,
      retryDelayMs,
    }),
  });

  if (response.status < 200 || response.status >= 300) return null;

  try {
    const parsed = JSON.parse(response.text) as Record<string, unknown>;
    const price = readFirstNumber(parsed, PRICE_FIELDS, Number.NaN);
    if (!Number.isFinite(price) || price <= 0) return null;
    return price;
  } catch {
    return null;
  }
};

export const fetchPriceEuroMapByLookupKeys = async (
  lookupKeys: string[],
  options?: OneCLookupOptions & {
    sourceTimeoutMs?: number;
    sourceCacheTtlMs?: number;
    includeDirectLookup?: boolean;
    includePricesPost?: boolean;
    directConcurrency?: number;
    maxKeys?: number;
  }
) => {
  const maxKeys =
    Number.isFinite(options?.maxKeys) && (options?.maxKeys || 0) > 0
      ? Math.floor(options?.maxKeys as number)
      : 96;
  const normalizedKeys = Array.from(
    new Set(lookupKeys.map((key) => normalizeFacetValue(key)).filter(Boolean))
  ).slice(0, maxKeys);

  if (normalizedKeys.length === 0) {
    return {} as Record<string, number>;
  }

  const resolved = new Map<string, number>();
  const preloaded = await fetchCatalogPricesByLookupKeys(normalizedKeys, {
    timeoutMs: options?.sourceTimeoutMs,
    cacheTtlMs: options?.sourceCacheTtlMs,
    includePricesPost: options?.includePricesPost,
  }).catch(() => ({} as Record<string, number>));

  for (const [key, value] of Object.entries(preloaded)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    resolved.set(key.trim().toLowerCase(), value);
  }

  if (options?.includeDirectLookup === false) {
    return Object.fromEntries(resolved);
  }

  const unresolvedKeys = normalizedKeys.filter((key) => !resolved.has(key));
  if (unresolvedKeys.length === 0) {
    return Object.fromEntries(resolved);
  }

  let cursor = 0;
  const workerCount = Math.min(
    Number.isFinite(options?.directConcurrency) && (options?.directConcurrency || 0) > 0
      ? Math.floor(options?.directConcurrency as number)
      : 6,
    unresolvedKeys.length
  );
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < unresolvedKeys.length) {
      const currentIndex = cursor;
      cursor += 1;

      const key = unresolvedKeys[currentIndex];
      const price = await fetchPriceEuro(key, {
        timeoutMs: options?.timeoutMs,
        retries: options?.retries,
        retryDelayMs: options?.retryDelayMs,
        cacheTtlMs: options?.cacheTtlMs,
      }).catch(() => null);

      if (typeof price === "number" && Number.isFinite(price) && price > 0) {
        resolved.set(key, price);
      }
    }
  });

  await Promise.allSettled(workers);
  return Object.fromEntries(resolved);
};

export const fetchCatalogPricesByLookupKeys = async (
  lookupKeys: string[],
  options?: {
    timeoutMs?: number;
    cacheTtlMs?: number;
    includePricesPost?: boolean;
  }
) => {
  const normalizedKeys = Array.from(
    new Set(lookupKeys.map((key) => normalizeFacetValue(key)).filter(Boolean))
  );
  if (normalizedKeys.length === 0) {
    return {} as Record<string, number>;
  }

  const mergeFromResponse = (text: string, target: Map<string, number>) => {
    const payload = parseLoosePayloadText(text);
    if (payload == null) return;

    const nextMap = buildCatalogPriceLookupMap(payload, normalizedKeys);
    for (const [key, value] of nextMap.entries()) {
      if (!target.has(key)) {
        target.set(key, value);
      }
    }
  };

  const resolved = new Map<string, number>();
  const timeoutMs =
    Number.isFinite(options?.timeoutMs) && (options?.timeoutMs || 0) > 0
      ? Math.floor(options?.timeoutMs as number)
      : 2200;
  const cacheTtlMs =
    Number.isFinite(options?.cacheTtlMs) && (options?.cacheTtlMs || 0) > 0
      ? Math.floor(options?.cacheTtlMs as number)
      : 1000 * 12;
  const sourceReaders: Array<() => Promise<Awaited<ReturnType<typeof oneCRequest>> | null>> = [
    async () =>
      oneCRequest("allgoods", {
        method: "POST",
        body: {
          [ALLGOODS_LIMIT_FIELD]: Math.min(500, Math.max(normalizedKeys.length * 6, 120)),
        },
        timeoutMs,
        retries: 0,
        cacheTtlMs,
        cacheKey: JSON.stringify({
          endpoint: "allgoods",
          body: {
            [ALLGOODS_LIMIT_FIELD]: Math.min(500, Math.max(normalizedKeys.length * 6, 120)),
          },
        }),
      }).catch(() => null),
  ];

  const attempts = sourceReaders.map((reader, index) =>
    Promise.resolve()
      .then(() => reader())
      .then((response) => ({ index, response }))
      .catch(() => ({ index, response: null }))
  );

  const pending = new Set<number>(attempts.map((_, index) => index));
  while (pending.size > 0 && resolved.size < normalizedKeys.length) {
    const result = await Promise.race(
      Array.from(pending, (index) => attempts[index])
    );
    pending.delete(result.index);

    const response = result.response;
    if (!response) continue;
    if (response.status < 200 || response.status >= 300) continue;

    mergeFromResponse(response.text, resolved);
  }

  return Object.fromEntries(resolved);
};

const refreshEuroRate = async () => {
  if (euroRateRefreshPromise) return euroRateRefreshPromise;

  euroRateRefreshPromise = (async () => {
    const now = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const response = await fetch(PRIVAT_URL, {
        cache: "no-store",
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
      if (!response.ok) return cachedEuroRate;

      const payload = (await response.json()) as Array<{ ccy?: string; sale?: string }>;
      const euro = Array.isArray(payload)
        ? payload.find((item) => item?.ccy === "EUR")
        : null;

      const sale = euro?.sale ? Number(euro.sale) : Number.NaN;
      if (Number.isFinite(sale) && sale > 0) {
        cachedEuroRate = sale;
        lastEuroFetchAt = now;
      }
    } catch {
      // Keep previous cached value.
    }

    return cachedEuroRate;
  })().finally(() => {
    euroRateRefreshPromise = null;
  });

  return euroRateRefreshPromise;
};

export const fetchEuroRate = async () => {
  const now = Date.now();
  if (lastEuroFetchAt > 0 && now - lastEuroFetchAt < EURO_RATE_TTL_MS) {
    return cachedEuroRate;
  }

  if (lastEuroFetchAt > 0) {
    void refreshEuroRate();
    return cachedEuroRate;
  }

  return refreshEuroRate();
};

export const fetchProductDescription = async (
  articleOrCode: string,
  options?: OneCLookupOptions
) => {
  const normalized = (articleOrCode || "").trim();
  if (!normalized) return null;

  const response = await oneCRequest("getinfo", {
    method: "POST",
    body: { [INFO_ARTICLE_FIELD]: normalized },
    timeoutMs: options?.timeoutMs,
    retries: options?.retries ?? 1,
    retryDelayMs: options?.retryDelayMs ?? 200,
    cacheTtlMs: options?.cacheTtlMs ?? 1000 * 60 * 30,
  });

  if (response.status < 200 || response.status >= 300) return null;

  try {
    const payload = JSON.parse(response.text) as Record<string, unknown>;
    for (const key of INFO_DESC_FIELDS) {
      const value = payload?.[key];
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  } catch {
    return null;
  }

  return null;
};

export const collectCatalogProductCodes = async (options?: {
  maxPages?: number;
  maxItems?: number;
  pageSize?: number;
}) => {
  const maxPages = options?.maxPages && options.maxPages > 0 ? options.maxPages : 120;
  const maxItems = options?.maxItems && options.maxItems > 0 ? options.maxItems : 6000;
  const pageSize = options?.pageSize && options.pageSize > 0 ? options.pageSize : 80;

  const codes = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await fetchCatalogProductsPage({ page, limit: pageSize });
    if (batch.length === 0) break;

    for (const item of batch) {
      const code = item.code.trim();
      if (!code) continue;
      codes.add(code);
      if (codes.size >= maxItems) break;
    }

    if (codes.size >= maxItems) break;
  }

  return Array.from(codes);
};

export const findSimilarProductsBySubgroup = async (
  product: CatalogProduct,
  options?: {
    limit?: number;
    maxPages?: number;
    pageSize?: number;
  }
) => {
  const limit = options?.limit && options.limit > 0 ? options.limit : 6;
  const maxPages = options?.maxPages && options.maxPages > 0 ? options.maxPages : 2;
  const pageSize = options?.pageSize && options.pageSize > 0 ? options.pageSize : 80;

  const targetCode = normalizeFacetValue(product.code);
  const targetArticle = normalizeFacetValue(product.article);
  const targetSubgroup = normalizeFacetValue(product.subGroup);
  const targetGroup = normalizeFacetValue(product.group || product.category);
  const targetProducer = normalizeFacetValue(product.producer);

  if (!targetSubgroup && !targetGroup) return [];

  const rankProducts = (items: CatalogProduct[]) => {
    const results: Array<{ item: CatalogProduct; score: number }> = [];
    const seen = new Set<string>();

    for (const item of items) {
      const itemCode = normalizeFacetValue(item.code);
      const itemArticle = normalizeFacetValue(item.article);
      if ((targetCode && itemCode === targetCode) || (targetArticle && itemArticle === targetArticle)) {
        continue;
      }

      const itemSubgroup = normalizeFacetValue(item.subGroup);
      const itemGroup = normalizeFacetValue(item.group || item.category);
      const matchesSubgroup = targetSubgroup ? itemSubgroup === targetSubgroup : false;
      const matchesGroup = !targetSubgroup && targetGroup ? itemGroup === targetGroup : false;
      if (!matchesSubgroup && !matchesGroup) continue;

      const dedupeKey = itemCode || itemArticle || `${item.name}:${itemGroup}:${itemSubgroup}`;
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      let score = 0;
      if (matchesSubgroup) score += 5;
      if (targetGroup && itemGroup === targetGroup) score += 2;
      if (targetProducer && normalizeFacetValue(item.producer) === targetProducer) score += 1;
      if (item.quantity > 0) score += 1;

      results.push({ item, score });
    }

    return results
      .sort((left, right) => right.score - left.score || right.item.quantity - left.item.quantity)
      .slice(0, limit)
      .map((entry) => entry.item);
  };

  const directBatch = await fetchCatalogProductsByFacet({
    group: product.group || product.category,
    subGroup: product.subGroup,
    page: 1,
    limit: Math.max(limit * 4, 24),
  });
  const directResults = rankProducts(directBatch);
  if (directResults.length > 0) return directResults;

  const fallbackBatch: CatalogProduct[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await fetchCatalogProductsPage({ page, limit: pageSize });
    if (batch.length === 0) break;
    fallbackBatch.push(...batch);
  }

  return rankProducts(fallbackBatch);
};

export const fetchCatalogProductsByArticle = async (
  article: string,
  options?: {
    limit?: number;
    page?: number;
  }
) => {
  const normalizedArticle = (article || "").trim();
  if (!normalizedArticle) return [];

  const page = Number.isFinite(options?.page) && (options?.page || 0) > 0
    ? Math.floor(options?.page as number)
    : 1;
  const limit = Number.isFinite(options?.limit) && (options?.limit || 0) > 0
    ? Math.floor(options?.limit as number)
    : 36;

  const body: Record<string, unknown> = {
    [PAGE_FIELD]: page,
    page,
    [OFFSET_FIELD]: (page - 1) * limit,
    [LIMIT_FIELD]: limit,
    [INFO_ARTICLE_FIELD]: normalizedArticle,
  };

  for (const key of ARTICLE_FIELDS) {
    body[key] = normalizedArticle;
  }

  const response = await oneCRequest("getdata", {
    method: "POST",
    body,
    retries: 1,
    retryDelayMs: 200,
    cacheTtlMs: 1000 * 60 * 3,
  });

  if (response.status < 200 || response.status >= 300) return [];

  const enriched = await enrichProductsWithAllgoodsPrices(parseItemsFromText(response.text), {
    cacheTtlMs: 1000 * 60 * 3,
    maxKeys: limit * 2,
  });

  const target = normalizeFacetValue(normalizedArticle);
  const seen = new Set<string>();
  const filtered: CatalogProduct[] = [];

  for (const item of enriched) {
    const itemArticle = normalizeFacetValue(item.article);
    const itemCode = normalizeFacetValue(item.code);
    const itemName = normalizeFacetValue(item.name);

    const matches =
      (target && itemArticle === target) ||
      (target && itemArticle.includes(target)) ||
      (target && itemCode === target) ||
      (target && itemName.includes(target));

    if (!matches) continue;

    const dedupeKey = itemCode || itemArticle || `${item.name}:${item.producer}`;
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    filtered.push(item);
  }

  return filtered.slice(0, limit);
};

const normalizeArticleSearchToken = (value: string | null | undefined) =>
  normalizeFacetValue(value).replace(/[\s\-_.\\/]+/g, "");

const productNameContainsArticle = (productName: string, article: string) => {
  const normalizedName = normalizeFacetValue(productName);
  const normalizedArticle = normalizeFacetValue(article);
  const compactName = normalizeArticleSearchToken(productName);
  const compactArticle = normalizeArticleSearchToken(article);

  if (!normalizedName || !normalizedArticle) return false;
  if (normalizedName.includes(normalizedArticle)) return true;
  if (!compactName || !compactArticle) return false;

  return compactName.includes(compactArticle);
};

export const findAnalogProductsByArticleInName = async (
  product: CatalogProduct,
  options?: {
    limit?: number;
    maxPages?: number;
    pageSize?: number;
  }
) => {
  const limit = options?.limit && options.limit > 0 ? options.limit : 6;
  const maxPages = options?.maxPages && options.maxPages > 0 ? options.maxPages : 3;
  const pageSize = options?.pageSize && options.pageSize > 0 ? options.pageSize : 80;

  const targetCode = normalizeFacetValue(product.code);
  const targetArticle = normalizeFacetValue(product.article);
  const targetSubgroup = normalizeFacetValue(product.subGroup);
  const targetGroup = normalizeFacetValue(product.group || product.category);
  const targetProducer = normalizeFacetValue(product.producer);

  if (!targetArticle) return [];

  const rankProducts = (items: CatalogProduct[]) => {
    const results: Array<{ item: CatalogProduct; score: number }> = [];
    const seen = new Set<string>();

    for (const item of items) {
      const itemCode = normalizeFacetValue(item.code);
      const itemArticle = normalizeFacetValue(item.article);
      if ((targetCode && itemCode === targetCode) || (targetArticle && itemArticle === targetArticle)) {
        continue;
      }

      if (!productNameContainsArticle(item.name, targetArticle)) continue;

      const itemSubgroup = normalizeFacetValue(item.subGroup);
      const itemGroup = normalizeFacetValue(item.group || item.category);
      const itemProducer = normalizeFacetValue(item.producer);
      const dedupeKey = itemCode || itemArticle || `${item.name}:${itemGroup}:${itemSubgroup}`;
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      let score = 0;
      if (item.quantity > 0) score += 2;
      if (targetProducer && itemProducer === targetProducer) score += 3;
      if (targetSubgroup && itemSubgroup === targetSubgroup) score += 4;
      if (targetGroup && itemGroup === targetGroup) score += 2;
      if (normalizeFacetValue(item.name).includes(targetArticle)) score += 3;

      results.push({ item, score });
    }

    return results
      .sort((left, right) => right.score - left.score || right.item.quantity - left.item.quantity)
      .slice(0, limit)
      .map((entry) => entry.item);
  };

  const directBatch = await fetchCatalogProductsByFacet({
    group: product.group || product.category,
    subGroup: product.subGroup,
    page: 1,
    limit: Math.max(limit * 12, 72),
  });
  const directResults = rankProducts(directBatch);
  if (directResults.length >= Math.min(3, limit)) return directResults;

  const fallbackBatch: CatalogProduct[] = [...directBatch];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await fetchCatalogProductsPage({ page, limit: pageSize });
    if (batch.length === 0) break;
    fallbackBatch.push(...batch);
  }

  return rankProducts(fallbackBatch);
};

export const fetchCatalogProductsByHeaderSearchQuery = async (
  query: string,
  options?: {
    page?: number;
    limit?: number;
  }
) => {
  const normalizedQuery = (query || "").replace(/\s+/g, " ").trim();
  if (!normalizedQuery) return [];

  const page =
    Number.isFinite(options?.page) && (options?.page || 0) > 0
      ? Math.floor(options?.page as number)
      : 1;
  const limit =
    Number.isFinite(options?.limit) && (options?.limit || 0) > 0
      ? Math.floor(options?.limit as number)
      : 48;

  const baseBody: Record<string, unknown> = {
    [PAGE_FIELD]: page,
    page,
    [OFFSET_FIELD]: (page - 1) * limit,
    [LIMIT_FIELD]: limit,
  };

  const makeBody = (keys: string[]) => {
    const body: Record<string, unknown> = { ...baseBody };
    for (const key of keys) body[key] = normalizedQuery;
    return body;
  };

  const run = async (keys: string[]) => {
    const response = await oneCRequest("getdata", {
      method: "POST",
      body: makeBody(keys),
      retries: 1,
      retryDelayMs: 200,
      cacheTtlMs: 1000 * 60 * 2,
    });
    if (response.status < 200 || response.status >= 300) return [];
    return parseItemsFromText(response.text);
  };

  const primary = await run([...NAME_FIELDS]);
  if (primary.length > 0) return primary.slice(0, limit);

  const fallback = await run([...ARTICLE_FIELDS, ...CODE_FIELDS]);
  return fallback.slice(0, limit);
};
