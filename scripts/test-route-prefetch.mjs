import assert from 'node:assert/strict';
import { getInternalNavigationHref, prefetchRoute } from '../app/lib/route-prefetch.ts';

const current = 'https://partson.test/katalog?group=filters';
for (const href of ['#results', '?group=filters#results', 'https://elsewhere.test/blog', 'mailto:test@example.test', 'javascript:void(0)', '/api/catalog-page', '/_next/static/app.js', '/guide.pdf', '//elsewhere.test/blog']) {
  assert.equal(getInternalNavigationHref(href, current), null, href);
}
assert.equal(getInternalNavigationHref('/product/engine-1.6?view=full#reviews', current), '/product/engine-1.6?view=full');
assert.equal(getInternalNavigationHref('?group=brakes', current), '/katalog?group=brakes');
assert.equal(getInternalNavigationHref('https://partson.test/blog#latest', current), '/blog');
assert.equal(prefetchRoute({ prefetch() { assert.fail('SSR must not prefetch'); } }, '/blog'), false);

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const realNow = Date.now;
let now = 1_000_000;
const navigatorMock = { onLine: true, connection: { saveData: false, effectiveType: '4g' } };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigatorMock });
globalThis.window = { location: { href: current } };
globalThis.document = { visibilityState: 'visible' };
Date.now = () => now;
const calls = [];
const router = { prefetch(href, options) { calls.push({ href, ...options }); } };
try {
  assert.equal(prefetchRoute(router, '/blog#latest'), true);
  const firstRequest = calls.at(-1);
  assert.equal(prefetchRoute(router, '/blog#older'), false, 'Hash variants share the same warm route');
  firstRequest.onInvalidate();
  assert.equal(prefetchRoute(router, '/blog'), true, 'Stale routes can warm again');
  firstRequest.onInvalidate();
  assert.equal(prefetchRoute(router, '/blog'), false, 'Old invalidation cannot evict a newer request');
  now += 30_001;
  assert.equal(prefetchRoute(router, '/blog'), true, 'Expired entries do not permanently block warming');
  assert.equal(prefetchRoute(router, '/inform/payment'), true, 'A reused anchor can warm its new href');
  assert.equal(prefetchRoute(router, '/groups', 'auto'), true);
  assert.equal(calls.at(-1).kind, 'auto');
  assert.equal(prefetchRoute(router, '/groups'), true, 'Navigation intent upgrades an idle shell prefetch to the complete route');
  assert.equal(calls.at(-1).kind, 'full');
  assert.equal(prefetchRoute(router, '/groups', 'auto'), false, 'A shell warmup cannot duplicate a full prefetch');

  navigatorMock.connection.saveData = true;
  assert.equal(prefetchRoute(router, '/save-data'), false);
  navigatorMock.connection.saveData = false;
  navigatorMock.connection.effectiveType = 'slow-2g';
  assert.equal(prefetchRoute(router, '/slow-network'), false);
  navigatorMock.connection.effectiveType = '4g';
  navigatorMock.onLine = false;
  assert.equal(prefetchRoute(router, '/offline'), false);
  navigatorMock.onLine = true;
  document.visibilityState = 'hidden';
  assert.equal(prefetchRoute(router, '/hidden'), false);
  document.visibilityState = 'visible';
  assert.equal(prefetchRoute(router, '/save-data'), true, 'Skipped requests are not cached');

  for (let index = 0; index < 70; index++) prefetchRoute(router, `/category-${index}`);
  assert.equal(prefetchRoute(router, '/category-0'), true, 'Registry evicts old entries instead of growing for the entire session');
  assert.equal(prefetchRoute({ prefetch() { throw new Error('interrupted'); } }, '/retry'), false);
  assert.equal(prefetchRoute(router, '/retry'), true, 'A failed speculative request never poisons the cache');
  console.log('PASS internal URLs, deduplication, invalidation, expiry, bounded cache, network preferences and retries');
} finally {
  Date.now = realNow;
  delete globalThis.window;
  delete globalThis.document;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
}
