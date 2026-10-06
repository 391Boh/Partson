import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const listeners = new Map();
const requests = [];
const applied = [];
let initial;
let cleanup;
const events = {
  addEventListener: (name, callback) => listeners.set(name, callback),
  removeEventListener: name => listeners.delete(name),
};
vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/use-live-catalog-refresh.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports, AbortController, AbortSignal, Date, clearTimeout, clearInterval,
  document: { hidden: false, ...events },
  window: { ...events, setTimeout: callback => { initial = callback; }, setInterval: () => 1 },
  fetch: (_url, options) => new Promise(resolve => requests.push({ resolve, options })),
  require: name => name === 'react'
    ? { useEffect: effect => { cleanup = effect(); }, useState: () => [null, () => {}] }
    : { getAdminIdToken: async () => null },
});
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const reply = (index, quantity) => requests[index].resolve({ ok: true, json: async () => ({ products: [{ code: 'TEST', quantity }] }) });

exports.useLiveCatalogRefresh(['TEST'], true, products => applied.push(products[0].quantity), 'fast');
initial();
assert.equal(requests.length, 1);
listeners.get('partson:catalog-invalidated')();
reply(0, 5);
await flush();
assert.deepEqual(applied, [], 'A pre-edit live response must not overwrite confirmed stock');
assert.equal(requests.length, 2, 'Invalidation during a pending fetch must queue immediate confirmation');
reply(1, 8);
await flush();
assert.deepEqual(applied, [8]);
listeners.get('partson:catalog-invalidated')();
assert.equal(requests.length, 3, 'Next edit must refresh immediately without the 30s polling delay');
cleanup();
reply(2, 4);
await flush();
assert.deepEqual(applied, [8], 'An unmounted catalog must ignore a late response');
assert.equal(listeners.size, 0);
console.log('Live stock refresh passed: old responses ignored, edits refreshed immediately, pending refresh queued, cleanup.');
