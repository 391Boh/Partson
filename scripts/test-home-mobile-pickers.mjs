import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.argv[2]||'./test-browser.mjs');
const origin=process.env.TEST_ORIGIN;
assert(origin,'Set TEST_ORIGIN to a chosen local preview.');
const shots=process.env.HOME_PICKER_SCREENSHOTS;
if(shots)await mkdir(shots,{recursive:true});
const models=Array.from({length:20},(_,i)=>`Модель ${i+1} Touring з довгою назвою`);
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:390,height:900}});
 await page.route('**/api/proxy?**',r=>{
  const u=new URL(r.request().url()),endpoint=u.searchParams.get('endpoint');
  if(endpoint==='getprod')return r.fulfill({json:Array.from({length:16},(_,i)=>({name:`Категорія деталей ${i+1}`,children:[{name:`Підгрупа деталей ${i+1}`,children:[]}]}))});
  if(endpoint!=='getauto')return r.continue();
  const q=JSON.parse(u.searchParams.get('q')||'{}');
  const data=q['Рік']?Array.from({length:18},(_,i)=>({'Обєм':String(1+i/10),'Потужність':110+i,'Коробка':'МКПП','Привід':'FWD','РікПочаток':2020,'РікКінець':2025})):q['Модель']?[{'РікПочаток':2020,'РікКінець':2025}]:models.map(model=>({'Модель':model,'РікПочаток':2020,'РікКінець':2025}));
  return r.fulfill({json:data});
 });
 await page.route('**/api/model-years',r=>r.fulfill({json:{yearOptions:[2020,2021,2022,2023,2024,2025],modelYearMap:Object.fromEntries(models.map(m=>[m,[{start:2020,end:2025}]]))}}));
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Лише необхідні',exact:true}).click({timeout:1500}).catch(()=>{});
 if(shots){await page.evaluate(async()=>{await document.fonts.ready});await page.screenshot({path:`${shots}/hero-390.png`});}
 const failures=[];
 const checkGrid=async(slot,label)=>{
  const problems=await slot.evaluate(e=>{
   const issues=[];
   for(const rail of e.querySelectorAll('[data-home-paged-grid]')){
    if(rail.querySelectorAll(':scope > div > [data-home-page-active]').length!==1)issues.push('active page count');
    if(rail.scrollWidth>rail.clientWidth+1)issues.push(`horizontal rail ${rail.scrollWidth}/${rail.clientWidth}`);
    const active=rail.querySelector('[data-home-page-active]');
    if(active){const r=active.getBoundingClientRect();for(let parent=rail.parentElement;parent&&e.contains(parent);parent=parent.parentElement){const s=getComputedStyle(parent),p=parent.getBoundingClientRect();if(['hidden','clip'].includes(s.overflowY)&&(r.top<p.top-2||r.bottom>p.bottom+2))issues.push(`clipped grid ${String(parent.className).slice(0,60)}`);}}
   }
   for(const x of e.querySelectorAll('*')){const s=getComputedStyle(x);if(x.clientHeight&&['auto','scroll'].includes(s.overflowY)&&x.scrollHeight>x.clientHeight+1)issues.push(`vertical scroll ${String(x.className).slice(0,60)}`);if(x.clientHeight&&x.clientWidth&&['auto','scroll'].includes(s.overflowX)&&x.scrollWidth>x.clientWidth+1)issues.push(`horizontal scroll ${String(x.className).slice(0,60)}`);}
   if(document.documentElement.scrollWidth>innerWidth+1)issues.push('page overflow');
   return issues;
  });failures.push(...problems.map(p=>label+': '+p));
 };
 for(const name of ['auto','product','brands']){
  const slot=page.locator('.home-slot-'+name);await slot.scrollIntoViewIfNeeded();await slot.locator('[data-home-paged-grid]').waitFor();
  for(const width of [320,390,640,767]){
   await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
   await checkGrid(slot,`${name} ${width}`);
   assert(await slot.locator('.home-description').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
   const before=await slot.locator('[data-home-page-active]').innerText();
   const next=slot.locator('.section-pagination').getByRole('button',{name:/Наступн/});
   await next.click();await page.waitForTimeout(100);
   assert.notEqual(await slot.locator('[data-home-page-active]').innerText(),before,`${name}: next page at ${width}`);
   await checkGrid(slot,`${name} next ${width}`);
   if(shots&&width===390)await slot.screenshot({path:`${shots}/${name}-390.png`});
   await slot.locator('.section-pagination').getByRole('button',{name:'Попередня сторінка',exact:true}).click();
  }
  // Returning to a native rail must retain the selected page and scroll position.
  await slot.locator('.section-pagination').getByRole('button',{name:'Наступна сторінка',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(150);
  const aligned=await slot.locator('[data-home-paged-grid]').evaluate(e=>{const active=e.querySelector('[data-home-page-active]');return Math.abs(active.getBoundingClientRect().left-e.getBoundingClientRect().left)<3});
  assert(aligned,`${name}: desktop rail aligns to selected page after resize`);
  await page.setViewportSize({width:390,height:900});await page.waitForTimeout(100);await checkGrid(slot,`${name} restored phone`);
 }
 const auto=page.locator('.home-slot-auto');await auto.scrollIntoViewIfNeeded();
 await auto.getByRole('button',{name:'Пошук марки',exact:true}).click();await auto.getByRole('textbox',{name:'Пошук марки',exact:true}).fill('BMW');await auto.getByRole('button',{name:'Обрати BMW',exact:true}).click();
 await auto.locator('.vehicle-model-choice').first().waitFor();await checkGrid(auto,'models');
 assert(await auto.locator('.home-model-year-mobile select').isVisible(),'Phone years use a select without a scrolling rail');
 const first=await auto.locator('[data-home-page-active]').innerText();await auto.locator('.vehicle-model-next').click();await page.waitForTimeout(100);assert.notEqual(await auto.locator('[data-home-page-active]').innerText(),first);await checkGrid(auto,'models next');
 if(shots)await auto.screenshot({path:`${shots}/models-390.png`});
 await auto.locator('.vehicle-model-choice:visible').first().click();await auto.locator('.vehicle-mod-choice[data-kind="year"]').filter({hasText:'2021'}).click();await auto.locator('.vehicle-mod-choice:not([data-kind="year"])').first().waitFor();await checkGrid(auto,'modifications');
 const optionBefore=await auto.locator('[data-home-page-active]').innerText();
 await auto.locator('.vehicle-mod-options').getByRole('button',{name:'Наступна сторінка',exact:true}).click();
 await page.waitForTimeout(100);assert.notEqual(await auto.locator('[data-home-page-active]').innerText(),optionBefore);await checkGrid(auto,'modifications next');
 assert.deepEqual(failures,[]);
 console.log('PASS home pickers: mobile grids without inner scroll, readable copy, pagination, desktop resize, model and modification steps');
} finally {await browser.close();}
