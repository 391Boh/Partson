import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const listeners = new Set();
const cleanups = [];
let value;
vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/use-product-quantity.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, {
  exports,
  require: () => ({
    useState: initial => { value = initial; return [value, next => { value = next; }]; },
    useEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
  }),
  window: {
    addEventListener: (_name, fn) => listeners.add(fn),
    removeEventListener: (_name, fn) => listeners.delete(fn),
  },
});
exports.useProductQuantity('CODE-1', 5);
const dispatch = detail => { for (const listener of listeners) listener({ detail }); };
dispatch({ code: 'other', quantity: 10 });
assert.equal(value, 5);
dispatch({ code: ' code-1 ', quantity: 12 });
assert.equal(value, 12);
dispatch({ code: 'CODE-1', quantity: 0 });
assert.equal(value, 0);
for (const quantity of [-1, 1.5, NaN, undefined]) dispatch({ code: 'CODE-1', quantity });
assert.equal(value, 0);
cleanups.forEach(cleanup => cleanup());
assert.equal(listeners.size, 0);
console.log('Quantity sync passed: immediate updates, zero, product isolation and cleanup.');
