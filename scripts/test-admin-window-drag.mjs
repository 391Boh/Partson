import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const { chromium } = await import(process.argv[2] || './test-browser.mjs');

const result = await build({
  stdin: { contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import Catalog from './app/components/AdminCatalogWindow';
    import Group from './app/components/AdminGroupProductsDialog';
    function App() {
      const [open, setOpen] = useState(true);
      return <><div className="site-header-shell" style={{position:'fixed',top:0,height:64}}>PartsON</div>
        <button id="reopen" style={{position:'fixed',left:12,top:80}} onClick={()=>setOpen(true)}>Відкрити</button>
        {open && (location.search.includes('group')
          ? <Group group={{code:'g1',name:'Гальма',path:[]}} groups={[]}
              authorizedFetch={async()=>({products:[]})} onClose={()=>setOpen(false)} onMoved={()=>{}}/>
          : <Catalog onClose={()=>setOpen(false)}/>)}</>;
    }
    createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'offline-catalog', setup(build) {
    build.onResolve({filter:/^next\/dynamic$/}, args=>({path:args.path,namespace:'mock'}));
    build.onLoad({filter:/.*/,namespace:'mock'}, ()=>({contents:'export default () => () => null;'}));
  }}],
});
const css = readFileSync('public/styles/dev.css');
const server = http.createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].text);}
  else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);}
  else {res.setHeader('Content-Type','text/html');res.end('<html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({channel:'chrome',headless:true});
const near = (a,b,message) => assert(Math.abs(a-b)<2, `${message}: ${a} vs ${b}`);
try {
  for(const mode of ['catalog','group']) {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?${mode}`);
    const handle=page.locator('[data-admin-drag-handle]');await handle.waitFor();
    const panel=mode==='group'?page.getByRole('dialog'):page.locator('section[data-admin-overlay]');
    await page.waitForTimeout(300);
    const original=await panel.boundingBox();
    if(mode==='group') await page.getByRole('textbox',{name:'Пошук товару'}).fill('Незбережений пошук');
    const start=await handle.boundingBox();
    await page.mouse.move(start.x+80,start.y+20);await page.mouse.down();
    await page.mouse.move(start.x-20,start.y+40,{steps:8});await page.mouse.up();
    const moved=await panel.boundingBox();
    near(moved.x,original.x-100,'Header drag moves the actual window');
    assert(moved.y>=72,'Window stays below the site header');
    if(mode==='group') assert.equal(await page.getByRole('textbox',{name:'Пошук товару'}).inputValue(),'Незбережений пошук');
    await handle.focus();await page.keyboard.press('ArrowRight');
    near((await panel.boundingBox()).x,moved.x+10,'Keyboard movement');
    await page.keyboard.press('Home');
    near((await panel.boundingBox()).x,original.x,'Home restores original placement');
    const corner=panel.getByRole('button',{name:'Змінити розмір вікна'});
    // Grow left/up so right-anchored windows have usable room in the viewport.
    const nw=panel.locator('[data-admin-resize="nw"]');
    const grip=await nw.boundingBox();
    await page.mouse.move(grip.x+13,grip.y+13);await page.mouse.down();
    await page.mouse.move(grip.x-93,grip.y+47,{steps:8});await page.mouse.up();
    const stretched=await panel.boundingBox();
    assert(stretched.width>original.width+90,'Left edge grows the window');
    assert(stretched.height<original.height-30,'Top edge changes height');
    if(mode==='group') assert.equal(await page.getByRole('textbox',{name:'Пошук товару'}).inputValue(),'Незбережений пошук');
    await corner.focus();await page.keyboard.press('ArrowLeft');
    near((await panel.boundingBox()).width,stretched.width-10,'Keyboard resize');
    await page.keyboard.press('Home');
    near((await panel.boundingBox()).width,original.width,'Home restores original size');
    assert.equal(await panel.getAttribute('data-admin-window-sized'),null);
    const h=await handle.boundingBox();
    await page.mouse.move(h.x+80,h.y+20);await page.mouse.down();
    await page.mouse.move(-1000,-1000,{steps:8});await page.mouse.up();
    const bounded=await panel.boundingBox();assert(bounded.x>=7 && bounded.y>=71,'Cannot lose the header offscreen');
    await page.setViewportSize({width:1000,height:800});
    const resized=await panel.boundingBox();assert(resized.x>=0 && resized.x+resized.width<=1001,'Resize keeps window reachable');
    await page.screenshot({path:`/tmp/partson-admin-drag-${mode}-desktop.png`});
    // A header button must keep its click and must not begin a drag.
    const close=panel.getByRole('button',{name:mode==='catalog'?'Закрити каталог':'Закрити',exact:true});
    const button=await close.boundingBox();await page.mouse.move(button.x+10,button.y+10);await page.mouse.down();
    assert.equal(await panel.getAttribute('data-admin-dragging'),null);
    await page.mouse.up();await panel.waitFor({state:'detached'});
    await page.locator('#reopen').click();await handle.waitFor();
    assert.equal(await panel.evaluate(el=>el.style.translate),'','Reopening clears the old offset');
    assert.deepEqual(errors,[]);await page.close();

    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await mobile.goto(`http://127.0.0.1:${server.address().port}/?${mode}`);
    const mh=mobile.locator('[data-admin-drag-handle]');await mh.waitFor();
    await mh.focus();await mobile.keyboard.press('ArrowLeft');
    const mp=mode==='group'?mobile.getByRole('dialog'):mobile.locator('section[data-admin-overlay]');
    assert.equal(await mp.evaluate(el=>el.style.translate),'','Mobile layout stays docked');
    const rect=await mp.boundingBox();assert(rect.x>=0 && rect.x+rect.width<=391,'Mobile has no horizontal overflow');
    assert.equal(await mp.getByRole('button',{name:'Змінити розмір вікна'}).count(),0,'Desktop resize handles stay hidden on mobile');
    await mobile.screenshot({path:`/tmp/partson-admin-drag-${mode}-mobile.png`});
    await mobile.close();
  }
  console.log('Admin windows passed: pointer and keyboard movement, screen bounds, resize, preserved drafts, header buttons, reopen cleanup, desktop and mobile.');
} finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
