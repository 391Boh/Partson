import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const entries = new Map();
let reviews = 0, stats = 0, galleries = 0, fail = false;
let images = [];
const cache = (fn, keys, options) => async () => {
  const key = JSON.stringify(keys);
  if (entries.has(key)) return entries.get(key).value;
  const value = await fn();
  entries.set(key, { value, tags: options.tags });
  assert.equal(options.revalidate, 180);
  return value;
};
const exports = {};
const source = readFileSync(new URL('../app/lib/product-page-extras.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, require: name => {
  if (name === 'server-only') return {};
  if (name === 'next/cache') return { unstable_cache: cache };
  if (name === './reviews-server') return {
    getProductReviewStats: async () => { stats++; return null; },
    getProductReviews: async () => { reviews++; if (fail) throw new Error('offline'); return []; },
  };
  if (name === './firebase-admin') return { getFirebaseAdminDb: () => {
    const query = { collection: () => query, doc: () => query, orderBy: () => query, limit: () => query,
      get: async () => { galleries++; if (fail) throw new Error('offline'); return { docs: images.map(url => ({ data: () => ({ url }) })) }; } };
    return query;
  } };
  throw new Error(`Unexpected module ${name}`);
} });
await exports.getProductPageReviews('a'); await exports.getProductPageReviews('a');
await exports.getProductPageGallery('a'); await exports.getProductPageGallery('a');
assert.deepEqual([stats, reviews, galleries], [1, 1, 1], 'Confirmed empty results are cached too');
await exports.getProductPageReviews('b');
assert.equal(reviews, 2, 'Products have independent keys');
fail = true;
await assert.rejects(exports.getProductPageGallery('failed'));
fail = false;
images = ['https://example.com/photo.webp', '', null, 12];
assert.deepEqual(JSON.parse(JSON.stringify(await exports.getProductPageGallery('failed'))), ['https://example.com/photo.webp'], 'A failure is not cached and invalid URLs are excluded');
const tag = exports.productPageExtrasTag('a');
for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key);
await exports.getProductPageReviews('a');
const fresh = await exports.getProductPageGallery('a');
assert.equal(reviews, 3, 'Write invalidation refreshes reviews');
assert.equal(fresh.length, 1, 'Write invalidation refreshes the gallery');
assert.equal((await exports.getProductPageGallery('')).length, 0);
for (const name of ['reviews', 'product-gallery']) {
  const route = readFileSync(new URL(`../app/api/${name}/route.ts`, import.meta.url), 'utf8');
  assert(route.includes('revalidateTag(productPageExtrasTag('), `${name} writes invalidate the cache`);
}
assert.equal((readFileSync(new URL('../app/api/product-gallery/route.ts', import.meta.url), 'utf8').match(/revalidateTag\(productPageExtrasTag\(code\)/g) || []).length, 2, 'Gallery uploads and deletion both invalidate');
console.log('PASS product extras: cached reads/empty lists, isolation, failure recovery and write invalidation');
