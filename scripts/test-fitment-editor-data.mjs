import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import path from 'node:path';
const modules = new Map();
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file);
  const exports = {}; modules.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => load((name.startsWith('app/') ? path.resolve(name) : path.resolve(path.dirname(file), name)) + '.ts') });
  return exports;
}
const { normalizeEngineVolume: volume, vehicleYearOptions: years, readAutoYearRange } = load('app/lib/vehicle-values.ts');
const { readFitmentRows: read, writeFitmentRows: write, fitmentRowError: error } = load('app/lib/product-fitment-editor.ts');
const { matchesVehicleFitment: matches } = load('app/lib/vehicle-fitment.ts');
const { parseProductFitment, formatFitmentPeriod } = load('app/lib/product-fitment-format.ts');
for (const raw of ['1,6', '1.6 л', '1598', '1598 см³', 1600, '1600 cc', '1.598']) assert.equal(volume(raw), '1.6');
for (const raw of [null, '', 'unknown', 0, -1, '2020']) assert.equal(volume(raw), raw === '2020' ? '2.0' : null);
assert.equal(JSON.stringify(years(2020, 0, 2026)), JSON.stringify([2020,2021,2022,2023,2024,2025,2026]));
assert.equal(years(2024, 2020).length, 0);
assert.equal(years('bad', 2026).length, 0);
assert.equal(readAutoYearRange({'Обєм':1998}).start, null);
assert.equal(readAutoYearRange({yearStart:2020,yearEnd:0}).end, null);
assert.equal(readAutoYearRange({'Рік':2021}).end, 2021);
const original = 'передн VW PASSAT B3/B4, GOLF II 1.6-2.8 02.88-05.97; AUDI A4 B5 1.8 11.94-\n\nМонтажна позиція\tпередн\nДовжина\t123 мм';
const rows = read(original);
assert.equal(rows.length, 3);
assert.equal(rows[0].yearFrom, '1988'); assert.equal(rows[0].yearTo, '1997');
const untouched = write(original, rows);
assert(untouched.startsWith('передн VW PASSAT'));
assert(untouched.includes('02.88-05.97')); assert(untouched.includes('11.94-'));
assert(untouched.endsWith('\n\nМонтажна позиція\tпередн\nДовжина\t123 мм'));
const edited = write(original, rows.map(row => ({...row, yearFrom:'2000',yearTo:'2010',volume:'1598 см³'})));
assert.equal(read(edited).length, 3);
for (const row of read(edited)) { assert.equal(row.yearFrom,'2000'); assert.equal(row.yearTo,'2010'); assert.equal(row.volume,'1.6'); }
assert(error({...rows[0],yearFrom:'2020',yearTo:'2000'}));
assert.throws(()=>write(original,[{...rows[0],volume:'2.0-1.0'}]));
assert.throws(()=>write(original,[{...rows[0],yearFrom:'2020.5'}]));
assert(write(original,[]).startsWith('передн\n\nМонтажна'));
const car = {brand:'VOLKSWAGEN',model:'Passat B3',year:1991,volume:'1598 см³',power:null,gearbox:null,drive:null};
assert(matches(original,car)); assert(!matches(original,{...car,volume:'3000 см³'}));
for (const { name: brand } of load('app/components/carBrands.tsx').carBrands) {
  const text=write('Характеристика\tЗначення',[{brand,model:'TEST X1',yearFrom:'2000',yearTo:'2010',volume:'1.6-2.0'}]);
  assert(parseProductFitment(text.split('\n')[0]), brand);
  assert(matches(text,{...car,brand,model:'TEST X1',year:2005,volume:'1,8'}), brand);
  assert(!matches(text,{...car,brand,model:'TEST X1',year:2011,volume:'1,8'}), brand);
}
for (const [raw,yes,no] of [['1.6-', '2.0','1.4'],['-2.0','1.6','2.5'],['10.0-12.0','11.0','9.0']]) {
  const text=write('',[{brand:'VW',model:'PASSAT B3',yearFrom:'1988',yearTo:'1997',volume:raw}]);
  assert(matches(text,{...car,volume:yes}),text); assert(!matches(text,{...car,volume:no}),text);
}
const until = write('',[{brand:'VW',model:'PASSAT B3',yearFrom:'',yearTo:'1997',volume:'1.6'}]);
assert(matches(until,car)); assert(!matches(until,{...car,year:2000}));
assert.equal(formatFitmentPeriod('-12.97'),'до 12.1997');
const historic = write('',[{brand:'FORD',model:'TEST',yearFrom:'1930',yearTo:'1939',volume:'2.0'}]);
assert.equal(read(historic)[0].yearFrom,'1930');
for (const legacy of ['VW PASSAT B3 1.9D-2.5D 1988-1997','VW PASSAT B3 1.5D/1.6D/1.9D 02.88-05.97','VW PASSAT B3 2.0D-Electric 02.88-']) { const row=read(legacy)[0]; assert.equal(error(row),null); assert(write(legacy,[row]).includes(row.volume)); }
console.log('PASS fitment editor: all makes, shared years/volume normalization, row and bulk roundtrip, dates preserved, bounds enforced, unrelated description intact');
