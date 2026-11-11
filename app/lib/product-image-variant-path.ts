import { buildProductPath, type ProductPathInput } from "app/lib/product-url";
import { buildPlainSeoSlug } from "app/lib/seo-slug";

// Width:height of the letterboxed product photo variants served by
// app/product-image/[code]/[ratio]/[file]/route.ts.
export const PRODUCT_IMAGE_ASPECT_RATIOS = {
  "1x1": [1, 1],
  "16x9": [16, 9],
  "4x3": [4, 3],
} as const;
export type ProductImageAspectRatio = keyof typeof PRODUCT_IMAGE_ASPECT_RATIOS;

// The same route serves the primary photo itself, uncropped, under this segment.
export const PRODUCT_PHOTO_SEGMENT = "photo";

const MAX_FILE_SLUG_LENGTH = 90;

const toFileSlug = (label: string) =>
  buildPlainSeoSlug(label).slice(0, MAX_FILE_SLUG_LENGTH).replace(/-+$/g, "") || "photo";

const articleQuery = (code: string, articleHint?: string) => {
  const article = (articleHint || "").trim();
  return article && article.toLowerCase() !== code.toLowerCase()
    ? `?article=${encodeURIComponent(article)}`
    : "";
};

/**
 * `/product-image/00-00004279/16x9/dysk-halmivnyy-peredniy-bosch-0986479b69.webp`
 * — the primary photo at another aspect ratio, with a readable file name.
 */
export const buildProductImageVariantPath = (
  productCode: string,
  ratio: ProductImageAspectRatio,
  fileLabel: string,
  articleHint?: string
) => {
  const code = (productCode || "").trim();
  if (!code) return "";
  return `/product-image/${encodeURIComponent(code)}/${ratio}/${toFileSlug(fileLabel)}.webp${articleQuery(code, articleHint)}`;
};

/**
 * `/product-image/00-00000066/photo/tros-zcheplennya-vectra-a-1-8-2-0-calibra-89-ad330143.webp`
 * — the primary photo as is, named after its product page. This is the one
 * URL Google sees for the photo: the page <img>, JSON-LD, og:image, the image
 * sitemap and the Merchant feed all build it from the same product fields, so
 * its indexing signals never split across query-string variants, and no
 * global cache version bump ever retires it.
 */
export const buildProductPhotoPath = (product: ProductPathInput) => {
  const code = (product.code || "").trim();
  if (!code) return "";
  let pageSlug = buildProductPath(product).split("/").pop() || "";
  try { pageSlug = decodeURIComponent(pageSlug); } catch {}
  return `/product-image/${encodeURIComponent(code)}/${PRODUCT_PHOTO_SEGMENT}/${toFileSlug(pageSlug)}.webp${articleQuery(code, product.article)}`;
};
