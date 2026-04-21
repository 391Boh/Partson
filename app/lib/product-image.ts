import "server-only";

import { oneCRequest } from "app/api/_lib/oneC";
import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";

export { PRODUCT_IMAGE_FALLBACK_PATH };

type ProductImageLookupOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  cacheTtlMs?: number;
  missCacheTtlMs?: number;
  allowUrlDownload?: boolean;
  skipMissCache?: boolean;
};

type ProductImageBatchResponseMatch = {
  resolved: Record<string, string>;
  handledKeys: Set<string>;
};

const IMAGE_BASE64_FIELDS = [
  "image_base64",
  "imageBase64",
  "ImageBase64",
  "base64",
  "Base64",
  "image",
  "Image",
  "data",
  "Data",
  "content",
  "Content",
];

const IMAGE_URL_FIELDS = [
  "image_url",
  "imageUrl",
  "ImageUrl",
  "url",
  "Url",
  "URL",
  "href",
  "link",
  "file",
  "fileUrl",
  "file_url",
  "path",
  "imagePath",
  "image_path",
];

const IMAGE_BATCH_ENDPOINT_CANDIDATES = Array.from(
  new Set(
    [
      (process.env.ONEC_IMAGE_BATCH_ENDPOINT || "").trim().toLowerCase(),
      (process.env.ONEC_GETIMAGES_BATCH_ENDPOINT || "").trim().toLowerCase(),
      "getimagesbatch",
      "getimages_batch",
      "getimagebatch",
      "getphotosbatch",
      "getphotobatch",
      "getimagespack",
    ].filter(Boolean)
  )
);

const IMAGE_BATCH_RESULT_FIELDS = [
  "items",
  "results",
  "data",
  "images",
  "Images",
  "photos",
  "Photos",
];

const IMAGE_BATCH_KEY_FIELDS = ["key", "Key", "imageKey", "ImageKey"];
const IMAGE_BATCH_STATUS_FIELDS = ["status", "Status", "state", "State"];
const IMAGE_BATCH_SUCCESS_FIELDS = [
  "success",
  "Success",
  "found",
  "Found",
  "hasPhoto",
  "HasPhoto",
];
const IMAGE_BATCH_CODE_FIELDS = ["code", "Code", "\u041a\u043e\u0434"];
const IMAGE_BATCH_ARTICLE_FIELDS = [
  "article",
  "Article",
  "\u0410\u0440\u0442\u0438\u043a\u0443\u043b",
  "\u041d\u043e\u043c\u0435\u0440\u041f\u043e\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0443",
];

const DATA_URI_REGEX =
  /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/_=\r\n\s-]+)$/i;
