export type PublicCatalogProductCandidate = {
  priceEuro?: number | null;
  hasPhoto?: boolean;
};

export const hasPublicCatalogPrice = (
  product: PublicCatalogProductCandidate | null | undefined
) =>
  typeof product?.priceEuro === "number" &&
  Number.isFinite(product.priceEuro) &&
  product.priceEuro > 0;

/**
 * Products exposed to shoppers, search engines and payment-provider review
 * must have both a real non-zero price and a confirmed product photo.
 */
export const isPublicCatalogProduct = (
  product: PublicCatalogProductCandidate | null | undefined
) => hasPublicCatalogPrice(product) && product?.hasPhoto === true;

