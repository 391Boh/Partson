import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadCatalogSearch } from "./lib/catalog-search-harness.mjs";

const product = (code, article, name = "Фільтр", producer = "FILTRON", price = 10) => ({
  Код: code, НомерПоКаталогу: article, Наименование: name,
  ПроизводительНаименование: producer, ЦінаПрод: price, Кількість: 2,
  Описание: "VW GOLF IV 1.6 1997-2004", Группа: "Фільтри", Подгруппа: "Оливні",
});
// More than a complete upstream batch of excluded variants precedes the hits.
const products = [
  ...Array.from({ length: 70 }, (_, i) => product(
    String(i).padStart(4, "0"), `OP570/${i + 1}`, `Фільтр OP570/${i + 1}`
  )),
  product("0100", "OP570", "Фільтр FILTRON OP570 (AN600/OP570/1)", "FILTRON", 30),
  product("0101", "AN600", "Елемент оливний", "OTHER", 20),
  product("0102", "OP570OF", "Фільтр FILTRON", "FILTRON", 5),
  product("0103", "REF-600", "Фільтр (OP570/1)", "OTHER", 15),
  product("0104", "OP570\\99", "Фільтр OP570\\99"),
  product("0105", "SIZE.570", "Фільтр", "OTHER"),
  product("0106", "ITEM-570", "Фільтр", "OTHER"),
];
const calls = [];
const api = loadCatalogSearch(async (endpoint, { body }) => {
  calls.push({ endpoint, body });
  // Old 1C services can return fuzzy hits and totals that include variants.
  // Matching, filtering and paging must therefore happen in the real pipeline.
  const rows = products.filter((p) => !body.ПослеКода || p.Код > body.ПослеКода);
  const items = rows.slice(0, body.Лимит);
  const more = rows.length > items.length;
  return { status: 200, text: JSON.stringify({
    success: true, items, total_count: products.length,
    has_more: more, next_cursor: more ? items.at(-1).Код : "",
  }) };
});
const codes = (items) => Array.from(items, (p) => p.code);
const withoutSlashes = (items) => assert(items.every((p) => !/[/\\]/.test(p.article)));
const search = (query, options = {}) => api.fetchCatalogProductsByQuery({
  searchQuery: query, searchFilter: "all", page: 1, limit: 2,
  forceAllgoodsSource: true, includePriceEnrichment: false, retries: 0, ...options,
});
async function collect(query, options = {}) {
  const items = [];
  let cursor = "";
  for (let page = 1; page <= 50; page++) {
    const result = await search(query, { ...options, page, cursor });
    items.push(...result.items);
    if (!result.hasMore) {
      assert.equal(new Set(codes(items)).size, items.length, "No duplicates between pages");
      return items;
    }
    cursor = result.nextCursor;
  }
  assert.fail("Search pagination did not terminate");
}

// The rule applies to every field, even an exact internal code or producer.
const variant = { code: "123456", article: "OP570/1", name: "Фільтр OP570", producer: "FILTRON", description: "Golf" };
for (const [field, query] of Object.entries({ code: "123456", article: "OP570", name: "фільтр", producer: "FILTRON", description: "Golf" })) {
  assert.equal(api.matchesSearchField(variant, query, field), false, field);
}
assert(api.matchesSearchField(variant, "OP570/1", "article"));
assert(api.matchesSearchField({ ...variant, article: "OP570\\1" }, "OP570\\1", "article"));
assert(api.matchesSearchField(variant, "OP570", "article", "OP570/999"), "A shortened query retains the original slash choice");
assert(api.isSearchArticleAllowed(variant, "   "), "Browsing keeps all articles");
assert(api.isSearchArticleAllowed({ article: "09.9772-11" }, "09977211"), "Other separators stay searchable");
assert(api.isSearchArticleAllowed({}, "фільтр"), "Products without an article stay searchable");

