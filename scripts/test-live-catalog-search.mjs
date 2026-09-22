// Read-only integration check against the configured 1C catalog.
// node --env-file=.env.local scripts/test-live-catalog-search.mjs
import assert from "node:assert/strict";
import { oneCRequest } from "../app/api/_lib/oneC.js";
import { loadCatalogSearch } from "./lib/catalog-search-harness.mjs";

const api = loadCatalogSearch(async (endpoint, options) => {
  const start = Date.now();
  const result = await oneCRequest(endpoint, options);
  if (result.status !== 200) console.log(JSON.stringify({ failedQuery: options.body, status: result.status, ms: Date.now() - start }));
  return result;
});
const search = (searchQuery, extra = {}) => api.fetchCatalogProductsByQuery({
  searchQuery, searchFilter: "all", page: 1, limit: 8, forceAllgoodsSource: true,
  includePriceEnrichment: false, timeoutMs: 6000, retries: 0, cacheTtlMs: 60_000, ...extra,
});
const results = new Map();
for (const query of ["OC90", "щс90", "фільтр", "filtr", "zzzznotfound987654"]) {
  const start = Date.now();
  const result = await search(query);
  results.set(query, result);
  const actual = result.correctedQuery || query;
  assert.ok(result.items.every((item) => ["name", "article", "code", "producer"]
    .some((field) => api.matchesSearchField(item, actual, field))));
  console.log(JSON.stringify({ query, ms: Date.now() - start, count: result.items.length,
    total: result.totalCount, hasMore: result.hasMore, correctedQuery: result.correctedQuery,
    articles: result.items.map((item) => item.article) }));
}
assert.ok(results.get("OC90").items.some((item) => item.article.toUpperCase() === "OC90"));
assert.equal(results.get("щс90").correctedQuery, "oc90");
assert.ok(results.get("filtr").items.length > 0);
assert.equal(results.get("zzzznotfound987654").items.length, 0);

const paged = [];
let cursor = "";
for (let page = 1; page <= 15; page++) {
  const result = await search("щс90", { page, cursor, limit: 2 });
  paged.push(...result.items.map((item) => item.code));
  if (!result.hasMore) break;
  assert.ok(result.nextCursor && result.nextCursor !== cursor);
  cursor = result.nextCursor;
  assert.ok(page < 15, "Pagination did not finish within the test budget");
}
assert.equal(new Set(paged).size, paged.length, "Duplicate products across pages");
const complete = await search("OC90", { limit: 50 });
assert.deepEqual([...paged].sort(), Array.from(complete.items, (item) => item.code).sort(), "Lost products across pages");
console.log(`Live search passed; all ${paged.length} OC90 matches survived corrected-query pagination.`);
