const normalizeSegment = (value?: string) => (value || "").trim();
const PRODUCT_IMAGE_ROUTE_VERSION = "3";

export const buildProductImageBatchKey = (
  productCode: string,
  articleHint?: string
) => {
  const normalizedCode = normalizeSegment(productCode).toLowerCase();
  const normalizedArticle = normalizeSegment(articleHint).toLowerCase();

  if (!normalizedCode) return "";
  if (!normalizedArticle || normalizedArticle === normalizedCode) {
    return `${normalizedCode}::-`;
  }

  return `${normalizedCode}::${normalizedArticle}`;
};

export const buildProductImagePath = (
  productCode: string,
  articleHint?: string,
  options?: {
    catalog?: boolean;
    retryToken?: number;
    strict?: boolean;
    noFallback?: boolean;
    cacheBust?: string | number;
  }
) => {
  const normalizedCode = normalizeSegment(productCode);
  if (!normalizedCode) return "";

  const normalizedArticle = normalizeSegment(articleHint);
  const params = new URLSearchParams();
  // Version the public URL independently from the one-shot `v` cache bust.
  // This retires legacy responses that browsers/CDNs may still hold under the
  // previous long-lived cache policy while keeping normal route caching active.
  params.set("iv", PRODUCT_IMAGE_ROUTE_VERSION);

  if (options?.catalog === true) {
    params.set("catalog", "1");
  }

  if (options?.strict === true) {
    params.set("strict", "1");
  }

  if (options?.noFallback === true) {
    params.set("fallback", "404");
  }

  if ((options?.retryToken || 0) > 0) {
    params.set("retry", String(options?.retryToken));
  }

  if (options?.cacheBust !== undefined && String(options.cacheBust).trim()) {
    params.set("v", String(options.cacheBust).trim());
  }

  if (
    normalizedArticle &&
    normalizedArticle.toLowerCase() !== normalizedCode.toLowerCase()
  ) {
    params.set("article", normalizedArticle);
  }

  const serialized = params.toString();
  return serialized
    ? `/product-image/${encodeURIComponent(normalizedCode)}?${serialized}`
    : `/product-image/${encodeURIComponent(normalizedCode)}`;
};
