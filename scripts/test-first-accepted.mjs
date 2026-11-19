// firstAcceptedInOrder: same winner as an ordered scan of Promise.all, but
// resolved as soon as the higher-priority lookups have settled.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const source = ts.transpileModule(readFileSync('app/lib/first-accepted.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, { exports, Promise, setTimeout });
const { firstAcceptedInOrder } = exports;

const after = (ms, value, fail = false) => new Promise((resolve, reject) => setTimeout(() => (fail ? reject(new Error('x')) : resolve(value)), ms));
const keep = (v) => (v && v.ok ? v.id : null);
const timed = async (promise) => { const start = Date.now(); const value = await promise; return [value, Date.now() - start]; };

// Empty and all-miss.
assert.equal(await firstAcceptedInOrder([], keep), null);
assert.equal(await firstAcceptedInOrder([after(5, { ok: false }), after(10, null)], keep), null);

// A fast match first in priority returns without waiting for a slow tail.
{
  const [value, ms] = await timed(firstAcceptedInOrder([after(10, { ok: true, id: 'a' }), after(400, { ok: true, id: 'b' })], keep));
  assert.equal(value, 'a');
  assert.ok(ms < 200, `returned after ${ms} ms`);
}

// Priority is kept: a later fast match waits for an earlier slower one.
assert.equal(await firstAcceptedInOrder([after(60, { ok: true, id: 'first' }), after(5, { ok: true, id: 'second' })], keep), 'first');

// Earlier misses/rejections are skipped as soon as they settle.
{
  const [value, ms] = await timed(firstAcceptedInOrder([after(5, null, true), after(10, { ok: false }), after(20, { ok: true, id: 'c' }), after(400, { ok: true, id: 'd' })], keep));
  assert.equal(value, 'c');
  assert.ok(ms < 200, `returned after ${ms} ms`);
}

// A throwing accept counts as no match.
assert.equal(await firstAcceptedInOrder([after(5, { ok: true, id: 'boom' }), after(10, { ok: true, id: 'e' })], (v) => { if (v.id === 'boom') throw new Error('bad'); return v.id; }), 'e');

console.log('first-accepted: ok');
