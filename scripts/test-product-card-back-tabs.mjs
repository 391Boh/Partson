import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {build,stop} from 'esbuild';
const {chromium}=await import(process.argv[2]||'./test-browser.mjs');
const description=['AUDI A4 B5, A6 C5; VW PASSAT B5 1.6-4.2 11.94-03.08','Комплект постачається з кріпленням.','Ширина [мм]\t150','Монтажна позиція\tпередн',...Array.from({length:24},(_,i)=>`Параметр ${i+1}\tЗначення ${i+1}`)].join('\n');
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';import Card from './app/components/ProductCard';
 const scenario=new URLSearchParams(location.search).get('scenario')||'ready',noop=()=>{};
 function App(){const[flipped,setFlipped]=useState(false),[item,setItem]=useState({code:'TABS-'+scenario,article:'ART-123',name:'Комплект гальмівних колодок передніх для автомобілів Volkswagen Passat',producer:'VALEO',quantity:12,hasPhoto:false,...(scenario==='empty'?{}:{category:'Гальмівна система',group:'Гальмівні колодки',subGroup:'Передні колодки'})});window.adminSaves??=[];
 return <main className="page-shell-inline"><div className="catalog-results-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"><Card item={item} productHref="/product/test" qty={1} cartQty={0} priceUAH={1800} priceStatus="ready" isAdmin={scenario==='admin'} isFlipped={flipped} motionEnabled={false} onAddToCart={noop} onRequestPrice={noop} onRemoveFromCart={noop} onQtyChange={noop} onFlip={()=>setFlipped(v=>!v)} onImageOpen={noop} onAdminEdit={async data=>{window.adminSaves.push(data);setItem(prev=>({...prev,...data}));return{ok:true}}}/></div></main>}
 createRoot(document.getElementById('root')).render(<App/>);
 `},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env':'{"NODE_ENV":"production"}'},plugins:[{name:'native-links-images',setup(b){
 b.onResolve({filter:/^next\/image$|^app\/components\/(SmartLink|ProductCardImage)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'tsx',resolveDir:process.cwd(),contents:
 path.endsWith('ProductCardImage')?`import React from 'react';export default()=> <div style={{height:'100%'}}/>;`:
 path.endsWith('SmartLink')?`import React from 'react';export default({prefetch,prefetchOnIntent,prefetchOnViewport,...p})=><a {...p}/>;`:
 `import React from 'react';export default({quality,unoptimized,priority,fetchPriority,...p})=><img {...p}/>;`
 }));
 }}]});
const server=http.createServer((req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents)}
 else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(readFileSync('public/styles/dev-site.css'))}
 else if(req.url==='/fonts/exo2-ui-v1.woff2'){res.setHeader('content-type','font/woff2');res.end(readFileSync('public/fonts/exo2-ui-v1.woff2'))}
 else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:"Exo 2";src:url("/fonts/exo2-ui-v1.woff2") format("woff2");font-weight:100 900}</style><link rel="stylesheet" href="/styles.css"><div id="root"></div><script src="/bundle.js"></script></html>')}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
const origin=`http://127.0.0.1:${server.address().port}`;
const screenshot=async(card,name)=>{if(process.env.CATALOG_BACK_SCREENSHOTS==='1'){mkdirSync('output/catalog-card-back',{recursive:true});await card.screenshot({path:`output/catalog-card-back/${name}.png`})}};
const allLayoutIssues=[];
try{
 for(const {width,touch} of [{width:320,touch:true},{width:390,touch:true},{width:1440,touch:false},{width:2560,touch:false}]){
  const page=await browser.newPage({viewport:{width,height:950},isMobile:touch,hasTouch:touch,reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));let requests=0,release;const gate=new Promise(r=>{release=r});
  await page.route('**/api/product-description?**',async route=>{requests++;await gate;await route.fulfill({json:{description}})});
  await page.goto(origin);await page.evaluate(()=>document.fonts.ready);assert.equal(await page.getByRole('tablist').count(),0,'Back stays unmounted before opening');assert.equal(requests,0);
  const card=page.locator('.catalog-product-card');const height=await card.evaluate(e=>e.getBoundingClientRect().height);
  await page.getByRole('button',{name:'Детальніше',exact:true}).click();await page.getByRole('tab',{name:'Застосування',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Категорія',exact:true}).click();const panel=page.getByRole('tabpanel');assert((await panel.innerText()).includes('Гальмівні колодки'),'Category works while description is still loading');
  const href=await panel.getByRole('link',{name:'Товари цієї категорії'}).getAttribute('href'),params=new URL(href,origin).searchParams;assert.equal(params.get('group'),'Гальмівні колодки');assert.equal(params.get('subcategory'),'Передні колодки');
  await screenshot(card,`${width}-category`);release();await page.getByRole('tab',{name:'Застосування',exact:true}).click();await panel.getByText('AUDI',{exact:true}).waitFor();assert(!(await panel.innerText()).includes('Ширина'),'Specifications do not leak into fitment');await screenshot(card,`${width}-fitment`);
  const fitment=page.getByRole('tab',{name:'Застосування',exact:true});await fitment.focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Характеристики',exact:true}).getAttribute('aria-selected'),'true');assert((await panel.innerText()).includes('150'));assert(!(await panel.innerText()).includes('PASSAT'),'Fitment does not leak into specifications');
  await panel.evaluate(e=>{e.scrollTop=e.scrollHeight});assert(await panel.evaluate(e=>e.scrollTop>0),'Long specifications scroll inside the card');await screenshot(card,`${width}-specs`);
  await page.getByRole('tab',{name:'Характеристики',exact:true}).focus();await page.keyboard.press('End');assert.equal(await page.getByRole('tab',{name:'Категорія',exact:true}).getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await fitment.getAttribute('aria-selected'),'true');await page.keyboard.press('ArrowLeft');assert.equal(await page.getByRole('tab',{name:'Категорія',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('button',{name:'Повернути картку'}).click();assert.equal(await page.getByRole('tablist').count(),0);await page.getByRole('button',{name:'Детальніше',exact:true}).click();assert.equal(await page.getByRole('tab',{name:'Категорія',exact:true}).getAttribute('aria-selected'),'true');assert.equal(requests,1,'Switching and reopening reuse one description request');
  assert.equal(await card.evaluate(e=>e.getBoundingClientRect().height),height);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const layoutIssues=await card.evaluate(card=>{const bounds=card.getBoundingClientRect(),face=card.querySelector('.catalog-card-face-back'),footer=face.querySelector('.catalog-card-back-footer'),tabs=face.querySelectorAll('[role=tab]');return[...tabs].flatMap(tab=>tab.scrollWidth>tab.clientWidth+1?['tab label overflow']:[]).concat(footer.getBoundingClientRect().bottom>bounds.bottom-4?['footer overflow']:[])});allLayoutIssues.push(...layoutIssues.map(issue=>`${width}px: ${issue}`));assert.deepEqual(errors,[]);
  console.log(`PASS back tabs ${width}px: separated data, category during loading, keyboard, internal scroll, stable size, one request, state preserved`);await page.close();
 }
 for(const scenario of ['empty','error','admin']){
  const page=await browser.newPage({viewport:{width:390,height:950},isMobile:true,hasTouch:true,reducedMotion:'reduce'});let requests=0;
  await page.route('**/api/catalog-meta-suggest?**',route=>route.fulfill({json:{items:[]}}));
  await page.route('**/api/product-description?**',route=>{requests++;return scenario==='error'&&requests<=2?route.fulfill({status:503,json:{error:'offline'}}):route.fulfill({json:{description:scenario==='empty'?null:description}})});
  await page.goto(`${origin}/?scenario=${scenario}`);await page.getByRole('button',{name:'Детальніше',exact:true}).click();const panel=page.getByRole('tabpanel');
  if(scenario==='empty'){
   await panel.getByText('Дані про застосування поки не вказані.').waitFor();await page.getByRole('tab',{name:'Характеристики',exact:true}).click();assert((await panel.innerText()).includes('ART-123'));await page.getByRole('tab',{name:'Категорія',exact:true}).click();assert((await panel.innerText()).includes('Категорію товару поки не вказано.'));
  }else if(scenario==='error'){
   await panel.getByRole('button',{name:'Спробувати ще раз'}).waitFor();await page.getByRole('tab',{name:'Категорія',exact:true}).click();assert((await panel.innerText()).includes('Гальмівні колодки'));await page.getByRole('tab',{name:'Застосування',exact:true}).click();await panel.getByRole('button',{name:'Спробувати ще раз'}).click();await panel.getByText('AUDI',{exact:true}).waitFor();assert.equal(requests,3);
  }else{
   await panel.getByText('AUDI',{exact:true}).waitFor();await page.getByRole('button',{name:'Редагувати опис і категорії'}).click();assert.equal(await page.getByRole('tablist').count(),0);const edited='VW GOLF IV 1.6 1998-2004\nШирина [мм]\t220';await page.locator('.catalog-admin-edit-form textarea').fill(edited);await page.getByRole('button',{name:'Зберегти',exact:true}).click();await page.getByRole('tab',{name:'Характеристики',exact:true}).waitFor();await page.getByRole('tab',{name:'Характеристики',exact:true}).click();assert((await panel.innerText()).includes('220'));assert.equal(await page.evaluate(()=>window.adminSaves.length),1);assert.equal(requests,1);
  }
  console.log(`PASS back tabs ${scenario}: honest empty/error states, retry and admin save retained`);await page.close();
 }
 assert.deepEqual(allLayoutIssues,[]);
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));stop()}
