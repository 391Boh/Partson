import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
const { chromium }=await import(process.argv[2]||'./test-browser.mjs');
const bundle=await build({
  stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Data from './app/components/Data';
    const empty=[];function App(){const [parent,setParent]=useState(0),[filtered,setFiltered]=useState(false);
      window.updateCatalogParent=()=>setParent(v=>v+1);window.filterCatalog=()=>setFiltered(v=>!v);
      return <><output id="parent">{parent}</output><Data selectedCars={empty} selectedCategories={empty} sortOrder="none" inStock={filtered}/></>;
    }createRoot(document.getElementById('root')).render(<App/>);
  `},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env':'{"NODE_ENV":"production"}'},
  plugins:[{name:'controlled-catalog-inputs',setup(b){
    b.onResolve({filter:/^(\.\/useCatalogData|next\/(navigation|dynamic)|app\/components\/(ProductCard|ProductListRow)|app\/lib\/(get-admin-token|use-live-catalog-refresh))$/},a=>({path:a.path,namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({loader:'tsx',resolveDir:process.cwd(),contents:
      path==='next/navigation'?'const params=new URLSearchParams();export const useSearchParams=()=>params;export const useRouter=()=>({replace(){}});':
      path==='next/dynamic'?'export default ()=>()=>null;':
      path.includes('get-admin-token')?'export const getAdminIdToken=async()=>null;':
      path.includes('use-live-catalog-refresh')?'export const useLiveCatalogRefresh=()=>false;':
      path.startsWith('app/components/')?`import React from 'react';export default ({item,cartQty,onAddToCart})=><button data-product={item.code} onClick={()=>onAddToCart(item)}>{item.name} Кошик: {cartQty}</button>;`:
      `import {useState,useCallback,useRef} from 'react';const noop=()=>{};const products=Array.from({length:16},(_,i)=>({code:'C'+i,article:'A'+i,name:'Товар '+i,quantity:2,priceEuro:10,producer:'TEST'}));const empty={};
      export function useCatalogData(props){window.catalogRenderCount=(window.catalogRenderCount||0)+1;
        const [cart,setCart]=useState({}),[page,setPage]=useState(1);const next=useRef(null);
        const add=useCallback(item=>setCart(value=>({...value,[item.code]:(value[item.code]||0)+1})),[]);
        return {filteredData:props.inStock?products.slice(0,8):products,directMode:false,dataStartIndex:0,
          quantities:empty,prices:empty,costPrices:empty,promoPrices:empty,resolvedPriceAccess:empty,euroRateReady:true,isPartner:false,
          hasPromoAvailability:empty,promoPercentByKey:empty,pageImages:empty,pageImagePending:empty,pageImageMissing:empty,euroRate:45,
          loading:false,hasMore:false,error:null,cartMap:cart,displayedPage:page,setDisplayedPage:setPage,
          handleFlip:noop,handleQtyChange:noop,handleAddToCart:add,handleRemoveFromCart:noop,handleImageOpen:noop,handleImageClose:noop,
          loadNextPage:noop,loadDirectPage:noop,prefetchNextPageTriggerRef:next,prefetchVisibleCatalogPrices:noop,prefetchVisibleCatalogImages:noop,
          isLoadingNextPage:false,isRefetching:false,hasLoadedOnce:true,firstPageResolvedItemCount:16,filterLoading:false,setFilterLoading:noop,
          updateCatalogItemPrice:noop,updateCatalogItemFields:noop,applyLiveCatalogProducts:noop,catalogTotalCount:props.inStock?8:16,
          catalogQuerySignature:'fixture',catalogReadyQuerySignature:'fixture'};
      }`
    }));
  }}],
});
const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/bundle.js"></script></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:950}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Fixture browser:',e.message)});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('[data-product="C0"]').waitFor();await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-product]').count(),16);
  const before=await page.evaluate(()=>window.catalogRenderCount);
  await page.evaluate(async()=>{for(let i=0;i<20;i++){window.updateCatalogParent();await new Promise(requestAnimationFrame);}});
  assert.equal(await page.locator('#parent').textContent(),'20');assert.equal(await page.evaluate(()=>window.catalogRenderCount),before,'Unrelated parent updates skip catalog rendering');
  await page.locator('[data-product="C0"]').click();await page.waitForFunction(()=>document.querySelector('[data-product="C0"]')?.textContent.includes('Кошик: 1'));
  assert((await page.evaluate(()=>window.catalogRenderCount))>before,'Own cart state still renders');
  await page.evaluate(()=>window.filterCatalog());await page.waitForFunction(()=>document.querySelectorAll('[data-product]').length===8);
  assert.deepEqual(errors,[]);console.log('PASS catalog boundary: 20 parent updates → 0 catalog renders; cart state and filter props remain reactive');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
