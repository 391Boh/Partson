import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { analyticsDayKey, shiftAnalyticsDay, analyticsDaysBetween } from '../app/lib/admin-order-analytics.ts';
const { chromium } = await import(process.argv[2] || './test-browser.mjs');

const result = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import Layout from './app/components/LayoutHost';
    localStorage.setItem('user_id','offline-admin');localStorage.setItem('partson:isAdmin:offline-admin','1');
    createRoot(document.getElementById('root')).render(<Layout><div style={{padding:32,color:'#4c6475'}}>PartsON · Каталог автозапчастин</div></Layout>);
  ` },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: {'process.env':'{}','process.env.NODE_ENV':'"production"'},
  plugins: [{name:'offline-layout', setup(b){
    b.onResolve({filter:/^\.\//},args=>{
      if(args.importer.endsWith('/LayoutHost.tsx') && args.path!=='./AdminOverviewWindow') return {path:args.path,namespace:'shell'};
    });
    b.onLoad({filter:/.*/,namespace:'shell'},({path})=>({loader:'tsx',resolveDir:process.cwd(),contents:
      path==='./Header' ? `export default ()=> <header className="site-header-shell" style={{height:64,background:'#102537',color:'#edf5fb',padding:'18px 24px'}}>PartsON</header>;` :
      path==='./PageTransition' ? 'export default ({children})=>children;' :
      path==='./AdminChatPanel' ? `export {default} from ${JSON.stringify(process.cwd()+'/app/components/AdminChatPanel.tsx')};` :
      'export default ()=>null;'}));
    b.onResolve({filter:/^(firebase\/firestore|\.\.\/\.\.\/firebase)$/},args=>({path:args.path,namespace:'firebase'}));
    b.onLoad({filter:/.*/,namespace:'firebase'},({path})=>({resolveDir:process.cwd(),contents:path==='../../firebase'?'export const db={};':`
      export const collection=(_,name)=>({name}),doc=(_,name,id)=>({name,id}),query=ref=>ref;
      export const orderBy=()=>({}),limit=()=>({}),serverTimestamp=()=>Date.now(),arrayUnion=(...v)=>v,arrayRemove=(...v)=>v;
      export const addDoc=async()=>({}),setDoc=async()=>{},updateDoc=async()=>{},deleteDoc=async()=>{},getDoc=async()=>({exists:()=>false,data:()=>({})});
      export const onSnapshot=(ref,callback)=>{const timer=setTimeout(()=>{
        const records=ref.name==='orders'?[{id:'order-1',name:'Олена Петренко',phone:'+380671234567',status:'new',totalAmount:2450,createdAt:Date.now(),read:false,cartItems:[]}]:[];
        callback({size:records.length,docs:records.map(r=>({id:r.id,data:()=>r})),data:()=>({})});
      },20);return()=>clearTimeout(timer)};
    `}));
    b.onResolve({filter:/^\.\/get-admin-token$/},()=>({path:'app/lib/get-admin-token',namespace:'mock'}));
    b.onResolve({filter:/^(next\/navigation|next\/dynamic|app\/lib\/(firebase-auth-state|get-admin-token|deferred-stylesheet|onec-proxy-client|schedule-background-task|route-prefetch))$/},args=>({path:args.path,namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({loader:'tsx',resolveDir:process.cwd(),contents:
      path==='next/navigation' ? 'const router={push(){},prefetch(){}};export const useRouter=()=>router,usePathname=()=>"/",useSearchParams=()=>new URLSearchParams();' :
      path==='next/dynamic' ? `import React from 'react';export default (load,options={})=>{const C=React.lazy(load);return props=><React.Suspense fallback={options.loading?<options.loading/>:null}><C {...props}/></React.Suspense>};` :
      path==='app/lib/firebase-auth-state' ? 'export const useFirebaseAuthState=()=>({user:null,ready:true});' :
      path==='app/lib/get-admin-token' ? 'export const getAdminIdToken=async()=>"offline-admin-token",getCurrentAdminUser=async()=>null;' :
      path==='app/lib/deferred-stylesheet' ? 'export const loadDeferredUi=load=>load();' :
      path==='app/lib/onec-proxy-client' ? 'export const fetchCatalogTree=async()=>[];' :
      path==='app/lib/schedule-background-task' ? 'export const scheduleBackgroundTask=()=>()=>{};' :
      'export const prefetchRoute=()=>{};'}));
  }}],
});
const summary={generatedAt:Date.now(),periods:{today:{orders:8,revenue:15420,avg:1928,cancelled:0},week:{orders:52,revenue:99750,avg:1918,cancelled:2},month:{orders:184,revenue:350920,avg:1907,cancelled:5}},
  previous:{today:{orders:5,revenue:10000,avg:2000,cancelled:1},week:{orders:45,revenue:85000,avg:1889,cancelled:2},month:{orders:150,revenue:290000,avg:1933,cancelled:3}},
  series:Array.from({length:30},(_,i)=>({day:shiftAnalyticsDay(analyticsDayKey(Date.now()),i-29),orders:i%5+1,revenue:1000+(i%7)*1800})),
  statusCounts:{new:3,packing:5,shipped:12,completed:24},alerts:[{id:'order-1',name:'Олена Петренко',phone:'+380671234567',total:2450,status:'new',reason:'unread',sinceMs:Date.now()-3600000},{id:'order-2',name:'Ігор Коваленко',phone:'+380931234567',total:1780,status:'arrived',reason:'arrived_waiting',sinceMs:Date.now()-172800000}],alertsTotal:2,
  topProducts:[{code:'p1',article:'OC 90',name:'Фільтр масляний',qty:12,revenue:4800,orders:8}],repeatCustomers:[{name:'Олена Петренко',phone:'+380671234567',orders:3,revenue:7350}],repeatCustomersTotal:12,customersTotal:156,payments:{paid:41,pending:4,failed:1,cod:138},openCalls:3};
const requests=[];
const server=http.createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].text);return;}
  if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(readFileSync('public/styles/dev.css'));return;}
  if(req.url.startsWith('/fonts/') && existsSync('public'+req.url)){res.end(readFileSync('public'+req.url));return;}
  if(req.url.startsWith('/api/')){
    requests.push({url:req.url,method:req.method,authorization:req.headers.authorization});
    res.setHeader('Content-Type','application/json');
    if(req.url.startsWith('/api/admin/orders/summary')) res.end(JSON.stringify(summary));
    else if(req.url.startsWith('/api/admin/orders/analysis')) {
      const params=new URL(req.url,'http://offline').searchParams;
      const from=params.get('from'),to=params.get('to'),days=analyticsDaysBetween(from,to),offset=Number(params.get('offset')||0);
      const rows=[{id:'order-1',name:'Олена Петренко',phone:'+380671234567',total:2450,createdAt:Date.now(),status:'new',payment:'paid',items:1,itemNames:['Фільтр масляний OC 90']},{id:'order-2',name:'Ігор Коваленко з довгим прізвищем для перевірки адаптації',phone:'+380931234567',total:1780,createdAt:Date.now(),status:'completed',payment:'cod',items:2,itemNames:['Гальмівні колодки','Моторна олива']}];
      res.end(JSON.stringify({period:{from,to,days},previous:{from:shiftAnalyticsDay(from,-days),to:shiftAnalyticsDay(from,-1),totals:{orders:1,revenue:2000,avg:2000,cancelled:0}},totals:{orders:2,revenue:4230,avg:2115,cancelled:1,paidRevenue:2450,completed:1,returned:0},statusCounts:{new:1,completed:1},rows:rows.slice(offset,offset+1),total:2,hasMore:offset===0,truncated:false}));
    }
    else if(req.url.startsWith('/api/admin/orders/np-sync')) res.end(JSON.stringify({checked:12,statusChanged:2,notified:1,errors:[]}));
    else if(req.url.startsWith('/api/admin/orders/export')){res.setHeader('Content-Type','text/csv');res.end('id,total\norder-1,2450');}
    else if(req.url.startsWith('/api/admin/search-misses')) res.end(JSON.stringify({items:[{query:'фільтр OC90',count:7,days:3,lastDay:'2026-11-24'}]}));
    else if(req.url.startsWith('/api/admin/catalog-quality')) res.end(JSON.stringify({catalogTotal:300,total:0,items:[],hasMore:false,facets:Object.fromEntries(['stock','visible','price','photo','fitment','description','renamed'].map(k=>[k,{yes:200,no:100}]))}));
    else if(req.url.startsWith('/api/admin/partners')) res.end(JSON.stringify({uids:[]}));
    else res.end(JSON.stringify({ok:true}));return;
  }
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
mkdirSync('.impeccable/review',{recursive:true});
try {
  for(const width of [390,768,1440]){
    const page=await browser.newPage({viewport:{width,height:1000}});
    const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message)});
    const before=requests.length;
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForTimeout(300);assert.deepEqual(errors,[]);
    const trigger=page.getByRole('button',{name:'Огляд магазину',exact:true});await trigger.waitFor();
    const t=await trigger.boundingBox(),plus=await page.getByRole('button',{name:'Додати товар'}).boundingBox();
    assert(t.y+t.height<=plus.y,'Overview button sits above the plus');
    await page.locator('.site-floating-actions').screenshot({path:`/tmp/partson-overview-button-${width}.png`});
    assert.equal(requests.slice(before).filter(r=>r.url.includes('/summary')).length,0,'Statistics load only when opened');
    await trigger.click();
    const panel=page.getByRole('dialog',{name:'Огляд магазину'});await panel.waitFor();
    await panel.locator('.admin-overview-alert').filter({hasText:'Олена Петренко'}).waitFor();
    assert.equal(await trigger.getAttribute('aria-expanded'),'true');
    assert(await panel.getByText('15 420 грн',{exact:true}).count() || await panel.getByText(/15\s420 грн/).count());
    const rect=await panel.boundingBox();assert(rect.x>=0 && rect.x+rect.width<=width+1,'Overview fits viewport');
    assert(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No outer horizontal overflow');
    await page.screenshot({path:width===1440?'.impeccable/review/desktop.png':width===390?'.impeccable/review/mobile.png':'.impeccable/review/tablet.png'});
    if(width>=768){
      const grip=await panel.locator('[data-admin-resize="se"]').boundingBox();
      await page.mouse.move(grip.x+10,grip.y+10);await page.mouse.down();
      await page.mouse.move(grip.x-110,grip.y-90,{steps:8});await page.mouse.up();
      const small=await panel.boundingBox();assert(small.width<rect.width-90 && small.height<rect.height-70,'Overview resizes');
      await panel.getByRole('button',{name:'Відновити розмір і положення вікна'}).click();
      assert(Math.abs((await panel.boundingBox()).width-rect.width)<2,'Restore button resets dimensions');
    }
    // Every summary dimension leads to real, authenticated order analysis.
    await panel.getByRole('button',{name:'Аналіз: Сьогодні',exact:true}).click();
    await panel.getByRole('heading',{name:'Замовлення · 2'}).waitFor();
    assert(await panel.getByText('Онлайн оплати',{exact:true}).count());
    assert(await panel.locator('.admin-analytics-detail').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Detail fits its window');
    await panel.getByRole('button',{name:'Показати ще',exact:true}).click();
    await panel.locator('.analytics-order-list li').nth(1).waitFor();
    await page.screenshot({path:`/tmp/partson-analysis-detail-${width}.png`});
    await panel.getByRole('button',{name:'До огляду',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'analytics-period-today','Back restores keyboard focus');
    const chart=panel.getByRole('region',{name:'Динаміка замовлень'});
    await chart.getByRole('button',{name:'30 днів',exact:true}).click();
    await chart.getByRole('button',{name:'Середній чек',exact:true}).click();
    const bars=chart.getByRole('button',{name:/Відкрити аналіз дня/});assert.equal(await bars.count(),30);
    assert(await bars.first().evaluate(el=>el.getBoundingClientRect().width>=30),'Chart targets stay usable with horizontal scrolling');
    const dayId=await bars.last().getAttribute('id');await bars.last().click();
    await panel.getByRole('heading',{name:'Замовлення · 2'}).waitFor();
    const dayRequest=new URL(requests.filter(r=>r.url.includes('/analysis')).at(-1).url,'http://offline');
    assert.equal(dayRequest.searchParams.get('from'),dayRequest.searchParams.get('to'));
    await panel.getByRole('button',{name:'До огляду',exact:true}).click();
    assert.equal(await chart.getByRole('button',{name:'30 днів',exact:true}).getAttribute('aria-pressed'),'true','Back preserves chart range');
    assert.equal(await chart.getByRole('button',{name:'Середній чек',exact:true}).getAttribute('aria-pressed'),'true','Back preserves metric');
    assert.equal(await page.evaluate(()=>document.activeElement.id),dayId);
    await page.screenshot({path:`/tmp/partson-analysis-chart-${width}.png`});
    for(const [id,key,value] of [['analytics-status-new','status','new'],['analytics-payment-paid','payment','paid'],['analytics-product-0','product','p1'],['analytics-customer-380671234567','phone','+380671234567']]) {
      await panel.locator('#'+id).click();await panel.getByRole('heading',{name:'Замовлення · 2'}).waitFor();
      const request=new URL(requests.filter(r=>r.url.includes('/analysis')).at(-1).url,'http://offline');
      assert.equal(request.searchParams.get(key),value,'Drilldown keeps the selected filter');
      await panel.getByRole('button',{name:'До огляду',exact:true}).click();
    }
    await panel.getByRole('tab',{name:'Якість каталогу'}).click();
    await page.waitForFunction(()=>document.body.textContent.includes('300'));
    await panel.getByRole('tab',{name:'Пошук без результатів'}).click();
    await panel.getByRole('link',{name:'фільтр OC90'}).waitFor();
    await panel.getByRole('tab',{name:'Продажі',exact:true}).click();
    await panel.getByRole('button',{name:'Статуси НП',exact:true}).click();
    await panel.getByText(/перевірено ТТН: 12/).waitFor();
    await panel.locator('summary').click();
    const download=page.waitForEvent('download');await panel.getByRole('button',{name:'Завантажити',exact:true}).click();
    assert((await download).suggestedFilename().endsWith('.csv'));
    await panel.getByRole('button',{name:'Аналіз: Сьогодні',exact:true}).click();
    await panel.locator('.analytics-order-list').getByRole('button',{name:/Олена Петренко/}).click();
    await panel.waitFor({state:'detached'});
    const order=page.locator('#admin-order-order-1');await order.waitFor();
    await order.getByRole('button',{name:'Згорнути замовлення'}).waitFor();
    await order.getByRole('link',{name:'+380671234567'}).waitFor();
    assert.equal(await page.locator('.admin-panel-shell').getByRole('button',{name:'Огляд',exact:true}).count(),0,'Overview no longer lives inside the admin panel');
    await page.getByRole('button',{name:'Закрити панель адміністратора'}).click();
    await trigger.click();await panel.getByRole('button',{name:'Дзвінки: 3'}).click();
    await page.getByText('Заявок на дзвінок не знайдено',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Закрити панель адміністратора'}).click();
    await trigger.click();await panel.getByRole('button',{name:'Закрити огляд'}).click();
    assert.equal(await trigger.getAttribute('aria-expanded'),'false');
    assert.deepEqual(errors,[]);await page.close();
    console.log(`Overview ${width}px: independent launch, button placement, real actions, navigation, responsive layout and resizing passed.`);
  }
  const errorPage=await browser.newPage();
  await errorPage.route('**/api/admin/orders/summary*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Тимчасово недоступно'})}),{times:1});
  await errorPage.goto(`http://127.0.0.1:${server.address().port}`);
  await errorPage.getByRole('button',{name:'Огляд магазину',exact:true}).click();
  await errorPage.getByRole('alert').filter({hasText:'Тимчасово недоступно'}).waitFor();
  await errorPage.getByRole('button',{name:'Оновити',exact:true}).click();
  await errorPage.locator('.admin-overview-alert').filter({hasText:'Олена Петренко'}).waitFor();
  await errorPage.close();
  assert(requests.filter(r=>r.url.startsWith('/api/admin/')).every(r=>r.authorization==='Bearer offline-admin-token'),'All data/actions require the admin token');
  console.log('Overview failure/retry and authorization passed.');
} finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
