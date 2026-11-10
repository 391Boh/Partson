// 1C runs inside a few Apache workers; every needless request holds one.
// The live log showed ~12k 404s a day on image endpoints 1C does not have,
// and a product page asking for its 1C code as three different fields.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { loadCatalogSearch } from './lib/catalog-search-harness.mjs';

// Image endpoints that answered 404 are not asked again.
const directory = await mkdtemp(path.join(process.cwd(), '.cache/onec-economy-test-'));
const t = (globalThis.onecEconomyTest = { requests: [] });
try {
  const outfile = path.join(directory, 'product-image.cjs');
  await build({
    entryPoints: ['app/lib/product-image.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile,
    plugins: [{ name: 'mock-1c', setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'mock' }));
      b.onResolve({ filter: /^app\/api\/_lib\/oneC$/ }, (a) => ({ path: a.path, namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path: p }) => ({ contents:
        p === 'server-only' ? '' :
        `const t = globalThis.onecEconomyTest;
         export const oneCRequest = async (endpoint, { body }) => {
           t.requests.push({ endpoint, body });
           return endpoint === 'getimages' ? { status: 504, text: '' } : { status: 404, text: '' };
         };`,
        loader: 'js' }));
    } }],
  });
  const api = createRequire(import.meta.url)(outfile);
  const options = { timeoutMs: 500, retries: 0, cacheTtlMs: 1000, skipMissCache: true };
  const missing = () => t.requests.filter((request) => request.endpoint !== 'getimages');

  assert.equal(await api.fetchProductImageBase64('SLOW-1', options), null);
  const firstWalk = missing();
  assert.ok(firstWalk.length > 0, 'a getimages timeout still looks for another endpoint');
  assert.equal(new Set(firstWalk.map((request) => request.endpoint)).size, firstWalk.length, 'one request per missing endpoint');

  t.requests.length = 0;
  assert.equal(await api.fetchProductImageBase64('SLOW-2', options), null);
  assert.equal(missing().length, 0, 'endpoints that answered 404 are skipped');
  assert.ok(t.requests.length > 0, 'getimages itself is still asked');
} finally {
  await rm(directory, { recursive: true, force: true });
  delete globalThis.onecEconomyTest;
}

// A 1C code is looked up as a code; catalog numbers only when that misses.
const record = (code) => ({ Код: code, Артикул: `A-${code}`, Наименование: `Товар ${code}`, ЦінаПрод: 10, Количество: 1 });
const calls = [];
const catalog = loadCatalogSearch(async (...[, options]) => {
  calls.push(options.body);
  const known = options.body.Код === '00-00000466' ? [record('00-00000466')] : [];
  return { status: 200, text: JSON.stringify({ success: true, items: known }) };
});
const found = await catalog.findCatalogProductByCode('00-00000466', { lookupLimit: 8, fallbackPages: 1, timeoutMs: 500 });
assert.equal(found?.code, '00-00000466');
assert.deepEqual(calls.map((body) => Object.keys(body).filter((key) => ['Код', 'Артикул', 'НомерПоКаталогу'].includes(key))), [['Код']], 'a found code costs one call');

calls.length = 0;
assert.equal(await catalog.confirmCatalogProductsMissing(['00-09999999']), true, 'a removed product is still confirmed missing');
assert.equal(calls.length, 3, 'a missing code is checked as code and both catalog-number fields');

// With a fresh snapshot a product page's description and similar items cost
// no allgoods calls; a product without allgoods text only asks getinfo.
const snapshotRecord = (code, extra) => ({
  ...record(code), Группа: 'Фільтри', Подгруппа: 'Масляний фільтр', ЕстьФото: true, ...extra,
});
const scanned = [
  snapshotRecord('00-00000001', { Описание: 'VW GOLF IV 1.6' }),
  snapshotRecord('00-00000002', { Артикул: 'ART-2' }),
  snapshotRecord('00-00000003'),
];
const snapshotCalls = [];
const warm = loadCatalogSearch(async (endpoint, options) => {
  if (options.body?.Лимит === 500) return { status: 200, text: JSON.stringify({ success: true, items: scanned }) };
  snapshotCalls.push({ endpoint, body: options.body });
  return { status: 200, text: JSON.stringify(endpoint === 'getinfo' ? {} : { success: true, items: [] }) };
});
// A cold listing starts the scan in the background; wait for it.
await warm.listCatalogFromSnapshot({ offset: 0, limit: 1 }).catch(() => null);
for (let i = 0; i < 50 && !warm.getFreshSnapshotProduct('00-00000001'); i += 1) await new Promise((r) => setTimeout(r, 20));
assert.ok(warm.getFreshSnapshotProduct('00-00000001'), 'the snapshot is warm');

const described = await warm.lookupProductDescriptionForProduct('00-00000001', 'A-00-00000001');
assert.equal(described.description, 'VW GOLF IV 1.6');
assert.equal(snapshotCalls.length, 0, 'a snapshot description needs no 1C call');

const undescribed = await warm.lookupProductDescriptionForProduct('00-00000002', 'ART-2');
assert.equal(undescribed.description, null);
assert.equal(undescribed.answered, true, 'no description is an answer, not an outage');
assert.deepEqual(snapshotCalls.map((call) => call.endpoint), ['getinfo'], 'only getinfo is still asked');

snapshotCalls.length = 0;
const similar = await warm.findSimilarProductsBySubgroup({ ...scanned[0], code: '00-00000001', article: 'A-00-00000001', subGroup: 'Масляний фільтр', group: 'Фільтри', producer: '' });
assert.equal(snapshotCalls.length, 0, 'similar items come from the snapshot');
assert.ok(similar.every((item) => item.code !== '00-00000001'), 'the product itself is not similar to itself');
snapshotCalls.length = 0;
const cards = await warm.fetchProductDescriptionsByCodes(['00-00000002', '00-00000001']);
assert.equal(JSON.stringify([...cards]), JSON.stringify([['00-00000001', 'VW GOLF IV 1.6']]));
assert.equal(snapshotCalls.length, 0, 'catalog card descriptions come from the snapshot');
await warm.fetchProductDescriptionsByCodes(['00-00000001', '00-00000099']);
assert.equal(JSON.stringify(snapshotCalls.map((call) => call.body.Коди)), JSON.stringify([['00-00000099']]), 'only an unknown card goes to 1C');
console.log('1C request economy passed: 404 image endpoints remembered, codes as codes first, snapshot descriptions and similar items.');
