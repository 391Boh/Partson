// VITOL supplier feed: Prom.ua CSV parsing, skipped rows and the 30% markup.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const source = ts.transpileModule(readFileSync('app/lib/vitol-feed.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, { exports });
// vm objects come from another realm; compare them as plain JSON.
const plain = (value) => JSON.parse(JSON.stringify(value));
const { parseVitolFeed, parseCsvRows, vitolRetailUah, uahToEuro, vitolMatchKey } = exports;

const header = 'Код_товару;Назва_позиції;Опис;Ціна;Валюта;Посилання_зображення;Кількість;Наявність;Виробник;Номер_групи;Назва_групи;Продукт_на_сайті;Ідентифікатор_товару;Код_маркування_(GTIN);Одиниця_виміру;Мінімальний_обсяг_замовлення;Тип_товару;Номер_пристрою_(MPN)';

// The real export today: header only, CRLF, BOM.
assert.deepEqual(plain(parseVitolFeed(`\uFEFF${header}\r\n`).items), []);
assert.throws(() => parseVitolFeed('foo;bar\r\n1;2\r\n'), /unexpected header/);

const feed = parseVitolFeed([
  header,
  '1001;"Щітка склоочисника 600 мм; безкаркасна";"<p>Опис&nbsp;з ""лапками""</p>";"1 234,50";UAH;https://vitol.com.ua/a.jpg, https://vitol.com.ua/b.jpg;5;+;Vitol;118;АВТОМОБІЛЬНІ ЩІТКИ СКЛООЧИСНИКА;;;;шт.;1;r;U-600',
  '1002;Ключ 10;;99;UAH;;0;!;;15;ІНСТРУМЕНТ;;;;шт.;1;r;',
  '1003;Без ціни;;;UAH;;0;+;Vitol;15;ІНСТРУМЕНТ;;;;шт.;1;r;',
  '1004;Нема;;10;UAH;;0;-;Vitol;15;ІНСТРУМЕНТ;;;;шт.;1;r;',
  '1001;Дубль;;10;UAH;;0;+;Vitol;15;ІНСТРУМЕНТ;;;;шт.;1;r;',
  'ART-7;Варіант 1;;10;UAH;;0;+;Vitol;15;ІНСТРУМЕНТ;;7001;;шт.;1;r;',
  'ART-7;Варіант 2;;12;UAH;;0;+;Vitol;15;ІНСТРУМЕНТ;;7002;;шт.;1;r;',
  '1005;Долари;;10;USD;;0;+;Vitol;15;ІНСТРУМЕНТ;;;;шт.;1;r;',
].join('\r\n'));

assert.equal(feed.items.length, 4);
const [brush, key, variant1, variant2] = feed.items;
assert.deepEqual([variant1.supplierCode, variant2.supplierCode], ['7001', '7002'], 'Ідентифікатор_товару keys repeated articles');
assert.equal(variant2.article, 'ART-7');
assert.equal(brush.name, 'Щітка склоочисника 600 мм; безкаркасна');
assert.equal(brush.description, 'Опис з "лапками"');
assert.equal(brush.costUah, 1234.5);
assert.equal(brush.article, 'U-600', 'MPN wins as the article');
assert.equal(brush.imageUrl, 'https://vitol.com.ua/a.jpg');
assert.equal(brush.groupName, 'АВТОМОБІЛЬНІ ЩІТКИ СКЛООЧИСНИКА');
assert.equal(key.article, '1002', 'supplier code is the fallback article');
assert.equal(key.producer, 'VITOL', 'empty producer falls back to VITOL');
assert.deepEqual(plain(feed.skipped.map((s) => s.reason)), ['немає ціни', 'немає у постачальника', 'дубль коду', 'валюта USD']);

assert.equal(vitolRetailUah(100), 100, 'default: sell at the VITOL retail price');
assert.equal(vitolRetailUah(100, 30), 130);
assert.equal(vitolRetailUah(1234.5, 30), 1605, '1604.85 rounds up to a whole hryvnia');
assert.equal(vitolRetailUah(99, 0), 99);
assert.equal(uahToEuro(130, 48.5), 2.68);
assert.equal(Math.round(uahToEuro(1605, 48.5) * 48.5), 1605, 'site shows the target price back');
assert.equal(vitolMatchKey('U-600 ', 'Vitol'), vitolMatchKey('u600', 'VITOL'));
assert.deepEqual(plain(parseCsvRows('a;"b\r\nc"\r\n')), [['a', 'b\r\nc']]);

console.log('vitol-feed: ok');
