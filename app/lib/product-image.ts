import "server-only";

import { oneCRequest } from "app/api/_lib/oneC";

export const PRODUCT_IMAGE_FALLBACK_PATH = "/Car-parts-fullwidth.png";

const IMAGE_BASE64_FIELDS = ["image_base64", "imageBase64", "ImageBase64", "image", "Image"];

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeBase64 = (value: string) => value.replace(/[\r\n\s]+/g, "").trim();

const readImageBase64 = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  for (const key of IMAGE_BASE64_FIELDS) {
    const value = record[key];
    if (typeof value !== "string") continue;
    const normalized = normalizeBase64(value);
    if (normalized) return normalized;
  }

  return null;
};

export const fetchProductImageBase64 = async (codeOrArticle: string) => {
  const normalized = safeDecode(codeOrArticle || "").trim();
  if (!normalized) return null;

  const response = await oneCRequest("getimages", {
    method: "POST",
    body: { code: normalized },
    retries: 1,
    retryDelayMs: 250,
    cacheTtlMs: 1000 * 60 * 60,
  });

  if (response.status < 200 || response.status >= 300) return null;

  try {
    const payload = JSON.parse(response.text) as unknown;
    const imageBase64 = readImageBase64(payload);
    if (!imageBase64) return null;

    // Quick validation that the payload is decodable.
    const decoded = Buffer.from(imageBase64, "base64");
    if (!decoded.length) return null;

    return imageBase64;
  } catch {
    return null;
  }
};

export const getProductImagePath = (code: string) =>
  `/product-image/${encodeURIComponent((code || "").trim())}`;