const URL_LIKE_REGEX = /^(https?:)?\/\/|^\//i;
const FILE_NAME_LIKE_REGEX =
  /^[A-Za-z0-9._~!$&'()*+,;=:@%/-]+\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?.*)?$/i;
const imageMissCache = new Map<string, number>();
const imageBase64Cache = new Map<string, { expiresAt: number; value: string }>();
const imageInFlightCache = new Map<string, Promise<string | null>>();
const IMAGE_URL_DOWNLOAD_TIMEOUT_MS = 1200;
const IMAGE_BATCH_ENDPOINT_RETRY_TTL_MS = 1000 * 60 * 5;
let resolvedImageBatchEndpoint: string | null | undefined;
let lastImageBatchEndpointProbeAt = 0;

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const safeTrim = (value: string) => value.replace(/[\u0000-\u001f]+/g, "").trim();

const pruneImageMissCache = () => {
  const now = Date.now();
  for (const [key, expiresAt] of imageMissCache.entries()) {
    if (expiresAt <= now) imageMissCache.delete(key);
  }
  for (const [key, entry] of imageBase64Cache.entries()) {
    if (!entry || entry.expiresAt <= now) imageBase64Cache.delete(key);
  }
};

const normalizeBase64 = (value: string) => {
  const cleaned = value.replace(/[\r\n\s]+/g, "").trim();
  if (!cleaned) return "";

  // Some 1C integrations return URL-safe base64 (-, _) without padding.
  const standard = cleaned.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = standard.length % 4;
  if (remainder === 0) return standard;
  return `${standard}${"=".repeat(4 - remainder)}`;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const isLikelyBase64 = (value: string) => {
  const normalized = normalizeBase64(value);
  if (normalized.length < 24) return false;
  if (normalized.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) return false;
  return true;
};

const hasBinaryContent = (value: string) => {
  try {
    const decoded = Buffer.from(normalizeBase64(value), "base64");
    return decoded.length > 0;
  } catch {
    return false;
  }
};

const extractDataUriBase64 = (value: string) => {
  const match = DATA_URI_REGEX.exec(safeTrim(value));
  if (!match) return null;

  const base64 = normalizeBase64(match[2] || "");
  if (!base64) return null;
  return base64;
};

const looksLikeImageUrl = (value: string) => {
  const trimmed = safeTrim(value);
  if (!trimmed) return false;
  if (trimmed.startsWith("data:image/")) return true;
  if (URL_LIKE_REGEX.test(trimmed)) return true;
  return FILE_NAME_LIKE_REGEX.test(trimmed);
};

const walkPayload = (
  value: unknown,
  visitor: (candidate: unknown) => void,
  depth = 0
): void => {
  if (depth > 4) return;
  visitor(value);

  if (Array.isArray(value)) {
    for (const item of value) walkPayload(item, visitor, depth + 1);
    return;
  }

  const record = asRecord(value);
  if (!record) return;

  for (const nested of Object.values(record)) {
    walkPayload(nested, visitor, depth + 1);
  }
};

const readImageBase64 = (payload: unknown) => {
  let resolved: string | null = null;

  const tryResolveString = (raw: string) => {
    if (resolved) return;

    const dataUriBase64 = extractDataUriBase64(raw);
    if (dataUriBase64 && hasBinaryContent(dataUriBase64)) {
      resolved = dataUriBase64;
      return;
    }

    const trimmed = safeTrim(raw);
    if (!trimmed) return;
    if (!isLikelyBase64(trimmed)) return;
    if (!hasBinaryContent(trimmed)) return;

    resolved = normalizeBase64(trimmed);
  };

  walkPayload(payload, (candidate) => {
    if (resolved) return;

    if (typeof candidate === "string") {
      tryResolveString(candidate);
      return;
    }

    const record = asRecord(candidate);
    if (!record) return;

    for (const key of IMAGE_BASE64_FIELDS) {
      const value = record[key];
      if (typeof value !== "string") continue;
      tryResolveString(value);
      if (resolved) return;
    }
  });

  return resolved;
};

const readImageUrl = (payload: unknown) => {
  let resolved: string | null = null;

  walkPayload(payload, (candidate) => {
    if (resolved) return;

    if (typeof candidate === "string") {
      const trimmed = safeTrim(candidate);
      if (!trimmed || !looksLikeImageUrl(trimmed)) return;
      resolved = trimmed;
      return;
    }

    const record = asRecord(candidate);
    if (!record) return;

    for (const key of IMAGE_URL_FIELDS) {
      const value = record[key];
      if (typeof value !== "string") continue;
      const trimmed = safeTrim(value);
      if (!trimmed || !looksLikeImageUrl(trimmed)) continue;
      resolved = trimmed;
      return;
    }
  });

  return resolved;
};

const resolveOneCImageUrl = (rawUrl: string) => {
  const trimmed = safeTrim(rawUrl);
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;

  const baseUrlRaw = (process.env.ONEC_BASE_URL || "").trim();
  if (!baseUrlRaw) return null;

  try {
    const base = new URL(baseUrlRaw);
    const origin = `${base.protocol}//${base.host}`;
    return new URL(trimmed, origin).toString();
  } catch {
    return null;
  }
};

const fetchImageUrlAsBase64 = async (rawUrl: string) => {
  const resolvedUrl = resolveOneCImageUrl(rawUrl);
  if (!resolvedUrl) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_URL_DOWNLOAD_TIMEOUT_MS);
    const headers: Record<string, string> = {};
    const authHeader = (process.env.ONEC_AUTH_HEADER || "").trim();
    if (authHeader) headers.Authorization = authHeader;

    const response = await fetch(resolvedUrl, {
      headers,
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    if (!response.ok) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) return null;

    return bytes.toString("base64");
  } catch {
    return null;
  }
};

const readFirstStringField = (
  record: Record<string, unknown>,
  fields: string[]
) => {
  for (const field of fields) {
    const value = record[field];
    if (typeof value !== "string") continue;

    const trimmed = safeTrim(value);
    if (trimmed) return trimmed;
  }

  return "";
};

const readFirstBooleanField = (
  record: Record<string, unknown>,
  fields: string[]
) => {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value !== "string") continue;

    const normalized = safeTrim(value).toLowerCase();
    if (!normalized) continue;
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }

  return null;
};

