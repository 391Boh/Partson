import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const requests = [];
let rejectDescription = false;
vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/product-admin-mutations.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, fetch: async (url, options) => {
  requests.push({ url, body: JSON.parse(options.body) });
  const ok = !(rejectDescription && url.includes('description'));
  return { ok, json: async () => ({ ok: true }) };
} });
const save = () => exports.saveProductAdminFields('CODE', 'OLD', { description: 'Text', catalogNumber: 'NEW', priceEuro: 0, quantity: 0 }, 'token');
assert.equal((await save()).ok, true);
assert.match(requests[0].url, /description/);
assert.equal(requests[0].body.article, 'OLD');
assert.equal(requests[1].body.НомерПоКаталогу, 'NEW');
assert.equal(requests[1].body.requirePriceConfirmation, true);
assert.equal(requests[1].body.ЦінаПрод, 0);
assert.equal(requests[1].body.Кількість, 0);
requests.length = 0;
rejectDescription = true;
assert.equal((await save()).ok, false);
assert.equal(requests.length, 1, 'Do not rename after failed description or ignore HTTP failure');
console.log('Admin mutations passed: sequencing, HTTP failures, zero values and price confirmation');
