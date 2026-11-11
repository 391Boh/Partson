import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

function load(file,mocks={},extra={}){
  const exports={};const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,URL,URLSearchParams,Request,Response,process,console,...extra,require:name=>{assert(name in mocks,`${file}: ${name}`);return mocks[name];}});return exports;
}
let current={},overrides={};
const catalog={getSnapshotPriceLookup:keys=>Object.fromEntries(keys.filter(key=>Object.hasOwn(current,key.toLowerCase())).map(key=>[key.toLowerCase(),current[key.toLowerCase()]])),toPriceUah:(price,rate)=>typeof price==='number'&&price>0&&rate>0?Math.round(price*rate):null};
const prices=load('app/lib/public-product-price.ts',{'server-only':{},'./catalog-server':catalog,'./product-edit-overrides':{getProductEditOverride:code=>overrides[code]}});
const source={code:'00-00000056',article:'AD030213',priceEuro:6.93};
assert.equal(prices.resolvePublicProductPriceEuro(source),6.93);
current={'00-00000056':{priceEuro:7,promoPriceEuro:0.01,costPriceEuro:0.001}};
assert.equal(prices.resolvePublicProductPriceEuro(source),7,'Only the regular public price is advertised');
overrides[source.code]={priceEuro:8};assert.equal(prices.resolvePublicProductPriceEuro(source),8);
overrides[source.code]={priceEuro:0};assert.equal(prices.resolvePublicProductPriceEuro(source),null,'Removing a price cannot resurrect the sitemap price');
overrides={};current={};
const pricing=load('app/lib/merchant-feed-pricing.ts',{'server-only':{},'node:crypto':crypto,'./catalog-server':catalog,'./public-product-price':prices});
const xml='<rss><channel><item><g:id>00-00000056</g:id><g:price>359.00 UAH</g:price><g:shipping><g:price>129.00 UAH</g:price></g:shipping></item></channel></rss>';
const saved=pricing.createMerchantFeedPricing(xml,{[source.code]:6.93});
const repriced=pricing.repriceMerchantFeed(xml,saved,51.37);
assert(repriced.includes('<g:price>356.00 UAH</g:price>'),'Regression: feed 359 → current page price 356');
assert(repriced.includes('<g:shipping><g:price>129.00 UAH</g:price>'),'Shipping is independent of the product price');
assert(!pricing.isMerchantFeedPricing(saved,xml+'changed'),'Mismatched XML/JSON files are refused');
assert.throws(()=>pricing.repriceMerchantFeed(xml,saved,NaN));
overrides[source.code]={priceEuro:0};assert(!pricing.repriceMerchantFeed(xml,saved,51.37).includes('<item>'),'No zero-price or stale removed offer');overrides={};

