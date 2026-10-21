import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadCatalogSearch } from './lib/catalog-search-harness.mjs';
let storedPromo = 8;
const api = loadCatalogSearch(async () => ({status:200,text:JSON.stringify({
 success:true, items:[{Код:'PROMO-1',Артикул:'ARTICLE-1',Наименование:'Test',ЦінаПрод:10,Акція:storedPromo}],has_more:false,
})}));
await api.fetchPromoCatalogProducts();
assert.equal(api.getSnapshotPriceLookup(['PROMO-1'])['promo-1'].promoPriceEuro,8);
api.setProductPromoPriceOverride('PROMO-1','ARTICLE-1',6);
assert.equal(api.getSnapshotPriceLookup(['PROMO-1'])['promo-1'].promoPriceEuro,6,'Confirmed edit replaces a warm snapshot immediately');
assert.equal((await api.fetchPromoOffersByLookupKeys(['ARTICLE-1']))['article-1'].promoPriceEuro,6,'Article lookup sees the same confirmed price');
const publicPromo = (await api.fetchPromoAvailabilityByLookupKeys(['PROMO-1']))['promo-1'];
assert.equal(publicPromo.hasPromo,true);
assert.equal(publicPromo.promoPriceEuro,undefined,'The public availability response does not expose the partner amount');
api.setProductPromoPriceOverride('PROMO-1','ARTICLE-1',0);
assert.equal(api.getSnapshotPriceLookup(['PROMO-1'])['promo-1'].promoPriceEuro,null);
assert.equal((await api.fetchPromoCatalogProducts()).products.length,0,'Removing a promo immediately updates the promo filter');
api.setProductPromoPriceOverride('PROMO-1','ARTICLE-1',7);
assert.equal((await api.fetchPromoCatalogProducts()).products.length,1);
assert.equal('promoPriceEuro' in (await api.fetchPromoCatalogProducts()).products[0],false,'Never append a private promo price to a public product');
await new Promise(resolve=>setTimeout(resolve,10));
storedPromo=5;
api.invalidateFullCatalogSnapshot();
await api.fetchPromoCatalogProducts();
await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(api.getSnapshotPriceLookup(['PROMO-1'])['promo-1'].promoPriceEuro,5,'A new scan started after the edit becomes authoritative again');
console.log('Promo snapshot passed: immediate add/edit/remove, both lookup keys, promo filter, fresh rescans and public/private separation.');

const sharedGlobal = {};
const overrideCode = ts.transpileModule(readFileSync('app/lib/product-promo-overrides.ts','utf8'), {
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const routeGraph = () => { const exports={}; vm.runInNewContext(overrideCode,{exports,globalThis:sharedGlobal,require:()=>({})});return exports; };
const writer=routeGraph(), reader=routeGraph();
writer.setProductPromoPriceOverride('SHARED','SHARED-ARTICLE',4.5);
assert.equal(reader.getProductPromoPriceOverride('SHARED',0),4.5,'Route module graphs share confirmed promo edits');
assert.equal(reader.getProductPromoPriceOverride('SHARED',Date.now()+100),undefined,'Newer snapshots supersede the override');
assert.equal(reader.getProductPromoPriceOverride('SHARED-ARTICLE',0),4.5,'An older route snapshot can still read its override');
console.log('Promo override passed across independent route module graphs.');
