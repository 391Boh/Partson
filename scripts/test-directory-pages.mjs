// Local preview only: readonly checks of the shared directory paths.
import assert from 'node:assert/strict';
import{mkdirSync}from'node:fs';
const{chromium}=await import(process.argv[2]||'./test-browser.mjs');
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
const browser=await chromium.launch({channel:'chrome',headless:true});
mkdirSync('output/directories',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.addCookies(['partson_analytics_consent','partson_advertising_consent'].map(name=>({name,value:'denied',url:base})));
 const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=async(path,name)=>{
  const response=await page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded',timeout:45000});assert.equal(response.status(),200,name);
  await page.locator('.directory-loading-list').waitFor({state:'hidden',timeout:20000});
  // /groups lists every category at once; the other hubs page their lists.
  const hub=new URL(path,base).pathname;if(hub==='/groups')await page.locator('.group-category-card').first().waitFor();else if(hub.split('/').filter(Boolean).length===1)await page.locator('.directory-pagination-summary').first().waitFor();
  await page.locator('h1:visible').first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
  assert.equal(await page.locator('h1:visible').count(),1,name+' has one heading');assert.equal(await page.locator('.directory-assist').count(),1,name+' has contextual help');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' fits');
  assert(await page.locator('link[rel=canonical]').getAttribute('href'),name+' has a canonical');
  await page.screenshot({path:`output/directories/${name}.png`});console.log('PASS directory page',name,path);
 };
 await check('/auto','auto-desktop');
 await check('/groups','groups-desktop');
 await check('/manufacturers','manufacturers-desktop');
 if(process.env.DIRECTORY_DETAIL_SMOKE==='1'){
  await check('/auto/bmw','brand-desktop');const model=page.locator('a.directory-entry[href^="/auto/"]').first();if(await model.count())await check(await model.getAttribute('href'),'model-desktop');
  await check('/groups','groups-detail-start');const groupPath=await page.locator('a.group-category-card__link').first().getAttribute('href');await check(groupPath,'group-desktop');const child=page.locator('a.cat-group-head').first();if(await child.count())await check(await child.getAttribute('href'),'category-desktop');
  await check('/manufacturers','manufacturers-detail-start');await page.locator('.directory-search-input').first().fill('BOSCH');await page.waitForTimeout(200);const manufacturer=page.locator('a.directory-entry[href^="/manufacturers/"]').first();if(await manufacturer.count())await check(await manufacturer.getAttribute('href'),'manufacturer-desktop');
 }
 await page.setViewportSize({width:390,height:950});for(const[path,name]of[['/auto','auto-phone'],['/groups','groups-phone'],['/manufacturers','manufacturers-phone']])await check(path,name);
 await page.locator('.directory-assist').scrollIntoViewIfNeeded();await page.screenshot({path:'output/directories/help-phone.png'});
 assert.deepEqual(errors,[]);await context.close();
}finally{await browser.close()}
