import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const fn = source.match(/const buildStylesheetLoaderScript = [\s\S]+?\n};/)[0];
const code = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const build = vm.runInNewContext(`${code};buildStylesheetLoaderScript`, { CRITICAL_CSS_PRECEDENCE: 'critical' });
function fixture({ critical = true, pathname = '/', readyState = 'loading' } = {}) {
  const links = [], listeners = {}, writes = [];
  const window = { location: { pathname } };
  const document = {
    readyState, querySelector: () => critical,
    createElement: () => ({}), head: { appendChild: link => links.push(link) },
    addEventListener: (name, callback) => { listeners[name] = callback; },
    write: html => writes.push(html),
  };
  vm.runInNewContext(build('/styles/site.test.css'), { document, window });
  return { window, links, listeners, writes };
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
await error.window.__partsonCssReady;
assert.equal(fixture({ pathname: '/katalog' }).links.length, 1, 'Other routes keep their existing stylesheet timing');
const product = fixture({ pathname: '/product/example' });
assert.equal(product.links.length, 0, 'Product critical CSS also keeps full CSS off its startup path');
product.listeners.DOMContentLoaded();
assert.equal(product.links.length, 1);
const plain = fixture({ critical: false });
assert.equal(plain.links.length, 0);
assert.match(plain.writes[0], /rel="stylesheet"/, 'Routes without critical CSS keep parser-blocking styles');
console.log('PASS stylesheet startup: homepage deferral, low priority, readiness/error completion and unchanged other routes');
