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


/**
 * costPriceEuro is the 1C purchase price. Catalog queries keep it for admin
 * price lookups, but anything serialized to the browser — API responses and
 * props passed to client components — must drop it first.
 */
export const withoutCostPrice = <T extends object>(product: T): Omit<T, "costPriceEuro"> => {
  if (!("costPriceEuro" in product)) return product;
  const { costPriceEuro: _costPriceEuro, ...publicProduct } = product as T & {
    costPriceEuro?: unknown;
  };
  void _costPriceEuro;
  return publicProduct;
};
