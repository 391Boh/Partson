import { buildProductImageBatchKey } from "app/lib/product-image-path";

export const PRODUCT_IMAGE_CLIENT_CACHE_PREFIX = "partson:v9:img:";
export const PRODUCT_IMAGE_CLIENT_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
export const PRODUCT_IMAGE_CLIENT_MISSING_CACHE_PREFIX = "partson:v3:img-miss:";
export const PRODUCT_IMAGE_CLIENT_MISSING_CACHE_TTL_MS = 1000 * 60;

export type ProductImageCacheRecord = {
  src: string;
  t: number;
};

export type ProductImageMissingCacheRecord = {
  t: number;
};

export const getProductImageClientCacheKey = (
  productCode: string,
  articleHint?: string
) => {
  const batchKey = buildProductImageBatchKey(productCode, articleHint);
  return batchKey ? `${PRODUCT_IMAGE_CLIENT_CACHE_PREFIX}${batchKey}` : "";
};

export const getProductImageClientMissingCacheKey = (
  productCode: string,
  articleHint?: string
) => {
  const batchKey = buildProductImageBatchKey(productCode, articleHint);
  return batchKey ? `${PRODUCT_IMAGE_CLIENT_MISSING_CACHE_PREFIX}${batchKey}` : "";
};

export const normalizeProductImageCachedSrc = (value: string) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:image/")) return trimmed;

  try {
    const parsed = new URL(trimmed, "http://localhost");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return trimmed;
  }
};

export const readProductImageSuccessFromStorage = (
  storage: Storage,
  cacheKey: string
) => {
  try {
    const raw = storage.getItem(cacheKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ProductImageCacheRecord;
    if (!parsed || typeof parsed.t !== "number" || typeof parsed.src !== "string") {
      storage.removeItem(cacheKey);
      return null;
    }

    if (Date.now() - parsed.t > PRODUCT_IMAGE_CLIENT_CACHE_TTL_MS) {
      storage.removeItem(cacheKey);
      return null;
    }

    const normalizedSrc = normalizeProductImageCachedSrc(parsed.src);
    if (!normalizedSrc) {
      storage.removeItem(cacheKey);
      return null;
    }

    return normalizedSrc;
  } catch {
    return null;
  }
};

export const readProductImageSuccess = (
  productCode: string,
  articleHint?: string
) => {
  if (typeof window === "undefined") return null;

  const cacheKey = getProductImageClientCacheKey(productCode, articleHint);
  if (!cacheKey) return null;

  return (
    readProductImageSuccessFromStorage(window.sessionStorage, cacheKey) ??
    readProductImageSuccessFromStorage(window.localStorage, cacheKey)
  );
};

const readProductImageMissingFromStorage = (
  storage: Storage,
  cacheKey: string
) => {
  try {
    const raw = storage.getItem(cacheKey);
    if (!raw) return false;

    const parsed = JSON.parse(raw) as ProductImageMissingCacheRecord;
    if (!parsed || typeof parsed.t !== "number") {
      storage.removeItem(cacheKey);
      return false;
    }

    if (Date.now() - parsed.t > PRODUCT_IMAGE_CLIENT_MISSING_CACHE_TTL_MS) {
      storage.removeItem(cacheKey);
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

export const readProductImageMissing = (
  productCode: string,
  articleHint?: string
) => {
  if (typeof window === "undefined") return false;

  const cacheKey = getProductImageClientMissingCacheKey(productCode, articleHint);
  if (!cacheKey) return false;

  return (
    readProductImageMissingFromStorage(window.sessionStorage, cacheKey) ||
    readProductImageMissingFromStorage(window.localStorage, cacheKey)
  );
};

export const writeProductImageSuccess = (
  productCode: string,
  articleHint: string | undefined,
  src: string
) => {
  if (typeof window === "undefined") return;

  const cacheKey = getProductImageClientCacheKey(productCode, articleHint);
  const normalizedSrc = normalizeProductImageCachedSrc(src);
  if (!cacheKey || !normalizedSrc) return;

  clearProductImageMissing(productCode, articleHint);

  const payload = JSON.stringify({
    src: normalizedSrc,
    t: Date.now(),
  } satisfies ProductImageCacheRecord);

  try {
    window.sessionStorage.setItem(cacheKey, payload);
  } catch {
    // Ignore storage quota issues.
  }

  try {
    window.localStorage.setItem(cacheKey, payload);
  } catch {
    // Ignore storage quota issues.
  }
};

export const writeProductImageMissing = (
  productCode: string,
  articleHint?: string
) => {
  if (typeof window === "undefined") return;

  const cacheKey = getProductImageClientMissingCacheKey(productCode, articleHint);
  if (!cacheKey) return;

  clearProductImageSuccess(productCode, articleHint);

  const payload = JSON.stringify({
    t: Date.now(),
  } satisfies ProductImageMissingCacheRecord);

  try {
    window.sessionStorage.setItem(cacheKey, payload);
  } catch {
    // Ignore storage quota issues.
  }

  try {
    window.localStorage.setItem(cacheKey, payload);
  } catch {
    // Ignore storage quota issues.
  }
};

export const clearProductImageSuccess = (
  productCode: string,
  articleHint?: string
) => {
  if (typeof window === "undefined") return;

  const cacheKey = getProductImageClientCacheKey(productCode, articleHint);
  if (!cacheKey) return;

  try {
    window.sessionStorage.removeItem(cacheKey);
  } catch {
    // Ignore storage errors.
  }

  try {
    window.localStorage.removeItem(cacheKey);
  } catch {
    // Ignore storage errors.
  }
};

export const clearProductImageMissing = (
  productCode: string,
  articleHint?: string
) => {
  if (typeof window === "undefined") return;

  const cacheKey = getProductImageClientMissingCacheKey(productCode, articleHint);
  if (!cacheKey) return;

  try {
    window.sessionStorage.removeItem(cacheKey);
  } catch {
    // Ignore storage errors.
  }

  try {
    window.localStorage.removeItem(cacheKey);
  } catch {
    // Ignore storage errors.
  }
};
