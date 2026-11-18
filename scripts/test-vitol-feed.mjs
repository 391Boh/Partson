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

const { parseVitolYml, vitolDescription, htmlToParagraphs, textHash } = exports;
const yml = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="2026-11-18"><shop><categories>
  <category id="3">ROOT</category>
  <category id="15" parentId="3">ІНСТРУМЕНТ</category>
  <category id="20" parentId="15">Інструмент ALLOID BUILDING TOOLS</category>
  <category id="21" parentId="20">Alloid. Свердла</category>
  <category id="22" parentId="15">Інструмент HANS</category>
</categories><offers>
  <offer id="900" available="true"><price>142</price><discount>30%</discount><currencyId>UAH</currencyId><categoryId>21</categoryId>
    <picture>https://vitol.com.ua/img/1.jpg</picture><name>Свердло &quot;Pro&quot; 6 мм</name>
    <description><![CDATA[<p>Свердло &quot;Pro&quot; 6 мм</p><p>Для металу.</p><ul><li>сталь HSS</li></ul>]]></description>
    <vendor>ALLOID</vendor><vendorCode>DR-6</vendorCode>
    <param name="Країна походження">Китай</param><param name="УКТВЕД">8207</param><param name="Вес ВГХ">0,05</param></offer>
  <offer id="901" available="true"><price>0</price><currencyId>UAH</currencyId><categoryId>22</categoryId><name>Без ціни</name><vendor>HANS</vendor></offer>
  <offer id="902" available="false"><price>10</price><currencyId>UAH</currencyId><categoryId>22</categoryId><name>Нема</name></offer>
  <offer id="903" available="true"><price>99</price><currencyId>UAH</currencyId><categoryId>560</categoryId><name>Тримач телефону</name><vendorCode>BH36</vendorCode><mpn>BH-36</mpn></offer>
</offers></shop></yml_catalog>`;
const parsedYml = parseVitolYml(yml);
assert.equal(parsedYml.items.length, 2);
assert.deepEqual(plain(parsedYml.skipped.map((s) => s.reason)), ['немає ціни', 'немає у постачальника']);
const [drill, holder] = parsedYml.items;
assert.equal(drill.name, 'Свердло "Pro" 6 мм');
assert.equal(drill.article, 'DR-6');
assert.equal(drill.costUah, 142);
assert.deepEqual(plain(drill.categoryPath), ['ROOT', 'ІНСТРУМЕНТ', 'Інструмент ALLOID BUILDING TOOLS', 'Alloid. Свердла']);
assert.equal(holder.article, 'BH-36', 'mpn wins over vendorCode');
assert.equal(holder.producer, 'VITOL');
assert.equal(parsedYml.prices.get('901'), undefined);
assert.equal(parsedYml.prices.get('902'), 10, 'regular prices are kept for every offer');
assert.equal(htmlToParagraphs('<p>a&nbsp;b</p><br/>c'), 'a b\nc');
assert.equal(
  vitolDescription(drill),
  'Для металу.\n• сталь HSS\nКраїна походження\tКитай\nВага, кг\t0,05',
  'name-only paragraph dropped, logistics params skipped, specs tab-separated'
);
assert.equal(vitolDescription({ name: 'X', description: 'X', params: [] }), '');
{
  const long = Array.from({ length: 40 }, (_, i) => `Речення номер ${i} про корисну властивість товару.`).join(' ');
  const text = vitolDescription({
    name: 'Чохол',
    description: `Перший абзац.\nТМ Витол гарантує, що вся продукція якісна.\n${long}\n• пункт`,
    params: [{ name: 'Матеріал', value: 'шкіра' }],
  });
  assert.ok(text.length <= 1024, `fits 1C's 1024 characters (${text.length})`);
  assert.ok(!text.includes('ТМ Витол'), 'brand boilerplate dropped');
  assert.ok(text.startsWith('Перший абзац.\nРечення номер 0'), 'paragraphs kept in order');
  assert.ok(/товару\.\nМатеріал\tшкіра$/.test(text), 'long paragraph cut at a sentence end, characteristics kept');
}
assert.equal(textHash('abc'), textHash('abc'));
assert.notEqual(textHash('abc'), textHash('abd'));
assert.throws(() => parseVitolYml('<shop><items></items></shop>'), /not a YML/);

const groupsSource = ts.transpileModule(readFileSync('app/lib/vitol-groups.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const groups = {};
vm.runInNewContext(groupsSource, { exports: groups });
const { vitolGroupFor, VITOL_GROUPS } = groups;
const group = (categoryPath, categoryId, name) => vitolGroupFor({ categoryPath, categoryId, name });
assert.equal(group(drill.categoryPath), 'Свердла, диски та абразив');
assert.equal(group(['ІНСТРУМЕНТ', 'Інструмент ALLOID BUILDING TOOLS', 'Alloid. Рівні, правила']), 'Будівельний інструмент');
assert.equal(group(['ІНСТРУМЕНТ', 'Інструмент ALLOID', 'Alloid. Пневмоінструмент']), 'Інструмент для ремонту авто');
assert.equal(group(['ІНСТРУМЕНТ', 'Інструмент ALLOID для ремонту авто', 'Alloid. Знімачі']), 'Інструмент для ремонту авто');
assert.equal(group(['ІНСТРУМЕНТ', 'Інструмент HANS', 'HANS. Голівки']), 'Ручний інструмент');
assert.equal(group(['ДОГЛЯД ЗА КУЗОВОМ і САЛОНОМ', 'ОСВІЖУВАЧІ', 'Освіжувачі  AREON']), 'Освіжувачі повітря');
assert.equal(group(['СВІТЛО', 'Лампи головного світла', 'Лампи LED']), 'Автолампи');
assert.equal(group(['ТЕХДОПОМОГА', 'Домкрати', 'Домкрати підкатні']), 'Домкрати');
assert.equal(group([], '528'), 'Щітки склоочисника', 'category missing from the tree: CSV group id');
assert.equal(group([], '99999', 'Освіжувач повітря'), 'Освіжувачі повітря', 'last resort: product name');
assert.equal(group(['ТРАНСПОРТ', 'Скутери'], '1312', 'Електровелосипед'), 'Інші автотовари');
assert.ok(VITOL_GROUPS.every((name) => name.length <= 100), '1C group names fit 100 chars');

console.log('vitol-feed: ok');
