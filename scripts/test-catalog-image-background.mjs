// Catalog thumbnails that 1C resolves only slowly (by article, or via a download
// link) used to fail every retry. This drives the real image route against a
// mocked 1C: the catalog lookup times out, the product-page lookup answers
// after a delay, and the card's retry must get the photo from the background
// fetch instead of a 404.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const directory = await mkdtemp(path.join(process.cwd(), '.cache/catalog-image-test-'));
const png = (await sharp({ create: { width: 64, height: 64, channels: 3, background: '#3b82f6' } }).png().toBuffer()).toString('base64');
globalThis.catalogImageTest = { png, slowLookups: 0, catalogLookups: 0, articleDelayMs: 2500, hasPhoto: true };

try {
  const outfile = path.join(directory, 'route.cjs');
  await build({
    entryPoints: ['app/product-image/[code]/route.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile,
    plugins: [{ name: 'mock-1c', setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'mock' }));
      b.onResolve({ filter: /^app\/lib\/(product-image|catalog-server|catalog-image-batch-server)$/ }, a => ({ path: a.path, namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path: p }) => ({ contents:
        p === 'server-only' ? '' :
        p === 'app/lib/catalog-image-batch-server' ? 'export const awaitInFlightCatalogImage = async () => {};' :
        p === 'app/lib/catalog-server' ? 'export const findCatalogProductByCode = async () => null;' :
        `const t = globalThis.catalogImageTest;
         const wait = ms => new Promise(r => setTimeout(r, ms));
         // Catalog batch lookup: 1C never answers within the thumbnail budget.
         export const fetchProductImageBase64BatchDetailed = async (keys, o) => { t.catalogLookups++; await wait(Math.min(o.timeoutMs, 300)); return { resolved: {}, handledKeys: new Set(), endpointAvailable: true }; };
         export const wasImageAuthoritativelyMissing = () => false;
         // Product-page lookup: the code finds nothing, the article finds the photo slowly.
         export const fetchProductImageBase64 = async (key) => { if (key !== 'ART-1') return null; t.slowLookups++; await wait(t.articleDelayMs); return t.hasPhoto ? t.png : null; };` }));
    } }],
  });
  process.chdir(directory);
  const { GET } = createRequire(import.meta.url)(outfile);
  const call = async (query) => {
    const started = Date.now();
    const response = await GET(new Request(`http://localhost/product-image/CODE-1?iv=5&catalog=1&article=ART-1${query}`), { params: Promise.resolve({ code: 'CODE-1' }) });
    return { status: response.status, ms: Date.now() - started, type: response.headers.get('content-type'), cache: response.headers.get('cache-control') };
  };

  const first = await call('');
  assert.equal(first.status, 404, 'The first catalog attempt still fails fast');
  assert(first.ms < 1500, `first attempt stays within the thumbnail budget (${first.ms}ms)`);
  assert.equal(first.cache, 'no-store', 'An inconclusive miss is not cached by the browser');

  const retry = await call('&retry=1');
  assert.equal(retry.status, 200, 'The retry receives the photo from the background fetch');
  assert.equal(retry.type, 'image/webp');
  assert.equal(globalThis.catalogImageTest.slowLookups, 1, 'Only one slow lookup ran for both requests');

  const later = await call('&retry=2');
  assert.equal(later.status, 200);
  assert(later.ms < 200, `a later request is served from cache (${later.ms}ms)`);
  const fresh = await call('');
  assert.equal(fresh.status, 200, 'The next visitor gets the cached thumbnail on the first try');
  assert.equal(globalThis.catalogImageTest.slowLookups, 1);
  console.log(`PASS slow photo: first ${first.ms}ms → 404, retry ${retry.ms}ms → photo, cached ${later.ms}ms`);

  // A product that genuinely has no photo is looked up in the background once,
  // then remembered, so its retries don't keep 1C busy.
  globalThis.catalogImageTest.hasPhoto = false;
  globalThis.catalogImageTest.articleDelayMs = 200;
  const missCall = (query) => GET(new Request(`http://localhost/product-image/CODE-2?iv=5&catalog=1&article=ART-1${query}`), { params: Promise.resolve({ code: 'CODE-2' }) });
  assert.equal((await missCall('')).status, 404);
  assert.equal((await missCall('&retry=1')).status, 404);
  const lookupsAfterMiss = globalThis.catalogImageTest.slowLookups;
  assert.equal((await missCall('&retry=2')).status, 404);
  assert.equal(globalThis.catalogImageTest.slowLookups, lookupsAfterMiss, 'A confirmed miss is not fetched again');
  console.log('PASS missing photo: one background lookup, then remembered');
} finally {
  process.chdir(path.dirname(directory));
  process.chdir('..');
  await rm(directory, { recursive: true, force: true });
}
