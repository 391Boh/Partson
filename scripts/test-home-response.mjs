import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, mocks, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, setTimeout, clearTimeout, ...globals });
  return exports;
}
let ratingPromise = Promise.resolve({ ratingValue: 4.7, reviewCount: 30 });
const rating = load('app/lib/google-rating.ts', {
  'server-only': {}, 'next/cache': { unstable_cache: () => () => ratingPromise },
});
assert.equal((await rating.getGoogleRatingForRender()).ratingValue, 4.7);
ratingPromise = new Promise(() => {});
const start = performance.now();
assert.equal(await rating.getGoogleRatingForRender(), null);
assert.ok(performance.now() - start < 600, 'Slow optional rating cannot hold the document open');
ratingPromise = Promise.reject(new Error('unavailable'));
assert.equal(await rating.getGoogleRatingForRender(), null);
let posts = [{ slug: 'test', title: 'Стаття', content: 'private large body', imageDataUrl: 'data:image/png;base64,AAAA', updatedAt: '2026-01-01' }];
const api = load('app/api/home-blog/route.ts', {
  'next/server': { NextResponse: { json: (body, options) => ({ body, options }) } },
  'app/lib/blog': { getPublishedBlogPosts: async () => posts },
  'app/lib/blog-media': { isStorageMediaUrl: () => false },
});
const response = await api.GET();
assert.equal(response.body.title, 'Стаття');
assert.ok(response.body.image.startsWith('/api/blog/og-image/test'));
assert.ok(!JSON.stringify(response.body).includes('base64'));
assert.ok(!('content' in response.body));
posts = [];
assert.equal((await api.GET()).options.headers['Cache-Control'], 'no-store');
const apiThrows = load('app/api/home-blog/route.ts', {
  'next/server': { NextResponse: { json: (body, options) => ({ body, options }) } },
  'app/lib/blog': { getPublishedBlogPosts: async () => { throw new Error('firestore unavailable'); } },
  'app/lib/blog-media': { isStorageMediaUrl: () => false },
});
assert.equal((await apiThrows.GET()).body, null);
console.log('Homepage response passed: bounded optional rating, failure fallback, small teaser payload without inline images, uncached empty result, resilient to a failed blog read.');
