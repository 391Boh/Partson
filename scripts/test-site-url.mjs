import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const source = ts.transpileModule(readFileSync('app/lib/site-url.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function load(env) {
  const exports = {};
  vm.runInNewContext(source, { exports, URL, process: { env } });
  return exports.getSiteUrl;
}
assert.equal(load({ NEXT_PUBLIC_SITE_URL: 'https://partson.shop/path?utm_source=test#top' })(), 'https://partson.shop');
assert.equal(load({ NEXT_PUBLIC_SITE_URL: 'https://user:password@bad.example', SITE_URL: 'https://partson.shop/' })(), 'https://partson.shop');
assert.equal(load({ NODE_ENV: 'production' })(), 'https://partson.shop');
assert.equal(load({ NODE_ENV: 'development' })(), 'http://localhost:3000');
assert.equal(load({})({ headers: new Headers({ host: 'localhost:3100' }) }), 'http://localhost:3100');
console.log('SEO origin checks passed: clean canonical origin, credential rejection, production and dev defaults.');
