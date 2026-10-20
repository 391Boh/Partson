// node scripts/test-catalog-name-sort.mjs
import assert from "node:assert/strict";
import { loadCatalogSearch } from "./lib/catalog-search-harness.mjs";

const requests = [];
let respond = () => ({ success: true, items: [], has_more: false, next_cursor: "" });
const api = loadCatalogSearch(async (endpoint, options) => {
  requests.push({ endpoint, body: options.body });
  return { status: 200, text: JSON.stringify(respond(options.body)) };
});
const item = (code, name) => ({ Код: code, Наименование: name, НомерПоКаталогу: code, ЦінаПрод: 10, Количество: 1 });

// 1C sorts and pages alphabetically itself; the site only forwards the order
// and hands 1C's own {"name","code"} cursor back unchanged.
const nameCursor = JSON.stringify({ name: "Важіль", code: "002" });
respond = () => ({
  success: true, sort_mode: "name_v1", total_count: 3, has_more: true, next_cursor: nameCursor,
  items: [item("001", "Амортизатор"), item("002", "Важіль")],
});
const first = await api.fetchCatalogProductsByQuery({ page: 1, limit: 2, nameSort: "asc", forceAllgoodsSource: true });
assert.equal(requests[0].endpoint, "allgoods");
assert.equal(requests[0].body.СортировкаПоНазве, "ASC");
assert.equal(requests[0].body.СортировкаПоЦене, undefined);
assert.equal(JSON.stringify(first.items.map((product) => product.code)), JSON.stringify(["001", "002"]));
assert.equal(first.nextCursor, nameCursor);

requests.length = 0;
respond = () => ({ success: true, sort_mode: "name_v1", has_more: false, next_cursor: "", items: [item("003", "Гайка")] });
await api.fetchCatalogProductsByQuery({ page: 2, limit: 2, nameSort: "asc", cursor: nameCursor, forceAllgoodsSource: true });
assert.equal(requests[0].body.ПослеКода, nameCursor, "the name cursor must reach 1C unchanged");
assert.equal(requests[0].body.СортировкаПоНазве, "ASC");

// Price sort wins over a stale name sort.
requests.length = 0;
respond = () => ({ success: true, has_more: false, next_cursor: "", items: [item("001", "Амортизатор")] });
await api.fetchCatalogProductsByQuery({ page: 1, limit: 2, sortOrder: "desc", nameSort: "asc", forceAllgoodsSource: true });
assert.ok(requests.length > 0);
for (const request of requests) assert.equal(request.body.СортировкаПоНазве, undefined);
assert.ok(requests.some((request) => request.body.СортировкаПоЦене === "DESC"));

// Direct page jumps keep the alphabetical order.
requests.length = 0;
respond = (body) => ({
  success: true, sort_mode: "name_v1", pagination_mode: "offset_v1", offset: body.Смещение,
  total_count: 100, has_more: false, next_cursor: "", items: [item("099", "Ясла")],
});
const direct = await api.fetchCatalogProductsByQuery({ page: 7, limit: 16, directOffset: 96, nameSort: "desc" });
assert.equal(requests.length, 1);
assert.equal(requests[0].body.ПрямаяСтраница, true);
assert.equal(requests[0].body.СортировкаПоНазве, "DESC");
assert.equal(direct.directOffset, 96);

// Searches merge several field queries, so the site orders the hits itself:
// Ukrainian alphabet (А, І, Ї, Я), numbers by value, ties by code.
requests.length = 0;
const hits = [item("005", "Ялинка фільтр"), item("004", "Їжак фільтр"), item("003", "Фільтр 10"), item("002", "Фільтр 9"), item("001", "Ігла фільтр")];
respond = () => ({ success: true, has_more: false, next_cursor: "", items: hits });
const searchAsc = await api.fetchCatalogProductsByQuery({ page: 1, limit: 10, searchQuery: "фільтр", searchFilter: "name", nameSort: "asc" });
assert.equal(JSON.stringify(searchAsc.items.map((product) => product.name)), JSON.stringify(["Ігла фільтр", "Їжак фільтр", "Фільтр 9", "Фільтр 10", "Ялинка фільтр"]));
for (const request of requests) assert.equal(request.body.СортировкаПоНазве, undefined, "per-field search batches are fetched unsorted");

requests.length = 0;
const searchDesc = await api.fetchCatalogProductsByQuery({ page: 1, limit: 2, searchQuery: "фільтр", searchFilter: "name", nameSort: "desc" });
assert.equal(JSON.stringify(searchDesc.items.map((product) => product.name)), JSON.stringify(["Ялинка фільтр", "Фільтр 10"]));
assert.equal(searchDesc.hasMore, true);

// An older 1C ignores СортировкаПоНазве (no sort_mode): the site collects
// the filtered set and pages it alphabetically with its own cursor.
requests.length = 0;
const unsorted = [item("010", "Шланг"), item("011", "Амортизатор"), item("012", "Ґумка"), item("013", "Гальмо"), item("014", "Ящик")];
respond = (body) => ({
  success: true, has_more: false, next_cursor: "",
  items: body.Лимит === 500 ? unsorted : unsorted.slice(0, body.Лимит),
});
const legacyFirst = await api.fetchCatalogProductsByQuery({ page: 1, limit: 2, group: "Фільтри", nameSort: "asc", forceAllgoodsSource: true });
assert.equal(JSON.stringify(legacyFirst.items.map((product) => product.name)), JSON.stringify(["Амортизатор", "Гальмо"]));
assert.equal(legacyFirst.totalCount, 5);
assert.equal(legacyFirst.nextCursor, "nl1:2");
const legacySecond = await api.fetchCatalogProductsByQuery({ page: 2, limit: 2, group: "Фільтри", nameSort: "asc", cursor: legacyFirst.nextCursor, forceAllgoodsSource: true });
assert.equal(JSON.stringify(legacySecond.items.map((product) => product.name)), JSON.stringify(["Ґумка", "Шланг"]));
const legacyLast = await api.fetchCatalogProductsByQuery({ page: 3, limit: 2, group: "Фільтри", nameSort: "asc", cursor: legacySecond.nextCursor, forceAllgoodsSource: true });
assert.equal(JSON.stringify(legacyLast.items.map((product) => product.name)), JSON.stringify(["Ящик"]));
assert.equal(legacyLast.hasMore, false);

console.log("Catalog name sort passed: 1C order + cursor round trip, price precedence, direct pages, Ukrainian search ordering, local fallback for an older 1C.");
