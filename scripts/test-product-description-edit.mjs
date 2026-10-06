// Offline tests: no writes to a live 1C service.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const noop = () => {};
let product = { code: 'CODE', article: 'CURRENT' };
let replies = [];
let writes = [];
let invalidations = 0;
const exports = {};
const mocks = {
  'next/server': { NextResponse: Response },
  'next/cache': { revalidatePath: noop, revalidateTag: noop },
  'app/api/_lib/oneC': { clearAllOneCCache: () => invalidations++, oneCRequest: async (_endpoint, options) => {
    writes.push(options.body);
    return { status: 200, text: replies.shift() ?? '{"success":true}' };
  } },
  'app/api/_lib/rateLimit': { checkRateLimit: () => ({ ok: true }), setRateLimitHeaders: noop },
  'app/api/_lib/requestValidation': { isNonEmptyString: value => typeof value === 'string' && !!value.trim(), readJsonObject: async request => ({ ok: true, value: await request.json() }) },
  'app/api/_lib/admin-auth': { verifyAdminRequest: async () => ({ email: 'test@example.com' }) },
  'app/lib/catalog-page-route-cache': { clearCatalogPageRouteCache: noop },
  'app/lib/catalog-server': { fetchExactCatalogProductByLookup: async (_code, options) => {
    assert.equal(options.cacheTtlMs, 0);
    assert.deepEqual(Array.from(options.lookupFields), ['Код']);
    return product;
  }, invalidateFullCatalogSnapshot: noop, patchFullCatalogSnapshotProduct: noop },
  'app/lib/product-edit-overrides': { setProductEditOverride: noop },
};
vm.runInNewContext(ts.transpileModule(readFileSync('app/api/product-update-description/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, process: { env: {} }, Headers, require: name => {
  assert.ok(mocks[name], name);
  return mocks[name];
} });
const save = async (body = {}) => {
  writes = []; invalidations = 0;
  const response = await exports.POST({ json: async () => ({ code: 'CODE', article: 'OLD', description: 'New description', ...body }) });
  return { status: response.status, payload: await response.json() };
};
assert.equal((await save()).payload.ok, true);
assert.equal(writes[0].НомерПоКаталогу, 'CURRENT', 'Resolve a stale article before writing');
assert.equal(writes[0].Код, undefined, 'Never substitute code for article');
assert.equal(invalidations, 1);
assert.equal((await save({ article: '' })).payload.ok, true);
for (const reply of ['Номенклатура не найдена', '"Номенклатура не найдена"', '{"error":"Номенклатура не найдена"}', '{"updated":false}', '{"success":false,"error_message":"Ошибка записи"}']) {
  replies = [reply];
  const result = await save();
  assert.equal(result.status, 422, reply);
  assert.equal(result.payload.ok, false);
  assert.equal(invalidations, 0, 'Do not cache a failed write as success');
  assert.equal(writes.length, 1, 'Do not repeat a write to the same article');
}
for (const missing of [null, { code: 'OTHER', article: 'CURRENT' }]) {
  product = missing;
  assert.equal((await save()).status, 503);
  assert.equal(writes.length, 0, 'Do not write using an unverified stale article');
}
console.log('Description editing passed: fresh identity, missing identity, plain/JSON errors, no false success or repeated writes.');
