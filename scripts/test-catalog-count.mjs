import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let calls = 0;
const exports = {};
vm.runInNewContext(compile('app/lib/catalog-count-client.ts'), { exports, URLSearchParams, AbortSignal,
  fetch: async () => { calls++; return { ok: true, json: async () => ({ totalCount: 42, exact: true }) }; },
});
const a = exports.fetchCatalogCount('search=abc&filter=all');
const b = exports.fetchCatalogCount('filter=all&search=abc');
assert.equal(a, b);
assert.equal((await a).totalCount, 42);
await exports.fetchCatalogCount('search=abc&filter=all');
assert.equal(calls, 1, 'Heading and pagination must share one request');
const route = {};
let sent;
vm.runInNewContext(compile('app/api/catalog-search-count/route.ts'), {
  exports: route, URL, URLSearchParams,
  require: name => name === 'next/server' ? { NextResponse: Response } : {
    fetchCatalogProductsByQuery: async options => { sent = options; return { items: [], hasMore: false, totalCount: 0 }; },
  },
});
const response = await route.GET(new Request('http://localhost/api/catalog-search-count?priceTo=0'));
assert.equal(response.status, 200);
assert.equal(sent.priceTo, 0, 'A zero upper price bound is a real filter');
assert.equal(sent.priceFrom, null);
assert.equal((await response.json()).exact, true);
console.log('Catalog counts passed: request sharing, cache reuse, zero price bound.');
