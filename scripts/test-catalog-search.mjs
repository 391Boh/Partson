// node scripts/test-catalog-search.mjs
import assert from "node:assert/strict";
import { loadCatalogSearch } from "./lib/catalog-search-harness.mjs";

const product = (code, name, article, producer = "BRAND", price = 10) => ({
  Код: code, Наименование: name, НомерПоКаталогу: article,
  ПроизводительНаименование: producer, ЦінаПрод: price, Кількість: 2,
});
let products = [
  product("001", "Фільтр OC90", "OC90", "KNECHT", 20),
  product("002", "Фільтр аналог (OC90)", "AB2", "BOSCH", 10),
  product("003", "Масляний фільтр", "OC90OF", "KNECHT", 30),
  product("004", "Інший товар", "XX", "OC90", 0),
  product("005", "Фільтр Golf 4", "G4", "BOSCH", 15),
];
let calls = [];
let fail = false;
let malformed = false;
const fields = ["Наименование", "НомерПоКаталогу", "Код", "ПроизводительНаименование"];
const transport = async (_endpoint, options) => {
  calls.push(options.body);
  if (fail) return { status: 503, text: "unavailable" };
  if (malformed) return { status: 200, text: "not JSON" };
  const body = options.body;
  const field = fields.find((key) => body[key]);
  const query = (body[field] || "").toLowerCase();
  let items = products.filter((p) => {
    // Reproduce the service's noisy name matches for OEM identifiers.
    if (field === "Наименование" && query === "oc90") return true;
    return !field || p[field].toLowerCase().includes(query);
  });
  const direction = body.СортировкаПоЦене;
  const price = (p) => p.ЦінаПрод > 0 ? p.ЦінаПрод : direction === "ASC" ? 999999999999 : -1;
  items.sort((a, b) => (direction ? (price(a) - price(b)) * (direction === "ASC" ? 1 : -1) : 0) || a.Код.localeCompare(b.Код));
  const total = items.length;
  const cursor = body.ПослеКода;
  if (cursor) {
    if (direction) {
      const after = JSON.parse(cursor);
      items = items.filter((p) => (direction === "ASC" ? price(p) > after.price : price(p) < after.price)
        || (price(p) === after.price && p.Код > after.code));
    } else items = items.filter((p) => p.Код > cursor);
  }
  const hasMore = items.length > body.Лимит;
  items = items.slice(0, body.Лимит);
  const last = items.at(-1);
  return { status: 200, text: JSON.stringify({
    success: true, items, total_count: cursor ? -1 : total, has_more: hasMore,
    next_cursor: hasMore && last ? direction ? JSON.stringify({ price: price(last), code: last.Код }) : last.Код : "",
  }) };
};
const api = loadCatalogSearch(transport);
async function search(query, extra = {}) {
  return api.fetchCatalogProductsByQuery({
    searchQuery: query, searchFilter: "all", page: 1, limit: 2,
    forceAllgoodsSource: true, includePriceEnrichment: false, retries: 0, ...extra,
  });
}
async function collect(query, extra = {}) {
  const codes = [];
  let cursor = "";
  for (let page = 1; page < 20; page++) {
    const result = await search(query, { ...extra, page, cursor });
    codes.push(...result.items.map((p) => p.code));
    if (!result.hasMore) return codes;
    assert.ok(result.nextCursor && result.nextCursor !== cursor);
    cursor = result.nextCursor;
  }
  assert.fail("Pagination did not terminate");
}

assert.deepEqual(await collect("OC90"), ["001", "002", "003", "004"]);
assert.deepEqual(await collect("OC90", { searchFilter: "article" }), ["001", "003"]);
assert.deepEqual(await collect("OC90", { searchFilter: "name" }), ["001", "002"]);
assert.deepEqual(await collect("BOSCH"), ["002", "005"]);
assert.deepEqual(await collect("Golf 4"), ["005"]);
assert.deepEqual(await collect("OC90", { sortOrder: "asc" }), ["002", "001", "003", "004"]);
assert.deepEqual(await collect("OC90", { sortOrder: "desc" }), ["003", "001", "002", "004"]);
assert.deepEqual(await collect("щс90"), ["001", "002", "003", "004"]);
assert.equal((await search("щс90")).correctedQuery, "oc90");
assert.deepEqual(await collect("фшдвддunlikely"), []);
assert.deepEqual(await collect("filtr"), ["001", "002", "003", "005"]);
calls = [];
await search("OC90");
assert.ok(calls.every((body) => fields.some((field) => body[field] === "oc90")), "Literal hits must not trigger alternatives");
assert.deepEqual(Array.from((await search("OC90", { page: 4 })).items), []);
fail = true;
await assert.rejects(search("OC90"), /503/);
fail = false;
malformed = true;
await assert.rejects(search("OC90"), /invalid response/);
malformed = false;

// Real matches occur AFTER a full fuzzy batch. They must not be dropped.
products = Array.from({ length: 125 }, (_, i) => product(String(i).padStart(4, "0"), "Зайвий товар", "NO"));
products.push(product("0200", "Фільтр OC90", "REAL"), product("0201", "Фільтр OC90", "REAL2"));
assert.deepEqual(await collect("OC90"), ["0200", "0201"]);
assert.equal((await search("OC90")).totalCount, 2);
console.log("Catalog search regression checks passed: fields, duplicates, pagination, sorting, layout, transliteration, failures and fuzzy matches.");

const helpers = loadCatalogSearch(transport);
assert.equal(helpers.suggestionDisplayName("Фільтр (примітка (вкладена)) оливи (OEM)"), "Фільтр оливи");
assert.equal(helpers.suggestionDisplayName("Фільтр (незакрита примітка"), "Фільтр");
assert.equal(helpers.suggestionDisplayName("Фільтр （OEM）"), "Фільтр");
await assert.rejects(helpers.searchProductFields({
  query: "OC90", fields: ["name"], limit: 8, cursor: "", sort: "none",
  fetchPage: async () => ({ items: [], hasMore: true, nextCursor: "001" }),
}), /non-advancing cursor/);

// Suggestions and catalog reuse identical upstream batches despite visible limits.
products = Array.from({ length: 40 }, (_, i) => product(String(i).padStart(4, "0"), "Фільтр OC90", "OC90-" + i));
calls = [];
const suggestionPage = await search("OC90", { limit: 8 });
const suggestionRequests = calls.map(body => JSON.stringify(body)).sort();
calls = [];
const catalogPage = await search("OC90", { limit: 16 });
assert.deepEqual(calls.map(body => JSON.stringify(body)).sort(), suggestionRequests);
assert.equal(suggestionPage.items.length, 8);
assert.equal(catalogPage.items.length, 16);
console.log("Search batch reuse passed for suggestions and catalog.");