const normalizeBatchStatus = (value: string) =>
  safeTrim(value)
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

const isReadyBatchStatus = (value: string) =>
  ["ready", "success", "found", "ok"].includes(normalizeBatchStatus(value));

const isMissingBatchStatus = (value: string) =>
  ["missing", "not_found", "miss", "empty"].includes(normalizeBatchStatus(value));

const hasImageBatchEnvelope = (payload: unknown) => {
  if (Array.isArray(payload)) return true;

  const record = asRecord(payload);
  if (!record) return false;

  for (const field of IMAGE_BATCH_RESULT_FIELDS) {
    if (Array.isArray(record[field])) return true;
  }

  return Boolean(
    readFirstStringField(record, IMAGE_BATCH_KEY_FIELDS) ||
      readFirstStringField(record, IMAGE_BATCH_CODE_FIELDS) ||
      readFirstStringField(record, IMAGE_BATCH_ARTICLE_FIELDS) ||
      readImageBase64(record)
  );
};

const getImageBatchResultRecords = (payload: unknown) => {
  if (Array.isArray(payload)) {
    return payload
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  }

  const record = asRecord(payload);
  if (!record) return [];

  for (const field of IMAGE_BATCH_RESULT_FIELDS) {
    const nested = record[field];
    if (!Array.isArray(nested)) continue;

    return nested
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  }

  if (
    readFirstStringField(record, IMAGE_BATCH_KEY_FIELDS) ||
    readFirstStringField(record, IMAGE_BATCH_CODE_FIELDS) ||
    readFirstStringField(record, IMAGE_BATCH_ARTICLE_FIELDS) ||
    readImageBase64(record)
  ) {
    return [record];
  }

  return [];
};

const parseImageBatchResponse = (
  payload: unknown,
  requestedKeys: Set<string>
): ProductImageBatchResponseMatch | null => {
  if (!hasImageBatchEnvelope(payload)) return null;

  const records = getImageBatchResultRecords(payload);
  const resolved: Record<string, string> = {};
  const handledKeys = new Set<string>();

  for (const record of records) {
    const explicitKey = readFirstStringField(record, IMAGE_BATCH_KEY_FIELDS).toLowerCase();
    const code = readFirstStringField(record, IMAGE_BATCH_CODE_FIELDS).toLowerCase();
    const article = readFirstStringField(record, IMAGE_BATCH_ARTICLE_FIELDS).toLowerCase();
    const matchedKey = [explicitKey, code, article].find(
      (candidate) => candidate && requestedKeys.has(candidate)
    );

    if (!matchedKey) continue;

    const imageBase64 = readImageBase64(record);
    const status = readFirstStringField(record, IMAGE_BATCH_STATUS_FIELDS);
    const success = readFirstBooleanField(record, IMAGE_BATCH_SUCCESS_FIELDS);

    if (imageBase64 && (isReadyBatchStatus(status) || success !== false || !status)) {
      resolved[matchedKey] = imageBase64;
      handledKeys.add(matchedKey);
      continue;
    }

    if (!imageBase64 && (isMissingBatchStatus(status) || success === false)) {
      handledKeys.add(matchedKey);
    }
  }

  return { resolved, handledKeys };
};

const buildImageMissCacheKey = (
  lookupKey: string,
  timeoutMs: number,
  allowUrlDownload: boolean
) => `${lookupKey.toLowerCase()}::${timeoutMs}::${allowUrlDownload ? "1" : "0"}`;

