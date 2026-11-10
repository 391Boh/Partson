// Product snippets: 1C model marks typed in Cyrillic ("А4", "6РК1705") read
// as Latin so they match searches, and the cars a product name itself names
// lead the description instead of whatever make sorts first.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const modules = new Map();
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, URL, URLSearchParams, require: (name) => load((name.startsWith('app/') ? path.resolve(name) : path.resolve(path.dirname(file), name)) + '.ts') });
  return exports;
}

const { fixCatalogSpelling } = load('app/lib/catalog-label-format.ts');
const spelled = {
  'Ролик з натягувачем А4, А6 Fabia': 'Ролик з натягувачем A4, A6 Fabia',
  'Колодки MERCEDES С180 W203': 'Колодки MERCEDES C180 W203',
  'Ремінь 6РК1705': 'Ремінь 6PK1705',
  'Датчик АВS': 'Датчик ABS',
  'Комплект щеплення AКПП': 'Комплект зчеплення АКПП',
  'Масло 5W-30 4л': 'Масло 5W-30 4л',
  'Сайлентблок В 2шт': 'Сайлентблок В 2шт',
  'Шрус ВАЗ 2108': 'Шрус ВАЗ 2108',
};
for (const [input, expected] of Object.entries(spelled)) assert.equal(fixCatalogSpelling(input), expected, input);

const { buildProductMetaDescription } = load('app/lib/product-seo-copy.ts');
const timingKit = buildProductMetaDescription({
  productName: 'Комплект ГРМ T5 TOURAN GOLF PASSAT 03-', producer: 'BOSCH', article: '1987945328',
  fitmentSource: 'AUDI A1 (8X1), A3 (8P1), A4 B8 (8K2); SEAT ALHAMBRA (710), ALTEA (5P1); VW GOLF V (1K1), PASSAT B6 (3C2), TOURAN (1T1), TRANSPORTER T5 (7HA)',
});
assert.match(timingKit, /для VW Golf V \(1K1\), Passat B6 \(3C2\)/, 'the named cars come first');
assert.ok(timingKit.indexOf('VW') < timingKit.indexOf('Audi') || !timingKit.includes('Audi'), 'a make the name does not mention follows');
assert.ok(timingKit.length <= 160);

const roller = buildProductMetaDescription({
  productName: 'Ролик з натягувачем А4, А6 Fabia 1.9-2.0TDI 99-', producer: 'INA', article: '534016410',
  fitmentSource: 'AUDI 100 C3 (443), A1 (8X1), A4 B5 (8D2), A6 C5 (4B2); SEAT ALHAMBRA (710); SKODA FABIA I (6Y2)',
});
assert.match(roller, /для Audi A4 B5 \(8D2\), A6 C5 \(4B2\)/, 'Cyrillic А4/А6 in the name still pick Audi A4/A6');
assert.ok(roller.indexOf('Skoda Fabia') < roller.indexOf('Seat') || !roller.includes('Seat'), 'a named Skoda comes before an unnamed Seat');

const unnamed = buildProductMetaDescription({
  productName: 'Фільтр масляний', producer: 'MANN', article: 'W712',
  fitmentSource: 'AUDI A4 B5 (8D2); OPEL ASTRA G (T98); VW GOLF IV (1J1)',
});
assert.match(unnamed, /для Audi A4 B5 \(8D2\); Opel Astra G \(T98\); VW Golf IV \(1J1\)/, 'no named car: 1C order, one model per make');

const cutFitment = buildProductMetaDescription({
  productName: 'Комплект ГРМ T5 TOURAN GOLF PASSAT 03-', producer: 'BOSCH', article: '1987945328',
  fitmentSource: 'AUDI A1, A3, A4 ALLROAD B8, A4 B8, A5; SEAT ALHAMBRA, ALTEA, ALTEA XL 1.2-2.5D 05.03-',
});
assert.match(cutFitment, /для T5 Touran Golf Passat \(з 2003\); Audi A1/, 'cars the cut 1C fitment misses still lead');
assert.ok(cutFitment.length <= 160);

console.log('Product SEO copy passed: Latin model marks, named cars first in descriptions.');