assert.deepEqual(codes(await collect("OP570")), ["0100", "0102", "0103"]);
assert.equal((await search("OP570")).totalCount, 3, "Upstream totals must be recomputed after filtering");
assert.deepEqual(codes(await collect("OP570", { searchFilter: "article" })), ["0100", "0102"]);
assert.deepEqual(codes(await collect("щз570")), ["0100", "0102", "0103"]);
assert.equal((await search("щз570")).correctedQuery, "op570");
for (const [searchFilter, query] of Object.entries({ all: "фільтр", name: "фільтр", producer: "FILTRON", description: "Golf", code: "0000" })) {
  withoutSlashes(await collect(query, { searchFilter }));
}
assert.deepEqual(codes(await collect("OP570", { sortOrder: "asc" })), ["0102", "0103", "0100"]);
assert.deepEqual(codes(await collect("OP570", { sortOrder: "desc" })), ["0100", "0103", "0102"]);
assert((await collect("OP570/1")).some((p) => p.article === "OP570/1"), "An explicit slash finds the variant");
assert((await collect("OP570\\99")).some((p) => p.article === "OP570\\99"));
// A fallback may shorten away the slash; page two still uses the original input.
const relaxed = await collect("OP570/999");
assert(relaxed.length > 70 && relaxed.some((p) => p.article === "OP570/1"));
await assert.rejects(search("OP570", { directOffset: 2 }), /DIRECT_PAGINATION_UNSUPPORTED/);

const legacy = await collect("фільтр", { selectedCars: ["Golf"], forceAllgoodsSource: false });
withoutSlashes(legacy);
assert.equal(legacy.length, 6, "Legacy filtering happens before page slicing");
assert.equal((await search("", { limit: 100 })).items.length, products.length, "Empty-query browsing remains complete");
const vehicle = { brand: "VOLKSWAGEN", model: "Golf IV", year: 2000 };
assert.equal((await search("", { vehicle, limit: 100 })).items.length, products.length, "Vehicle browsing without a text query keeps slash articles");
withoutSlashes((await search("Golf", { vehicle, limit: 100 })).items);

// Warm search powers both the catalog and ranked quick suggestions.
await api.fetchPromoCatalogProducts();
const warmCalls = calls.length;
for (const rank of [false, true]) {
  let offset = 0;
  let afterCode = "";
  const found = [];
  for (let page = 0; page < 10; page++) {
    const result = await api.searchCatalogIndex("OP570", { filter: "all", limit: 2, rank, offset, afterCode });
    assert(result);
    assert.equal(result.totalCount, 4, "Only the eligible analog contributes to the count");
    withoutSlashes(result.items);
    found.push(...result.items);
    if (!result.hasMore) break;
    offset += result.items.length;
    afterCode = result.items.at(-1).code;
  }
  assert.equal(new Set(codes(found)).size, 4);
  assert.deepEqual(codes(found).sort(), ["0100", "0101", "0102", "0103"]);
  if (rank) assert.equal(found[0].article, "OP570", "Exact articles lead quick suggestions");
}
const facets = await api.searchCatalogIndex("фільтр", { filter: "all", limit: 16, rank: true });
withoutSlashes(facets.items);
assert.equal(facets.totalCount, 6, "Five literal matches plus the eligible analog");
assert.equal(facets.facets.categories[0].count, 5, "Facet counts exclude slash variants");
const spelling = await api.searchCatalogIndex("філтр", { filter: "name", limit: 16, rank: true });
assert(spelling.items.length > 0);
withoutSlashes(spelling.items);
const warmRelaxed = await api.searchCatalogIndex("OP570/999", { filter: "article", limit: 2, rank: true });
assert(warmRelaxed.correctedQuery);
const warmNext = await api.searchCatalogIndex(warmRelaxed.correctedQuery, {
  filter: "article", limit: 2, rank: true, offset: 2, articleQuery: "OP570/999",
});
assert(warmNext.items.some((p) => /[/\\]/.test(p.article)), "Ranked continuation retains the slash choice");
assert.equal(calls.length, warmCalls, "Warm suggestions and recoveries need no extra 1C requests");