const fetchProductImageBase64BatchFromEndpoint = async (
  lookupKeys: string[],
  options?: ProductImageLookupOptions
): Promise<ProductImageBatchResponseMatch | null> => {
  if (lookupKeys.length === 0) {
    return {
      resolved: {},
      handledKeys: new Set<string>(),
    };
  }

  const timeoutMs =
    Number.isFinite(options?.timeoutMs) && (options?.timeoutMs || 0) > 0
      ? Math.floor(options?.timeoutMs as number)
      : 9000;
  const retries =
    Number.isFinite(options?.retries) && (options?.retries || 0) >= 0
      ? Math.floor(options?.retries as number)
      : 0;
  const retryDelayMs =
    Number.isFinite(options?.retryDelayMs) && (options?.retryDelayMs || 0) >= 0
      ? Math.floor(options?.retryDelayMs as number)
      : 250;
  const cacheTtlMs =
    Number.isFinite(options?.cacheTtlMs) && (options?.cacheTtlMs || 0) > 0
      ? Math.floor(options?.cacheTtlMs as number)
      : 1000 * 60 * 60;
  const missCacheTtlMs =
    Number.isFinite(options?.missCacheTtlMs) && (options?.missCacheTtlMs || 0) > 0
      ? Math.floor(options?.missCacheTtlMs as number)
      : 1000 * 60 * 20;
  const allowUrlDownload = options?.allowUrlDownload !== false;
  const skipMissCache = options?.skipMissCache === true;
  const requestedKeys = new Set(lookupKeys.map((lookupKey) => lookupKey.toLowerCase()));
  const requestItems = lookupKeys.map((lookupKey) => ({
    key: lookupKey.toLowerCase(),
    code: lookupKey,
    article: lookupKey,
  }));

  const endpoints =
    typeof resolvedImageBatchEndpoint === "string" && resolvedImageBatchEndpoint
      ? [
          resolvedImageBatchEndpoint,
          ...IMAGE_BATCH_ENDPOINT_CANDIDATES.filter(
            (endpoint) => endpoint !== resolvedImageBatchEndpoint
          ),
        ]
      : resolvedImageBatchEndpoint === null &&
          Date.now() - lastImageBatchEndpointProbeAt < IMAGE_BATCH_ENDPOINT_RETRY_TTL_MS
        ? []
        : IMAGE_BATCH_ENDPOINT_CANDIDATES;

  for (const endpoint of endpoints) {
    const response = await oneCRequest(endpoint, {
      method: "POST",
      body: { items: requestItems },
      timeoutMs,
      retries,
      retryDelayMs,
      cacheTtlMs,
      cacheKey: JSON.stringify({
        endpoint,
        timeoutMs,
        retries,
        retryDelayMs,
        items: requestItems.map((item) => [item.key, item.code]),
      }),
    }).catch(() => null);

    if (!response || response.status < 200 || response.status >= 300) continue;

    let payload: unknown;
    try {
      payload = JSON.parse(safeTrim(response.text || "")) as unknown;
    } catch {
      continue;
    }

    const parsed = parseImageBatchResponse(payload, requestedKeys);
    if (!parsed) continue;

    resolvedImageBatchEndpoint = endpoint;
    lastImageBatchEndpointProbeAt = 0;

    for (const [lookupKey, imageBase64] of Object.entries(parsed.resolved)) {
      imageBase64Cache.set(lookupKey.toLowerCase(), {
        value: imageBase64,
        expiresAt: Date.now() + cacheTtlMs,
      });
    }

    if (!skipMissCache) {
      for (const handledKey of parsed.handledKeys) {
        if (parsed.resolved[handledKey]) continue;
        imageMissCache.set(
          buildImageMissCacheKey(handledKey, timeoutMs, allowUrlDownload),
          Date.now() + missCacheTtlMs
        );
      }
    }

    return parsed;
  }

  if (typeof resolvedImageBatchEndpoint !== "string") {
    resolvedImageBatchEndpoint = null;
    lastImageBatchEndpointProbeAt = Date.now();
  }

  return null;
};

