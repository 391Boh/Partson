import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const baseURL = process.argv[3] || 'http://localhost:3000';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const width of [390,1440]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(baseURL,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Увійти',exact:true}).waitFor();
  await page.waitForTimeout(1200);
  const cover=page.locator('.home-highlights[data-server-resolved]:visible .home-highlight-feature:not(.is-previous) img');
  await cover.waitFor();
  await cover.evaluate(img=>img.decode());
  assert.equal(await cover.getAttribute('loading'),'eager');
  const src=await cover.evaluate(img => img.currentSrc);
  assert((await response.text()).includes('home-highlight-cover'), 'Initial HTML includes a cover before hydration');
  const html=await response.text();
  console.log(JSON.stringify({width,src,serverCover:html.includes('home-highlight-cover'),image:await cover.evaluate(img=>({naturalWidth:img.naturalWidth,complete:img.complete})),errors}));
  assert.deepEqual(errors,[]);
  await page.getByRole('button',{name:'Увійти',exact:true}).hover();
  await page.getByRole('button',{name:'Увійти',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).waitFor({timeout:15000});
  await page.screenshot({path:`/tmp/home-auth-assets-${width}.png`});
  await page.close();
 }
}finally{await browser.close();}
