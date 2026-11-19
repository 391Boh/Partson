import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { buildProductPath } from "../app/lib/product-url.ts";

const product = (code, article, name = "Фільтр оливи") => ({ code, article, name, producer: "TEST", priceEuro: 10, quantity: 0, hasPhoto: true });
let entries = [product("A", "A1"), product("B", "B1"), product("C", "C1"), product("DUPLICATE-A", "A1"),
  { ...product("NO-PHOTO", "PHOTO"), hasPhoto: false }, { ...product("NO-PRICE", "PRICE"), priceEuro: 0 }];
let now = 1_000_000;
let reads = 0;
const api = {};
vm.runInNewContext(ts.transpileModule(readFileSync("app/lib/product-sitemap.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: api, console, setTimeout, clearTimeout, Date: { now: () => now },
  process: { env: { PRODUCT_SITEMAP_MAX_ITEMS: "2" } },
  require: name => {
    if (name === "node:fs/promises") return { readFile: async () => { reads++; return JSON.stringify({ entries }); } };
    if (name === "app/lib/catalog-server") return {};
    if (name === "app/lib/product-url") return { buildProductPath };
    if (name === "app/lib/public-catalog-product") return { isPublicCatalogProduct: item => item.hasPhoto === true && item.priceEuro > 0 };
    throw new Error(name);
  },
});
assert.equal((await api.getAllProductSitemapEntries()).length, 4, "Exact-code source retains both 1C records");
const ids = await api.getPricedProductSitemapIds();
assert.equal(ids.length, 2);
const batches = await Promise.all(ids.map(({ id }) => api.getPricedProductEntriesBySitemapId(id)));
const canonical = batches.flat().map(buildProductPath);
assert.equal(canonical.length, 3);
assert.equal(new Set(canonical).size, canonical.length, "Canonical duplicates are removed across chunks");
assert.equal(batches[0].length, 2);
assert.equal(batches[1].length, 1);
assert.equal((await api.getAllProductSitemapEntries()).length, 4, "Sitemap deduplication does not mutate the source snapshot");
const warmReads = reads;
await api.getPricedProductSitemapIds();
assert.equal(reads, warmReads, "Warm sitemap requests reuse one snapshot");
entries = [...entries, product("NEW", "NEW1", "Новий товар")];
now += 300_001;
const refreshed = await api.getAllPricedProductSitemapEntries();
assert.equal(refreshed.length, 4);
assert(refreshed.some(item => item.code === "NEW"), "A refreshed snapshot exposes newly imported products");
assert(!refreshed.some(item => item.code === "NO-PHOTO" || item.code === "NO-PRICE"));
console.log("PASS canonical sitemap: unique URLs across chunks, preserved exact-code source, public product gate, warm reuse and new-product refresh.");
