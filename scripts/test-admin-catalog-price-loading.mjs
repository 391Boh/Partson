import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual catalog loader with independently controlled API replies.
const source = readFileSync('app/components/catalog/useCatalogData.ts', 'utf8');
const ast = ts.createSourceFile('Data.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let loader;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'fetchCatalogPagePrices') {
    loader = node.initializer.arguments[0].getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert(loader, 'Find the catalog price loader');
const compiled = ts.transpileModule(`exports.load = ${loader};`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const payload = (price, costPrice = null) => ({
  prices: { code: price }, costPrices: { code: costPrice },
  promoPrices: {}, hasPromo: {}, promoPercent: {}, isPartner: costPrice !== null,
});

function fixture({ token = 'admin-token', admin = true, signedIn = false } = {}) {
  const fast = deferred();
  const full = deferred();
  const partner = deferred();
  const calls = [];
  const prices = { current: {} };
  const costs = { current: {} };
  const promos = { current: {} };
  let isPartner = false;
  let tokenCalls = 0;
  const signature = { current: 'catalog' };
  const cooldowns = { current: {} };
  const accessScope = { current: `${admin}:${signedIn}` };
  let resolvedAccess = {};
  const context = {
    exports: {}, window: { setTimeout: () => 1, clearTimeout() {} }, AbortController, console: { log() {} }, performance,
    includeCostPrices: admin, includePartnerPrices: signedIn,
    getAdminAuthToken: async () => { tokenCalls++; return token; },
    PRICE_PAGE_BATCH_SIZE: 128, PRICE_ROUTE_NULL_REVALIDATE_AFTER_MS: 12000,
    PRICE_REVALIDATE_AFTER_NULL_MS: 30000, CATALOG_PRICE_BATCH_ROUTE: '/api/catalog-prices',
    pricesRef: prices, costPricesRef: costs, promoPricesRef: promos,
    priceAccessScopeRef: accessScope,
    livePricesRef: { current: {} }, hasPromoAvailabilityRef: { current: {} },
    activeQuerySignatureRef: signature, priceLoadingKeysRef: { current: new Set() },
    priceRetryCooldownUntilRef: cooldowns, inFlightPriceBatchRequests: new Map(),
    getProductPriceStateKey: item => item.code,
    getProductPriceLookupKeys: item => [item.code],
    readCachedPriceEntry: () => ({ hit: false }), readStalePositivePriceEntry: () => null,
    writeCachedPriceEntry() {}, mergePagePricesIntoCache() {},
    setPrices: update => { prices.current = update(prices.current); },
    setCostPrices: update => { costs.current = update(costs.current); },
    setResolvedPriceAccess: update => { resolvedAccess = update(resolvedAccess); },
    setHasPromoAvailability() {}, setPromoPercentByKey() {}, setIsPartner(value) { isPartner = value; },
    setPromoPrices(update) { promos.current = typeof update === 'function' ? update(promos.current) : update; }, rememberPartnerPriceHint() {}, handleCatalogBackgroundError() {},
    observeCatalogRequest: promise => { promise.catch(() => {}); return promise; },
    awaitWithAbortSignal: promise => promise,
    buildPriceBatchRequestKey: mode => mode,
    isAbortLikeError: error => error?.name === 'AbortError',
    fetch: async (url, options) => {
      const mode = new URL(url, 'http://test').searchParams.get('mode');
      calls.push({ mode, headers: options.headers });
      const data = await (mode === 'full' ? full.promise : mode === 'partner' ? partner.promise : fast.promise);
      return { ok: true, json: async () => data };
    },
  };
  vm.runInNewContext(compiled, context);
  const run = (query = 'catalog') => context.exports.load([{ code: 'code', article: 'article' }], {
    allowFullLookup: true, querySignatureSnapshot: query,
  });
  return { fast, full, partner, calls, prices, costs, promos, signature, cooldowns, accessScope, run, get tokenCalls() { return tokenCalls; }, get isPartner() { return isPartner; }, get resolvedAccess() { return resolvedAccess; } };
}

const admin = fixture({ signedIn: true });
const pending = admin.run();
await tick();
assert.deepEqual(admin.calls.map(call => call.mode).sort(), ['fast', 'full', 'partner'], 'Light sale/promo prices do not wait for purchase-cost details');
assert.equal(admin.calls.find(call => call.mode === 'full').headers.Authorization, 'Bearer admin-token');
assert.equal(admin.tokenCalls, 1, 'Partner prices and purchase costs share one token request');
admin.full.resolve({ ...payload(100, 60), promoPrices: { code: 80 }, isPartner: true });
await tick();
assert.equal(admin.prices.current.code, 100, 'Render the admin sale price while public lookup is pending');
assert.equal(admin.costs.current.code, 60, 'Render cost price without waiting for public prices');
assert.equal(admin.promos.current.code, 80, 'The same verified response sets the admin partner price');
assert.equal(admin.isPartner, true);
assert.equal(admin.resolvedAccess.code, 'true:true', 'Only the protected reply releases the admin skeleton');
admin.fast.resolve(payload(90));
await pending;
await tick();
assert.equal(admin.prices.current.code, 100, 'A late public reply must not replace the admin price');
assert.equal(admin.promos.current.code, 80, 'Public prices cannot clear the verified promo');
assert.equal(admin.isPartner, true);
assert.equal(admin.calls.filter(call => call.mode === 'full').length, 1, 'Reuse the concurrent admin request');

const publicFirst = fixture();
const publicPending = publicFirst.run();
publicFirst.fast.resolve(payload(95));
await publicPending;
assert.equal(publicFirst.prices.current.code, 95, 'Show public price while admin lookup is pending');
assert.equal(publicFirst.resolvedAccess.code, undefined, 'A public reply cannot release the admin skeleton');
publicFirst.partner.resolve({ ...payload(100), promoPrices: { code: 80 }, isPartner: true });
await tick();
assert.equal(publicFirst.prices.current.code, 100, 'Light verified price renders before cost lookup');
assert.equal(publicFirst.promos.current.code, 80);
assert.equal(publicFirst.costs.current.code, undefined, 'Purchase costs remain unresolved');
assert.equal(publicFirst.resolvedAccess.code, 'true:false');
publicFirst.full.resolve(payload(100, 60));
await tick();
assert.equal(publicFirst.prices.current.code, 100);
assert.equal(publicFirst.costs.current.code, 60);
assert.equal(publicFirst.resolvedAccess.code, 'true:false');

const noToken = fixture({ token: null });
const noTokenPending = noToken.run();
await tick();
assert.deepEqual(noToken.calls.map(call => call.mode), ['fast'], 'Do not send protected requests without a token');
noToken.fast.resolve(payload(95));
await noTokenPending;
assert.equal(noToken.prices.current.code, 95);
assert.equal(Object.keys(noToken.costs.current).length, 0);
assert.equal(noToken.resolvedAccess.code, undefined, 'No token is not a resolved private price');

const stale = fixture();
const stalePending = stale.run();
stale.signature.current = 'different-filter';
stale.full.resolve(payload(100, 60));
stale.fast.resolve(payload(95));
await stalePending;
await tick();
assert.equal(Object.keys(stale.prices.current).length, 0, 'Ignore responses after changing catalog filters');
assert.equal(Object.keys(stale.costs.current).length, 0);

const previousRole = fixture({ admin: false, signedIn: true });
const previousRolePending = previousRole.run();
previousRole.accessScope.current = 'true:true';
previousRole.promos.current = { code: 80 };
previousRole.partner.resolve(payload(100));
previousRole.fast.resolve(payload(95));
await previousRolePending;
await tick();
assert.equal(previousRole.promos.current.code, 80, 'A late pre-admin response cannot clear the admin promo');
assert.equal(previousRole.resolvedAccess.code, undefined, 'An old role response cannot release the current skeleton');

const partnerFirst = fixture({ admin: false, signedIn: true });
const partnerFirstPending = partnerFirst.run();
partnerFirst.partner.resolve({ ...payload(100), promoPrices: { code: 80 }, isPartner: true });
await tick();
partnerFirst.fast.resolve(payload(95));
await partnerFirstPending;
assert.equal(partnerFirst.prices.current.code, 100, 'A later public reply cannot overwrite a verified price');
assert.equal(partnerFirst.promos.current.code, 80);
admin.partner.resolve({ ...payload(90), promoPrices: { code: 70 }, isPartner: true });
await tick();
assert.equal(admin.prices.current.code, 100, 'Late snapshot response cannot overwrite full live admin details');
assert.equal(admin.promos.current.code, 80);

const pendingCost = fixture({ admin: true, signedIn: true });
const pendingCostFirst = pendingCost.run();
pendingCost.partner.resolve({ ...payload(100), promoPrices: { code: 80 }, isPartner: true });
pendingCost.fast.resolve(payload(100));
await pendingCostFirst;
await tick();
await pendingCost.run();
assert.equal(pendingCost.calls.filter(call => call.mode === 'full').length, 1, 'Visible updates cannot duplicate an in-flight purchase-cost lookup');
pendingCost.full.resolve(payload(100,60));
await tick();

const unpricedGuest = fixture({ admin: false, signedIn: false });
const unpricedPending = unpricedGuest.run();
unpricedGuest.fast.resolve(payload(null));
await unpricedPending;
assert.equal(unpricedGuest.prices.current.code, null, 'An explicit absent price ends the skeleton');
assert.equal(unpricedGuest.tokenCalls, 0, 'A guest never restores Firebase for an admin-only fallback');
assert.deepEqual(unpricedGuest.calls.map(call => call.mode), ['fast']);

const staleAdminHint = fixture({ admin: true, signedIn: true });
const staleAdminPending = staleAdminHint.run();
staleAdminHint.partner.resolve({ ...payload(100), promoPrices: { code: 80 }, isPartner: true });
await tick();
staleAdminHint.full.resolve(payload(95));
staleAdminHint.fast.resolve(payload(95));
await staleAdminPending;
await tick();
assert.equal(staleAdminHint.promos.current.code, 80, 'A rejected admin role cannot revoke verified partner access');
assert.equal(Object.keys(staleAdminHint.costs.current).length, 0, 'No purchase cost from an unverified admin response');

const timedOutGuest = fixture({ admin: false, signedIn: false });
const timeoutPending = timedOutGuest.run();
timedOutGuest.fast.reject({ name: 'AbortError', message: 'Request deadline' });
await timeoutPending;
assert.equal(timedOutGuest.prices.current.code, undefined, 'A timeout is not an absent price');
assert(timedOutGuest.cooldowns.current.code > Date.now(), 'A request deadline schedules a paced retry');

const filtering = fixture({ admin: false, signedIn: true });
const beforeFilter = filtering.run();
await tick();
filtering.signature.current = 'new-filter';
const afterFilter = filtering.run('new-filter');
await tick();
filtering.partner.resolve({ ...payload(100), promoPrices: { code: 80 }, isPartner: true });
await tick();
assert.equal(filtering.promos.current.code, 80, 'A new filter can subscribe to in-flight prices for an overlapping product');
filtering.fast.resolve(payload(95));
await beforeFilter;
await afterFilter;
assert.equal(filtering.calls.filter(call => call.mode === 'partner').length, 1, 'Filter changes reuse the protected source request');

const cacheSource = readFileSync('app/components/catalog/catalog-cache.ts', 'utf8');
const cacheAst = ts.createSourceFile('cache.ts', cacheSource, ts.ScriptTarget.Latest, true);
let keyBuilder;
function readKey(node) { if (ts.isVariableDeclaration(node) && node.name.getText(cacheAst) === 'buildPriceBatchRequestKey') keyBuilder = node.initializer.getText(cacheAst); ts.forEachChild(node, readKey); }
readKey(cacheAst);
const keyContext={exports:{}};
vm.runInNewContext(ts.transpileModule('exports.key='+keyBuilder,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,keyContext);
const sameProduct=[{stateKey:'code',lookupKeys:['code']}];
assert.notEqual(keyContext.exports.key('partner',sameProduct,'false:true:user-a'),keyContext.exports.key('partner',sameProduct,'false:true:user-b'),'Private pending responses are isolated by user');
assert.equal(keyContext.exports.key('fast',sameProduct,'user-a'),keyContext.exports.key('fast',sameProduct,'user-b'),'Public batches remain shareable');

console.log('Admin catalog prices passed: concurrent loading, immediate results, late replies, token gating and filter changes.');
