import assert from 'node:assert/strict';
import {loadCatalogSearch} from './lib/catalog-search-harness.mjs';
const products=Array.from({length:1201},(_,i)=>({Код:String(i+1).padStart(5,'0'),НомерПоКаталогу:`P${i}`,Наименование:`Деталь ${1201-i}`,ПроизводительНаименование:'TEST',ЦінаПрод:i%11===0?0:i+1,Кількість:1,ЕстьФото:i>=700&&i%3===0}));
const calls=[];
const api=loadCatalogSearch(async(endpoint,{body})=>{
 assert.equal(endpoint,'allgoods');calls.push(body);
 // Deliberately ignore ТолькоЗФото, as older 1C configurations do.
 let rows=products.filter(p=>(!body.ТолькоСЦеной||p.ЦінаПрод>0)&&(body.ЦенаОт==null||p.ЦінаПрод>=body.ЦенаОт)&&(body.ЦенаДо==null||p.ЦінаПрод<=body.ЦенаДо));
 if(body.СортировкаПоЦене){const direction=body.СортировкаПоЦене==='DESC'?-1:1;rows.sort((a,b)=>direction*(a.ЦінаПрод-b.ЦінаПрод)||a.Код.localeCompare(b.Код));}
 else if(body.ПослеКода)rows=rows.filter(p=>p.Код>body.ПослеКода);
 const size=body.Лимит||10,items=rows.slice(0,size),more=rows.length>size;
 return {status:200,text:JSON.stringify({items,total_count:products.length,has_more:more,next_cursor:more&&!body.СортировкаПоЦене?items.at(-1)?.Код:'',sort_mode:''})};
});
async function collect(options){const result=[];let cursor='';for(let page=1;page<60;page++){
 const payload=await api.fetchCatalogProductsByQuery({group:'Тест',page,limit:13,withPhotoOnly:true,includePriceEnrichment:false,...options,cursor});
 assert(payload.items.every(p=>p.hasPhoto===true));result.push(...payload.items);
 if(!payload.hasMore)return result;
 assert(payload.nextCursor&&payload.nextCursor!==cursor);cursor=payload.nextCursor;
 }assert.fail('Photo pagination did not finish');}
const expected=products.filter(p=>p.ЕстьФото);
const plain=await collect({});assert.deepEqual(plain.map(p=>p.code),expected.map(p=>p.Код));
for(const sortOrder of ['asc','desc']){
 const actual=await collect({sortOrder});
 const sorted=[...expected].sort((a,b)=>{
 const ap=a.ЦінаПрод>0,bp=b.ЦінаПрод>0;if(ap!==bp)return ap?-1:1;
 return ap?(sortOrder==='asc'?a.ЦінаПрод-b.ЦінаПрод:b.ЦінаПрод-a.ЦінаПрод)||a.Код.localeCompare(b.Код):a.Код.localeCompare(b.Код);
 });assert.deepEqual(actual.map(p=>p.code),sorted.map(p=>p.Код));
}
const named=await collect({nameSort:'asc'});assert.equal(named.length,expected.length);assert.equal(new Set(named.map(p=>p.code)).size,expected.length);
assert(calls.every(body=>body.ТолькоЗФото===true));
await assert.rejects(api.fetchCatalogProductsByQuery({withPhotoOnly:true,directOffset:50,limit:13}),/DIRECT_PAGINATION_UNSUPPORTED/);
console.log('PASS: photo-only pages cross empty batches without skipping/duplicates; price and name sorts; unpriced tail; ignored upstream flag; safe direct-page fallback.');
