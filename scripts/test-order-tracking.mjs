import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

const directory = await mkdtemp(path.join(process.cwd(), '.cache/tracking-test-'));
const state = { admin: true, exists: true, deliveryMethod: 'Нова Пошта', writes: [] };
globalThis.trackingTestState = state;
try {
  const outfile = path.join(directory, 'route.cjs');
  await build({ entryPoints: ['app/api/orders/tracking/route.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile,
    plugins: [{ name: 'tracking-auth-db', setup(build) {
      build.onResolve({filter:/^(app\/api\/_lib\/admin-auth|app\/lib\/firebase-admin|firebase-admin\/firestore)$/}, args => ({path:args.path,namespace:'mock'}));
      build.onLoad({filter:/.*/,namespace:'mock'}, ({path}) => ({contents:
        path.includes('admin-auth') ? 'export const verifyAdminRequest = async () => globalThis.trackingTestState.admin ? {uid:"admin", email:"admin@example.test"} : null;' :
        path==='firebase-admin/firestore' ? 'export const FieldValue={serverTimestamp:()=>"server-time"};' :
        `export const getFirebaseAdminDb=()=>({collection:name=>{if(name!=="orders")throw Error("Wrong collection");return {doc:id=>({id})}},runTransaction:async fn=>fn({get:async()=>({exists:globalThis.trackingTestState.exists,data:()=>({deliveryMethod:globalThis.trackingTestState.deliveryMethod})}),update:(ref,patch)=>globalThis.trackingTestState.writes.push({ref,patch})})});` }));
    }}],
  });
  const { POST } = createRequire(import.meta.url)(outfile);
  const request = (body) => new Request('http://localhost/api/orders/tracking', {method:'POST',body:JSON.stringify(body)});
  const input = {orderId:'order-123', trackingNumber:'2040 1234 5678 90'};
  state.admin=false; assert.equal((await POST(request(input))).status,401); assert.equal(state.writes.length,0);
  state.admin=true;
  for(const trackingNumber of ['123','1234567890123X',12345678901234,'1'.repeat(65)]) assert.equal((await POST(request({...input,trackingNumber}))).status,400);
  assert.equal((await POST(request({...input,orderId:'orders/other'}))).status,400);
  state.deliveryMethod='Самовивіз'; assert.equal((await POST(request(input))).status,409); assert.equal(state.writes.length,0);
  state.deliveryMethod='Нова Пошта';state.exists=false;assert.equal((await POST(request(input))).status,404);
  state.exists=true;const response=await POST(request(input));assert.equal(response.status,200);assert.equal((await response.json()).trackingNumber,'20401234567890');
  assert.deepEqual(state.writes[0],{ref:{id:'order-123'},patch:{trackingNumber:'20401234567890',trackingUpdatedAt:'server-time',trackingUpdatedBy:'admin'}});
  await POST(request({...input,trackingNumber:''}));assert.equal(state.writes[1].patch.trackingNumber,null);
  console.log('Tracking API passed: admin authorization, format, delivery method, missing order, normalization, clear, status preservation.');

  const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Editor from './app/components/OrderTrackingEditor';createRoot(document.getElementById('root')).render(<Editor orderId="order-123" onSaved={value=>window.savedTracking=value}/>);`},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'tracking-token',setup(build){build.onResolve({filter:/^app\/lib\/get-admin-token$/},args=>({path:args.path,namespace:'mock'}));build.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const getAdminIdToken=async()=>"test-token";'}));}}]});
  const bundle=result.outputFiles[0].text;const css=await readFile('public/styles/dev.css');let fail=false;const writes=[];
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);return;}
    if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
    if(req.url==='/api/orders/tracking'){
      assert.equal(req.headers.authorization,'Bearer test-token');let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);writes.push(body);res.setHeader('Content-Type','application/json');setTimeout(()=>{res.statusCode=fail?500:200;res.end(JSON.stringify(fail?{ok:false,error:'Save failed'}:{ok:true,trackingNumber:body.trackingNumber||null}));},200);return;
    }
    res.setHeader('Content-Type','text/html');res.end('<html lang="uk"><link rel="stylesheet" href="/style.css"><body style="background:#0f172a;padding:16px"><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {chromium}=await import(process.argv[2]||'playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
  try {for(const width of [390,1440]){
    writes.length=0;fail=false;const page=await browser.newPage({viewport:{width,height:600}});await page.goto(`http://127.0.0.1:${server.address().port}`);
    const field=page.getByLabel('ТТН Нової Пошти');const save=page.getByRole('button',{name:'Зберегти ТТН',exact:true});await field.fill('123');await save.click();await page.getByRole('alert').waitFor();assert.equal(writes.length,0);
    await field.fill('2040 1234 5678 90');await save.click();await page.getByRole('status').waitFor();assert.equal(writes.length,1);assert.equal(writes[0].trackingNumber,'20401234567890');assert.equal(await page.evaluate(()=>window.savedTracking),'20401234567890');assert.equal(await save.isDisabled(),true);assert((await page.getByRole('link').getAttribute('href')).startsWith('https://tracking.novaposhta.ua/'));
    fail=true;await field.fill('20401234567891');await save.click();await page.getByRole('alert').waitFor();assert.equal(await field.inputValue(),'20401234567891');assert.equal(await page.evaluate(()=>window.savedTracking),'20401234567890');fail=false;await save.click();await page.getByRole('status').waitFor();assert.equal(await page.evaluate(()=>window.savedTracking),'20401234567891');
    await field.fill('');await save.click();await page.getByRole('status').waitFor();assert.equal(await page.evaluate(()=>window.savedTracking),null);assert.equal(await page.getByRole('link').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.close();console.log(`Tracking editor passed at ${width}px: validation, save, failure retry, clear, tracking link, layout.`);
  }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}finally{delete globalThis.trackingTestState;await rm(directory,{recursive:true,force:true});}
