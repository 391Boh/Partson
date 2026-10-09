import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync('app/lib/marketing-attribution.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
function load(window, cookie = '') {
  const exports = {};
  vm.runInNewContext(source, { exports, window, document: { cookie }, URL, Date,
    require: () => ({ ADVERTISING_CONSENT_COOKIE: 'ads-consent', pushAnalyticsEvent: () => {} }),
  });
  return exports;
}
const blocked = {};
Object.defineProperty(blocked, 'sessionStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
Object.defineProperty(blocked, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
assert.equal(load(blocked).getMarketingAttribution(), null, 'Blocked browser storage must not prevent checkout');
const window = { sessionStorage: memory(), localStorage: memory() };
const api = load(window);
api.captureMarketingAttribution({ href: 'https://partson.shop/katalog?utm_source=google&utm_campaign=parts&other=ignored' });
const attribution = api.getMarketingAttribution();
assert.equal(attribution.utm_source, 'google');
assert.equal(attribution.utm_campaign, 'parts');
assert.equal(attribution.landing_path, '/katalog');
assert.equal(attribution.other, undefined);
assert.equal(window.localStorage.getItem('partson:attribution:last'), null);
window.sessionStorage.setItem('partson:attribution:session', '{bad-json');
assert.equal(api.getMarketingAttribution(), null);
const old = { utm_source: 'old', captured_at: new Date(Date.now() - 91 * 86400000).toISOString() };
window.localStorage.setItem('partson:attribution:last', JSON.stringify(old));
assert.equal(load(window, 'ads-consent=granted').getMarketingAttribution(), null);
console.log('Marketing attribution passed: blocked storage, campaign capture, malformed cache, consent and expiry.');
