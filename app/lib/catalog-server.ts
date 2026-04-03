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
}

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

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeFacetValue = (value: string | null | undefined) =>
  maybeFixMojibake((value || "").replace(/\s+/g, " ").trim()).toLowerCase();

export const toPriceUah = (priceEuro: number | null, euroRate: number) => {
  if (typeof priceEuro !== "number" || !Number.isFinite(priceEuro) || priceEuro <= 0) {
    return null;
  }
  return Math.round(priceEuro * euroRate);
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
  return parseItemsFromText(response.text);
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
    const candidates = parseItemsFromText(lookupResponse.text);
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

  const response = await oneCRequest("prices", {
    method: "POST",
    body: { [PRICE_CODE_FIELD]: normalized },
    timeoutMs: options?.timeoutMs,
    retries: options?.retries ?? 1,
    retryDelayMs: options?.retryDelayMs ?? 200,
    cacheTtlMs: options?.cacheTtlMs ?? 1000 * 60 * 3,
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

  const target = normalizeFacetValue(normalizedArticle);
  const seen = new Set<string>();
  const filtered: CatalogProduct[] = [];

  for (const item of parseItemsFromText(response.text)) {
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
