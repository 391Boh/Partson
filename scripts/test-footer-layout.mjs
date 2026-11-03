import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {build,stop} from 'esbuild';
const {chromium}=await import(process.argv[2]||'./test-browser.mjs');
const shots=process.env.FOOTER_SCREENSHOTS;
if(shots)mkdirSync(shots,{recursive:true});
const bundle=await build({
 stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import React from 'react';import{createRoot}from'react-dom/client';
  import Footer from './app/components/footer';
  import{ANALYTICS_CONSENT_SETTINGS_EVENT}from './app/lib/gtm';
  window.cookieSettingsOpened=0;window.addEventListener(ANALYTICS_CONSENT_SETTINGS_EVENT,()=>window.cookieSettingsOpened++);
  createRoot(document.getElementById('root')).render(<div className="footer-frame"><Footer/></div>);
 `},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env':'{"NODE_ENV":"production"}'},
 plugins:[{name:'footer-local-links',setup(b){
  b.onResolve({filter:/^next\/image$|^app\/components\/SmartLink$/},a=>({path:a.path,namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({loader:'tsx',resolveDir:process.cwd(),contents:path==='next/image'
   ?`import React from 'react';export default({quality,priority,fetchPriority,unoptimized,...props})=><img {...props}/>;`
   :`import React from 'react';export default({prefetch,prefetchOnIntent,prefetchOnViewport,...props})=><a {...props}/>;`
  }));
 }}],
});
const server=http.createServer((req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
 if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(readFileSync('public/styles/dev-site.css'));return;}
 const asset=path.join(process.cwd(),'public',new URL(req.url,'http://fixture').pathname);
 if(existsSync(asset)&&/\.(webp|svg)$/.test(asset)){res.setHeader('content-type',asset.endsWith('.svg')?'image/svg+xml':'image/webp');res.end(readFileSync(asset));return;}
 res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
const issues=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce',timezoneId:'America/New_York'});
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.clock.install({time:new Date('2026-11-01T13:59:00Z')});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByText('Працюємо зараз',{exact:true}).waitFor();
 await page.clock.fastForward(120000);
 await page.getByText('Зараз зачинено',{exact:true}).waitFor();
 const expected=['/','/katalog','/auto','/groups','/manufacturers','/inform/about','/inform/delivery','/inform/payment','/inform/returns','/inform/diagnostics','/blog','/inform/location','/inform/privacy','/editorial-policy','tel:+380634211851','mailto:romaniukbboogg@gmail.com','https://viber.me/380634211851'];
 const hrefs=await page.locator('footer a').evaluateAll(a=>a.map(x=>x.getAttribute('href')));
 for(const href of expected)assert(hrefs.includes(href),`Preserve footer destination ${href}`);
 assert(hrefs.some(href=>href.startsWith('https://t.me/')),'Working Telegram destination');
 assert(!hrefs.some(href=>!href||href==='#'),'Every link has a destination');
 await page.getByRole('button',{name:'Налаштувати cookies',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.cookieSettingsOpened),1,'Cookie settings action works');
 for(const width of [320,360,390,640,768,820,1024,1280,1440,1920,2560,3840]){
  await page.setViewportSize({width,height:1000});
  await page.waitForTimeout(50);
  const info=await page.locator('footer').evaluate(e=>{
   const r=e.getBoundingClientRect(),errors=[];
   if(document.documentElement.scrollWidth>innerWidth+1)errors.push('page overflow');
   if(e.scrollWidth>e.clientWidth+1)errors.push('footer overflow');
   for(const x of e.querySelectorAll('a,button')){
    const b=x.getBoundingClientRect();if(!b.width||!b.height)continue;
    if(b.left<r.left-1||b.right>r.right+1)errors.push(`outside footer: ${x.textContent}`);
    if(b.height<43)errors.push(`small target: ${x.textContent} ${b.height}`);
   }
   const reserved=parseFloat(getComputedStyle(e).getPropertyValue('--footer-reserved-height'));
   if(r.height>reserved+1)errors.push(`placeholder grows ${Math.round(r.height-reserved)}px`);
   return{height:Math.ceil(r.height),reserved,errors};
  });
  issues.push(...info.errors.map(e=>`${width}px: ${e}`));console.log(JSON.stringify({width,...info}));
  if(shots&&[320,390,1440,2560].includes(width))await page.locator('footer').screenshot({path:`${shots}/footer-${width}.png`});
 }
 await page.setViewportSize({width:1440,height:1000});
 const call=page.locator('.site-footer-call');await call.focus();
 assert(await call.evaluate(e=>parseFloat(getComputedStyle(e).outlineWidth)>=2),'Visible keyboard focus');
 const before=await call.boundingBox();await call.hover();assert.deepEqual(await call.boundingBox(),before,'Hover keeps the contact target still');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(300);
 assert.equal(await page.locator('footer').evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0,'No continuous footer animation');
 assert.deepEqual(pageErrors,[]);assert.deepEqual(issues,[]);
 console.log('PASS footer: destinations, cookies, Kyiv hours, keyboard, stable hover, 44px controls and 320–3840px layouts');
}finally{await browser.close();await new Promise(r=>server.close(r));stop();}
