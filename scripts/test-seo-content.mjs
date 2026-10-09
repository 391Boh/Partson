import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  vm.runInNewContext(ts.transpileModule(readFileSync(`${file}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: load });
  return exports;
}
const { buildProductSeoTitle: title, buildProductMetaDescription: description, buildProductImageAlt: alt } = load('app/lib/product-seo-copy');
const product = { productName: 'Гальмівний диск VW GOLF VII (ANALOG/123)', producer: 'BREMBO', article: '09.9772.11' };
assert.ok(title({ name: 'Трос ручн. гальм. лів. AUDI 80 бараб,', producer: 'Adriauto', article: 'AD030213' }).includes('AUDI'), 'Abbreviations must not hide vehicle fitment');
const text = description(product);
assert.ok(text.includes('VW GOLF VII') && text.includes('BREMBO') && text.includes('09.9772.11'));
assert.ok(text.length <= 160);
assert.ok(!text.includes('ANALOG'));
assert.notEqual(text, description({ ...product, article: '09.9772.12' }));
assert.ok(title({ name: product.productName, producer: product.producer, article: product.article }).endsWith('| PartsON'));
assert.equal((title({ name: 'Фільтр BOSCH AB123', producer: 'BOSCH', article: 'AB123' }).match(/AB123/g) || []).length, 1);
assert.ok(title({ name: 'Фільтр AB1234', article: 'AB123' }).includes('— AB123'), 'Do not confuse partial article matches');
// Long names keep their fitment: the site name, then the manufacturer, are
// dropped before the name itself is cut; the article always stays.
const kiaTitle = title({ name: 'Фільтр повітря KIA RIO HYUNDAI ACCENT 02-', producer: 'ALPHA', article: 'AF1741' });
assert.equal(kiaTitle, 'Фільтр повітря KIA RIO HYUNDAI ACCENT 02- — ALPHA AF1741');
const lampTitle = title({ name: 'Лампа сигналу повороту переднього ліва SCUDO 94-', producer: 'DEPO', article: '6611518LUE' });
assert.equal(lampTitle, 'Лампа сигналу повороту переднього ліва SCUDO 94- — 6611518LUE');
const cutTitle = title({ name: 'Щітка склоочисника безкаркасна RENAULT Clio II, TOYOTA Avensis/Corolla', producer: 'BOSCH', article: '3397118901' });
assert.ok(cutTitle.length <= 65 && cutTitle.endsWith('… — 3397118901'), cutTitle);
for (const value of [kiaTitle, lampTitle, cutTitle]) assert.ok(value.length <= 65, value);
const { normalizeProductDisplayName: displayName } = load('app/lib/product-display-name');
assert.equal(displayName('Трос зчеплення Vectra A 1. 8-2. 0, Calibra 89-'), 'Трос зчеплення Vectra A 1.8-2.0, Calibra 89-');
assert.equal(displayName('Подушка двигуна ASTRA H 1. 9CDTi 04-'), 'Подушка двигуна ASTRA H 1.9CDTi 04-');
assert.equal(displayName('Трос зчеплення Omega 1, 8-2, 0 86-87'), 'Трос зчеплення Omega 1, 8-2, 0 86-87');
assert.equal(displayName('1. 2 болти в комплекті'), '1. 2 болти в комплекті');
assert.equal(displayName('Сальник 12. 02-'), 'Сальник 12. 02-');
assert.ok(!alt(product).includes('ANALOG'));
for (const name of ['', 'Фільтр '.repeat(100), '<b>Фільтр</b>']) {
 assert.ok(description({ productName: name }).length <= 160);
 assert.ok(!description({ productName: name }).includes('<b>'));
}
const { buildPageMetadata } = load('app/lib/seo-metadata');
const metadata = buildPageMetadata({ title: 'Гальмівні диски', description: text, canonicalPath: '/groups/discs', keywords: ['Гальмівні диски', 'гальмівні диски'], image: { url: '/real-photo.webp', alt: 'Гальмівний диск' } });
assert.equal(metadata.openGraph.images[0].width, undefined, 'Do not invent image dimensions');
assert.equal(metadata.robots['max-image-preview'], 'large');
assert.equal(metadata.keywords.filter(word => word.toLowerCase() === 'гальмівні диски').length, 1);
const { safeJsonLd } = load('app/lib/safe-json-ld');
const hostile = { name: '<!--<script></script><script>alert(1)</script>' };
assert.ok(!safeJsonLd(hostile).includes('<'));
assert.deepEqual(JSON.parse(safeJsonLd(hostile)), hostile);
console.log('SEO copy passed: product identity, unique concise descriptions, image metadata and safe JSON-LD.');
console.log(JSON.stringify({ title: title({ name: product.productName, producer: product.producer, article: product.article }), description: text, alt: alt(product) }, null, 2));