export const fetchProductImageBase64 = async (
  codeOrArticle: string,
  options?: ProductImageLookupOptions
) => {
  const normalized = safeDecode(codeOrArticle || "").trim();
  if (!normalized) return null;
  pruneImageMissCache();

  const timeoutMs =
    Number.isFinite(options?.timeoutMs) && (options?.timeoutMs || 0) > 0
      ? Math.floor(options?.timeoutMs as number)
      : 9000;
  const retries =
    Number.isFinite(options?.retries) && (options?.retries || 0) >= 0
      ? Math.floor(options?.retries as number)
      : 0;
  const retryDelayMs =
    Number.isFinite(options?.retryDelayMs) && (options?.retryDelayMs || 0) >= 0
      ? Math.floor(options?.retryDelayMs as number)
      : 250;
  const cacheTtlMs =
    Number.isFinite(options?.cacheTtlMs) && (options?.cacheTtlMs || 0) > 0
      ? Math.floor(options?.cacheTtlMs as number)
      : 1000 * 60 * 60;
  const missCacheTtlMs =
    Number.isFinite(options?.missCacheTtlMs) && (options?.missCacheTtlMs || 0) > 0
      ? Math.floor(options?.missCacheTtlMs as number)
      : 1000 * 60 * 20;
  const allowUrlDownload = options?.allowUrlDownload !== false;
  const skipMissCache = options?.skipMissCache === true;
  const positiveCacheKey = normalized.toLowerCase();
  const inFlightKey = [
    positiveCacheKey,
    timeoutMs,
    retries,
    retryDelayMs,
    allowUrlDownload ? 1 : 0,
    skipMissCache ? 1 : 0,
  ].join("::");
  const missCacheKey = buildImageMissCacheKey(
    normalized,
    timeoutMs,
    allowUrlDownload
  );

  const cachedPositive = imageBase64Cache.get(positiveCacheKey);
  if (cachedPositive && cachedPositive.expiresAt > Date.now() && cachedPositive.value) {
    return cachedPositive.value;
  }

  if (!skipMissCache && (imageMissCache.get(missCacheKey) || 0) > Date.now()) {
    return null;
  }

  const inFlight = imageInFlightCache.get(inFlightKey);
  if (inFlight) {
    return inFlight;
  }

  const queryBodies: Array<Record<string, string>> = [
    { code: normalized },
    { "\u041a\u043e\u0434": normalized }, // Код
    { article: normalized },
    { "\u0410\u0440\u0442\u0438\u043a\u0443\u043b": normalized }, // Артикул
    { "\u041d\u043e\u043c\u0435\u0440\u041f\u043e\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0443": normalized }, // НомерПоКаталогу
  ];

  const loadFromBody = async (body: Record<string, string>) => {
    const response = await oneCRequest("getimages", {
      method: "POST",
      body,
      timeoutMs,
      retries,
      retryDelayMs,
      cacheTtlMs,
      cacheKey: JSON.stringify({
        endpoint: "getimages",
        body,
        timeoutMs,
        retries,
        retryDelayMs,
      }),
    });
    if (response.status < 200 || response.status >= 300) return null;

    const text = safeTrim(response.text || "");
    if (!text) return null;

    const dataUriBase64 = extractDataUriBase64(text);
    if (dataUriBase64 && hasBinaryContent(dataUriBase64)) return dataUriBase64;

    if (isLikelyBase64(text) && hasBinaryContent(text)) {
      return normalizeBase64(text);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      return null;
    }

    const record = asRecord(payload);
    if (record?.success === false) return null;

    const imageBase64 = readImageBase64(payload);
    if (imageBase64) return imageBase64;

    const imageUrl = readImageUrl(payload);
    if (!imageUrl || !allowUrlDownload) return null;

    const downloaded = await fetchImageUrlAsBase64(imageUrl);
    if (downloaded) return downloaded;
    return null;
  };

  const uniqueBodies = queryBodies.filter((body, index, list) => {
    const serialized = JSON.stringify(body);
    return list.findIndex((entry) => JSON.stringify(entry) === serialized) === index;
  });
  const isCodeBody = (body: Record<string, string>) =>
    Object.prototype.hasOwnProperty.call(body, "code") ||
    Object.prototype.hasOwnProperty.call(body, "\u041a\u043e\u0434");

  const resolveFirstAvailable = async (bodies: Array<Record<string, string>>) => {
    if (bodies.length === 0) return null;

    const attempts = bodies.map((body, index) =>
      Promise.resolve()
        .then(() => loadFromBody(body))
        .then((value) => ({ index, value }))
        .catch(() => ({ index, value: null as string | null }))
    );

    const pending = new Set<number>(attempts.map((_, index) => index));
    while (pending.size > 0) {
      const result = await Promise.race(
        Array.from(pending, (index) => attempts[index])
      );
      pending.delete(result.index);
      if (typeof result.value === "string" && result.value) {
        return result.value;
      }
    }

    return null;
  };

  const requestPromise = (async () => {
    const stagedBodies = [
      uniqueBodies.filter((body) => isCodeBody(body)),
      uniqueBodies.filter((body) => !isCodeBody(body)),
    ].filter((stage) => stage.length > 0);
    for (const stage of stagedBodies) {
      const resolved = await resolveFirstAvailable(stage);
      if (!resolved) continue;

      imageBase64Cache.set(positiveCacheKey, {
        value: resolved,
        expiresAt: Date.now() + cacheTtlMs,
      });
      return resolved;
    }

    if (!skipMissCache) {
      imageMissCache.set(missCacheKey, Date.now() + missCacheTtlMs);
    }
    return null;
  })().finally(() => {
    imageInFlightCache.delete(inFlightKey);
  });

  imageInFlightCache.set(inFlightKey, requestPromise);
  return requestPromise;
};

