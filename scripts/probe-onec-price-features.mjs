// Read-only check of which site features the installed 1C module supports.
// Never writes to 1C and never prints configuration or credentials.
// Usage: node --env-file=.env.local scripts/probe-onec-price-features.mjs
import { oneCRequest } from "../app/api/_lib/oneC.js";

const request = async (endpoint, body) => {
  const started = Date.now();
  const result = await oneCRequest(endpoint, { method: "POST", body, timeoutMs: 30000, retries: 0, cacheTtlMs: 0 });
  let payload = {};
  try { payload = JSON.parse(result.text); } catch {}
  return { payload, ms: Date.now() - started };
};
const listing = { ВключатьФотоBase64: false, ВключатьОписание: false };

const priced = await request("allgoods", { ...listing, Лимит: 3, ТолькоСЦеной: true });
const item = priced.payload.items?.[0] ?? {};
const unpriced = await request("allgoods", { ...listing, Лимит: 3, ТолькоБезЦены: true });
const direct = await request("allgoods", { ...listing, Лимит: 3, ТолькоБезЦены: true, ПрямаяСтраница: true, Смещение: 3 });
const price = await request("prices", { Код: item.НомерПоКаталогу || item.Артикул || "" });

const checks = [
  ["price_filter sale_v1 (ТолькоБезЦены)", priced.payload.price_filter === "sale_v1"],
  ["ТолькоБезЦены returns only price-less rows", (unpriced.payload.items || []).every((row) => !(Number(row.ЦінаПрод) > 0)) && unpriced.payload.price_filter === "sale_v1"],
  ["direct page with a price filter", direct.payload.pagination_mode === "offset_v1" && direct.payload.offset === 3],
  ["purchase price hidden from listings", !("ЦінаЗакуп" in item)],
  ["description omitted from listings", !("Описание" in item)],
  ["prices returns Акція (promo read-back)", "Акція" in price.payload],
];
for (const [name, ok] of checks) console.log(`${ok ? "yes" : "no "}  ${name}`);
console.log(`timings: priced ${priced.ms}ms, unpriced ${unpriced.ms}ms, direct ${direct.ms}ms, prices ${price.ms}ms`);
