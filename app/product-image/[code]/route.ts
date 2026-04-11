import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { fetchProductImageBase64, PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image";
import { findCatalogProductByCode } from "app/lib/catalog-server";

export const runtime = "nodejs";

interface ProductImageRouteContext {
  params: Promise<{ code: string }>;
}

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const fallbackRedirect = (request: Request) => {
  const response = NextResponse.redirect(new URL(PRODUCT_IMAGE_FALLBACK_PATH, request.url), 307);
  response.headers.set(
    "cache-control",
    "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400"
  );
  return response;
};
const fallbackNotFound = (cacheControl?: string) =>
  new NextResponse(null, {
    status: 404,
    headers: {
      "cache-control":
        cacheControl ||
        "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
const FAST_IMAGE_LOOKUP_OPTIONS = {
  timeoutMs: 2200,
  retries: 1,
  retryDelayMs: 120,
  cacheTtlMs: 1000 * 60 * 60,
  missCacheTtlMs: 1000 * 60 * 20,
};
const CATALOG_IMAGE_LOOKUP_OPTIONS = {
  timeoutMs: 950,
  retries: 0,
  retryDelayMs: 80,
  cacheTtlMs: 1000 * 60 * 60 * 2,
  missCacheTtlMs: 1000 * 30,
  allowUrlDownload: true,
};
const CATALOG_IMAGE_RETRY_LOOKUP_OPTIONS = {
  timeoutMs: 1450,
  retries: 0,
  retryDelayMs: 90,
  cacheTtlMs: 1000 * 60 * 20,
  missCacheTtlMs: 1000 * 45,
  allowUrlDownload: true,
  skipMissCache: true,
};
const CATALOG_IMAGE_FINAL_LOOKUP_OPTIONS = {
  timeoutMs: 1750,
  retries: 0,
  retryDelayMs: 100,
  cacheTtlMs: 1000 * 60 * 20,
  missCacheTtlMs: 1000 * 18,
  allowUrlDownload: true,
  skipMissCache: true,
};
const CATALOG_IMAGE_RECOVERY_LOOKUP_OPTIONS = {
  timeoutMs: 1650,
  retries: 0,
  retryDelayMs: 100,
  cacheTtlMs: 1000 * 60 * 60,
  missCacheTtlMs: 1000 * 45,
  allowUrlDownload: true,
};
const CATALOG_IMAGE_RETRY_RECOVERY_LOOKUP_OPTIONS = {
  timeoutMs: 1900,
  retries: 0,
  retryDelayMs: 110,
  cacheTtlMs: 1000 * 60 * 10,
  missCacheTtlMs: 1000 * 60,
  allowUrlDownload: true,
  skipMissCache: true,
};
const CATALOG_IMAGE_FINAL_RECOVERY_LOOKUP_OPTIONS = {
  timeoutMs: 2050,
  retries: 0,
  retryDelayMs: 120,
  cacheTtlMs: 1000 * 60 * 12,
  missCacheTtlMs: 1000 * 18,
  allowUrlDownload: true,
  skipMissCache: true,
};
const STRICT_IMAGE_LOOKUP_OPTIONS = {
  timeoutMs: 1650,
  retries: 1,
  retryDelayMs: 80,
  cacheTtlMs: 1000 * 60 * 20,
  missCacheTtlMs: 1000 * 60 * 5,
  allowUrlDownload: true,
};
const IMAGE_ARTICLE_FALLBACK_LOOKUP_OPTIONS = {
  lookupLimit: 16,
  fallbackPages: 1,
  pageSize: 24,
  timeoutMs: 900,
  retries: 0,
  retryDelayMs: 80,
  cacheTtlMs: 1000 * 60 * 10,
};
const OPTIMIZED_IMAGE_CACHE_TTL_MS = 1000 * 60 * 60;
const CATALOG_IMAGE_MAX_WIDTH = 360;
const CATALOG_IMAGE_MAX_HEIGHT = 360;
const CATALOG_IMAGE_QUALITY = 70;
const FULL_IMAGE_MAX_WIDTH = 1280;
const FULL_IMAGE_MAX_HEIGHT = 1280;
const FULL_IMAGE_QUALITY = 82;
const CATALOG_ROUTE_MISS_CACHE_TTL_MS = 1000 * 8;
const CATALOG_ROUTE_RETRY_MISS_CACHE_TTL_MS = 1000 * 18;
let fallbackImageHashPromise: Promise<string | null> | null = null;
const optimizedImageCache = new Map<
  string,
  { expiresAt: number; value: { buffer: Buffer; contentType: string } }
>();
const optimizedImageInFlight = new Map<
  string,
  Promise<{ buffer: Buffer; contentType: string }>
>();
const routeMissCache = new Map<string, number>();

const buildBufferHash = (buffer: Buffer) =>
  createHash("sha1").update(buffer).digest("hex");

const getFallbackImageHash = async () => {
  if (fallbackImageHashPromise) return fallbackImageHashPromise;

  fallbackImageHashPromise = readFile(
    path.join(process.cwd(), "public", PRODUCT_IMAGE_FALLBACK_PATH.replace(/^\//, ""))
  )
    .then((buffer) => buildBufferHash(buffer))
    .catch(() => null);

  return fallbackImageHashPromise;
};

const pruneOptimizedImageCache = () => {
  const now = Date.now();
  for (const [key, entry] of optimizedImageCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      optimizedImageCache.delete(key);
    }
  }
};

const pruneRouteMissCache = () => {
  const now = Date.now();
  for (const [key, expiresAt] of routeMissCache.entries()) {
    if (expiresAt <= now) {
      routeMissCache.delete(key);
    }
  }
};

const detectContentType = (buffer: Buffer) => {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return "image/gif";
  }

  return "application/octet-stream";
};

const optimizeImageBuffer = async (
  imageBuffer: Buffer,
  options: {
    hash: string;
    variant: "catalog" | "full";
    originalContentType: string;
  }
) => {
  pruneOptimizedImageCache();

  const cacheKey = `${options.variant}:${options.hash}`;
  const cached = optimizedImageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const inFlight = optimizedImageInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async () => {
    const original = {
      buffer: imageBuffer,
      contentType: options.originalContentType,
    };

    if (
      options.originalContentType === "image/gif" ||
      options.originalContentType === "image/svg+xml"
    ) {
      optimizedImageCache.set(cacheKey, {
        expiresAt: Date.now() + OPTIMIZED_IMAGE_CACHE_TTL_MS,
        value: original,
      });
      return original;
    }

    try {
      const resizeOptions =
        options.variant === "catalog"
          ? {
              width: CATALOG_IMAGE_MAX_WIDTH,
              height: CATALOG_IMAGE_MAX_HEIGHT,
              quality: CATALOG_IMAGE_QUALITY,
            }
          : {
              width: FULL_IMAGE_MAX_WIDTH,
              height: FULL_IMAGE_MAX_HEIGHT,
              quality: FULL_IMAGE_QUALITY,
            };

      const transformed = await sharp(imageBuffer, {
        failOn: "none",
        animated: false,
      })
        .rotate()
        .resize({
          width: resizeOptions.width,
          height: resizeOptions.height,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({
          quality: resizeOptions.quality,
          effort: options.variant === "catalog" ? 4 : 3,
        })
        .toBuffer();

      const optimized =
        transformed.length > 0 && transformed.length < imageBuffer.length
          ? {
              buffer: transformed,
              contentType: "image/webp",
            }
          : original;

      optimizedImageCache.set(cacheKey, {
        expiresAt: Date.now() + OPTIMIZED_IMAGE_CACHE_TTL_MS,
        value: optimized,
      });
      return optimized;
    } catch {
      optimizedImageCache.set(cacheKey, {
        expiresAt: Date.now() + OPTIMIZED_IMAGE_CACHE_TTL_MS,
        value: original,
      });
      return original;
    }
  })().finally(() => {
    optimizedImageInFlight.delete(cacheKey);
  });

  optimizedImageInFlight.set(cacheKey, promise);
  return promise;
};

const getFirstResolvedImageBase64 = async (
  lookupKeys: string[],
  lookupOptions: Parameters<typeof fetchProductImageBase64>[1]
) => {
  const normalizedKeys = Array.from(
    new Set(lookupKeys.map((value) => value.trim()).filter(Boolean))
  );
  if (normalizedKeys.length === 0) return null;

  for (const key of normalizedKeys) {
    const value = await fetchProductImageBase64(key, lookupOptions).catch(
      () => null
    );
    if (typeof value === "string" && value) {
      return value;
    }
  }

  return null;
};

const getFirstResolvedCatalogProduct = async (
  lookupKeys: string[],
  lookupOptions: Parameters<typeof findCatalogProductByCode>[1]
) => {
  const normalizedKeys = Array.from(
    new Set(lookupKeys.map((value) => value.trim()).filter(Boolean))
  );
  if (normalizedKeys.length === 0) return null;

  for (const key of normalizedKeys) {
    const value = await findCatalogProductByCode(key, lookupOptions).catch(
      () => null
    );
    if (value) {
      return value;
    }
  }

  return null;
};

const getCatalogLookupOptions = (retryAttempt: number) => {
  if (retryAttempt > 1) {
    return CATALOG_IMAGE_FINAL_LOOKUP_OPTIONS;
  }

  if (retryAttempt > 0) {
    return CATALOG_IMAGE_RETRY_LOOKUP_OPTIONS;
  }

  return CATALOG_IMAGE_LOOKUP_OPTIONS;
};

const getCatalogRecoveryLookupOptions = (retryAttempt: number) => {
  if (retryAttempt > 1) {
    return CATALOG_IMAGE_FINAL_RECOVERY_LOOKUP_OPTIONS;
  }

  if (retryAttempt > 0) {
    return CATALOG_IMAGE_RETRY_RECOVERY_LOOKUP_OPTIONS;
  }

  return CATALOG_IMAGE_RECOVERY_LOOKUP_OPTIONS;
};

export async function GET(request: Request, context: ProductImageRouteContext) {
  const requestUrl = new URL(request.url);
  const strictMode = requestUrl.searchParams.get("strict") === "1";
  const catalogMode = requestUrl.searchParams.get("catalog") === "1";
  const retryAttempt = Math.min(
    2,
    Math.max(0, Number(requestUrl.searchParams.get("retry") || "0") || 0)
  );
  const catalogMissCacheControl =
    "public, max-age=3, s-maxage=3, stale-while-revalidate=8";
  const articleHint = safeDecode(requestUrl.searchParams.get("article") || "").trim();
  const allowDeepCatalogRecovery = catalogMode && (retryAttempt > 0 || !articleHint);
  const allowCatalogProductFallback = !catalogMode || retryAttempt < 2;
  const lookupOptions = strictMode
    ? STRICT_IMAGE_LOOKUP_OPTIONS
    : catalogMode
      ? getCatalogLookupOptions(retryAttempt)
      : FAST_IMAGE_LOOKUP_OPTIONS;

  const resolvedParams = await context.params;
  const rawCode = resolvedParams?.code || "";
  const normalizedCode = safeDecode(rawCode).trim();
  pruneRouteMissCache();

  if (!normalizedCode) {
    return strictMode || catalogMode
      ? fallbackNotFound(catalogMode ? catalogMissCacheControl : undefined)
      : fallbackRedirect(request);
  }

  const lookupKeys: string[] = [];
  const addLookupKey = (value: string) => {
    const trimmed = (value || "").trim();
    if (!trimmed) return;
    if (lookupKeys.some((item) => item.toLowerCase() === trimmed.toLowerCase())) return;
    lookupKeys.push(trimmed);
  };

  addLookupKey(normalizedCode);
  addLookupKey(articleHint);

  const routeMissCacheKey = [
    strictMode ? "strict" : "normal",
    catalogMode ? "catalog" : "full",
    retryAttempt,
    normalizedCode.toLowerCase(),
    articleHint.toLowerCase(),
  ].join("::");
  const routeMissTtlMs = catalogMode
    ? retryAttempt > 0
      ? CATALOG_ROUTE_RETRY_MISS_CACHE_TTL_MS
      : CATALOG_ROUTE_MISS_CACHE_TTL_MS
    : 0;

  if (routeMissTtlMs > 0 && (routeMissCache.get(routeMissCacheKey) || 0) > Date.now()) {
    return fallbackNotFound(catalogMode ? catalogMissCacheControl : undefined);
  }

  let imageBase64 = await getFirstResolvedImageBase64(
    lookupKeys,
    lookupOptions
  ).catch(() => null);

  if (!imageBase64 && !strictMode && allowDeepCatalogRecovery) {
    imageBase64 = await getFirstResolvedImageBase64(
      lookupKeys,
      getCatalogRecoveryLookupOptions(retryAttempt)
    ).catch(() => null);
  }

  if (!imageBase64 && !strictMode && allowCatalogProductFallback && (!catalogMode || allowDeepCatalogRecovery)) {
    try {
      const product = await getFirstResolvedCatalogProduct(
        lookupKeys,
        {
          ...IMAGE_ARTICLE_FALLBACK_LOOKUP_OPTIONS,
          timeoutMs:
            catalogMode && retryAttempt > 0
              ? 900
              : catalogMode
                ? 650
                : IMAGE_ARTICLE_FALLBACK_LOOKUP_OPTIONS.timeoutMs,
          cacheTtlMs: catalogMode ? 1000 * 60 * 5 : IMAGE_ARTICLE_FALLBACK_LOOKUP_OPTIONS.cacheTtlMs,
        }
      );
      const recoveryKeys = Array.from(
        new Set(
          [(product?.article || "").trim(), (product?.code || "").trim()].filter(
            Boolean
          )
        )
      ).filter(
        (value) =>
          !lookupKeys.some((item) => item.toLowerCase() === value.toLowerCase())
      );

      if (recoveryKeys.length > 0) {
        imageBase64 = await getFirstResolvedImageBase64(
          recoveryKeys,
          catalogMode
            ? getCatalogRecoveryLookupOptions(retryAttempt)
            : lookupOptions
        ).catch(() => null);
      }
    } catch {
      imageBase64 = null;
    }
  }

  if (!imageBase64) {
    if (routeMissTtlMs > 0) {
      routeMissCache.set(routeMissCacheKey, Date.now() + routeMissTtlMs);
    }
    return strictMode || catalogMode
      ? fallbackNotFound(catalogMode ? catalogMissCacheControl : undefined)
      : fallbackRedirect(request);
  }

  try {
    const imageBuffer = Buffer.from(imageBase64, "base64");
    if (!imageBuffer.length) {
      if (routeMissTtlMs > 0) {
        routeMissCache.set(routeMissCacheKey, Date.now() + routeMissTtlMs);
      }
      return strictMode || catalogMode
        ? fallbackNotFound(catalogMode ? catalogMissCacheControl : undefined)
        : fallbackRedirect(request);
    }

    const fallbackHash = await getFallbackImageHash();
    const imageHash = buildBufferHash(imageBuffer);
    if (fallbackHash && imageHash === fallbackHash) {
      if (routeMissTtlMs > 0) {
        routeMissCache.set(routeMissCacheKey, Date.now() + routeMissTtlMs);
      }
      return strictMode || catalogMode
        ? fallbackNotFound(catalogMode ? catalogMissCacheControl : undefined)
        : fallbackRedirect(request);
    }

    routeMissCache.delete(routeMissCacheKey);

    const originalContentType = detectContentType(imageBuffer);
    const optimizedImage = await optimizeImageBuffer(imageBuffer, {
      hash: imageHash,
      variant: catalogMode ? "catalog" : "full",
      originalContentType,
    });

    return new NextResponse(new Uint8Array(optimizedImage.buffer), {
      status: 200,
      headers: {
        "content-type": optimizedImage.contentType,
        "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    if (routeMissTtlMs > 0) {
      routeMissCache.set(routeMissCacheKey, Date.now() + routeMissTtlMs);
    }
    return strictMode || catalogMode
      ? fallbackNotFound(catalogMode ? catalogMissCacheControl : undefined)
      : fallbackRedirect(request);
  }
}
