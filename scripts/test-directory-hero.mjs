import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { build, stop } from 'esbuild';
import { buildCriticalCss } from './build-critical-css.mjs';
const { chromium } = await import(process.argv[2] || 'playwright');
const css = readFileSync('public/styles/dev-site.css');
assert(buildCriticalCss(css.toString(),'directory').css.includes('.directory-loading-list'),'Streamed loading shells are styled by the blocking critical stylesheet');
const result = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import CatalogHubHero from './app/components/CatalogHubHero';
    import CatalogDirectoryLoading from './app/components/CatalogDirectoryLoading';
    import {CarFront} from 'lucide-react';
    const content={
      auto:{title:'Підбір автозапчастин за маркою і моделлю авто',description:'Почніть із марки свого автомобіля. Далі оберіть модель і потрібну систему — наприклад, гальма або підвіску. Рік випуску, двигун та артикул допоможуть уточнити потрібну деталь.',anchor:'auto-brands-directory',label:'Усі марки'},
      groups:{title:'Категорії автозапчастин',description:'Оберіть потрібну систему автомобіля, потім групу чи підгрупу деталей. Звірте артикул і сумісність перед замовленням.',anchor:'groups-directory',label:'Усі категорії'},
      manufacturers:{title:'Виробники автозапчастин',description:'Оберіть виробника, щоб переглянути його запчастини за категоріями. Порівняйте асортимент, ціни й наявність та знайдіть потрібний артикул.',anchor:'manufacturers-directory',label:'Усі виробники'}
    };
    window.routePrefetches=[];window.__router={prefetch:(href,options)=>window.routePrefetches.push({href,kind:options.kind,time:performance.now()})};
    function App(){const [current,setCurrent]=useState('auto');window.navigateDirectory=next=>{history.pushState({},'', '/'+next);setCurrent(next)};const c=content[current];
      return location.search.includes('loading')?<CatalogDirectoryLoading current={current}/>:<main className="catalog-directory-page"><div className="catalog-hub-stage"><CatalogHubHero current={current} title={c.title} titleAccent={current==='auto'?'за маркою і моделлю авто':undefined} description={c.description} badge="" icon={CarFront} stats={[{label:current==='auto'?'Марок':'Розділів',value:'62',icon:CarFront}]} quickLinks={[{href:'#'+c.anchor,label:c.label,icon:CarFront,accent:true}]}/></div><section id={c.anchor} tabIndex={-1} style={{minHeight:500,margin:'24px auto',maxWidth:1260,padding:16}}><h2>Список каталогу</h2></section></main>;
    }
    const root=createRoot(document.getElementById('root'));window.removeHero=()=>root.unmount();root.render(<App/>);
  ` }, bundle:true, write:false, platform:'browser', jsx:'automatic', minify:true,
  define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'router-fixture',setup(b){
    b.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'tsx',resolveDir:process.cwd(),contents:path==='next/navigation'?'export const useRouter=()=>window.__router;':`import React from 'react';export default function Link({href,prefetch,children,...props}){return <a href={href} {...props} onClick={event=>{if(String(href).startsWith('/')&&!event.metaKey&&!event.ctrlKey){event.preventDefault();window.navigateDirectory(String(href).slice(1))}}}>{children}</a>;}`}));
  }}],
});
const publicRoot=path.resolve('public');
const server=http.createServer((request,response)=>{
  const pathname=new URL(request.url,'http://fixture.test').pathname;
  if(pathname==='/bundle.js'){response.setHeader('Content-Type','text/javascript');response.end(result.outputFiles[0].contents);}
  else if(pathname==='/style.css'){response.setHeader('Content-Type','text/css');response.end(css);}
  else if(pathname.startsWith('/fonts/')||pathname.startsWith('/images/directories/')){
    const file=path.resolve(publicRoot,'.'+pathname);
    if(!file.startsWith(publicRoot+path.sep)||!existsSync(file)){response.writeHead(404);response.end();return;}
    response.setHeader('Content-Type',file.endsWith('.webp')?'image/webp':'font/woff2');response.setHeader('Cache-Control','public,max-age=3600');response.end(readFileSync(file));
  }else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const findings=[];
  for(const width of [320,390,768,1440]){
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768});const page=await context.newPage();const errors=[];const photos=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/images/directories/'))photos.push(r.url());});
    await page.goto(base+'/auto');await page.waitForFunction(()=>window.routePrefetches.length===2);
    assert.deepEqual(await page.evaluate(()=>window.routePrefetches.map(r=>r.href).sort()),['/groups','/manufacturers'],'Only the two neighbouring directories are warmed');
    assert(photos.every(url=>width>960?!url.includes('-960.webp'):url.includes('-960.webp')),'Warm images and visible images select the same responsive source');
    for(const section of ['auto','groups','manufacturers']){
      if(section!=='auto')await page.getByRole('link',{name:section==='groups'?'Категорії':'Виробники',exact:true}).click();
      await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);
      const geometry=await page.evaluate(()=>{const nav=document.querySelector('.directory-section-nav').getBoundingClientRect(),hero=document.querySelector('.directory-intro').getBoundingClientRect();return{fits:document.documentElement.scrollWidth<=innerWidth+1,navInside:nav.left>=0&&nav.right<=innerWidth+1,links:[...document.querySelectorAll('.directory-section-nav>a')].map(el=>{const b=el.getBoundingClientRect();return{height:b.height,textFits:el.scrollWidth<=el.clientWidth+1,inside:b.left>=nav.left&&b.right<=nav.right+1};}),headingInside:document.querySelector('h1').getBoundingClientRect().right<=hero.right+1,mask:getComputedStyle(document.querySelector('.directory-hero-photo')).maskImage};});
      if(!(geometry.fits&&geometry.navInside&&geometry.headingInside&&geometry.links.every(b=>b.height>=44&&b.textFits&&b.inside)))findings.push(`${width}px ${section}: ${JSON.stringify(geometry)}`);
      assert(geometry.mask.includes('linear-gradient'),'The photograph has real gradient transparency');
      assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('.directory-section-nav [aria-current="page"]').getAttribute('href'),'/'+section);
      if(width>=768){
        const inactive=page.locator('.directory-section-nav>a:not([aria-current])').first();const before=await inactive.boundingBox();const paint=await inactive.evaluate(el=>getComputedStyle(el).backgroundImage);
        await inactive.hover();await page.waitForTimeout(220);const after=await inactive.boundingBox();
        assert(Math.abs(after.x-before.x)<.5&&Math.abs(after.y-before.y)<.5&&Math.abs(after.width-before.width)<.5,'Hover keeps navigation hit areas still');
        assert.equal(await inactive.evaluate(el=>getComputedStyle(el).backgroundImage),paint,'Hover fades its overlay without swapping the background');
      }
      await page.keyboard.press('Tab');const active=page.locator('.directory-section-nav [aria-current="page"]');await active.focus();assert.equal(await active.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
      if(width===390||width===1440)await page.screenshot({path:`/tmp/partson-directory-hero-${section}-${width}.png`});
    }
    await page.emulateMedia({reducedMotion:'reduce'});if(await page.locator('.directory-section-nav>a').first().evaluate(el=>getComputedStyle(el).transitionDuration)!=='0s')findings.push(width+'px reduced-motion transition');
    assert.deepEqual(errors,[]);console.log(`CHECK directory hero ${width}px: three sections, gradient photo, 44px targets, no overflow, keyboard focus, reduced motion and two warm routes`);await context.close();
  }
  for(const preference of ['saveData','offline','hidden','unmount']){
    const context=await browser.newContext();const page=await context.newPage();
    await page.addInitScript(preference=>{if(preference==='saveData')Object.defineProperty(navigator,'connection',{value:{saveData:true,effectiveType:'4g'},configurable:true});if(preference==='offline')Object.defineProperty(navigator,'onLine',{value:false,configurable:true});if(preference==='hidden')Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true});},preference);
    await page.goto(base+'/auto');if(preference==='unmount')await page.evaluate(()=>window.removeHero());await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(()=>window.routePrefetches.length),0,preference+' cancels optional navigation work');await context.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:900}});await page.goto(base+'/auto?loading');assert.equal(await page.locator('main').getAttribute('aria-busy'),'true');assert.equal(await page.getByRole('status').textContent(),'Завантаження автомобілів');assert.equal(await page.getByRole('link',{name:'Категорії',exact:true}).count(),1);await page.waitForTimeout(900);assert.equal(await page.evaluate(()=>window.routePrefetches.length),0,'The loading shell never competes with its pending page by warming other routes');await page.close();
  assert.deepEqual(findings,[]);
  console.log('PASS directory hero 320–1440px, three sections; warmup respects Save-Data/offline/hidden/unmount, and styled accessible loading shells leave pending pages priority');
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));stop();}
