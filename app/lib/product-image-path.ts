const normalizeSegment = (value?: string) => (value || "").trim();

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
  options?: { catalog?: boolean; retryToken?: number; strict?: boolean }
) => {
  const normalizedCode = normalizeSegment(productCode);
  if (!normalizedCode) return "";

  const normalizedArticle = normalizeSegment(articleHint);
  const params = new URLSearchParams();

  if (options?.catalog === true) {
    params.set("catalog", "1");
  }

  if (options?.strict === true) {
    params.set("strict", "1");
  }

  if ((options?.retryToken || 0) > 0) {
    params.set("retry", String(options?.retryToken));
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
