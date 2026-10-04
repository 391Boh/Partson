import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/product-admin-validation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports });
const { parseProductFormPrice: price, parseProductFormQuantity: quantity } = exports;
for (const [raw, expected] of [['0', 0], ['12,50', 12.5], ['1 234,56', 1234.56], ['', undefined], ['  ', undefined], ['-1', null], ['1e3', null], ['0x10', null], ['12.345', null], ['abc', null]]) {
  assert.equal(price(raw), expected, `price: ${raw}`);
}
for (const [raw, expected] of [['0', 0], ['12', 12], ['', null], ['-1', null], ['1.5', null], ['1e3', null], ['9007199254740992', null]]) {
  assert.equal(quantity(raw), expected, `quantity: ${raw}`);
}
console.log('Product form validation checks passed');
