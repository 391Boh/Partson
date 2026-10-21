// Offline regression checks: node scripts/test-product-stock.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

let response;
let sent;
let freshStock = null;
let readCount = 0;
let promoReadback = {};
const promoReadbackRequests = [];
const noop = () => {};
const priceResult = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/api/_lib/onec-price-result.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: priceResult });
assert.equal(priceResult.readOneCPriceResultValue({ ЦенаАкции: "7,25" }, "promo"), 7.25);
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
  "app/api/_lib/requestValidation": { isNonEmptyString: (s) => typeof s === "string" && !!s.trim(), readJsonObject: async request => ({ ok: true, value: JSON.parse(await request.text()) }) },
  "app/api/_lib/admin-auth": { verifyAdminRequest: async () => ({ email: "test@example.com" }) },
  "app/api/_lib/onec-price-result": priceResult,
  "app/lib/catalog-image-result-cache": { clearCatalogImageResultCacheForProduct: noop },
  "app/lib/product-image": { clearProductImageCacheForProduct: noop },
  "app/lib/product-image-route-cache": { clearRouteImageCacheForProduct: noop },
  "app/lib/catalog-page-route-cache": { clearCatalogPageRouteCache: noop },
  "app/lib/catalog-server": {
    invalidateFullCatalogSnapshot: noop,
    patchFullCatalogSnapshotProduct: noop,
    fetchPromoOffersByLookupKeys: async (keys, options) => {
      promoReadbackRequests.push({ keys, options });
      return promoReadback;
    },
    fetchExactCatalogProductByLookup: async (_code, options) => {
      readCount++;
      assert.equal(options.cacheTtlMs, 0);
      assert.equal(options.retries, 0);
      return freshStock;
    },
  },
  "app/lib/product-promo-overrides": { setProductPromoPriceOverride: noop },
  "app/lib/product-edit-overrides": { setProductEditOverride: noop },
};
const promoConfirmation = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/api/_lib/confirm-onec-promo-price.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: promoConfirmation, setTimeout,
  require: name => mocks[name] || mocks[`app/api/_lib/${name.replace(/^\.\//, "")}`],
});
mocks["app/api/_lib/confirm-onec-promo-price"] = promoConfirmation;
const exports = {};
const source = readFileSync(new URL("../app/api/product-update/route.ts", import.meta.url), "utf8");
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports, process: { env: {} }, Headers, setTimeout,
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
  freshStock = { code: "123", quantity: Number(String(raw).replace(",", ".")) };
  const result = await update({ receipt: 2 }, { success: true, quantity_result: { success: true, КількістьДо: raw } });
  assert.equal(result.body.quantity, Number(String(raw).replace(",", ".")));
  assert.equal(sent.retries, 0, "Stock movements must never be retried automatically");
  assert.equal(sent.body.Поступлення, 2);
}
// Movement response fields are ambiguous; only a fresh product read
// confirms the resulting balance, including when an old balance is echoed.
{
  freshStock = { code: "123", quantity: 52 };
  const result = await update(
    { receipt: 2 },
    { success: true, quantity_result: { success: true, Кількість: 2, КількістьДо: 50 } }
  );
  assert.equal(result.body.quantity, 52);
}
for (const body of [{ receipt: -1 }, { sale: 1.5 }, { quantity: 2, receipt: 1 }]) {
  assert.equal((await update(body, {})).status, 400);
  assert.equal(sent, undefined);
}
freshStock = null;
for (const reply of [{ updated: false }, { error: "Номенклатура не найдена" }, { message: "Номенклатура не найдена" }]) {
  const failed = await update({ name: "New name" }, reply);
  assert.equal(failed.status, 422, "A failed 1C edit must not be presented as success");
  assert.equal(failed.body.ok, false);
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
const savedPromo = await update({ article: "ARTICLE-42", Акція: 7.25, requirePriceConfirmation: true }, {
  success: true, price_result: { success: true, Акция: "7,25" },
});
assert.equal(savedPromo.status, 200, "Accept 1C's Russian alias and decimal-comma promo-price echo");
assert.equal(savedPromo.body.promoPriceEuro, 7.25);
assert.equal(sent.body.артикул_ціни, "ARTICLE-42");
assert.equal(sent.body.Акція, 7.25);
promoReadback = { "article-42": { hasPromo: true, promoPriceEuro: 7.25 } };
const promoReadbackSave = await update({ article: "ARTICLE-42", Акція: 7.25, requirePriceConfirmation: true }, {
  success: true, price_result: { success: true },
});
assert.equal(promoReadbackSave.status, 200, "Confirm a promo price by reading the exact article when the edit response omits its value");
assert.equal(promoReadbackRequests.at(-1).keys.join(","), "ARTICLE-42");
assert.equal(promoReadbackRequests.at(-1).options.live, true);
assert.equal(promoReadbackRequests.at(-1).options.cacheTtlMs, 0);
const stalePromoEchoSave = await update({ article: "ARTICLE-42", Акція: 7.25, requirePriceConfirmation: true }, {
  success: true, price_result: { success: true, Акція: 8.5 },
});
assert.equal(stalePromoEchoSave.status, 200, "Use the matching live value if the edit response contains a stale price");
assert.equal(stalePromoEchoSave.body.promoPriceEuro, 7.25);
promoReadback = { "article-42": { hasPromo: false, promoPriceEuro: null } };
const promoRemovalReadback = await update({ article: "ARTICLE-42", Акція: 0, requirePriceConfirmation: true }, {
  success: true, price_result: { success: true },
});
assert.equal(promoRemovalReadback.status, 200, "Confirm promo removal when the exact article has no active promo");
promoReadback = {};
// A 1C module without promo support answers the price block without Акція.
const oldModulePromo = await update({ article: "ARTICLE-42", Акція: 7.25, requirePriceConfirmation: true }, {
  success: true, price_result: { success: true, message: "Ціна не передана" },
});
assert.equal(oldModulePromo.status, 502);
assert.match(oldModulePromo.body.error, /модуль 1С ще не записує поле «Акція»/, "Name the outdated 1C module instead of a generic failure");
const failedPromo = await update({ article: "ARTICLE-42", Акція: 7.25, requirePriceConfirmation: true }, {
  success: true, price_result: { success: false, message: "Помилка запису" },
});
assert.notEqual(failedPromo.status, 200);
assert.doesNotMatch(failedPromo.body.error, /модуль 1С/, "A failed write in a current module is not reported as an outdated module");
for (const price_result of [undefined, { success: true }, { success: true, ЦінаПрод: 0 }]) {
  assert.equal((await update({ ЦінаПрод: 12.5, requirePriceConfirmation: true }, { success: true, price_result })).status, 502);
}
assert.equal((await update({ ЦінаПрод: 0, requirePriceConfirmation: true }, { success: true, price_result: { ЦінаПрод: 0 } })).status, 200);
console.log('New product price confirmation checks passed.');

// A movement amount must never be displayed as the total remaining stock.
freshStock = { code: "123", quantity: 52 };
readCount = 0;
const verified = await update({ receipt: 2 }, { success: true, quantity_result: { success: true, Кількість: 2 } });
assert.equal(verified.body.quantity, 52);
assert.equal(readCount, 1);
assert.equal(sent.retries, 0);
freshStock = { code: "123", quantity: 0 };
assert.equal((await update({ quantity: 0 }, { success: true })).body.quantity, 0);
freshStock = { code: "123", quantity: 7 };
assert.equal((await update({ quantity: 9 }, { success: true, quantity_result: { Кількість: 7 } })).status, 409);
freshStock = { code: "different", quantity: 9 };
assert.equal((await update({ quantity: 9 }, { success: true })).status, 502);
console.log("Stock verification passed: uncached read, movement echo, zero and mismatched balance.");

// A successful movement survives one failed confirmation read. Only reads
// repeat, and a stale before-balance must never be published as the result.
freshStock = { code: "123", quantity: 49 };
const originalRead = mocks["app/lib/catalog-server"].fetchExactCatalogProductByLookup;
let confirmationAttempts = 0;
mocks["app/lib/catalog-server"].fetchExactCatalogProductByLookup = async (...args) => {
  if (++confirmationAttempts === 1) return null;
  return originalRead(...args);
};
const recovered = await update({ sale: 3 }, { success: true, quantity_result: { КількістьДо: 52, Кількість: 3 } });
assert.equal(recovered.body.quantity, 49);
assert.equal(confirmationAttempts, 2);
assert.equal(sent.retries, 0);
mocks["app/lib/catalog-server"].fetchExactCatalogProductByLookup = originalRead;
console.log("Receipt/sale confirmation passed: old balance ignored, transient read failure recovered without another write.");

// Full-form writes may update normal and promotional prices together.
promoReadback = { "article-42": { hasPromo: true, promoPriceEuro: 7.25 } };
assert.equal((await update({ article: "ARTICLE-42", ЦінаПрод: 12.5, Акція: 7.25, requirePriceConfirmation: true }, {
  success: true, price_result: { success: true, ЦінаПрод: 12.5 },
})).status, 200);
promoReadback = { "article-42": { hasPromo: true, promoPriceEuro: 8.5 } };
assert.equal((await update({ article: "ARTICLE-42", Акція: 7.25 }, {
  success: true, price_result: { success: true, Акція: 8.5 },
})).status, 502, "Unconfirmed promotions must fail even for callers without the strict flag");

// The price-only endpoint must follow the same confirmation contract.
const priceExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/api/product-update-price/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: priceExports, process: { env: {} }, Headers,
  require: name => { assert.ok(mocks[name], name); return mocks[name]; },
});
const savePromo = async (price, reply) => {
  response = reply;
  const result = await priceExports.POST({ text: async () => JSON.stringify({ code: "123", article: "ARTICLE-42", promoPriceEuro: price }) });
  return { status: result.status, body: await result.json() };
};
assert.equal((await savePromo(7.25, { success: true, price_result: { Акція: 8.5 } })).status, 502);
promoReadback = { "article-42": { hasPromo: true, promoPriceEuro: 7.25 } };
const addedPromo = await savePromo(7.25, { success: true, price_result: { success: true } });
assert.equal(addedPromo.status, 200);
assert.equal(addedPromo.body.promoPriceEuro, 7.25);
assert.equal(addedPromo.body.hasPrice, undefined, "A promo edit must not erase regular-price availability");
promoReadback = { "article-42": { hasPromo: false, promoPriceEuro: null } };
assert.equal((await savePromo(0, { success: true })).body.promoPriceEuro, 0);
console.log("Promo add/edit/remove confirmation passed on both endpoints, including mixed edits and stale echoes.");
