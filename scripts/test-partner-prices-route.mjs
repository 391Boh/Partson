import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
let authorized = true;
let adminAuthorized = false;
let detailCalls = 0;
let publicCalls = 0;
const mocks = {
  'next/server': { NextResponse: Response },
  'app/api/_lib/admin-auth': { verifyAdminRequest: async () => adminAuthorized },
  'app/api/_lib/partner-auth': { verifyPartnerRequest: async () => authorized },
  'app/lib/catalog-server': {
    getSnapshotPriceLookup: () => ({}),
    fetchCatalogPriceDetailsByLookupKeys: async () => {
      detailCalls++;
      return { prices: { code: 100 }, costPrices: { code: 50 }, promoPrices: { code: 80 } };
    },
    fetchPriceEuroMapByLookupKeys: async () => { publicCalls++; return { code: 100 }; },
    fetchPromoAvailabilityByLookupKeys: async () => { publicCalls++; return { code: { hasPromo: true, promoPercent: 20 } }; },
  },
};
vm.runInNewContext(ts.transpileModule(readFileSync('app/api/catalog-prices/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, URL, require: name => { assert.ok(mocks[name], name); return mocks[name]; } });
const request = (mode = 'partner') => exports.POST({ url: `https://example.test/api/catalog-prices?mode=${mode}`, json: async () => ({ items: [{ stateKey: 'code', lookupKeys: ['code', 'article'] }] }) });
let payload = await (await request()).json();
assert.equal(payload.promoPrices.code, 80);
assert.equal(payload.costPrices.code, null);
assert.equal(payload.promoPercent.code, 20);
assert.equal(publicCalls, 0, 'Protected prices must not wait for redundant public lookups');
await request();
assert.equal(detailCalls, 1, 'Warm partner prices use cache');
authorized = false;
payload = await (await request()).json();
assert.equal(payload.isPartner, false);
assert.equal(payload.promoPrices.code, null, 'Never expose cached partner prices after authorization fails');
assert.equal(publicCalls, 2);
adminAuthorized = true;
payload = await (await request('full')).json();
assert.equal(payload.isPartner, true, 'Admins have the same promo access in batches and live refresh');
assert.equal(payload.costPrices.code, 50);
assert.equal(payload.promoPrices.code, 80);
assert.equal((await (await request('full')).json()).isPartner, true, 'Cached admin responses retain promo access');
payload = await (await request('partner')).json();
assert.equal(payload.isPartner, true, 'An admin does not need a separate partner grant');
assert.equal(payload.promoPrices.code, 80);
assert.equal(payload.costPrices.code, null, 'Partner mode never includes admin cost prices');
adminAuthorized = false;
payload = await (await request('full')).json();
assert.equal(payload.isPartner, false);
assert.equal(payload.promoPrices.code, null);
assert.equal(payload.costPrices.code, null, 'Revoked access cannot reuse an admin cache');
console.log('Partner prices passed: no redundant lookups, cache reuse and authorization isolation.');
