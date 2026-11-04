import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {build,stop} from 'esbuild';
const {chromium}=await import(process.argv[2]||'./test-browser.mjs');
const bundle=await build({
 stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import React from 'react';import{createRoot}from'react-dom/client';import Data from './app/components/Data';
  const mode=new URLSearchParams(location.search).get('view')||'grid';
  createRoot(document.getElementById('root')).render(<main className="page-shell-inline"><Data selectedCars={[]} selectedCategories={[]} sortOrder="none" viewMode={mode}/></main>);
 `},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env':'{"NODE_ENV":"production"}'},
 plugins:[{name:'controlled-price-responses',setup(b){
  b.onResolve({filter:/^(\.\/useCatalogData|next\/(navigation|dynamic|image)|app\/components\/(SmartLink|ProductCardImage)|app\/lib\/(get-admin-token|use-live-catalog-refresh))$/},a=>({path:a.path,namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({loader:'tsx',resolveDir:process.cwd(),contents:
   path==='next/navigation'?'export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({replace(){}});':
   path==='next/dynamic'?'export default ()=>()=>null;':
   path==='next/image'?`import React from 'react';export default({quality,unoptimized,priority,fetchPriority,...p})=><img {...p}/>;`:
   path.endsWith('SmartLink')?`import React from 'react';export default({prefetch,prefetchOnIntent,prefetchOnViewport,...p})=><a {...p}/>;`:
   path.endsWith('ProductCardImage')?`import React from 'react';export default()=> <div style={{height:'100%'}}/>;`:
   path.includes('get-admin-token')?'export const getAdminIdToken=()=>new Promise(()=>{});':
   path.includes('use-live-catalog-refresh')?'export const useLiveCatalogRefresh=()=>false;':
   `import{useState,useRef}from'react';const empty={},noop=()=>{};const products=[{code:'C0',article:'A0',name:'Фільтр для перевірки ціни',quantity:5,priceEuro:10,producer:'TEST'}];
    export function useCatalogData(props){
     const [verifiedIdentity,setVerifiedIdentity]=useState(null),[access,setAccess]=useState(0),[rateReady,setRateReady]=useState(true),[cart,setCart]=useState({}),[page,setPage]=useState(1);const next=useRef(null);
     window.confirmPrices=value=>{setVerifiedIdentity(props.priceAccessIdentity);setAccess(value)};window.setRateReady=setRateReady;
     const signedIn=props.includePartnerPrices||props.includeCostPrices;
     const scope=props.includeCostPrices+':'+props.includePartnerPrices+(verifiedIdentity?':'+verifiedIdentity:'');
     return {filteredData:products,directMode:false,dataStartIndex:0,quantities:empty,prices:{c0:10},costPrices:access===3?{c0:6}:empty,
      promoPrices:signedIn&&access!==1?{c0:8}:empty,resolvedPriceAccess:access?{c0:scope}:empty,euroRateReady:rateReady,isPartner:signedIn&&access!==1,
      hasPromoAvailability:{c0:true},promoPercentByKey:{c0:20},pageImages:empty,pageImagePending:empty,pageImageMissing:empty,euroRate:45,
      loading:false,hasMore:false,error:null,cartMap:cart,displayedPage:page,setDisplayedPage:setPage,
      handleFlip:noop,handleQtyChange:noop,handleAddToCart:item=>setCart({[item.code]:1}),handleRemoveFromCart:noop,handleImageOpen:noop,handleImageClose:noop,
      loadNextPage:noop,loadDirectPage:noop,prefetchNextPageTriggerRef:next,prefetchVisibleCatalogPrices:noop,prefetchVisibleCatalogImages:noop,
      isLoadingNextPage:false,isRefetching:false,hasLoadedOnce:true,firstPageResolvedItemCount:1,filterLoading:false,setFilterLoading:noop,
      updateCatalogItemPrice:noop,updateCatalogItemFields:noop,applyLiveCatalogProducts:noop,catalogTotalCount:1,catalogQuerySignature:'fixture',catalogReadyQuerySignature:'fixture'};
    }`
  }));
 }}],
});
const server=http.createServer((req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
 if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(readFileSync('public/styles/dev-site.css'));return;}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const view of ['grid','list'])for(const role of ['guest','user','partner','admin']){
  const page=await browser.newPage({viewport:{width:view==='grid'?390:1280,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(role=>{if(role!=='guest'){localStorage.setItem('user_id','fixture-user');if(role==='admin')localStorage.setItem('partson:isAdmin:fixture-user','1');}},role);
  await page.goto(`http://127.0.0.1:${server.address().port}/?view=${view}`);
  await page.locator('[data-catalog-card]').first().waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-catalog-card]')?.hasAttribute('data-guest-price'));
  const amount=()=>page.locator(view==='grid'?'.catalog-card-price-pill':'.catalog-list-price-depth').first();
  if(view==='grid')assert.equal(await page.locator('.catalog-product-card--guest').count(),role==='guest'?1:0,'Guest alignment follows authentication, including a signed-in non-partner');
  await amount().filter({hasText:'450'}).waitFor();
  assert(!(await amount().innerText()).includes('360'),'A cached private amount stays hidden until verification');
  const buy=page.getByRole('button',{name:/^(?:Підтягуємо ціну|Перевіряємо ціну для вашого профілю|Додати в кошик)$/}).first();
  if(role!=='guest'){
   assert(await buy.isDisabled(),'Show base price while purchase waits for the verified account price');
   await page.evaluate(access=>window.confirmPrices(access),role==='user'?1:2);
   await page.getByRole('button',{name:'Додати в кошик',exact:true}).waitFor();
   assert(await page.getByRole('button',{name:'Додати в кошик',exact:true}).isEnabled());
   assert((await amount().innerText()).includes(role==='user'?'450':'360'),'Use the verified regular/discounted price');
   if(role==='admin'){
    assert(!(await page.locator('main').innerText()).includes('270'),'Purchase costs have not arrived');
    await page.evaluate(()=>window.confirmPrices(3));
    assert((await amount().innerText()).includes('360'),'Cost arrival keeps the sale/promo price stable');
   }
  } else assert(await buy.isEnabled(),'Guest can buy at the public price');
  if(role==='partner'){
   await page.evaluate(()=>{localStorage.setItem('user_id','another-user');window.dispatchEvent(new CustomEvent('partson:authStateChange',{detail:{uid:'another-user'}}))});
   await amount().filter({hasText:'450'}).waitFor();
   assert(!(await amount().innerText()).includes('360'),'A different account cannot reuse the previous partner price');
   assert(await page.getByRole('button',{name:/^(?:Підтягуємо ціну|Перевіряємо ціну для вашого профілю)$/}).isDisabled());
   await page.evaluate(()=>window.confirmPrices(1));
   await page.getByRole('button',{name:'Додати в кошик',exact:true}).waitFor();
  }

  await page.evaluate(()=>window.setRateReady(false));
  await page.waitForTimeout(20);
  assert(!(await page.locator(view==='grid'?'.catalog-card-price-pill':'.catalog-list-price-depth').allTextContents()).join('').includes('450'),'Do not show conversion without a confirmed rate');
  assert.deepEqual(errors,[]);
  console.log(`PASS ${view}/${role}: known public price before private response; account price and purchase remain verified`);
  await page.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));stop();}
