import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const warnings = [];
vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/catalog-request-lifecycle.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, console: { warn: (...args) => warnings.push(args) } });
const { isAbortLikeError, awaitWithAbortSignal, observeCatalogRequest, handleCatalogBackgroundError } = exports;
for (const value of [new DOMException('cancelled', 'AbortError'), { name: 'AbortError' }, { message: 'Fetch is aborted' }, 'Fetch is aborted', vm.runInNewContext('new Error("Fetch is aborted")')]) {
  assert.equal(isAbortLikeError(value), true);
}
assert.equal(isAbortLikeError(new Error('Network failed')), false);
assert.equal(isAbortLikeError({ name: 'TimeoutError' }), false);
const unhandled = [];
const onUnhandled = reason => unhandled.push(reason);
process.on('unhandledRejection', onUnhandled);
const tick = () => new Promise(resolve => setImmediate(resolve));
try {
  const cancelled = new AbortController();
  cancelled.abort();
  const source = Promise.reject(new Error('Late network failure'));
  await assert.rejects(awaitWithAbortSignal(source, cancelled.signal), { name: 'AbortError' });
  const active = new AbortController();
  let finish;
  const shared = new Promise(resolve => { finish = resolve; });
  const abandoned = assert.rejects(awaitWithAbortSignal(shared, active.signal), { name: 'AbortError' });
  const subscriber = awaitWithAbortSignal(shared, new AbortController().signal);
  active.abort();
  finish('products');
  await abandoned;
  assert.equal(await subscriber, 'products', 'Cancellation must not abort other subscribers');
  const partner = observeCatalogRequest(Promise.reject(new DOMException('Fetch is aborted', 'AbortError')));
  await tick(); // Public price request has not completed yet.
  await assert.rejects(partner, { name: 'AbortError' });
  await Promise.reject(new Error('Background network failure')).catch(handleCatalogBackgroundError);
  handleCatalogBackgroundError({ name: 'AbortError' });
  assert.equal(warnings.length, 1, 'Real background failures remain visible in diagnostics');
  await tick();
  assert.deepEqual(unhandled, []);
  console.log('Catalog request lifecycle passed: cancellation, parallel rejection, shared requests and diagnostics.');
} finally {
  process.removeListener('unhandledRejection', onUnhandled);
}
