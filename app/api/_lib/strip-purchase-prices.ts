// Raw 1C answers (allgoods, prices) can carry the purchase price until the
// 1C module that leaves it out by default is loaded. Public routes that pass
// those answers through drop every purchase/cost field first.
const PURCHASE_PRICE_KEY = /закуп|cost/i;

export const stripPurchasePrices = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripPurchasePrices);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !PURCHASE_PRICE_KEY.test(key))
      .map(([key, entry]) => [key, stripPurchasePrices(entry)])
  );
};

/** The same, on a JSON text; anything that isn't JSON is returned as is. */
export const stripPurchasePricesFromText = (text: string) => {
  try {
    return JSON.stringify(stripPurchasePrices(JSON.parse(text)));
  } catch {
    return text;
  }
};