// Drive the actual confirmed-rate function, including a legitimate rate of 50.
const ast=ts.createSourceFile('catalog.ts',readFileSync('app/lib/catalog-server.ts','utf8'),ts.ScriptTarget.Latest,true);let initializer;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='fetchConfirmedEuroRate')initializer=node.initializer.getText(ast);ts.forEachChild(node,visit);}visit(ast);
let now=2*86_400_000;const state={exports:{},Date:{now:()=>now},EURO_RATE_TTL_MS:1_800_000,lastEuroFetchAt:0,cachedEuroRate:50};
state.refreshEuroRate=async()=>state.cachedEuroRate;
vm.runInNewContext(ts.transpileModule(`exports.read=${initializer}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,state);
assert.equal(await state.exports.read(),null,'The initial guessed 50 rate cannot enter Google/checkout data');
state.lastEuroFetchAt=now;assert.equal(await state.exports.read(),50,'A confirmed rate of 50 is valid');
now+=25*3_600_000;assert.equal(await state.exports.read(),null,'An indefinitely stale rate cannot be advertised');
state.refreshEuroRate=async()=>{state.cachedEuroRate=51.37;state.lastEuroFetchAt=now;return state.cachedEuroRate;};assert.equal(await state.exports.read(),51.37);

const root=await mkdtemp(path.join(tmpdir(),'partson-merchant-test-'));
const store=load('app/lib/merchant-feed-store.ts',{'server-only':{},'node:fs/promises':await import('node:fs/promises'),'node:path':path,'./merchant-feed-pricing':pricing,'./public-catalog-product':{isPublicCatalogProduct:p=>p.hasPhoto===true&&p.priceEuro>0}});
const snapshot={xml,pricing:saved,catalogEntries:[{...source,quantity:1,hasPhoto:true},{code:'NO-PHOTO',priceEuro:10,hasPhoto:false,quantity:1}]};
await store.writeMerchantFeedSnapshot(snapshot,root);assert.equal((await store.readMerchantFeedSnapshot(root)).xml,xml);
assert.equal((await stat(path.join(root,'google-merchant-feed.xml'))).mode & 0o777,0o644,'The public nginx feed remains readable by a different worker UID');
const index=JSON.parse(await readFile(path.join(root,'product-sitemap-entries.json'),'utf8'));assert.equal(index.count,1);assert.equal(index.entries[0].priceEuro,6.93,'Feed and product page snapshots are published together');
await writeFile(path.join(root,'google-merchant-feed.xml'),xml+'broken');assert.equal(await store.readMerchantFeedSnapshot(root),null,'Partial/concurrent writes never expose mismatched prices');

let lastmodTime=Date.parse('2026-11-12T12:00:00Z');
class LastmodDate extends Date{constructor(...args){super(args.length?args[0]:lastmodTime);}static now(){return lastmodTime;}}
const lastmod=load('app/lib/product-sitemap-lastmod.ts',{
  'server-only':{},'node:path':path,'node:fs/promises':{readFile:async()=>{throw new Error('empty test store');},mkdir:async()=>{},writeFile:async()=>{}},
  './catalog-server':catalog,'./public-product-price':prices,
},{Date:LastmodDate});
const entry={...source,name:'Трос гальма',quantity:1,hasPhoto:true};
const dates=await lastmod.getProductSitemapLastModified([entry],{euroRate:51.37});const date=dates.get(source.code);
lastmodTime+=3_600_000;
assert.equal((await lastmod.getProductSitemapLastModified([entry],{euroRate:51.37})).get(source.code),date,'Unchanged product retains its lastmod');
assert.equal((await lastmod.getProductSitemapLastModified([entry],{euroRate:null})).get(source.code),date,'A rate outage does not pretend the public price changed');
const repricedDate=(await lastmod.getProductSitemapLastModified([entry],{euroRate:52})).get(source.code);assert.notEqual(repricedDate,date,'Visible UAH changes update lastmod');
lastmodTime+=3_600_000;
assert.notEqual((await lastmod.getProductSitemapLastModified([entry],{euroRate:52,galleryImages:new Map([[source.code,['/product-gallery/new.webp']]])})).get(source.code),repricedDate,'A changed gallery updates lastmod');

let rate=51.37,prepared=snapshot,generations=0,clock=Date.now();class Clock extends Date{static now(){return clock;}}
const route=load('app/google-merchant-feed.xml/route.ts',{
  'app/lib/google-merchant-feed':{getGoogleMerchantFeedSnapshot:async()=>{generations++;return{...snapshot,sourceCount:1}}},
  'app/lib/catalog-server':{fetchConfirmedEuroRate:async()=>rate},'app/lib/merchant-feed-pricing':pricing,
  'app/lib/merchant-feed-store':{readMerchantFeedSnapshot:async()=>prepared,writeMerchantFeedSnapshot:async()=>{}},
  'app/lib/site-url':{getSiteUrl:()=> 'https://partson.shop'},'app/lib/xml-entities':{normalizeInvalidXmlEntities:xml=>xml},
},{Date:Clock});
const request=(etag)=>new Request('https://partson.shop/google-merchant-feed.xml',{headers:etag?{'If-None-Match':etag}:{}});
const [a,b]=await Promise.all([route.GET(request()),route.GET(request())]);assert.equal(a.status,200);assert.equal(await a.text(),repriced);assert.equal(await b.text(),repriced);assert.equal(generations,0);
assert.equal((await route.GET(request(a.headers.get('etag')))).status,304);assert(!a.headers.get('cache-control').includes('86400'));
clock+=61_000;rate=null;const unavailable=await route.GET(request());assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get('cache-control'),'no-store');
clock+=61_000;rate=52;prepared=null;const fresh=await route.GET(request());assert.equal(fresh.status,200);assert.equal(generations,1,'Legacy XML without pricing metadata is regenerated');
console.log('PASS Google prices: regular vs private, current code/override, 359→356 feed correction, shipping, missing rates, atomic snapshots, shared generation, ETag, failures and source refresh');
