import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../app/lib/catalog-page-prefetch.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const storage = new Map();
let calls = 0, now = 1000;
const exports = {};
vm.runInNewContext(code, {
  exports, URL, Date: { now: () => now },
  window: { location: { origin: 'http://test.local' }, sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: key => storage.delete(key) } },
  fetch: async () => { calls++; return { ok: true, json: async () => ({ items: [{ code: 'one' }], prices: {}, images: {} }) }; },
  require: name => {
    if (name.endsWith('catalog-client-cache')) return { CATALOG_PAGE_CACHE_VERSION: 'test' };
    if (name.endsWith('product-params')) return { PRODUCT_PARAMS_QUERY_KEY: 'params', decodeProductParamFilters: () => [], encodeProductParamFilters: () => '' };
    throw new Error(name);
  },
});
const prefetch = exports.prefetchCatalogListing;
await Promise.all([prefetch('/katalog'), prefetch('/katalog')]);
assert.equal(calls, 1, 'Concurrent intent shares one request');
await prefetch('/katalog');
assert.equal(calls, 1, 'Fresh cache prevents a duplicate download');
now += 240_001;
await prefetch('/katalog');
assert.equal(calls, 2, 'Expired cache must not suppress prefetch forever');
const key = [...storage.keys()][0];
storage.set(key, 'broken json');
await prefetch('/katalog');
assert.equal(calls, 3, 'Invalid cache can be refreshed');
await prefetch('/blog');
assert.equal(calls, 3, 'Unrelated routes do not fetch catalogue data');
console.log('PASS catalogue prefetch: fresh/expired/corrupt cache and concurrent requests');
