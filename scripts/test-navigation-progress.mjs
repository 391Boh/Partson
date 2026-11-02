import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { build, stop } from 'esbuild';
const { chromium } = await import(process.argv[2] || './test-browser.mjs');
const css = readFileSync('public/styles/dev-site.css');
const result = await build({
  stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
    import React from 'react';import{createRoot}from'react-dom/client';import NavigationProgress from './app/components/NavigationProgress';
    window.routeListeners=new Set();window.fixtureDelay=60000;window.fixtureTimer=0;
    window.finishNavigation=href=>{clearTimeout(window.fixtureTimer);history.pushState({},'',href);window.routeListeners.forEach(fn=>fn());};
    const navigate=event=>{event.preventDefault();if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      const href=event.currentTarget.getAttribute('href');if(href.startsWith('#')){history.pushState({},'',href);return;}
      window.fixtureTimer=setTimeout(()=>window.finishNavigation(href),window.fixtureDelay);
    };
    const root=createRoot(document.getElementById('root'));window.unmountProgress=()=>root.unmount();
    root.render(<><NavigationProgress/><header className="font-ui" style={{height:76,background:'#0b2234',color:'#e0f2fe',display:'flex',alignItems:'center',padding:'0 24px',fontWeight:700}}>PartsON</header><main style={{padding:24}}><h1>Перехід між сторінками</h1><nav style={{display:'flex',gap:20,marginTop:24}}><a href="/slow" onClick={navigate}>Повільний</a><a href="/fast" onClick={navigate}>Швидкий</a><a href="#details" onClick={navigate}>До блоку</a></nav><section id="details" style={{marginTop:50}}>Сторінка залишається доступною під час переходу.</section></main></>);
  `},bundle:true,write:false,platform:'browser',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'navigation-fixture',setup(b){
    b.onResolve({filter:/^next\/navigation$/},args=>({path:args.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'tsx',resolveDir:process.cwd(),contents:`import{useSyncExternalStore,useMemo}from'react';const subscribe=fn=>{window.routeListeners.add(fn);return()=>window.routeListeners.delete(fn)};const router={prefetch(){}};export const useRouter=()=>router;export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);export const useSearchParams=()=>{const query=useSyncExternalStore(subscribe,()=>location.search);return useMemo(()=>new URLSearchParams(query),[query]);};`}));
  }}],
});
const server=http.createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].contents);}
  else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);}
  else if(req.url?.startsWith('/fonts/')&&existsSync(`public${req.url}`)){res.end(readFileSync(`public${req.url}`));}
  else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
const scale=page=>page.locator('.nav-progress-bar').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a);
const hidden=page=>page.waitForFunction(()=>getComputedStyle(document.querySelector('.nav-progress-bar')).visibility==='hidden');
const loading=page=>page.locator('.nav-progress-bar[data-state="loading"]').waitFor({state:'visible'});
const finish=async(page,href='/finished')=>{await page.evaluate(href=>window.finishNavigation(href),href);await hidden(page);};
const open=async(width=1440,reduce=false,safety=false)=>{
  const context=await browser.newContext({viewport:{width,height:650},reducedMotion:reduce?'reduce':'no-preference'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(safety=>{let state='visible';Object.defineProperty(document,'visibilityState',{get:()=>state,configurable:true});window.setTabVisibility=next=>{state=next;document.dispatchEvent(new Event('visibilitychange'));};if(safety){const timeout=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>timeout(fn,ms===15000?700:ms,...args);}},safety);
  await page.goto(base+'/initial');await page.waitForFunction(()=>window.routeListeners?.size>0);return{page,context,errors};
};
try{
  for(const width of [390,1440]){
    const{page,context,errors}=await open(width);await hidden(page);
    await page.getByRole('link',{name:'Повільний',exact:true}).click();await loading(page);const first=await scale(page);await page.waitForTimeout(650);const later=await scale(page);
    assert(later>first&&later<.95,'Progress advances while remaining below completion');
    const paint=await page.locator('.nav-progress-bar').evaluate(el=>{const c=getComputedStyle(el),b=el.getBoundingClientRect();return{height:b.height,top:b.top,pointer:c.pointerEvents,gradient:c.backgroundImage,live:el.getAnimations({subtree:true}).some(a=>a.constructor.name==='CSSAnimation'&&a.playState==='running')};});
    assert.equal(paint.height,4);assert.equal(paint.top,0);assert.equal(paint.pointer,'none');assert(paint.gradient.includes('linear-gradient')&&paint.live,'The active bar has live light over the gradient');
    await page.screenshot({path:`/tmp/partson-navigation-progress-${width}.png`,clip:{x:0,y:0,width,height:110}});
    await page.evaluate(()=>window.finishNavigation('/completed'));await page.locator('.nav-progress-bar[data-state="complete"]').waitFor({state:'attached'});await page.waitForTimeout(170);assert(await scale(page)>.99,'Completion reaches the end before fading');await hidden(page);
    assert.equal(await page.locator('.nav-progress-bar').evaluate(el=>el.getAnimations({subtree:true}).length),0,'Idle progress has no running or retained animations');
    await page.evaluate(()=>{window.barWasVisible=false;new MutationObserver(()=>{if(getComputedStyle(document.querySelector('.nav-progress-bar')).visibility==='visible')window.barWasVisible=true;}).observe(document.querySelector('.nav-progress-bar'),{attributes:true});window.fixtureDelay=10;});
    await page.getByRole('link',{name:'Швидкий',exact:true}).click();await page.waitForURL('**/fast');await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>window.barWasVisible),false,'Fast navigation never flashes a bar');
    await page.getByRole('link',{name:'До блоку',exact:true}).click();await page.waitForTimeout(160);await hidden(page);
    assert.deepEqual(errors,[]);console.log(`PASS navigation progress ${width}px: living gradient, advancing fill, completed fade, no idle work, no fast/hash flashes`);await context.close();
  }
  {
    const{page,context}=await open();await page.getByRole('link',{name:'Повільний',exact:true}).click();await loading(page);await page.evaluate(()=>window.finishNavigation('/first'));
    await page.locator('.nav-progress-bar[data-state="complete"]').waitFor({state:'attached'});await page.getByRole('link',{name:'Повільний',exact:true}).click();await loading(page);await page.waitForTimeout(450);assert.equal(await page.locator('.nav-progress-bar').evaluate(el=>getComputedStyle(el).visibility),'visible','The old fade cannot hide the next navigation');await finish(page);await context.close();
  }
  {
    const{page,context}=await open(390,true);await page.getByRole('link',{name:'Повільний',exact:true}).click();await loading(page);assert.equal(await page.locator('.nav-progress-bar').evaluate(el=>el.getAnimations({subtree:true}).length),0,'Reduced motion keeps a static indicator');await finish(page);await context.close();
  }
  {
    const{page,context}=await open();await page.getByRole('link',{name:'Повільний',exact:true}).click();await loading(page);await page.evaluate(()=>window.setTabVisibility('hidden'));const before=await scale(page);await page.waitForTimeout(150);assert(Math.abs(await scale(page)-before)<.001,'Hidden tabs pause the progress');await page.evaluate(()=>window.setTabVisibility('visible'));await page.waitForTimeout(180);assert(await scale(page)>before,'Visible tabs resume smoothly');
    await page.locator('.nav-progress-bar').evaluate(el=>el.getAnimations().filter(a=>a.constructor.name==='Animation').forEach(a=>a.finish()));await page.evaluate(()=>{window.setTabVisibility('hidden');window.setTabVisibility('visible');});await page.waitForTimeout(100);assert(await scale(page)>.93,'A finished fill never rewinds when returning to a tab');
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(50);assert.equal(await page.locator('.nav-progress-bar').evaluate(el=>el.getAnimations({subtree:true}).length),0,'Preference changes stop motion during navigation');await finish(page);await context.close();
  }
  {
    const{page,context}=await open(390,false,true);await page.getByRole('link',{name:'Повільний',exact:true}).click();await loading(page);await hidden(page);assert.equal(await page.locator('.nav-progress-bar').evaluate(el=>el.getAnimations({subtree:true}).length),0,'Failed navigation releases all animation work after its guard');await context.close();
  }
  console.log('PASS interruption, reduced motion, visibility pause/resume, finished-fill stability, preference changes and failed-navigation cleanup');
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));stop();}
