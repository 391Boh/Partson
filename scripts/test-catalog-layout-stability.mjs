import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {build,stop} from 'esbuild';
const {chromium}=await import(process.argv[2]||'./test-browser.mjs');
const baseline=process.env.CATALOG_LAYOUT_BASELINE==='1';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import{createRoot}from'react-dom/client';import Data from './app/components/Data';
 const mode=new URLSearchParams(location.search).get('view')||'grid';
 createRoot(document.getElementById('root')).render(<main className="page-shell-inline"><Data selectedCars={[]} selectedCategories={[]} sortOrder="none" viewMode={mode}/><section id="after-results" style={{height:200}}>Наступний блок сторінки</section></main>);
`},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env':'{"NODE_ENV":"production"}'},plugins:[{name:'controlled-catalog-loading',setup(b){
 b.onResolve({filter:/^(\.\/useCatalogData|next\/(navigation|dynamic|image)|app\/components\/(SmartLink|ProductCardImage)|app\/lib\/(get-admin-token|use-live-catalog-refresh))$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({loader:'tsx',resolveDir:process.cwd(),contents:
 path==='next/navigation'?'const params=new URLSearchParams();export const useSearchParams=()=>params;export const useRouter=()=>({replace(){}});':
 path==='next/dynamic'?'export default ()=>()=>null;':
 path==='next/image'?`import React from 'react';export default({quality,unoptimized,priority,fetchPriority,...p})=><img {...p}/>;`:
 path.endsWith('SmartLink')?`import React from 'react';export default({prefetch,prefetchOnIntent,prefetchOnViewport,...p})=><a {...p}/>;`:
 path.endsWith('ProductCardImage')?`import React from 'react';export default()=> <div style={{height:'100%'}}/>;`:
 path.includes('get-admin-token')?'export const getAdminIdToken=async()=>null;':
 path.includes('use-live-catalog-refresh')?'export const useLiveCatalogRefresh=()=>false;':
 `import{useState,useRef}from'react';const empty={},noop=()=>{};const products=Array.from({length:16},(_,i)=>({code:'C'+i,article:'A'+i,name:'Комплект зчеплення для Volkswagen Transporter з підшипником '+i,quantity:5,priceEuro:10,producer:'VALEO',hasPhoto:false}));
 export function useCatalogData(props){const [loading,setLoading]=useState(true),[cart,setCart]=useState({}),[promo,setPromo]=useState(false),[page,setPage]=useState(1);const next=useRef(null);
 window.resolveCatalog=()=>setLoading(false);window.togglePromo=()=>setPromo(v=>!v);window.fillCart=()=>setCart({C0:1});
 const scope=props.includeCostPrices+':'+props.includePartnerPrices+(props.priceAccessIdentity?':'+props.priceAccessIdentity:'');
 return{filteredData:loading?[]:products,directMode:false,dataStartIndex:0,quantities:empty,prices:Object.fromEntries(products.map(x=>[x.code.toLowerCase(),10])),costPrices:empty,promoPrices:promo?{c0:8}:empty,
 resolvedPriceAccess:Object.fromEntries(products.map(x=>[x.code.toLowerCase(),scope])),euroRateReady:true,isPartner:promo,hasPromoAvailability:promo?{c0:true}:empty,promoPercentByKey:promo?{c0:20}:empty,
 pageImages:empty,pageImagePending:empty,pageImageMissing:empty,euroRate:45,loading,hasMore:true,error:null,cartMap:cart,displayedPage:page,setDisplayedPage:setPage,
 handleFlip:noop,handleQtyChange:noop,handleAddToCart:()=>setCart({C0:1}),handleRemoveFromCart:noop,handleImageOpen:noop,handleImageClose:noop,loadNextPage:noop,loadDirectPage:noop,
 prefetchNextPageTriggerRef:next,prefetchVisibleCatalogPrices:noop,prefetchVisibleCatalogImages:noop,isLoadingNextPage:false,isRefetching:false,hasLoadedOnce:!loading,firstPageResolvedItemCount:16,
 filterLoading:false,setFilterLoading:noop,updateCatalogItemPrice:noop,updateCatalogItemFields:noop,applyLiveCatalogProducts:noop,catalogTotalCount:160,catalogQuerySignature:'fixture',catalogReadyQuerySignature:'fixture'};
 }`
 }));
}}]});
const server=http.createServer((req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
 if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(readFileSync('public/styles/dev-site.css'));return;}
 const asset=path.join(process.cwd(),'public',new URL(req.url,'http://fixture').pathname);
 if(existsSync(asset)&&/\.(woff2|webp|svg)$/.test(asset)){res.setHeader('content-type',asset.endsWith('.woff2')?'font/woff2':asset.endsWith('.svg')?'image/svg+xml':'image/webp');res.end(readFileSync(asset));return;}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:"Exo 2";src:url("/fonts/exo2-ui-v1.woff2") format("woff2");font-weight:100 900;font-display:swap}</style><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
const issues=[];
try{
 const page=await browser.newPage({reducedMotion:'reduce'});
 await page.addInitScript(()=>{window.layoutShifts=[];new PerformanceObserver(list=>list.getEntries().forEach(e=>{if(!e.hadRecentInput)window.layoutShifts.push(e.value)})).observe({type:'layout-shift',buffered:true});if(new URLSearchParams(location.search).get('role')==='admin'){localStorage.setItem('user_id','layout-admin');localStorage.setItem('partson:isAdmin:layout-admin','1')}else{localStorage.removeItem('user_id')}});
 for(const role of ['guest','admin'])for(const view of ['grid','list'])for(const width of [320,390,768,1024,1440,2560]){
  await page.setViewportSize({width,height:950});await page.goto(`http://127.0.0.1:${server.address().port}/?role=${role}&view=${view}`);await page.evaluate(async()=>{await document.fonts.ready});await page.waitForTimeout(100);
  const geometry=()=>page.evaluate(()=>{const g=document.querySelector('#catalog-results .grid');return{grid:g.getBoundingClientRect().height,after:document.querySelector('#after-results').getBoundingClientRect().top+scrollY,card:document.querySelector('.catalog-product-card,.catalog-product-list-row')?.getBoundingClientRect().height}});
  const before=await geometry();await page.evaluate(()=>{window.layoutShifts=[];window.resolveCatalog()});await page.locator('[data-catalog-card]').first().waitFor();await page.waitForTimeout(100);const ready=await geometry();
  await page.evaluate(()=>window.fillCart());await page.waitForTimeout(100);const cart=await geometry();
  await page.evaluate(()=>window.togglePromo());await page.waitForTimeout(100);const promo=await geometry();
  const cls=await page.evaluate(()=>window.layoutShifts.reduce((a,b)=>a+b,0));
  if(process.env.CATALOG_LAYOUT_SCREENSHOTS==='1'&&[390,1440].includes(width)){
   mkdirSync('output/catalog-loading',{recursive:true});await page.screenshot({path:`output/catalog-loading/${role}-${view}-${width}.png`});
  }
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('.catalog-product-card')].flatMap(card=>{const r=card.getBoundingClientRect();const actions=card.querySelector('.catalog-card-actions');return actions&&actions.getBoundingClientRect().bottom>r.bottom+1?['actions below card']:[]}));
  if(!baseline)assert.deepEqual(overflow,[],`${role}/${view}/${width}: controls fit`);
  const row={role,view,width,before,ready,cart,promo,cls};console.log(JSON.stringify(row));
  if(Math.abs(before.after-ready.after)>1)issues.push(`${role}/${view}/${width}: loading shift ${Math.round(ready.after-before.after)}`);
  if(Math.abs(ready.after-cart.after)>1||Math.abs(cart.after-promo.after)>1)issues.push(`${role}/${view}/${width}: cart/promo shift`);
  if(!baseline)assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 if(!baseline){assert.deepEqual(issues,[]);console.log('PASS catalog layout: 24 guest/admin, grid/list scenarios at 320–2560px; zero result/footer shift across loading, cart and discount; no horizontal overflow.')}else console.log('BASELINE ISSUES',JSON.stringify(issues));
}finally{await browser.close();await new Promise(r=>server.close(r));stop();}