export const fetchProductImageBase64Batch = async (
  lookupKeys: string[],
  options?: ProductImageLookupOptions & {
    batchConcurrency?: number;
    maxKeys?: number;
  }
) => {
  const maxKeys =
    Number.isFinite(options?.maxKeys) && (options?.maxKeys || 0) > 0
      ? Math.floor(options?.maxKeys as number)
      : 24;
  const normalizedKeys = Array.from(
    new Set(lookupKeys.map((key) => safeDecode(key || "").trim()).filter(Boolean))
  ).slice(0, maxKeys);

  if (normalizedKeys.length === 0) {
    return {} as Record<string, string>;
  }

  const resolved = new Map<string, string>();
  const batchResponse = await fetchProductImageBase64BatchFromEndpoint(
    normalizedKeys,
    options
  ).catch(() => null);

  if (batchResponse) {
    for (const [lookupKey, imageBase64] of Object.entries(batchResponse.resolved)) {
      if (!imageBase64) continue;
      resolved.set(lookupKey.toLowerCase(), imageBase64);
    }
  }

  const remainingKeys = normalizedKeys.filter(
    (lookupKey) => !batchResponse?.handledKeys.has(lookupKey.toLowerCase())
  );

  if (remainingKeys.length === 0) {
    return Object.fromEntries(resolved);
  }

  let cursor = 0;
  const workerCount = Math.min(
    Number.isFinite(options?.batchConcurrency) && (options?.batchConcurrency || 0) > 0
      ? Math.floor(options?.batchConcurrency as number)
      : 4,
    remainingKeys.length
  );
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < remainingKeys.length) {
      const currentIndex = cursor;
      cursor += 1;

      const key = remainingKeys[currentIndex];
      const imageBase64 = await fetchProductImageBase64(key, options).catch(() => null);
      if (typeof imageBase64 === "string" && imageBase64) {
        resolved.set(key.toLowerCase(), imageBase64);
      }
    }
  });

  await Promise.allSettled(workers);
  return Object.fromEntries(resolved);
};

export const getProductImagePath = (code: string, articleHint?: string) => {
  const normalizedCode = (code || "").trim();
  const basePath = `/product-image/${encodeURIComponent(normalizedCode)}`;

  const normalizedArticle = (articleHint || "").trim();
  if (!normalizedArticle) return basePath;
  if (normalizedArticle.toLowerCase() === normalizedCode.toLowerCase()) return basePath;

  return `${basePath}?article=${encodeURIComponent(normalizedArticle)}`;
};
