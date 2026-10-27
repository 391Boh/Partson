import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  const dir = file.slice(0, file.lastIndexOf('/'));
  // "app/lib/x" from the alias, "./x" relative to the importing module.
  const resolve = (name) => name.startsWith('./') ? `${dir}/${name.slice(2)}` : name;
  vm.runInNewContext(ts.transpileModule(readFileSync(`${file}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name) => load(resolve(name)) });
  return exports;
}
const { buildProductSeoTitle: title, buildProductMetaDescription: description, buildProductImageAlt: alt } = load('app/lib/product-seo-copy');
const product = { productName: 'Гальмівний диск VW GOLF VII (ANALOG/123)', producer: 'BREMBO', article: '09.9772.11', subGroup: 'Гальмівні диски' };
assert.ok(title({ name: 'Трос ручн. гальм. лів. AUDI 80 бараб,', producer: 'Adriauto', article: 'AD030213' }).includes('AUDI'), 'Abbreviations must not hide vehicle fitment');
const text = description(product);
// The part in the singular, its maker and article, then the cars it fits.
assert.equal(text, 'Гальмівний диск BREMBO 09.9772.11 для VW Golf VII. Оригінали й аналоги, перевірка сумісності за VIN. Купити в PartsON: Львів, доставка по Україні.');
assert.ok(description({ productName: 'Фільтр MEGANE 02-', subGroup: 'Фільтр MEGANE 02-' }).startsWith('Фільтр для Megane (з 2002).'), 'A category equal to the name adds nothing');
assert.ok(text.length <= 160);
assert.ok(!text.includes('ANALOG'));
// The 1C fitment line wins over the name and lists each make first.
const fitted = description({ productName: 'Диск гальмівний передній VIVARO TRAFIC 01-', producer: 'BOSCH', article: '0986479B69', subGroup: 'Гальмівні диски',
  fitmentSource: 'NISSAN NAVARA NP300, PRIMASTAR; OPEL VIVARO A; RENAULT TRAFIC II 1.9D-2.5D 02.01-\n\nМонтажна позиція\tпередн' });
assert.ok(fitted.startsWith('Диск гальмівний передній BOSCH 0986479B69 для Nissan Navara NP300; Opel Vivaro A; Renault Trafic II'), fitted);
assert.ok(fitted.length <= 160, fitted);
// Display spelling of 1C labels: typos fixed, never in the raw value.
assert.ok(description({ productName: 'Трос щеплення RECORD 1.8 83-', producer: 'Adriauto', article: 'AD330137' }).startsWith('Трос зчеплення Adriauto'));
assert.ok(description({ productName: 'Вимикач світла заднього ходу Aveo 11-', producer: 'VERNET', article: 'RS5635', subGroup: 'Перерключателі/ вмикачі',
  fitmentSource: 'CHEVROLET AVEO (T300) 1.2-1.6 05.11-' }).includes('для Chevrolet Aveo (T300)'), 'CHEVROLET is a fitment make');
assert.ok(!/ціна|грн|наявн|замовлення/iu.test(text), text);
assert.equal(description({ ...product, priceUah: 1250, inStock: true }), text);
assert.equal(description({ ...product, priceUah: 9876, inStock: false }), text);
assert.ok(description({ subGroup: 'Повітряний фільтр(Повітря)' }).startsWith('Повітряний фільтр.'));
assert.ok(description({ subGroup: 'Фільтр (АКПП)' }).startsWith('Фільтр (АКПП).'));
assert.ok(description({ subGroup: 'Повітряні фільтри' }).startsWith('Повітряні фільтри'));
for (const example of [
 { productName: 'Фільтр повітря KIA RIO HYUNDAI ACCENT 02-', producer: 'ALPHA', article: 'AF1741' },
 { productName: 'Подушка двигуна ASTRA H 1.9CDTi 04-', producer: 'FEBI', article: '12345' },
 { productName: 'Щітка склоочисника '.repeat(10), producer: 'BOSCH', article: '3397118901' },
]) {
 const copy = description(example);
 assert.ok(copy.length <= 160 && copy.endsWith('доставка по Україні.'), copy);
 assert.ok(copy.includes(example.article) && copy.includes('Львів'), copy);
}

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

const { normalizeSeoTitle, trimSeoDescription } = load('app/lib/seo-metadata');
for (const input of ['Каталог | PartsON | PartsON', 'PartsON — магазин | PartsON', '  Каталог   | PartsON ']) {
 const result = normalizeSeoTitle(input);
 assert.equal((result.match(/PartsON/g) || []).length, 1, result);
 assert.equal(normalizeSeoTitle(result), result);
 const page = buildPageMetadata({ title: input, description: 'Опис категорії.', canonicalPath: '/groups' });
 assert.equal(page.title.absolute, result);
 assert.equal(page.openGraph.title, result);
 assert.equal(page.twitter.title, result);
}
const completeSentence = 'Оберіть деталі для гальмівної системи вашого автомобіля.';
assert.equal(trimSeoDescription(`${completeSentence} ${'Додаткова інформація '.repeat(15)}`), completeSentence);
console.log('SEO metadata passed: one brand, consistent social titles and complete sentences.');
