import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
const productPath = process.env.TEST_PRODUCT_PATH || '/product/filtr-povitryanyy-megane-02-af1912';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {for(const width of [320,390,768,1440]) {
 const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});
 await page.goto(`${origin}${productPath}`,{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('.product-pinned-controls').waitFor({timeout:45000});
 for(const admin of [false,true]) {
 // Exercise admin geometry with a local fixture; no credentials or writes.
 if(admin) await page.evaluate(()=>{const bar=document.createElement('div');bar.className='product-admin-bar';bar.innerHTML='<button class="product-admin-bar-toggle" style="height:36px;width:100%">Адмін · Редагувати</button>';document.querySelector('.product-admin-slot').append(bar)});
 if(width<768){
 const positions=[];
 for(const y of [400,650,1000,700,450]) {
 await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await page.waitForTimeout(120);
 positions.push(await page.locator('.product-pinned-controls').evaluate(e=>({y:e.getBoundingClientRect().y,nav:e.querySelector('nav').getBoundingClientRect().y,bar:e.querySelector('.product-admin-bar')?.getBoundingClientRect().bottom})));
 }
 for(const pos of positions){assert(Math.abs(pos.y-64)<1,JSON.stringify(pos));if(admin)assert(Math.abs(pos.nav-pos.bar)<1,'Navigation sits immediately below admin bar: '+JSON.stringify(pos));}
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
 }
 await page.screenshot({path:`/tmp/product-controls-${width}-${admin}.png`});
 console.log('PASS',width,admin?'admin fixture':'visitor');
 }
 await page.close();
}}finally{await browser.close()}
