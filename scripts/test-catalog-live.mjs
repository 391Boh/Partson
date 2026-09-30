import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
let requests = 0; let active = 0; let peak = 0; let authorized = false;
let price = 25; let quantity = 0; let fail = false;
vm.runInNewContext(ts.transpileModule(readFileSync('app/api/catalog-live/route.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
 exports, require: name => ({
 'next/server': {NextResponse:{json:(body, options)=>({body,...options})}},
 'app/api/_lib/rateLimit': {checkRateLimit:()=>({ok:true})},
 'app/api/_lib/admin-auth': {verifyAdminRequest:async()=>authorized?{uid:'admin'}:null},
 'app/api/_lib/partner-auth': {verifyPartnerRequest:async()=>false},
 'app/lib/product-edit-overrides': {getProductEditOverride:code=>code==='edited'?{name:'Нова назва',quantity:7,priceEuro:30}:null},
 'app/lib/catalog-server': {
  fetchExactCatalogProductByLookup: async(code, options)=>{
   assert.equal(options.cacheTtlMs,0);requests++;active++;peak=Math.max(peak,active);
   await new Promise(resolve=>setTimeout(resolve,2));active--;
   if(fail)return null;
   return {code,name:'Товар',article:'A-'+code,producer:'Brand',quantity,costPriceEuro:999,description:'private'};
  },
  fetchPriceEuroMapByLookupKeys:async(codes, options)=>{assert.equal(options.cacheTtlMs,0);return Object.fromEntries(codes.map(code=>[code.toLowerCase(),price]));},
  fetchCatalogPriceDetailsByLookupKeys:async codes=>({prices:{},costPrices:Object.fromEntries(codes.map(code=>[code,10])),promoPrices:Object.fromEntries(codes.map(code=>[code,20]))}),
 },
 })[name],
});
const post=(codes,mode='fast')=>exports.POST({json:async()=>({codes,mode})});
assert.equal((await post(Array(17).fill('x'))).status,400);
assert.equal(requests,0);
let response=await post(['one','edited']);
assert.equal(response.headers['Cache-Control'],'no-store');
assert.equal(response.body.products[0].quantity,0);
assert.equal(response.body.products[0].priceEuro,25);
assert.equal(response.body.products[1].name,'Нова назва');
assert.equal(response.body.products[1].priceEuro,30);
assert.ok(!JSON.stringify(response.body).includes('999'));
price=0;quantity=4;
response=await post(['one']);
assert.equal(response.body.products[0].priceEuro,0);
assert.equal(response.body.products[0].quantity,4);
response=await post(['one'],'full');
assert.equal(response.body.products[0].costPriceEuro,undefined);
authorized=true;
response=await post(['one'],'full');
assert.equal(response.body.products[0].costPriceEuro,10);
assert.equal(response.body.products[0].promoPriceEuro,20);
await post(Array.from({length:16},(_,i)=>'code'+i));assert.ok(peak<=3);
fail=true;assert.equal((await post(['one'])).body.products.length,0);
console.log('Live catalog passed: fresh reads, zero stock/price, confirmed edits, bounded concurrency, public field allowlist, protected prices and failed lookups.');
