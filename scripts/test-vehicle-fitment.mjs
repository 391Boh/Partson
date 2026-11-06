import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadCatalogSearch } from './lib/catalog-search-harness.mjs';
const load = file => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../app/lib/${file}.ts`, import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>load(name.replace('./',''))});
  return exports;
};
const { matchesVehicleFitment: matches, readVehicleSelection, encodeVehicleSelection } = load('vehicle-fitment');
const car = {brand:'VOLKSWAGEN',model:'Passat B3',year:1991,volume:'1.8',power:null,gearbox:null,drive:null};
const desc = 'VW PASSAT B3/B4 1.6-2.8 02.88-05.97\n\nМонтажна позиція\tзадн\nДовжина\t1625.0 мм';
assert(matches(desc,car));
assert(!matches('SEAT TOLEDO I; VW CADDY I, GOLF I, PASSAT B3/B4 1.5D/1.6D/1.9D 08.76-03.99',car));
assert(!matches(desc,{...car,year:2005}));
assert(!matches(desc,{...car,volume:'3.0'}));
assert(!matches(desc,{...car,model:'Passat B6'}));
assert(!matches('AUDI PASSAT B3 1.8 1988-1997',car));
assert(!matches('AUDI A4 B5; VW GOLF IV 1.8 1990-1998',car));
assert(!matches('VW PASSAT B3 1.8 1988-1997; AUDI A4 3.0 2000-2008',{...car,year:2005,volume:'3.0'}));
assert(matches('VW PASSAT B3 1.8 1988-1997; AUDI A4 3.0 2000-2008',car));
assert(!matches('VW PASSAT B3 1.8 88-97',{...car,year:1998}));
assert(matches('VW PASSAT B3 1.8 02.88-',car));
assert(!matches('VW PASSAT B3 1.8 02.88-',{...car,year:1987}));
assert(!matches('VW PASSAT B3 1.8 150 HP',{...car,power:'90'}));
assert(!matches('VW PASSAT B3 1.8 MT',{...car,gearbox:'АКПП'}));
assert(!matches('VW PASSAT B3 1.8 AWD',{...car,drive:'FWD'}));
assert(!matches('VW PASSAT B3 1.8 RWD',{...car,drive:'FWD'}));
assert(!matches('VW PASSAT B30 1.8',car));
assert(!matches('VW PASSAT B3\nКоментар\tAUDI A4 B5',{...car,brand:'AUDI',model:'A4 B5'}));
assert(matches('Застосування\tVW PASSAT B3 1.8 1988-1997',car));
assert(!matches('AUDI A4 B5, A6 C5 1.6-4.2 1994-2008',{...car,brand:'AUDI',model:'A4 B5',volume:'5.0',year:2000}));
assert(!matches('VW PASSAT',car),'A model family alone cannot confirm a generation and year');
const vivaro={brand:'OPEL',model:'Vivaro A',year:2005};
assert(matches('NISSAN NAVARA NP300, PRIMASTAR; OPEL VIVARO A; RENAULT TRAFIC II 1.9D-2.5D 02.01-',vivaro),'A letter generation names the generation without dates');
assert(!matches('OPEL VIVARO B 1.6D 05.14-',vivaro),'Another letter generation does not match');
assert(!matches('OPEL VIVARO',vivaro),'A bare family still cannot confirm the year');
assert(matches('OPEL ASTRA G, ZAFIRA A',{brand:'OPEL',model:'Astra G',year:2001}));
assert(!matches(undefined,car));
// The range after the last make covers the makes listed before it.
const v=(brand,model,extra={})=>({brand,model,year:null,volume:null,power:null,gearbox:null,drive:null,...extra});
assert(matches('VOLVO C30, V50; FORD FOCUS II 1.6-2.0 10.03-',v('VOLVO','C30 I')),'a bare model takes the shared trailing range');
assert(!matches('VOLVO C30, V50; FORD FOCUS II 1.6-2.0 10.03-',v('VOLVO','C30 I',{year:1999})),'the shared range limits the years');
// The model is named before the range: Renault "10" is not the month of "10.80-".
assert(!matches('RENAULT MASTER I 2.0-2.5D 10.80-',v('RENAULT','10')),'a date is not a model');
assert(!matches('MAZDA 323 S V 1.3-2.0 07.94-',v('MAZDA','2 II')),'an engine volume is not a model');
assert(!matches('HYUNDAI IONIQ 6 09.22-',v('HYUNDAI','Ioniq')),'a number after the name is another model');
assert(matches('FORD Mondeo 1993 - 2000',v('FORD','Mondeo I')),'a year range after the name is not');
// "80 B3, 80 B4" are two entries; "GALAXY MK I" names generation I.
assert(matches('AUDI 80 B3, 80 B4; VW GOLF III 1.6-2.0 08.85-04.03',v('AUDI','80 V B4')),'a model after a comma that starts with a digit');
assert(matches('FORD GALAXY MK I 1.9D 03.95-05.06',v('FORD','Galaxy I'))&&!matches('FORD GALAXY MK I 1.9D 03.95-05.06',v('FORD','Galaxy II')),'MK I is generation I');
// A spec row glued onto the fitment line keeps the list readable.
assert(matches('CITROEN C3 I, XSARA PICASSO 1.4-2.0D 03.91-Висота [мм]\t7.0',v('CITROEN','Xsara Picasso')),'a glued spec row');
// The car picker lists Lanos, Nexia… under CHEVROLET; TecDoc says DAEWOO.
assert(matches('DAEWOO LANOS, NEXIA 1.5 05.97-',v('CHEVROLET','Lanos I')),'DAEWOO models are Chevrolet ones');
// The model opens the entry; a following word makes it another model the
// picker lists on its own, a body or trim word does not.
const golf=v('VOLKSWAGEN','Golf V');
assert(!matches('VW GOLF PLUS, GOLF PLUS V, SHARAN, TOURAN 03.95-06.19',golf),'Golf Plus is not Golf');
assert(matches('VW GOLF PLUS V, GOLF V, JETTA III 1.2-3.2 05.03-07.15',golf));
assert(matches('VW GOLF PLUS 1.4 01.05-',v('VOLKSWAGEN','Golf Plus I')),'the picker model with the word');
assert(!matches('AUDI A4 ALLROAD B8, A4 B8, A5 1.8-4.2 06.07-05.17',v('AUDI','A4 I B5')),'a trim word does not hide the generation');
assert(matches('AUDI A4 AVANT B5 1.6-2.8 11.94-',v('AUDI','A4 I B5')),'a body word keeps the generation');
assert(!matches('MAZDA 6 IV, 626 V, MX-6 1.6-2.5 08.91-10.05',v('MAZDA','6 III')),'MX-6 is not Mazda 6');
assert(!matches('FIAT CROMA, GRANDE PUNTO, PUNTO EVO 1.0-3.2 04.02-',v('FIAT','Punto II')),'Grande Punto is not Punto II');
assert(matches('VW FOX, NEW BEETLE, POLO IV 1.2-1.9D 10.99-',v('VOLKSWAGEN','Beetle I A4')),'New Beetle is the picker Beetle I');
assert(matches('RENAULT LOGAN/SANDERO 04-',v('RENAULT','Sandero II')),'models joined by a slash');
assert(matches('SUZUKI BALENO, SX4 S-CROSS, VITARA 1.0-1.6D 10.10-',v('SUZUKI','SX4 II S-Cross')));
assert(matches('MERCEDES 124 (C124), 124 (W124), E (W124) 1.8-5.7 10.88-',v('MERCEDES-BENZ','W124')),'a bracketed chassis');
assert(matches('AUDI A3; CUPRA LEON, LEON SPORTSTOURER 1.0-2.0D 07.19-',v('SEAT','Leon IV')),'Cupra sells SEAT models');
assert(!matches('VW GOLF IV; FSO POLONEZ 1.4-3.0 10.82-',v('VOLKSWAGEN','Polonez')),'an unknown make is not the previous one');
assert(matches('FORD USA EXPEDITION, F-150 1.2-3.7 01.06-',v('FORD','Expedition III')));
assert.equal(readVehicleSelection('invalid'),null);
assert(encodeVehicleSelection(car).includes('1991'));

// Empty early batches must be skipped; totals and cursors describe accepted
// products, rather than the unfiltered description-search candidate set.
const source = Array.from({length:70},(_,i)=>({Код:String(i+1).padStart(4,'0'),НомерПоКаталогу:`A${i}`,Наименование:'Трос Passat',Кількість:1,Описание:i<40?'VW PASSAT B6 2.0 2005-2010':desc}));
const calls=[];
const catalog=loadCatalogSearch(async(endpoint,{body})=>{
  calls.push({endpoint,body});
  const after=body.ПослеКода || body.Курсор || body.cursor || '';
  const start=after ? source.findIndex(p=>p.Код===after)+1 : 0;
  const limit=body.Лимит || 32;
  const items=source.slice(start,start+limit);
  return {status:200,text:JSON.stringify({items,total_count:70,has_more:start+limit<source.length,next_cursor:items.at(-1)?.Код || ''})};
});
const first=await catalog.fetchCatalogProductsByQuery({vehicle:car,searchQuery:'Passat B3',searchFilter:'description',selectedCars:['saved label'],limit:5,includePriceEnrichment:false});
assert.equal(first.items.length,5);
assert(first.items.every(item=>Number(item.code)>40));
assert(first.hasMore);assert(first.nextCursor);
assert(calls.length>=2,'Must continue through an entire batch of incompatible applications');
assert(calls.every(c=>c.endpoint==='allgoods' && c.body.ВключатьОписание===true));
const next=await catalog.fetchCatalogProductsByQuery({vehicle:car,limit:5,cursor:first.nextCursor,includePriceEnrichment:false});
assert.equal(next.items.length,5);
assert(!next.items.some(item=>first.items.some(p=>p.code===item.code)));
const empty=await catalog.fetchCatalogProductsByQuery({vehicle:{...car,year:2020},limit:5,includePriceEnrichment:false});
assert.equal(empty.items.length,0);assert.equal(empty.hasMore,false);assert.equal(empty.totalCount,0);
const failing=loadCatalogSearch(async()=>({status:503,text:'unavailable'}));
await assert.rejects(failing.fetchCatalogProductsByQuery({vehicle:car,limit:5,includePriceEnrichment:false,retries:0}));
console.log('PASS: application brand/model/generation, years, engine, power, gearbox, drive, scoped descriptions, cursor paging, empty results and upstream failure.');
