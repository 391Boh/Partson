type PriceField = "sale" | "cost" | "promo";

const PRICE_RESULT_FIELDS: Record<PriceField, readonly string[]> = {
  sale: [
    "ЦінаПрод",
    "ЦенаПрод",
    "ЦінаПродажу",
    "ЦенаПродажи",
    "priceEuro",
    "price_euro",
  ],
  cost: [
    "ЦінаЗакуп",
    "ЦенаЗакуп",
    "ЦінаЗакупівлі",
    "ЦенаЗакупки",
    "costPriceEuro",
    "purchasePrice",
    "purchase_price",
  ],
  promo: [
    "Акція",
    "Акция",
    "ЦінаАкції",
    "ЦенаАкции",
    "ЦенаАкция",
    "АкционнаяЦена",
    "promoPriceEuro",
    "promo_price_euro",
    "actionPriceEuro",
    "salePriceEuro",
    "discountPriceEuro",
  ],
};

export function readOneCPriceResultValue(
  result: Record<string, unknown> | undefined,
  field: PriceField
): number | undefined {
  if (!result) return undefined;

  for (const key of PRICE_RESULT_FIELDS[field]) {
    const raw = result[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw !== "string") continue;

    const normalized = raw.trim().replace(/\s+/g, "").replace(",", ".");
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) continue;
    const value = Number(normalized);
    if (Number.isFinite(value)) return value;
  }

  return undefined;
}
