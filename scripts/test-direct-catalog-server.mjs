import assert from "node:assert/strict";
import { loadCatalogSearch } from "./lib/catalog-search-harness.mjs";

let supported = true;
const requests = [];
const api = loadCatalogSearch(async (endpoint, options) => {
  requests.push({ endpoint, ...options });
  return { status: 200, text: JSON.stringify({
    success: true,
    items: [{ Код: "LAST-ITEM", Наименование: "Останній товар", НомерПоКаталогу: "LAST", Количество: 1 }],
    total_count: 10107, has_more: false, next_cursor: "",
    ...(supported ? { pagination_mode: "offset_v1", offset: options.body.Смещение } : {}),
  }) };
});
const result = await api.fetchCatalogProductsByQuery({
  page: 632, limit: 16, directOffset: 10096, sortOrder: "none",
});
assert.equal(requests.length, 1, "Direct page must not walk previous pages");
assert.equal(requests[0].endpoint, "allgoods");
assert.equal(requests[0].body.Смещение, 10096);
assert.equal(requests[0].body.ПрямаяСтраница, true);
assert.equal(requests[0].body.Лимит, 16);
assert.equal(result.directOffset, 10096);
assert.equal(result.items[0].code, "LAST-ITEM");
assert.equal(result.totalCount, 10107);

requests.length = 0;
await api.fetchCatalogProductsByQuery({
  page: 5, limit: 48, directOffset: 192, searchQuery: "OC90", searchFilter: "all",
  producer: "BOSCH", group: "Фільтри", sortOrder: "desc", onlyInStock: true, priceFrom: 10, priceTo: 20,
});
assert.equal(requests.length, 1);
assert.equal(requests[0].body.Поиск, "oc90");
assert.equal(requests[0].body.ПолеПоиска, "all");
assert.equal(requests[0].body.ПроизводительНаименование, "BOSCH");
assert.equal(requests[0].body.Группа, "Фільтри");
assert.equal(requests[0].body.СортировкаПоЦене, "DESC");
assert.equal(requests[0].body.ЦенаОт, 10);
assert.equal(requests[0].body.ЦенаДо, 20);

supported = false;
requests.length = 0;
await assert.rejects(api.fetchCatalogProductsByQuery({ page: 632, limit: 16, directOffset: 10096 }), /DIRECT_PAGINATION_UNSUPPORTED/);
assert.equal(requests.length, 1, "An old service must not silently return page one or walk the catalog");
console.log("Direct server pagination passed: one request, offset acknowledgement, filters and safe legacy detection.");
