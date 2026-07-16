import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";
import { buildProductImagePath } from "app/lib/product-image-path";
import {
  buildPersistentCatalogRouteImageKey,
  getProductRouteImageCacheRevision,
  isRouteImageCacheInvalidating,
  removePersistentRouteImage,
  routeImageHitCache,
  writePersistentRouteImage,
} from "app/lib/product-image-route-cache";

type CatalogImageIdentity = {
  code: string;
  article?: string;
};

const CATALOG_IMAGE_MAX_WIDTH = 320;
const CATALOG_IMAGE_MAX_HEIGHT = 320;
const CATALOG_IMAGE_QUALITY = 64;
const CATALOG_WEBP_PASSTHROUGH_MAX_BYTES = 120 * 1024;
const CATALOG_ROUTE_MEMORY_CACHE_TTL_MS = 1000 * 60 * 60 * 4;

let fallbackImageHashPromise: Promise<string | null> | null = null;

const buildBufferHash = (buffer: Buffer) =>
  createHash("sha1").update(buffer).digest("hex");

const getFallbackImageHash = () => {
  if (!fallbackImageHashPromise) {
    fallbackImageHashPromise = readFile(
      path.join(
        process.cwd(),
        "public",
        PRODUCT_IMAGE_FALLBACK_PATH.replace(/^\//, "")
      )
    )
      .then(buildBufferHash)
      .catch(() => null);
  }

  return fallbackImageHashPromise;
};

const detectImageContentType = (buffer: Buffer) => {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
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
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }
  return "";
};

const optimizeCatalogImage = async (
  buffer: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string }> => {
  if (
    contentType === "image/gif" ||
    (contentType === "image/webp" &&
      buffer.length <= CATALOG_WEBP_PASSTHROUGH_MAX_BYTES)
  ) {
    return { buffer, contentType };
  }

  try {
    const transformed = await sharp(buffer, {
      failOn: "none",
      animated: false,
    })
      .rotate()
      .resize({
        width: CATALOG_IMAGE_MAX_WIDTH,
        height: CATALOG_IMAGE_MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: CATALOG_IMAGE_QUALITY, effort: 2 })
      .toBuffer();

    if (transformed.length > 0 && transformed.length < buffer.length) {
      return { buffer: transformed, contentType: "image/webp" };
    }
  } catch {
    // The original image is still valid and can be served unchanged.
  }

  return { buffer, contentType };
};

export const materializeCatalogImageBase64 = async (
  item: CatalogImageIdentity,
  imageBase64: string,
  options?: { cacheRevision?: string }
) => {
  const code = (item.code || "").trim();
  const article = (item.article || "").trim();
  if (!code || !imageBase64) return null;

  try {
    const originalBuffer = Buffer.from(imageBase64, "base64");
    if (!originalBuffer.length) return null;

    const [fallbackHash, originalContentType] = await Promise.all([
      getFallbackImageHash(),
      Promise.resolve(detectImageContentType(originalBuffer)),
    ]);
    if (!originalContentType.startsWith("image/")) return null;
    if (fallbackHash && buildBufferHash(originalBuffer) === fallbackHash) {
      return null;
    }

    const cacheRevision =
      options?.cacheRevision ??
      getProductRouteImageCacheRevision(code, article);
    const optimized = await optimizeCatalogImage(
      originalBuffer,
      originalContentType
    );

    if (
      cacheRevision !== getProductRouteImageCacheRevision(code, article) ||
      isRouteImageCacheInvalidating(code, article)
    ) {
      return null;
    }

    const persistentCacheKey = buildPersistentCatalogRouteImageKey(
      code,
      article
    );
    // Hand the optimized buffer straight to the public image route. Previously
    // the batch waited for a disk write and the route immediately read/hash-checked
    // that same file again before a card could paint it.
    routeImageHitCache.set(persistentCacheKey, {
      expiresAt: Date.now() + CATALOG_ROUTE_MEMORY_CACHE_TTL_MS,
      value: optimized,
    });

    // Keep the persistent cache warm for later processes/requests, but do not
    // make the first visible paint wait on filesystem I/O.
    void writePersistentRouteImage(persistentCacheKey, optimized)
      .then(async () => {
        if (
          cacheRevision === getProductRouteImageCacheRevision(code, article) &&
          !isRouteImageCacheInvalidating(code, article)
        ) {
          return;
        }

        routeImageHitCache.delete(persistentCacheKey);
        await removePersistentRouteImage(persistentCacheKey);
      })
      .catch(() => undefined);

    return buildProductImagePath(code, article, { catalog: true });
  } catch {
    return null;
  }
};
