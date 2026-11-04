// Exercise the real image state machine and batch client with one held chunk.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {build,stop} from 'esbuild';
import sharp from 'sharp';
const {chromium}=await import(process.argv[2]||'./test-browser.mjs');
const fixture=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import Image from './app/components/ProductCardImage';import{fetchCatalogImageBatch}from'./app/lib/product-image-batch-client';import{buildProductImageBatchKey,buildProductImagePath}from'./app/lib/product-image-path';
 const items=Array.from({length:12},(_,i)=>({code:'PAINT-'+i,article:'A'+i,hasPhoto:true}));
 function App(){const[photos,setPhotos]=useState({});useEffect(()=>{window.progress=[];window.batchDone=false;fetchCatalogImageBatch(items,{onProgress:results=>{window.progress.push(...results);setPhotos(prev=>({...prev,...Object.fromEntries(results.filter(r=>r.status==='ready').map(r=>[r.key,r.src]))}))}}).then(()=>{window.batchDone=true})},[]);return <main><div className="paint-grid">{items.map(item=><section className="image-cell" key={item.code}><Image productCode={item.code} articleHint={item.article} alt={item.code} hasKnownPhoto prefetchedSrc={photos[buildProductImageBatchKey(item.code,item.article)]} disableDirectLoad={!photos[buildProductImageBatchKey(item.code,item.article)]}/></section>)}</div><div id="after-images">Після фото</div></main>}
 createRoot(document.getElementById('root')).render(<App/>);
 `},bundle:true,platform:'browser',write:false,jsx:'automatic',define:{'process.env':'{"NODE_ENV":"production"}'},plugins:[{name:'native-image',setup(b){b.onResolve({filter:/^next\/image$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'tsx',resolveDir:process.cwd(),contents:`import React,{forwardRef}from'react';export default forwardRef(function Image({fill,sizes,quality,unoptimized,priority,...props},ref){return <img {...props} ref={ref} style={{...props.style,...(fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:{})}}/>})`}))}}]});
const png=await sharp({create:{width:80,height:80,channels:3,background:'#0c8897'}}).png().toBuffer();
const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(fixture.outputFiles[0].contents)}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(readFileSync('public/styles/dev-site.css'))}else{res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{margin:0}.paint-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:12px}.image-cell{height:120px;min-width:0}@media(max-width:639px){.paint-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}</style><div id="root"></div><script src="/bundle.js"></script>')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'});const requested=[];let releaseSlow;const slowGate=new Promise(r=>{releaseSlow=r});
 await page.route('**/api/catalog-image-batch',async route=>{const{items}=route.request().postDataJSON();if(items.some(i=>i.code==='PAINT-4'))await slowGate;await route.fulfill({json:{items:items.map(item=>({...item,key:`${item.code.toLowerCase()}::${item.article.toLowerCase()}`,status:'ready',src:`/product-image/${item.code}?iv=5&catalog=1&article=${item.article}`}))}})});
 let releaseImages;const imageGate=new Promise(r=>{releaseImages=r});
 await page.route('**/product-image/PAINT-*',async route=>{const url=new URL(route.request().url());requested.push(url);await imageGate;if(url.pathname.endsWith('PAINT-4')&&!url.searchParams.has('retry'))return route.fulfill({status:503,body:''});return route.fulfill({contentType:'image/png',body:png})});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.image-cell').first().waitFor();
 const geometry=()=>page.evaluate(()=>({after:document.querySelector('#after-images').getBoundingClientRect().top,boxes:[...document.querySelectorAll('.image-cell')].map(e=>e.getBoundingClientRect().height)}));const before=await geometry();releaseImages();
 await page.waitForFunction(()=>window.progress.length===8);assert.equal(await page.evaluate(()=>window.batchDone),false);
 await page.waitForFunction(()=>[...document.querySelectorAll('.image-cell img')].filter(img=>img.complete&&img.naturalWidth>0&&!img.classList.contains('opacity-0')).length===12);
 assert.equal(await page.evaluate(()=>window.batchDone),false,'Visible fallback paints before the stalled batch completes');assert.deepEqual(await geometry(),before,'Decoding and fallback preserve image geometry');
 const beforeRelease=requested.length;releaseSlow();await page.waitForFunction(()=>window.batchDone);await page.waitForTimeout(150);
 assert.equal(requested.length,beforeRelease,'Late batch does not restart decoded images');assert.equal(requested.filter(u=>u.pathname.endsWith('PAINT-4')&&!u.searchParams.has('retry')).length,1);assert.equal(requested.filter(u=>u.pathname.endsWith('PAINT-4')&&u.searchParams.has('retry')).length,1);
 assert.equal(await page.locator('.catalog-image-loading').count(),0);assert.deepEqual(await geometry(),before);console.log(`PASS image paint ${width}px: ready chunks, visible fallback, 503 recovery, stable boxes, no duplicate request after late batch`);await page.close();
}}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));stop()}
