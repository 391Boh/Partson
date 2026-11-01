import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
const window = new EventTarget();
const timers = new Map(), requests = [], counts = [];
let nextTimer = 1;
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/admin-notification-client.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, document, window, AbortController,
  setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
  fetch: async (url, options) => { requests.push({ url, options }); return { status: 200, ok: true, json: async () => ({ total: requests.length * 3 }) }; },
});
const tick = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const stop = exports.subscribeAdminNotificationCount({ getIdToken: async () => 'fixture' }, value => counts.push(value));
await tick();
assert.deepEqual(counts, [3]); assert.equal(requests[0].options.headers.Authorization, 'Bearer fixture');
document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
window.dispatchEvent(new Event('focus')); await tick(); assert.equal(requests.length, 1, 'Hidden tabs do no polling');
document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange')); await tick();
assert.equal(requests.length, 2);
window.dispatchEvent(new Event(exports.ADMIN_NOTIFICATIONS_CHANGED_EVENT)); await tick();
assert(requests.at(-1).url.endsWith('?refresh=1'));
const before = requests.length;
stop(); window.dispatchEvent(new Event('focus'));
for (const timer of timers.values()) timer.fn();
await tick(); assert.equal(requests.length, before);
console.log('PASS visible-only counts, authenticated requests, immediate refresh and teardown');