const listing = (searchQuery, extra = {}) => api.listCatalogFromSnapshot({
  searchQuery, searchFilter: "all", group: "", subcategory: "", producer: "",
  selectedCategories: [], expandHierarchy: false, vehicle: null,
  sortOrder: "none", nameSort: "none", pricedOnly: false, withPhoto: false,
  inStock: false, priceFrom: null, priceTo: null, offset: 0, limit: 100, ...extra,
});
for (const extra of [{}, { sortOrder: "asc" }, { producer: "FILTRON" }, { group: "Фільтри", subcategory: "Оливні" }]) {
  const result = await listing("OP570", extra);
  assert(result);
  withoutSlashes(result.items);
  assert.equal(result.totalCount, result.items.length);
}
assert.deepEqual(codes((await listing("OP570")).items), ["0100", "0102", "0103", "0101"]);
assert((await listing("OP570/1")).items.some((p) => p.article === "OP570/1"));
assert.equal((await listing("")).totalCount, products.length);

// Exercise the actual API's suggestion cursor and cold promo fallback too.
const route = {};
let coldPromo = false;
const modules = {
  "next/server": { NextResponse: Response },
  "app/lib/vehicle-fitment": { readVehicleSelection: () => null, matchesVehicleFitment: () => true },
  "app/lib/public-catalog-product": { withoutCostPrice: (item) => item },
  "app/lib/catalog-image-batch-server": { warmCatalogImages: () => {} },
  "app/lib/catalog-server": {
    ...api,
    listCatalogFromSnapshot: (query) => coldPromo ? Promise.resolve(null) : api.listCatalogFromSnapshot(query),
    fetchPromoCatalogProducts: async () => ({ products: [variant, { ...variant, code: "PROMO", article: "OP570" }], stale: false }),
  },
  "app/lib/catalog-search": api,
  "app/lib/catalog-links": { buildCatalogCategoryPath: () => "/category", buildManufacturerPathFromLabel: () => "/brand" },
  "app/lib/catalog-params-server": {},
  "app/lib/product-params": { decodeProductParamFilters: () => [] },
  "app/lib/catalog-page-route-cache": { routeSuccessCache: new Map() },
};
vm.runInNewContext(ts.transpileModule(readFileSync("app/api/catalog-page/route.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: route, console, setTimeout, clearTimeout,
  require: (name) => {
    assert(name in modules, `Unexpected API dependency: ${name}`);
    return modules[name];
  },
});
const post = async (body) => {
  const response = await route.POST(new Request("http://localhost/api/catalog-page", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  assert.equal(response.status, 200);
  return response.json();
};
withoutSlashes((await post({ searchQuery: "OP570", purpose: "suggestions", limit: 16 })).items);
const rankedBody = { searchQuery: "OP570/999", searchFilter: "article", purpose: "suggestions", limit: 2 };
const firstRanked = await post(rankedBody);
assert(firstRanked.correctedQuery && firstRanked.nextCursor);
const nextRanked = await post({ ...rankedBody, cursor: firstRanked.nextCursor });
assert.equal(nextRanked.totalCount, firstRanked.totalCount);
assert(nextRanked.items.some((p) => /[/\\]/.test(p.article)));
coldPromo = true;
const promo = await post({ promoOnly: true, searchQuery: "OP570", limit: 100 });
withoutSlashes(promo.items);
assert.equal(promo.totalCount, 1);
assert.equal((await post({ promoOnly: true, searchQuery: "", limit: 100 })).totalCount, 2);

console.log("Search slash rules passed: all fields, fuzzy batches, totals, cursor pages, sorts, layout/spelling, analogs, facets, ranked suggestions, legacy source and empty-query browsing.");
