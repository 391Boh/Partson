// A photo-less product used to cost ~3.8s on the full image route: after 1C
// answered `codes` with "no ФайлКартинки", the lookup still tried six other
// body shapes on every endpoint candidate. Drives the real lookup against a
// mocked 1C and checks that the batch answer is final.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

const directory = await mkdtemp(path.join(process.cwd(), '.cache/product-image-miss-test-'));
const t = (globalThis.productImageMissTest = { requests: [] });
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

try {
  const outfile = path.join(directory, 'product-image.cjs');
  await build({
    entryPoints: ['app/lib/product-image.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile,
    plugins: [{ name: 'mock-1c', setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'mock' }));
      b.onResolve({ filter: /^app\/api\/_lib\/oneC$/ }, (a) => ({ path: a.path, namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path: p }) => ({ contents:
        p === 'server-only' ? '' :
        `const t = globalThis.productImageMissTest;
         const png = ${JSON.stringify(png)};
         export const oneCRequest = async (endpoint, { body }) => {
           t.requests.push({ endpoint, body });
           const ok = (text) => ({ status: 200, text: JSON.stringify(text) });
           if (endpoint !== 'getimages') return { status: 404, text: '' };
           if (!Array.isArray(body.codes)) return ok({ success: false, error_message: 'Ошибка запроса фото' });
           return ok({ success: true, count: 1, items: body.codes.flatMap((code) =>
             code === 'NO-PHOTO' ? [{ success: false, code, image_base64: '', error_message: 'Для товара не указана ссылка на файл ФайлКартинки' }] :
             code === 'HAS-PHOTO' ? [{ success: true, code, image_base64: png }] : []) });
         };`,
        loader: 'js' }));
    } }],
  });
  const api = createRequire(import.meta.url)(outfile);
  const options = { timeoutMs: 1700, retries: 0, cacheTtlMs: 1000, skipMissCache: true };

  assert.equal(await api.fetchProductImageBase64('NO-PHOTO', options), null);
  assert.equal(t.requests.length, 1, 'a product 1C names without a photo needs one request');
  assert.equal(api.wasImageAuthoritativelyMissing('no-photo'), true);

  t.requests.length = 0;
  assert.equal(await api.fetchProductImageBase64('UNKNOWN', options), null);
  assert.equal(t.requests.length, 1, 'an unknown code is not retried with other body shapes');
  assert.equal(api.wasImageAuthoritativelyMissing('unknown'), false, 'only a named product is a confirmed miss');

  t.requests.length = 0;
  assert.equal(await api.fetchProductImageBase64('HAS-PHOTO', options), png);
  assert.equal(t.requests.length, 1);

  api.clearProductImageCacheForProduct('NO-PHOTO');
  assert.equal(api.wasImageAuthoritativelyMissing('no-photo'), false, 'a photo upload clears the confirmed miss');

  console.log('Image final miss passed: one 1C request per photo-less product, unknown codes not confirmed, upload clears it.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
