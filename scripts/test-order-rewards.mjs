import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const { chromium } = await import(process.argv[2] || 'playwright');
const modelBuild = await build({entryPoints:['app/lib/order-rewards.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {ORDER_REWARDS,getOrderRewardProgress}=await import('data:text/javascript;base64,'+Buffer.from(modelBuild.outputFiles[0].text).toString('base64'));
assert.deepEqual(ORDER_REWARDS.map(r=>r.threshold),[2000,5000,10000,25000,50000,100000]);
for(let i=0;i<ORDER_REWARDS.length;i++){
 const reward=ORDER_REWARDS[i];
 assert.equal(getOrderRewardProgress(reward.threshold-.01).earned.length,i);
 const exact=getOrderRewardProgress(reward.threshold);
 assert.equal(exact.earned.length,i+1);
 assert.equal(exact.current.id,reward.id);
 assert.equal(exact.progress,i===ORDER_REWARDS.length-1?100:0);
}
for(const value of [-50,NaN,Infinity])assert.equal(getOrderRewardProgress(value).earned.length,0);
const halfway=getOrderRewardProgress(7500);assert.equal(halfway.remaining,2500);assert.equal(halfway.progress,50);
assert.equal(getOrderRewardProgress(125000).next,null);
console.log('PASS reward boundaries, money precision, invalid totals, between-tier progress and highest tier');
const fixture=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Rewards from './app/components/ProfileOrderRewards';const amount=new URLSearchParams(location.search).get('amount');function App(){const[state,setState]=React.useState(amount==='error'?'error':amount==='loading'?'loading':'ready');return <div className="customer-window customer-overlay-panel app-overlay-panel soft-modal-shell" style={{top:8,left:8,right:8,maxWidth:740}}><div className="soft-panel-content"><Rewards totalSpent={state==='ready'?Number(amount)||0:null} status={state} onRetry={()=>setState('ready')}/></div></div>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture.outputFiles[0].text)}else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(readFileSync('public/styles/dev.css'))}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>')}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const width of [320,390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  for(const [amount,earned]of[[0,0],[1999.99,0],[2000,1],[7500,2],[100000,6]]){
   await page.goto(`http://127.0.0.1:${server.address().port}/?amount=${amount}`);
   await page.getByText('Мої нагороди',{exact:true}).waitFor();const disclosure=page.locator('.profile-rewards-disclosure');assert.equal(await disclosure.getAttribute('open'),null);assert.equal(await page.getByRole('list',{name:'Нагороди за суму замовлень'}).isVisible(),false);const collapsed=await page.locator('.profile-rewards').boundingBox();assert(collapsed.height<180,'Collapsed rewards must stay compact');await page.locator('.profile-rewards-summary').click();assert(await page.getByRole('list',{name:'Нагороди за суму замовлень'}).isVisible());
   assert.equal(await page.locator('[data-unlocked="true"]').count(),earned);
   assert.equal(await page.locator('[data-unlocked="false"]').count(),6-earned);
   assert(await page.locator('.profile-rewards').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(amount===7500){await page.screenshot({path:`/tmp/order-rewards-expanded-${width}.png`});await page.locator('.profile-rewards-summary').click();await page.screenshot({path:`/tmp/order-rewards-collapsed-${width}.png`});}
  }
  await page.goto(`http://127.0.0.1:${server.address().port}/?amount=loading`);
  assert.equal(await page.getByRole('progressbar').count(),0,'Loading must not show a zero balance');
  await page.goto(`http://127.0.0.1:${server.address().port}/?amount=error`);
  await page.getByRole('button',{name:'Повторити'}).click();
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'0');
  console.log(`PASS ${width}px: earned/locked states, mobile layout, loading, error and retry`);
  await page.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
