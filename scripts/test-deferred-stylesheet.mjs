import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const { chromium } = await import(process.argv[2] || './test-browser.mjs');
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {loadDeferredUi} from './app/lib/deferred-stylesheet';
    function App(){
      const [Window,setWindow]=useState(null),[error,setError]=useState(''),[count,setCount]=useState(0);
      const load=()=>loadDeferredUi(()=>import('./app/components/Contact'));
      const open=async()=>{setError('');try{const module=await load();setWindow(()=>module.default)}catch(e){setError(e.message)}};
      return <><button id="open" onFocus={()=>void load().catch(()=>{})} onClick={open}>Відкрити</button>
        <button id="counter" onClick={()=>setCount(v=>v+1)}>{count}</button><p role="status">{error}</p>
        {Window&&<Window onClose={()=>setWindow(null)}/>}</>;
    } createRoot(document.getElementById('root')).render(<App/>);
  ` },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: {'process.env':'{"NODE_ENV":"production"}'},
  plugins: [{name:'offline-contact', setup(b){
    b.onResolve({filter:/^(firebase\/(auth|firestore)|\.\.\/\.\.\/firebase|app\/lib\/firebase-firestore)$/}, a=>({path:a.path,namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'}, ({path})=>({contents:path==='firebase/auth'
      ? 'export const getAuth=()=>({currentUser:null});export const onAuthStateChanged=(a,cb)=>{cb(null);return()=>{}};'
      : path==='firebase/firestore' ? 'export const doc=()=>({});export const getFirestore=()=>({});export const collection=()=>({});export const addDoc=()=>{throw Error("No cloud writes")};export const Timestamp={now:()=>({})};export const getDoc=async()=>({exists:()=>false});export const onSnapshot=(_,cb)=>{cb({exists:()=>false});return()=>{}};'
      : 'export const db={};export const app={};export const auth={currentUser:null};'}));
  }}],
});
const pending = new Set(); let requests=0, failNext=false;
const server = http.createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
  if(req.url==='/site.css'){res.setHeader('Content-Type','text/css');res.end(readFileSync('public/styles/dev-site.css'));return;}
  if(req.url==='/deferred.css'){
    requests++;
    if(failNext){failNext=false;res.writeHead(503);res.end();return;}
    pending.add(res);res.once('close',()=>pending.delete(res));return;
  }
  if(req.url?.startsWith('/fonts/')){res.end();return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="partson-deferred-css" content="/deferred.css"><link rel="stylesheet" href="/site.css"><script>window.__partsonCssReady=new Promise(resolve=>window.releaseBaseCss=resolve)</script><div id="root"></div><script src="/bundle.js"></script></html>');
});
const release=()=>{for(const res of pending){res.setHeader('Content-Type','text/css');res.end(readFileSync('public/styles/dev-deferred.css'));}pending.clear();};
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Fixture browser:',e.message)});
    const before=requests;
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#open').waitFor();assert.equal(requests,before,'Guest startup does not download window CSS');
    const cssRequest=page.waitForRequest('**/deferred.css');await page.locator('#open').focus();await cssRequest;
    await page.locator('#open').click();await page.waitForTimeout(100);
    assert.equal(await page.getByRole('dialog').count(),0,'A slow stylesheet never produces an unstyled window');
    await page.locator('#counter').click();assert.equal(await page.locator('#counter').textContent(),'1','Page stays interactive during the CSS request');
    assert.equal(requests,before+1,'Focus and click share one CSS request');
    release();await page.waitForTimeout(100);
    assert.equal(await page.getByRole('dialog').count(),0,'Windows also await shared storefront styles');
    await page.evaluate(()=>window.releaseBaseCss());await page.getByRole('dialog').waitFor();
    const bounds=await page.getByRole('dialog').boundingBox();assert(bounds.width<=width+1&&bounds.x>=0,'Window fits the viewport');
    assert(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    await page.screenshot({path:`/tmp/partson-deferred-${width}.png`});
    assert.deepEqual(errors,[]);await page.close();
  }
  const page=await browser.newPage();failNext=true;
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(()=>window.releaseBaseCss());
  // Programmatic activation avoids speculative focus preloading in this failure case.
  await page.locator('#open').evaluate(e=>e.click());
  await page.getByRole('status').filter({hasText:'Не вдалося'}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);
  const retry=page.waitForRequest('**/deferred.css');await page.locator('#open').evaluate(e=>e.click());await retry;
  release();await page.getByRole('dialog').waitFor();await page.close();
  console.log('PASS intent-only CSS, shared requests, styled mount, responsive windows, interactive pending state and failed-request retry');
} finally { release();await browser.close();await new Promise(resolve=>server.close(resolve)); }
