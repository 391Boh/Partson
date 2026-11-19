import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const route = {};
const cache = new Map();
const product = {
  code: "PHOTO-1", article: "OC90", name: "Фільтр оливи", producer: "KNECHT",
  quantity: 3, priceEuro: 12, hasPhoto: true, costPriceEuro: 6,
  description: "Застосування та характеристики. ".repeat(2000),
  group: "Фільтри", subGroup: "Оливні", category: "Двигун",
};
const facets = { categories: [{ label: "Оливні", count: 12, group: "Фільтри", subGroup: "Оливні" }], producers: [] };
let failIndex = false;
const modules = {
  "next/server": { NextResponse: Response },
  "app/lib/vehicle-fitment": { readVehicleSelection: () => null, matchesVehicleFitment: () => true },
  "app/lib/public-catalog-product": { withoutCostPrice: item => { const clean = { ...item }; delete clean.costPriceEuro; return clean; } },
  "app/lib/catalog-image-batch-server": { warmCatalogImages() {} },
  "app/lib/catalog-server": { searchCatalogIndex: async () => {
    if (failIndex) throw new Error("controlled search outage");
    return { items: [product], totalCount: 12, facets };
  } },
  "app/lib/catalog-search": { normalizeSearchQuery: value => value.trim(), encodeSearchCursor: (query, code) => JSON.stringify({ query, code }) },
  "app/lib/catalog-links": { buildCatalogCategoryPath: () => "/katalog?group=filters", buildManufacturerPathFromLabel: () => "/manufacturers/knecht" },
  "app/lib/catalog-params-server": {},
  "app/lib/product-params": { decodeProductParamFilters: () => [] },
  "app/lib/catalog-page-route-cache": { routeSuccessCache: cache },
};
vm.runInNewContext(ts.transpileModule(readFileSync("app/api/catalog-page/route.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: route, console, setTimeout, clearTimeout,
  require: name => { if (!(name in modules)) throw new Error(name); return modules[name]; },
});
const post = async purpose => {
  const response = await route.POST(new Request("http://test/api/catalog-page", {
    method: "POST", body: JSON.stringify({ searchQuery: "OC90", limit: 16, ...(purpose ? { purpose } : {}) }),
  }));
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
};
const checkSuggestion = result => {
  assert.deepEqual(result.items[0], {
    code: product.code, article: product.article, name: product.name, producer: product.producer,
    quantity: product.quantity, priceEuro: product.priceEuro, hasPhoto: true,
  });
  assert.equal(result.totalCount, 12);
  assert.equal(result.hasMore, true);
  assert.ok(result.nextCursor.startsWith("rank-v1:"));
  assert.equal(result.facets.categories[0].href, "/katalog?group=filters");
};

const first = await post("suggestions");
checkSuggestion(first);
checkSuggestion(await post("suggestions")); // Fresh cache must also stay compact.
for (const entry of cache.values()) entry.freshUntil = 0;
failIndex = true;
const stale = await post("suggestions");
checkSuggestion(stale);
assert.equal(stale.stale, true);
failIndex = false;
const catalog = await post();
assert.equal(catalog.items[0].description, product.description, "Full catalog data survives suggestion requests");
assert.equal(catalog.items[0].costPriceEuro, undefined);
assert.equal(product.costPriceEuro, 6, "Serialization never mutates the shared snapshot");
assert(Buffer.byteLength(JSON.stringify(first)) < Buffer.byteLength(JSON.stringify(catalog)) / 20);
console.log("PASS compact suggestions: live/fresh/stale responses, exact photo identity and prices, facets/cursors, full catalog data preserved.");
