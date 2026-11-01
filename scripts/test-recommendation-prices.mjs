import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};let calls=0,fail=false,now=100;const requests=[];
class Clock extends Date {static now(){return now;}}
vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/recommendation-prices-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,Date:Clock,setTimeout,clearTimeout,AbortController,
  fetch:async(url,options)=>{calls++;requests.push({url,options});if(fail)throw Error('offline');return{ok:true,json:async()=>({prices:{code:100},promoPrices:{code:80},hasPromo:{code:true},promoPercent:{code:20},isPartner:options.headers.Authorization==='Bearer partner'})};},
});
const items=[{code:'code',article:'article'}];const {loadRecommendationPrices:load}=exports;
const [a,b]=await Promise.all([load(items,null),load(items,null)]);
assert.equal(calls,1);assert.equal(a,b);assert.equal(a.code.priceEuro,100);assert.equal(a.code.promoPriceEuro,null,'Public prices never reveal partner amounts');assert.equal(a.code.hasPromo,true);assert.equal(a.code.promoPercent,20);
await load(items,null);assert.equal(calls,1,'Warm public cache');
const partner={uid:'partner',getIdToken:async()=>'partner'};const p=await load(items,partner);assert.equal(p.code.promoPriceEuro,80);assert.equal(p.code.isPartner,true);assert(requests.at(-1).url.endsWith('mode=partner'));
const customer=await load(items,{uid:'other',getIdToken:async()=>'customer'});assert.equal(customer.code.promoPriceEuro,null,'Authenticated non-partner still cannot see a private amount');assert.equal(customer.code.isPartner,false);
assert.equal((await load(items,null)).code.promoPriceEuro,null,'Partner cache is never reused by guests');
await load(items,{uid:'public',getIdToken:async()=>'partner'});
assert.equal((await load(items,null)).code.promoPriceEuro,null,'UIDs cannot collide with the public cache namespace');
now+=31_000;fail=true;await assert.rejects(load(items,null),/offline/);fail=false;assert.equal((await load(items,null)).code.priceEuro,100,'Failed request can be retried');
assert.deepEqual(Object.keys(await load([],null)),[]);
assert.deepEqual(Object.keys(await load([{code:'legacy-code'},{article:'legacy-article'}],null)).sort(),['legacy-article','legacy-code'],'Old browsing history can omit code or article');
console.log('PASS recommendation prices: batch sharing, public teaser, verified partner amount, account isolation, TTL, failure and retry');
