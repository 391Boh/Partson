import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Fitment lines as 1C descriptions write them; the parser feeds the product
// page, the admin fitment editor, the Merchant feed and the /auto pages.
const compile = file => ts.transpileModule(readFileSync(new URL(`../app/lib/${file}.ts`, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modules = {};
const load = name => {
  if (modules[name]) return modules[name];
  const exports = {};
  modules[name] = exports;
  vm.runInNewContext(compile(name), { exports, require: spec => load(spec.replace(/^(app\/lib\/|\.\/)/, '')) });
  return exports;
};
const { splitProductFitmentLine } = load('product-fitment-format');
const { parseProductDescription } = load('product-description-format');
const { readFitmentRows, writeFitmentRows } = load('product-fitment-editor');
const { matchesVehicleFitment } = load('vehicle-fitment');

const models = line => splitProductFitmentLine(line)?.groups.map(g => `${g.brand}: ${g.models.join(' | ')}`).join(' ;; ');

assert.equal(models('Трос щеплення Opel Vectra/ Calibra'), 'OPEL: Vectra | Calibra', 'models joined by "/ " are separate');
assert.equal(models('Трос ручника OPEL Kadett E/ D'), 'OPEL: Kadett E | Kadett D', 'a bare generation letter continues the family');
assert.equal(models('VW PASSAT B3/B4 1.6-2.8 02.88-05.97'), 'VW: PASSAT B3/B4', 'generations without a space stay one model');
assert.equal(models('FORD FIESTA, FIESTA FURGON/NADWOZIE WIELKOPRZESTRZENNE 1.0-2.0 10.85-01.97'), 'FORD: FIESTA | FIESTA FURGON/NADWOZIE WIELKOPRZESTRZENNE');
assert.equal(
  models('MERCEDES SPRINTER 2-T (B901, B902), SPRINTER 3,5-T (B909) AUTOBUS/FURGON/PLATFORMA / PODWOZIE 01.95-'),
  'MERCEDES: SPRINTER 2-T (B901, B902) | SPRINTER 3,5-T (B909) AUTOBUS/FURGON/PLATFORMA / PODWOZIE',
  'a decimal comma and body types do not split models'
);
assert.equal(models('Трос ручника WV Golf2/ Jetta2'), 'VW: Golf2 | Jetta2', 'misspelt WV reads as VW');
assert.equal(models('Трос ручника Mersedes Benz W/ C/ S123'), 'MERCEDES-BENZ: W123 | C123 | S123', 'chassis letters share the number');
assert.equal(models('NISSAN MAXIMA, MAXIMA / MAXIMA QX V 1.5D-Electric 06.01-.'), 'NISSAN: MAXIMA | MAXIMA QX V', 'each model once');
assert.equal(splitProductFitmentLine('NISSAN MAXIMA 1.5D-Electric 06.01-.').groups[0].period, '06.01-', 'stray full stop after the period');
assert.equal(splitProductFitmentLine('Opel RECORD E 82-86').groups[0].period, '82-86', 'two-digit year range');

const glued = splitProductFitmentLine('LAND ROVER FREELANDER I 2.0D 11.00-10.06Сторона монтажу Вихід');
assert.equal(glued.groups[0].period, '11.00-10.06');
assert.equal(glued.suffix, 'Сторона монтажу Вихід', 'Cyrillic text after the list is not a model');
const note = splitProductFitmentLine('Внутрішня ручка дверей NISSAN QASHQAI БУ! Мінімальні пошкодження');
assert.equal(models('Внутрішня ручка дверей NISSAN QASHQAI БУ! Мінімальні пошкодження'), 'NISSAN: QASHQAI');
assert.equal(note.prefix, 'Внутрішня ручка дверей');
assert.equal(note.suffix, 'БУ! Мінімальні пошкодження');

const page = parseProductDescription('RENAULT LAGUNA I, MASTER II 1.6-3.0D 09.95-Сторона монтажу прав / лів\nДовжина\t353.0 мм');
assert.equal(JSON.stringify(page.specs.map(s => s.label)), JSON.stringify(['Сторона монтажу', 'Довжина']), 'a glued spec row joins the characteristics');
assert.equal(page.fitment[0].models.length, 2);

// The admin editor keeps the text it doesn't edit.
const description = 'Ручка NISSAN QASHQAI БУ! Мінімальні пошкодження\nКолір\tчорн';
const rows = readFitmentRows(description);
assert.equal(rows.length, 1);
assert.equal(writeFitmentRows(description, rows), 'Ручка NISSAN QASHQAI БУ! Мінімальні пошкодження\nКолір\tчорн');

const car = { brand: 'VOLKSWAGEN', model: 'Golf', year: null, volume: null, power: null, gearbox: null, drive: null };
assert(matchesVehicleFitment('Трос ручника WV Golf', car), 'the car filter accepts the WV spelling');
assert(matchesVehicleFitment('Трос ручника Mersedes Benz Sprinter', { ...car, brand: 'MERCEDES-BENZ', model: 'Sprinter' }));

const { parseAnalogCodesFromName } = load('product-url');
const analogs = name => JSON.stringify(parseAnalogCodesFromName(name));
assert.equal(analogs('Трос T4 90-(LIN470172/LCC7103/AD5502481/77111639'), JSON.stringify(['LIN470172', 'LCC7103', 'AD5502481']),
  'a name 1C cut off keeps its analogs, minus the possibly cut last code');
assert.equal(analogs('Насос PASSAT 95-(MAM00015/'), JSON.stringify(['MAM00015']), 'a list cut right after "/" is complete');
assert.equal(analogs('Щітка 600mm MERCEDES 124 82-(600/3397018300/A1248200845)'), JSON.stringify(['3397018300', 'A1248200845']),
  'a leading size is not an analog code');
assert.equal(analogs('Шланг GOLF 83-(HP100216/IMP 220735)'), JSON.stringify(['HP100216', 'IMP220735']), 'a space inside one code');
assert.equal(analogs('Шланг ASTRA 06- (KL3012/\tDRM15007/\t92181)'), JSON.stringify(['KL3012', 'DRM15007', '92181']), 'tabs in the list');
assert.equal(analogs('Важіль FORTUNE FZ5528 ([FZ5552 комплект]/ LMI13676/ FE21196/ JTC348) L'), JSON.stringify(['LMI13676', 'FE21196', 'JTC348']), 'a [kit note] is skipped');
assert.equal(analogs('Пильник (500325E/0025984/VKJP01003/BTUN/IMP4524)'), JSON.stringify(['500325E', '0025984', 'VKJP01003', 'IMP4524']), 'one stray word is dropped');
assert.equal(analogs('Ремкомплект склопідіймача 1007226 (VITO/ W639) L'), '[]', 'car models are not analogs');
assert.equal(analogs('Фільтр (op590/2/op495/22)'), JSON.stringify(['op590/2', 'op495/22']), 'short pieces continue the code before them');

console.log('PASS fitment lines: slash models, generations, body types, decimal commas, misspelt makes, glued text kept, editor round trip; analog codes from cut-off names, sizes, spaces and tabs');
