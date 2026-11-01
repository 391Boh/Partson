import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const {chromium}=await import(process.argv[2]||'./test-browser.mjs');
const item=(code,index=0)=>({code,article:code+'-ДОВГИЙ-АРТИКУЛ-1234567890-TEST',name:index%2?'Супердовгенайменуванняавтозапчастинибезпробілів 0123456789':'Комплект зчеплення з двомасовим маховиком для автомобіля Volkswagen Transporter',producer:'Виробник з дуже довгою назвою',quantity:index?0:99999,priceEuro:index?12:24691357,group:'Двигун та комплектуючі',subGroup:'Дуже довга категорія запчастин для автомобіля',hasPhoto:false});
const related=[item('A0'),item('A1',1)],similar=[item('S0'),item('S1',1)],recent=[item('R0'),item('R1',1)];
delete recent[1].article; // Legacy browsing history is allowed to contain only a code.
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import React from 'react';import{createRoot}from'react-dom/client';
  import Related from './app/components/ProductRelatedItemsClientSection';import Recent from './app/components/ProductRecentlyViewedSection';
  const product={code:'CURRENT',article:'CURRENT',name:'Фільтр',producer:'TEST',group:'Двигун'};
  createRoot(document.getElementById('root')).render(<main className="product-page" style={{maxWidth:1000,margin:'auto',padding:12}}><Related product={product} initialRelatedItems={${JSON.stringify(related)}} initialSimilarItems={${JSON.stringify(similar)}} euroRate={50}/><Recent product={product} euroRate={50}/></main>);
`},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env':'{"NODE_ENV":"production"}'},plugins:[{name:'offline-recommendations',setup(b){
  b.onResolve({filter:/^app\/(components\/(SmartLink|ProductCardImage)|lib\/product-image-batch-client)$|^(\.\/firebase-auth-state)$/},a=>({path:a.path,namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({loader:'tsx',resolveDir:process.cwd(),contents:
    path.endsWith('SmartLink')?`import React from 'react';export default({href,className,children})=><a href={href} className={className}>{children}</a>;`:
    path.endsWith('ProductCardImage')?`import React from 'react';export default()=> <span aria-hidden="true" style={{display:'grid',placeItems:'center',height:'100%',color:'#94a3b8'}}>Фото</span>;`:
    path.endsWith('product-image-batch-client')?'export const fetchCatalogImageBatch=async()=>[];':
    `import{useSyncExternalStore}from'react';let listeners=new Set();const make=role=>({ready:true,user:role==='guest'?null:{uid:role,getIdToken:async()=>role}});let value=make(new URLSearchParams(location.search).get('role')||'guest');window.setPriceIdentity=role=>{value=make(role);listeners.forEach(fn=>fn())};export const useFirebaseAuthState=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>value);`
  }));
}}]});
const server=http.createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
  if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(readFileSync('public/styles/dev-site.css'));return;}
  if(req.url.startsWith('/api/catalog-prices')){
    let body='';for await(const chunk of req)body+=chunk;const items=JSON.parse(body).items;
    const partner=req.headers.authorization==='Bearer partner';const keys=items.map(item=>item.stateKey);
    const map=fn=>Object.fromEntries(keys.map(key=>[key,fn(key)]));
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({prices:map(key=>key.endsWith('0')?24691357:12),promoPrices:map(key=>key.endsWith('0')?19753085.6:9.6),hasPromo:map(()=>true),promoPercent:map(()=>20),isPartner:partner}));return;
  }
  if(req.url.startsWith('/fonts/')){const file='public'+req.url;try{res.end(readFileSync(file));}catch{res.end();}return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const width of [320,390,768,1440])for(const role of ['guest','partner']){
    const page=await browser.newPage({viewport:{width,height:950}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
    await page.addInitScript(items=>localStorage.setItem('partson:v2:recently-viewed-products',JSON.stringify(items.map((item,index)=>({...item,viewedAt:Date.now()-index})))),recent);
    await page.goto(`http://127.0.0.1:${server.address().port}/?role=${role}`);
    await page.locator('.recommendation-discount').first().waitFor();
    if(role==='partner')await page.waitForFunction(()=>document.querySelectorAll('.recommendation-old-price').length===6);
    assert.equal(await page.locator('.recommendation-old-price').count(),role==='partner'?6:0,'Exact promo amounts follow verified partner access');
    const check=async()=>{
      const bounds=await page.locator('.product-compact-card:visible').evaluateAll(cards=>cards.map(card=>{
        const b=card.getBoundingClientRect();return{width:b.width,height:b.height,scrollHeight:card.scrollHeight,clientHeight:card.clientHeight,prices:[...card.querySelectorAll('.recommendation-price-pill,.recommendation-price-value,.recommendation-discount')].map(el=>{const r=el.getBoundingClientRect();return{inside:r.left>=b.left&&r.right<=b.right+1&&r.bottom<=b.bottom+1,fits:el.scrollWidth<=el.clientWidth+1}})};
      }));
      assert(bounds.every(card=>card.height===248&&card.scrollHeight<=card.clientHeight+1&&card.prices.every(price=>price.inside&&price.fits)),`${width}px ${role}: prices, badges and long text fit the card: ${JSON.stringify(bounds)}`);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page has no horizontal overflow');
    };
    await check();await page.getByRole('tab',{name:/Схожі/}).click();await check();
    await page.screenshot({path:`/tmp/partson-recommendations-${role}-${width}.png`,fullPage:true});
    if(role==='partner'){
      await page.evaluate(()=>window.setPriceIdentity('guest'));await page.waitForFunction(()=>document.querySelectorAll('.recommendation-old-price').length===0);
      assert.equal(await page.locator('.recommendation-discount').first().textContent(),'−20%партнерам','Sign-out immediately restores public display');
    }
    assert.deepEqual(errors,[]);console.log(`PASS ${role} ${width}px: analogs, similar and recent prices, long amounts/names, stable cards and auth isolation`);await page.close();
  }
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
