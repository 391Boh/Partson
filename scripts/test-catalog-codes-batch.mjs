// fetchCatalogProductsByCodes (catalog-live): one allgoods call with Коди on a
// 1C that knows it; null (per-code fallback) on an older module, remembered.
import assert from "node:assert/strict";
import { loadCatalogSearch } from "./lib/catalog-search-harness.mjs";

const record = (code) => ({ Код: code, Артикул: `A-${code}`, Наименование: `Товар ${code}`, ЦінаПрод: 10, Количество: 2 });
const answer = (codes) => ({ status: 200, text: JSON.stringify({ success: true, items: codes.map(record) }) });

// A current module filters by Коди.
const currentCalls = [];
const current = loadCatalogSearch(async (endpoint, options) => {
  currentCalls.push({ endpoint, body: options.body });
  return answer((options.body.Коди || []).filter((code) => code !== "GONE"));
});
const found = await current.fetchCatalogProductsByCodes(["00-2", "00-1", "GONE", "00-1"]);
assert.equal(currentCalls.length, 1, "One 1C call for the whole batch");
assert.deepEqual([...currentCalls[0].body.Коди], ["00-1", "00-2", "GONE"], "Unique, sorted codes");
assert.equal(currentCalls[0].body.Лимит, 3);
assert.deepEqual([...found.keys()].sort(), ["00-1", "00-2"], "Missing products are simply absent");
assert.equal(found.get("00-1").quantity, 2);
assert.equal((await current.fetchCatalogProductsByCodes([])).size, 0);
assert.equal(await current.fetchCatalogProductsByCodes(Array.from({ length: 51 }, (_, i) => `C${i}`)), null, "Over 50 codes is not batched");

// An older module ignores Коди and lists the catalog from the start.
const olderCalls = [];
const older = loadCatalogSearch(async (endpoint) => {
  olderCalls.push(endpoint);
  return answer(["00-0", "00-1"]);
});
assert.equal(await older.fetchCatalogProductsByCodes(["00-1", "00-5"]), null, "Unrequested product means no Коди support");
assert.equal(await older.fetchCatalogProductsByCodes(["00-7"]), null);
assert.equal(olderCalls.length, 1, "The miss is remembered; no second probe");

// A failed request is a fallback, not an empty result.
const failing = loadCatalogSearch(async () => ({ status: 500, text: "{}" }));
assert.equal(await failing.fetchCatalogProductsByCodes(["00-1"]), null);

// Descriptions for every card on screen come from the same single call.
const describedCalls = [];
const described = loadCatalogSearch(async (endpoint, options) => {
  describedCalls.push({ endpoint, body: options.body });
  return {
    status: 200,
    text: JSON.stringify({
      success: true,
      items: [
        { Код: "00-1", Описание: "Трос зчеплення" },
        { Код: "00-2", Описание: "   " },
      ],
    }),
  };
});
const descriptions = await described.fetchProductDescriptionsByCodes(["00-2", "00-1", "00-1", "00-3"]);
assert.equal(describedCalls.length, 1, "One 1C call for all descriptions");
assert.equal(describedCalls[0].endpoint, "allgoods");
assert.deepEqual([...describedCalls[0].body.Коди], ["00-1", "00-2", "00-3"]);
assert.equal(describedCalls[0].body.ВключатьОписание, true);
assert.equal(descriptions.get("00-1"), "Трос зчеплення");
assert.equal(descriptions.has("00-2"), false, "A blank description is no description");
assert.equal(descriptions.has("00-3"), false, "A product 1C did not return is absent");
assert.equal((await described.fetchProductDescriptionsByCodes([])).size, 0);

const olderDescribed = loadCatalogSearch(async () => answer(["00-0"]));
assert.equal(await olderDescribed.fetchProductDescriptionsByCodes(["00-1"]), null, "An older 1C falls back");
const forbidden = loadCatalogSearch(async () => ({ status: 403, text: "" }));
assert.equal(await forbidden.fetchProductDescriptionsByCodes(["00-1"]), null, "A refused batch falls back");
const brokenBody = loadCatalogSearch(async () => ({ status: 200, text: "<html>" }));
assert.equal(await brokenBody.fetchProductDescriptionsByCodes(["00-1"]), null, "An unreadable answer falls back");

console.log("Catalog codes batch passed: one call per batch, older 1C detected and remembered, failures fall back.");
