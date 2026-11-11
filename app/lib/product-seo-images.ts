import { buildProductImageVariantPath, buildProductPhotoPath } from "./product-image-variant-path";
import type { ProductPathInput } from "./product-url";
import { PRODUCT_IMAGE_FALLBACK_PATH } from "./product-image-constants";

export function buildProductSeoImages(options: {
  siteUrl: string; product: ProductPathInput; label: string;
  hasCatalogPhoto: boolean; gallery?: string[];
}) {
  const { siteUrl, product, label, hasCatalogPhoto, gallery = [] } = options;
  const code = (product.code || "").trim();
  const article = product.article;
  const absolute = (value: string) => {
    try {
      if (!value || value.startsWith("//") || (!value.startsWith("/") && !/^https?:\/\//i.test(value))) return "";
      const url = new URL(value, siteUrl);
      if (url.username || url.password || url.pathname === PRODUCT_IMAGE_FALLBACK_PATH) return "";
      url.hash = "";
      return url.href;
    } catch { return ""; }
  };
  const catalog = hasCatalogPhoto && code ? [
    buildProductPhotoPath(product),
    ...(["1x1", "4x3", "16x9"] as const).map(ratio => buildProductImageVariantPath(code, ratio, label, article)),
  ] : [];
  const images = [...new Set([...catalog, ...gallery].map(absolute).filter(Boolean))].slice(0, 16);
  return { primary: images[0] || "", images };
}
