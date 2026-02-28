import "server-only";

import { oneCRequest } from "app/api/_lib/oneC";

export const PRODUCT_IMAGE_FALLBACK_PATH = "/Car-parts-fullwidth.png";

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

const DATA_URI_REGEX =
  /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/_=\r\n\s-]+)$/i;
const URL_LIKE_REGEX = /^(https?:)?\/\/|^\//i;
const FILE_NAME_LIKE_REGEX =
  /^[A-Za-z0-9._~!$&'()*+,;=:@%/-]+\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?.*)?$/i;

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const safeTrim = (value: string) => value.replace(/[\u0000-\u001f]+/g, "").trim();

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
    const headers: Record<string, string> = {};
    const authHeader = (process.env.ONEC_AUTH_HEADER || "").trim();
    if (authHeader) headers.Authorization = authHeader;

    const response = await fetch(resolvedUrl, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) return null;

    return bytes.toString("base64");
  } catch {
    return null;
  }
};

export const fetchProductImageBase64 = async (codeOrArticle: string) => {
  const normalized = safeDecode(codeOrArticle || "").trim();
  if (!normalized) return null;

  const queryBodies: Array<Record<string, string>> = [
    { code: normalized },
    { "\u041a\u043e\u0434": normalized }, // Код
    { article: normalized },
    { "\u0410\u0440\u0442\u0438\u043a\u0443\u043b": normalized }, // Артикул
    { "\u041d\u043e\u043c\u0435\u0440\u041f\u043e\u041a\u0430\u0442\u0430\u043b\u043e\u0433\u0443": normalized }, // НомерПоКаталогу
  ];

  const seenBodies = new Set<string>();
  for (const body of queryBodies) {
    const cacheKey = JSON.stringify(body);
    if (seenBodies.has(cacheKey)) continue;
    seenBodies.add(cacheKey);

    const response = await oneCRequest("getimages", {
      method: "POST",
      body,
      timeoutMs: 9000,
      retries: 0,
      retryDelayMs: 250,
      cacheTtlMs: 1000 * 60 * 60,
    });
    if (response.status < 200 || response.status >= 300) continue;

    const text = safeTrim(response.text || "");
    if (!text) continue;

    const dataUriBase64 = extractDataUriBase64(text);
    if (dataUriBase64 && hasBinaryContent(dataUriBase64)) return dataUriBase64;

    if (isLikelyBase64(text) && hasBinaryContent(text)) {
      return normalizeBase64(text);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      continue;
    }

    const record = asRecord(payload);
    if (record?.success === false) continue;

    const imageBase64 = readImageBase64(payload);
    if (imageBase64) return imageBase64;

    const imageUrl = readImageUrl(payload);
    if (!imageUrl) continue;

    const downloaded = await fetchImageUrlAsBase64(imageUrl);
    if (downloaded) return downloaded;
  }

  return null;
};

export const getProductImagePath = (code: string, articleHint?: string) => {
  const normalizedCode = (code || "").trim();
  const basePath = `/product-image/${encodeURIComponent(normalizedCode)}`;

  const normalizedArticle = (articleHint || "").trim();
  if (!normalizedArticle) return basePath;
  if (normalizedArticle.toLowerCase() === normalizedCode.toLowerCase()) return basePath;

  return `${basePath}?article=${encodeURIComponent(normalizedArticle)}`;
};
