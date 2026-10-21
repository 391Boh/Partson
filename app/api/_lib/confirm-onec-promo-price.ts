import { clearAllOneCCache } from "./oneC";
import { readOneCPriceResultValue } from "./onec-price-result";
import { fetchPromoOffersByLookupKeys } from "app/lib/catalog-server";

// A handled request is not proof of a saved price: older 1C modules omit
// the promo echo, and some return the old value. Read the exact product back.
export async function confirmOneCPromoPrice(
  expected: number,
  response: Record<string, unknown>,
  lookupKey: string
): Promise<boolean> {
  const result = response.price_result;
  const echoed = readOneCPriceResultValue(
    result && typeof result === "object" ? result as Record<string, unknown> : undefined,
    "promo"
  ) ?? readOneCPriceResultValue(response, "promo");
  if (echoed !== undefined && Math.abs(echoed - expected) < 0.000001) return true;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    clearAllOneCCache();
    const offers = await fetchPromoOffersByLookupKeys([lookupKey], {
      live: true, timeoutMs: 1800, retries: 0, cacheTtlMs: 0, concurrency: 1,
    }).catch(() => ({}));
    const offer = Object.values(offers)[0];
    if (offer && (expected === 0
      ? offer.hasPromo === false
      : offer.hasPromo && typeof offer.promoPriceEuro === "number" && Math.abs(offer.promoPriceEuro - expected) < 0.000001)) return true;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return false;
}

// A module older than the promo support answers a handled price block
// without any Акція field (or "Ціна не передана" for a promo-only edit).
export function oneCLacksPromoSupport(response: Record<string, unknown>): boolean {
  const result = response.price_result;
  if (!result || typeof result !== "object") return false;
  const record = result as Record<string, unknown>;
  return record.success !== false && readOneCPriceResultValue(record, "promo") === undefined;
}

export const promoConfirmationError = (response: Record<string, unknown>) =>
  oneCLacksPromoSupport(response)
    ? "Акційну ціну не збережено: модуль 1С ще не записує поле «Акція». Потрібно завантажити оновлений модуль ОбщегоНазначения в базу 1С."
    : "1С не підтвердила акційну ціну після повторної перевірки. Перевірте ціну в 1С перед повторним збереженням.";
