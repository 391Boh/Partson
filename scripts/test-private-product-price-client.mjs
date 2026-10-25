import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let user = { uid: 'test-admin', getIdToken: async () => 'test-token' };
const requests = [];
const pending = [];
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/private-product-price-client.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports, AbortSignal, URLSearchParams,
  require: () => ({
    waitForFirebaseAuthReady: async () => ({ ready: true, user }),
    getFirebaseAuthSnapshot: () => ({ ready: true, user }),
  }),
  fetch: (url, options) => {
    requests.push({ url, options });
    return new Promise(resolve => pending.push(resolve));
  },
});
const read = exports.loadPrivateProductPrice;
const tick = () => new Promise(resolve => setImmediate(resolve));
const answer = (payload, ok = true) => pending.shift()({ ok, json: async () => payload });
const first = read(['CODE', 'ARTICLE']);
const second = read(['ARTICLE', 'CODE', 'CODE']);
await tick();
assert.equal(requests.length, 1, 'Panels share one in-flight read');
assert.equal(requests[0].options.cache, 'no-store');
assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token');
answer({ isPartner: true, promoPriceEuro: 10 });
assert.equal((await first).promoPriceEuro, 10);
assert.equal((await second).promoPriceEuro, 10);
assert.equal((await read(['CODE', 'ARTICLE'])).promoPriceEuro, 10);
assert.equal(requests.length, 1, 'Late editor mount reuses the just-confirmed response');
const refreshed = read(['CODE', 'ARTICLE'], true);
await tick();
assert.equal(requests.length, 2, 'A price edit bypasses the short reuse cache');
answer({ isPartner: true, promoPriceEuro: 8 });
assert.equal((await refreshed).promoPriceEuro, 8);
user = { ...user, uid: 'second-admin' };
const otherUser = read(['CODE', 'ARTICLE']);
await tick();
assert.equal(requests.length, 3, 'Values are isolated by verified user');
user = null;
answer({ isPartner: true, promoPriceEuro: 9 });
assert.equal(await otherUser, null, 'Ignore a response after logout');
assert.equal(await read(['CODE', 'ARTICLE']), null);
assert.equal(requests.length, 3, 'Anonymous reads never send a private request');
user = { uid: 'test-admin', getIdToken: async () => 'test-token' };
const obsolete = read(['CODE', 'ARTICLE']);
await tick();
const newest = read(['CODE', 'ARTICLE'], true);
await tick();
answer({ promoPriceEuro: 12 });
assert.equal(await obsolete, null, 'A superseded read cannot overwrite an edited price');
answer({ promoPriceEuro: 7 });
assert.equal((await newest).promoPriceEuro, 7);
console.log('PASS: shared authenticated price requests, refresh bypass and user isolation.');
