import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const load=(file,mocks)=>{const cjs={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{assert(name in mocks,name);return mocks[name]},cjs,cjs.exports);return cjs.exports;};
const params=load('app/lib/product-params.ts',{});
const fitment=load('app/lib/vehicle-fitment.ts',{'./car-model-search':load('app/lib/car-model-search.ts',{})});
const products=Array.from({length:10},(_,index)=>({code:String(index),name:'Колодки',producer:index<2?'A':'B',description:`Монтажна позиція\t${index%2?'задня':'передня'}\nШирина\t${10+index} мм\nТип\t${index<2?'Zulu':'Alpha'}`,quantity:1}));
let reads=0;
const server=load('app/lib/catalog-params-server.ts',{
 'server-only':{},
 './vehicle-fitment':fitment,
 'app/lib/catalog-server':{fetchCatalogProductsByQuery:async query=>{reads++;assert.equal(query.includeDescription,true);return{items:products.filter(item=>!query.producer||item.producer===query.producer),hasMore:false};}},
 'app/lib/catalog-page-route-cache':{catalogRouteCacheClearHooks:new Set()},
 'app/lib/catalog-search':{normalizeSearchQuery:query=>query.trim()},
 'app/lib/product-params':params,
 'app/lib/product-tree':{getProductTreeDataset:async()=>({groups:[{label:'Інше',slug:'other',subgroups:[]},{label:'Гальма',slug:'brakes',subgroups:[{label:'Система',slug:'system',children:[{label:'Колодки',slug:'pads'}]},{label:'Диски',slug:'discs',children:[]}]}]})},
});
const query={group:'Система',subcategory:'Колодки',producer:'',selectedCars:[],selectedCategories:[],searchQuery:'',searchFilter:'all',expandHierarchy:false};
assert(await server.isTerminalCatalogParamsQuery(query));
assert(await server.isTerminalCatalogParamsQuery({...query,group:'Гальма',subcategory:'Диски'}));
assert(!await server.isTerminalCatalogParamsQuery({...query,group:'Гальма',subcategory:'Система'}));
assert(!await server.isTerminalCatalogParamsQuery({...query,expandHierarchy:true}));
assert(await server.isTerminalCatalogParamsQuery({...query,group:'',subcategory:'',selectedCategories:['Гальма / Система / Колодки']}));
assert(await server.isTerminalCatalogParamsQuery({...query,group:'Інше',subcategory:''}));
assert(!await server.isTerminalCatalogParamsQuery({...query,selectedCategories:['Колодки','Диски']}));
const original=await server.getCatalogParamFacets(query,[]);
const filtered=await server.getCatalogParamFacets({...query,producer:'A'},[{id:'position',values:['front']}]);
const shape=facets=>facets.map(({id,kind,...facet})=>({id,kind,...(kind==='range'?{min:facet.min,max:facet.max}:{values:facet.values.map(({id,label})=>({id,label}))})}));
assert.deepEqual(shape(filtered.facets),shape(original.facets),'Producer/filter changes must preserve fields, options, order and ranges');
const width=filtered.facets.find(f=>f.id==='width');assert.equal(width.kind,'range');assert.equal(width.min,10);assert.equal(width.max,19);assert.equal(width.count,1,'A contextual two-value subset must not convert the stable range into buttons or lose counts');
assert.equal(filtered.matchCount,1);
const type=filtered.facets.find(f=>f.id==='typ'||f.label==='Тип');assert.deepEqual(type.values.map(({label,count})=>({label,count})),[{label:'Alpha',count:0},{label:'Zulu',count:1}]);
const empty=await server.getCatalogParamFacets({...query,producer:'NONE'},[]);assert.deepEqual(shape(empty.facets),shape(original.facets));assert.equal(empty.matchCount,0);assert(empty.facets.every(f=>f.kind==='range'?f.count===0:f.values.every(v=>v.count===0)));
const matched=await server.getCatalogProductsMatchingParams({...query,producer:'A'},[{id:'width',min:10,max:10}],{sortOrder:'none',pricedOnly:false,priceFrom:null,priceTo:null,inStock:false});assert.deepEqual(matched.map(p=>p.code),['0']);
const before=reads;await server.getCatalogParamFacets({...query,producer:'A'},[]);assert.equal(reads,before,'Cached bases must serve subsequent selections');
console.log('PASS: terminal group/subgroup/path gating, stable schema across producer/selection changes, correct contextual counts, cached bases.');
const {loadCatalogSearch}=await import('./lib/catalog-search-harness.mjs');
const upstream=[];
const catalog=loadCatalogSearch(async(endpoint,{body})=>{upstream.push({endpoint,body});return{status:200,text:JSON.stringify({success:true,items:[{Код:'P1',НомерПоКаталогу:'TEST-1',Наименование:'Колодка',Описание:'Ширина\t10 мм',Кількість:1}],has_more:false,total_count:1,next_cursor:''})};});
const described=await catalog.fetchCatalogProductsByQuery({group:'Система',subcategory:'Колодки',searchQuery:'TEST-1',searchFilter:'article',includeDescription:true,forceAllgoodsSource:true,includePriceEnrichment:false,retries:0});
assert(described.items[0].description.includes('Ширина'));
assert(upstream.every(call=>call.body.ВключатьОписание===true),'Parameters must retain descriptions with article/name/code search');
const failed=loadCatalogSearch(async()=>({status:503,text:'unavailable'}));
await assert.rejects(failed.fetchCatalogProductsByQuery({group:'Система',subcategory:'Колодки',includeDescription:true,forceAllgoodsSource:true,includePriceEnrichment:false,retries:0}),'A failed specification source must not fall back to records without descriptions');
console.log('PASS: descriptions survive article search; source failure cannot silently remove parameters.');
