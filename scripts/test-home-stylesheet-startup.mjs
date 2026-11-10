import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const fn = source.match(/const buildStylesheetLoaderScript = [\s\S]+?\n};/)[0];
const code = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const build = vm.runInNewContext(`${code};buildStylesheetLoaderScript`, { CRITICAL_CSS_PRECEDENCE: 'critical' });
function fixture({ critical = true, pathname = '/', readyState = 'loading' } = {}) {
  const links = [], listeners = {}, writes = [], timers = [];
  const window = { location: { pathname }, setTimeout: callback => { timers.push(callback); } };
  const document = {
    readyState, querySelector: () => critical,
    createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild: link => links.push(link) },
    addEventListener: (name, callback) => { listeners[name] = callback; },
    write: html => writes.push(html),
  };
  vm.runInNewContext(build('/styles/site.test.css'), { document, window });
  return { window, links, listeners, writes, timers };
}
const home = fixture();
assert.equal(home.links.length, 0, 'Full CSS must not compete with initial homepage scripts/fonts');
assert(home.window.__partsonCssReady, 'Deferred sections can subscribe before DOMContentLoaded');
home.listeners.DOMContentLoaded();
assert.equal(home.links.length, 1);
assert.equal(home.links[0].media, 'print');
assert.equal(home.links[0].fetchPriority, 'low');
home.links[0].onload();
await home.window.__partsonCssReady;
assert.equal(home.links[0].media, 'all', 'Loaded styles become active before deferred sections mount');
const error = fixture({ readyState: 'interactive' });
error.links[0].onerror();
assert.equal(error.links[0].removed, true, 'A failed file is removed before retrying');
assert.equal(error.timers.length, 1);
error.timers.shift()();
assert.equal(error.links.length, 2);
error.links[1].onload();
await error.window.__partsonCssReady;
const foreground = fixture();
foreground.window.__partsonEnsureCss();
assert.equal(foreground.links.length, 1, 'Intent can start CSS before DOMContentLoaded');
assert.equal(foreground.links[0].fetchPriority, 'high');
foreground.listeners.DOMContentLoaded();
assert.equal(foreground.links.length, 1, 'Intent and the normal start share one download');
foreground.links[0].onerror();
foreground.timers.shift()();
assert.equal(foreground.links[1].fetchPriority, 'high', 'Retries retain the foreground priority');
foreground.links[1].onload();
await foreground.window.__partsonCssReady;
const exhausted = fixture({ readyState: 'interactive' });
for (let attempt = 0; attempt < 3; attempt++) {
  exhausted.links.at(-1).onerror();
  exhausted.timers.shift()?.();
}
await assert.rejects(exhausted.window.__partsonCssReady, /оформлення/);
assert.equal(exhausted.links.length, 3, 'An unavailable stylesheet cannot start an infinite retry loop');
exhausted.window.__partsonEnsureCss();
assert.equal(exhausted.links.length, 4, 'A later interaction can retry a failed stylesheet');
exhausted.links[3].onload();
await exhausted.window.__partsonCssReady;
const raced = fixture({ readyState: 'interactive' });
const staleTimers = [];
for (let attempt = 0; attempt < 3; attempt++) {
  raced.links.at(-1).onerror();
  if (attempt < 2) {
    staleTimers.push(raced.timers.shift());
    raced.window.__partsonEnsureCss();
  }
}
await assert.rejects(raced.window.__partsonCssReady, /оформлення/);
staleTimers.forEach(callback => callback());
assert.equal(raced.links.length, 3, 'Old retry timers cannot restart an exhausted request after foreground promotion');
assert.equal(fixture({ pathname: '/katalog' }).links.length, 1, 'Other routes keep their existing stylesheet timing');
const product = fixture({ pathname: '/product/example' });
assert.equal(product.links.length, 0, 'Product critical CSS also keeps full CSS off its startup path');
product.listeners.DOMContentLoaded();
assert.equal(product.links.length, 1);
const plain = fixture({ critical: false });
assert.equal(plain.links.length, 0);
assert.match(plain.writes[0], /rel="stylesheet"/, 'Routes without critical CSS keep parser-blocking styles');
// The shared readiness helper promotes actual interactions, while background
// preparation leaves the initial low-priority request alone.
const readiness = {};
let finish, promoted = 0;
const callbacks = new Map();
const mockWindow = {
  __partsonCssReady: new Promise(resolve => { finish = resolve; }),
  __partsonEnsureCss: () => { promoted++; },
  setTimeout: callback => { const id = callbacks.size + 1; callbacks.set(id, callback); return id; },
  clearTimeout: id => callbacks.delete(id),
};
vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/full-stylesheet.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: readiness, window: mockWindow });
const background = readiness.whenFullStylesheetReady({ priority: 'low' });
assert.equal(promoted, 0);
const interaction = readiness.whenFullStylesheetReady();
assert.equal(promoted, 1);
finish();
await Promise.all([background, interaction]);
assert.equal(callbacks.size, 0, 'Settled styles leave no ten-second timers behind');
mockWindow.__partsonCssReady = Promise.reject(new Error('CSS unavailable'));
await assert.rejects(readiness.whenFullStylesheetReady(), /CSS unavailable/, 'Failed styles never release unstyled controls');
mockWindow.__partsonCssReady = new Promise(() => {});
const timedOut = readiness.whenFullStylesheetReady();
for (const callback of callbacks.values()) callback();
await assert.rejects(timedOut, /оформлення/, 'A stalled stylesheet reports failure instead of mounting unstyled UI');
console.log('PASS stylesheet startup: deferred low-priority CSS, intent promotion, deduplicated start, bounded retries, readiness and timer cleanup');
