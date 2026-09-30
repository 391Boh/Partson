import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
 const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page = await context.newPage();
 await page.route('**/api/manufacturer-counts', route => route.fulfill({json:{clientProducers:Array.from({length:24},(_,i)=>({label:`Brand ${String(i+1).padStart(2,'0')}`,logoPath:null,description:'Виробник',productCount:10,groupsCount:2}))}}));
 await page.goto('http://localhost:3000/',{waitUntil:'domcontentloaded'});
 const section=page.locator('.home-slot-brands');await section.scrollIntoViewIfNeeded();
 const rail=section.getByRole('region',{name:'Сторінки виробників'});await rail.waitFor();await rail.scrollIntoViewIfNeeded();
 const read=()=>rail.evaluate(e=>({left:e.scrollLeft,width:parseFloat(getComputedStyle(e.querySelector('[data-brand-page]')).width),touch:getComputedStyle(e).touchAction}));
 const touch = (await read()).touch; assert.ok(touch.includes('pan-x') || ['auto', 'manipulation'].includes(touch), touch);
 const cdp=await context.newCDPSession(page);
 const swipe=async()=>{
  const box=await rail.boundingBox();const x=box.x+box.width-35,y=box.y+65;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let step=1;step<=8;step++) {await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-(box.width-70)*step/8,y}]});await page.waitForTimeout(35);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(700);
 };
 console.log('Checking swipe'); await swipe();let state=await read();assert.ok(Math.abs(state.left-state.width)<4,JSON.stringify(state));
 assert.equal(await section.getByRole('button',{name:'Закрити деталі виробника'}).count(),0,'Swipe must not select a brand');
 console.log('Checking restore'); await rail.locator('[data-brand-page]').nth(1).getByRole('link').first().tap();
 await section.getByRole('button',{name:'Закрити деталі виробника'}).tap();await rail.waitFor();await page.waitForTimeout(400);
 state=await read();assert.ok(Math.abs(state.left-state.width)<4,'Restore selected page after details');
 console.log('Checking rotation'); await page.setViewportSize({width:768,height:600});await page.waitForTimeout(400);
 state=await read();assert.ok(Math.abs(state.left-state.width)<4,'Keep page aligned after rotation');
 console.log('Checking search'); await section.getByRole('button',{name:'Пошук виробника',exact:true}).tap();
 const input=section.getByRole('textbox',{name:'Пошук виробника'});await input.fill('Brand 24');await page.waitForTimeout(400);
 assert.equal(await rail.getByRole('link',{name:'Обрати Brand 24'}).count(),1);
 assert.equal(Math.round((await read()).left),0,'Search resets pagination');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow');
 console.log('Mobile brands passed: native touch swipe, no accidental selection, page restoration, rotation, search and viewport overflow.');
} catch (error) { console.error(error); throw error; } finally { await browser.close(); }
