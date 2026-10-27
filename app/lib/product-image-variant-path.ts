import { buildPlainSeoSlug } from "app/lib/seo-slug";

// Width:height of the letterboxed product photo variants served by
// app/product-image/[code]/[ratio]/[file]/route.ts.
export const PRODUCT_IMAGE_ASPECT_RATIOS = {
  "16x9": [16, 9],
  "4x3": [4, 3],
} as const;
export type ProductImageAspectRatio = keyof typeof PRODUCT_IMAGE_ASPECT_RATIOS;

const MAX_FILE_SLUG_LENGTH = 90;

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
  const slug = buildPlainSeoSlug(fileLabel).slice(0, MAX_FILE_SLUG_LENGTH).replace(/-+$/g, "") || "photo";
  const article = (articleHint || "").trim();
  const query = article && article.toLowerCase() !== code.toLowerCase()
    ? `?article=${encodeURIComponent(article)}`
    : "";
  return `/product-image/${encodeURIComponent(code)}/${ratio}/${slug}.webp${query}`;
};
