// Read-only homepage browsing regression; uses the site data, never writes products/orders.
import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.argv[3] || 'http://localhost:3000';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const width of [320,768,1440]){
 const p=await browser.newPage({viewport:{width,height:950}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(30000);
 await p.goto(origin,{waitUntil:'domcontentloaded'});await p.getByRole('button',{name:'Лише необхідні',exact:true}).click({timeout:3000}).catch(()=>{});
 for(const[kind,label]of[['auto','Пошук марки'],['product','Пошук категорії'],['brands','Пошук виробника']]){
  const s=p.locator('.home-slot-'+kind);await s.scrollIntoViewIfNeeded();await s.locator('.home-deferred-content.is-ready').waitFor();await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(350);
  const rail=await s.locator('.home-picker-rail').boundingBox();const results=await (kind==='brands'?s.locator('.home-brands-grid > :last-child'):s.locator('.home-picker-results')).boundingBox();assert(kind==='product' ? (width<768?results.y<rail.y:results.x<rail.x) : (width<768?rail.y<results.y:rail.x<results.x),`${width} ${kind} order`);
  const searchBox=await s.getByRole('button',{name:label,exact:true}).boundingBox();
  assert(searchBox && searchBox.width>=(width<768?88:100),`${width} ${kind} wider search`);
  assert.equal(await s.locator('.home-picker-rail .home-picker-trigger').count(),0);
  const carousel=s.locator('.home-picker-carousel').first();
  if(await carousel.count()){
   const navigation=carousel.locator('.section-pagination').first();
   const prev=await navigation.getByRole('button',{name:'Попередня сторінка',exact:true}).boundingBox();
   const next=await navigation.getByRole('button',{name:'Наступна сторінка',exact:true}).boundingBox();
   const count=await navigation.locator('.section-pagination-value').boundingBox();
   const swipe=await carousel.locator('.no-scrollbar').first().boundingBox();
   assert(await carousel.evaluate(e=>Boolean(e.querySelector('.home-picker-search-slot').compareDocumentPosition(e.querySelector('.no-scrollbar')) & Node.DOCUMENT_POSITION_FOLLOWING)),`${width} ${kind} toolbar precedes cards in DOM`);
   assert(prev && next && count && swipe,`${width} ${kind} navigation exists`);
   assert(prev.x+prev.width<=swipe.x+1 && next.x>=swipe.x+swipe.width-1,`${width} ${kind} arrows outside both edges`);
   assert(count.y+count.height<=swipe.y+1,`${width} ${kind} page controls above list`);
   const bounds=await carousel.boundingBox();
   assert(width<768 || Math.abs(count.x+count.width/2-(bounds.x+bounds.width/2))<2,`${width} ${kind} pages centred`);
   assert.equal(await navigation.locator('.section-pagination-label').isVisible(),false);
   assert.match(await carousel.locator('.home-picker-directory-summary').innerText(),/Доступно\s+\d+/);
   assert.match(await carousel.locator('.home-picker-directory-summary').innerText(),{auto:/марк/,product:/категор/,brands:/виробник/}[kind]);
   const all=carousel.locator('.reveal-tail > a').first();
   if(await all.count()){
    const link=await all.boundingBox();
    assert(link && (width<768 || count.x+count.width<=link.x+1),`${width} ${kind} counter left of all link`);
    assert(link.y+link.height<=swipe.y,`${width} ${kind} combined summary above cards`);
    const currentSearch=await s.getByRole('button',{name:label,exact:true}).boundingBox();
    assert(Math.abs(count.y-currentSearch.y)<3,`${width} ${kind} responsive search toolbar`);
   }
   const style=await navigation.getByRole('button',{name:'Наступна сторінка',exact:true}).evaluate(e=>{const c=getComputedStyle(e);return[c.backgroundColor,c.borderTopWidth,c.boxShadow]});
   assert.deepEqual(style,['rgba(0, 0, 0, 0)','0px','none'],`${width} ${kind} bare arrows`);
  }
  const initial=await s.getByRole('group',{name:/Сторінка 1 з/}).first().getAttribute('aria-label');
  await s.getByRole('button',{name:'Наступна сторінка',exact:true}).first().click();await s.getByRole('group',{name:/Сторінка 2 з/}).first().waitFor();
  await s.getByRole('button',{name:'Попередня сторінка',exact:true}).first().click();await s.getByRole('group',{name:initial,exact:true}).first().waitFor();
  await s.getByRole('button',{name:label,exact:true}).click();const input=s.getByRole('textbox').first();await input.waitFor();const fieldBox=await input.locator('xpath=ancestor::div[contains(@class,"home-picker-search-slot")]').boundingBox();assert(Math.abs(fieldBox.width-searchBox.width)<3,`${width} ${kind} button and field same width`);
  if(kind==='auto'){
   await input.fill('zzzzmissingmake');await p.waitForTimeout(650);assert.equal(await input.inputValue(),'zzzzmissingmake');
   await input.fill('BMW');await p.waitForTimeout(450);const b=s.getByRole('button',{name:'Обрати BMW',exact:true});await b.click();
   await s.getByRole('heading',{level:2,name:'Моделі BMW',exact:true}).waitFor();assert.match(await s.locator('nav[aria-label="Кроки підбору авто"] [aria-current="step"]').innerText(),/МОДЕЛЬ|Модель/i);
  }else if(kind==='product'){
   await input.fill('zzzzmissingcategory');await p.waitForTimeout(650);assert(await s.locator('.home-picker-results').getByText('Нічого не знайдено',{exact:true}).first().isVisible());await input.fill('');await s.locator('.home-picker-tile').first().waitFor();
   await s.locator('.home-picker-results .home-picker-tile').first().click();await p.waitForTimeout(500);assert(await s.locator('.home-picker-results').innerText());
  }else{
   await input.fill('zzzzmissingproducer');await p.waitForTimeout(650);assert.equal(await input.inputValue(),'zzzzmissingproducer');
   await input.fill('BOSCH');await p.waitForTimeout(450);await s.getByRole('link',{name:/Обрати BOSCH/i}).first().click();await s.getByRole('heading',{level:3,name:/^bosch$/i}).waitFor();await s.getByRole('button',{name:'Закрити деталі виробника'}).click();
  }
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${kind} overflow`);console.log('PASS',width,kind);
 }
 assert.deepEqual(errors,[]);await p.close();
}}finally{await browser.close()}
