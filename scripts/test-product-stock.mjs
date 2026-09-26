// Offline regression checks: node scripts/test-product-stock.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

let response;
let sent;
const noop = () => {};
const mocks = {
  "next/server": { NextResponse: Response },
  "next/cache": { revalidatePath: noop, revalidateTag: noop },
  "app/api/_lib/oneC": {
    clearAllOneCCache: noop,
    oneCRequest: async (_endpoint, options) => {
      sent = options;
      return { status: 200, text: JSON.stringify(response) };
    },
  },
  "app/api/_lib/rateLimit": { checkRateLimit: () => ({ ok: true }), setRateLimitHeaders: noop },
  "app/api/_lib/requestValidation": { isNonEmptyString: (s) => typeof s === "string" && !!s.trim() },
  "app/api/_lib/admin-auth": { verifyAdminRequest: async () => ({ email: "test@example.com" }) },
  "app/lib/catalog-image-result-cache": { clearCatalogImageResultCacheForProduct: noop },
  "app/lib/product-image": { clearProductImageCacheForProduct: noop },
  "app/lib/product-image-route-cache": { clearRouteImageCacheForProduct: noop },
  "app/lib/catalog-page-route-cache": { clearCatalogPageRouteCache: noop },
};
const exports = {};
const source = readFileSync(new URL("../app/api/product-update/route.ts", import.meta.url), "utf8");
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports, process: { env: {} }, Headers,
  require: (name) => {
    assert.ok(mocks[name], `Unexpected dependency: ${name}`);
    return mocks[name];
  },
});
async function update(body, oneCResponse) {
  response = oneCResponse;
  sent = undefined;
  const result = await exports.POST({ text: async () => JSON.stringify({ Код: "123", ...body }) });
  return { status: result.status, body: await result.json() };
}

for (const raw of [7, "7", "7,0", 0, "0"]) {
  const result = await update({ receipt: 2 }, { success: true, quantity_result: { success: true, Кількість: raw } });
  assert.equal(result.body.quantity, Number(String(raw).replace(",", ".")));
  assert.equal(sent.retries, 0, "Stock movements must never be retried automatically");
  assert.equal(sent.body.Поступлення, 2);
}
// quantity_result.Кількість echoes back the *movement* amount (e.g. the "2"
// just received), not the resulting balance — quantity_result.КількістьДо is
// 1C's actual post-movement stock level, and must win whenever present.
{
  const result = await update(
    { receipt: 2 },
    { success: true, quantity_result: { success: true, Кількість: 2, КількістьДо: 52 } }
  );
  assert.equal(result.body.quantity, 52);
}
for (const body of [{ receipt: -1 }, { sale: 1.5 }, { quantity: 2, receipt: 1 }]) {
  assert.equal((await update(body, {})).status, 400);
  assert.equal(sent, undefined);
}
assert.equal((await update({ sale: 1 }, { success: true })).status, 502);
assert.equal((await update({ sale: 1 }, { success: true, quantity_result: { success: false } })).body.ok, false);
assert.equal((await update({ receipt: 1 }, { success: true, count: 1, items: [{}] })).body.ok, false);
const created = await update({ ЦінаПрод: 12.5, Кількість: 4 }, {
  success: true, price_result: { success: true, ЦінаПрод: 12.5 }, quantity_result: { success: true, Кількість: 4 },
});
assert.equal(created.body.priceEuro, 12.5);
assert.equal(created.body.quantity, 4);
assert.equal(sent.body.Кількість, 4);
assert.equal(sent.body.артикул_ціни, undefined, "New product prices use the internal code");
console.log("Product stock regression checks passed.");

const savedPrices = await update({ article: 'NEW-ARTICLE', ЦінаПрод: 12.5, ЦінаЗакуп: 8.25, requirePriceConfirmation: true }, {
  success: true, price_result: { success: true, ЦінаПрод: 12.5, ЦінаЗакуп: 8.25 },
});
assert.equal(savedPrices.status, 200);
assert.equal(sent.body.артикул_ціни, 'NEW-ARTICLE');
assert.equal(sent.body.НомерПоКаталогу, undefined);
for (const price_result of [undefined, { success: true }, { success: true, ЦінаПрод: 0 }]) {
  assert.equal((await update({ ЦінаПрод: 12.5, requirePriceConfirmation: true }, { success: true, price_result })).status, 502);
}
assert.equal((await update({ ЦінаПрод: 0, requirePriceConfirmation: true }, { success: true, price_result: { ЦінаПрод: 0 } })).status, 200);
console.log('New product price confirmation checks passed.');
