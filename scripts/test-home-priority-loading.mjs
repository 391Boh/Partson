import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const baseURL = process.argv[3] || 'http://localhost:3000';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const width of [390,1440]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const blogRefreshes=[];page.on('request',r=>{if(r.url().includes('/api/home-blog?view=all'))blogRefreshes.push(r.url());});
  const response=await page.goto(baseURL,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Увійти',exact:true}).waitFor();
  await page.waitForTimeout(2200);
  const cover=page.locator('.home-highlights[data-server-resolved]:visible .home-highlight-feature:not(.is-previous) img');
  await cover.waitFor();
  await cover.evaluate(img=>img.decode());
  assert.notEqual(await cover.getAttribute('loading'),'lazy');
  assert(await page.locator('link[rel=preload][as=image]').count() > 0, 'First cover is preloaded from server HTML');
  const src=await cover.evaluate(img => img.currentSrc);
  assert((await response.text()).includes('home-highlight-cover'), 'Initial HTML includes a cover before hydration');
  const html=await response.text();
  console.log(JSON.stringify({width,src,serverCover:html.includes('home-highlight-cover'),image:await cover.evaluate(img=>({naturalWidth:img.naturalWidth,complete:img.complete})),errors}));
  assert.equal(blogRefreshes.length, 0, 'Successful server articles do not trigger a duplicate client request');
  const hero = page.locator('.hero-photo img');
  await hero.evaluate(img => img.decode());
  assert.match(await hero.evaluate(img => img.currentSrc), /\.avif$/, 'Browser selects the AVIF hero');
  const heroRequests = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => /partson-store-1.*\.(webp|avif)/.test(e.name)).map(e => e.name));
  assert.equal(heroRequests.length, 1, 'Preload and picture share one download without fetching the fallback');
  assert.deepEqual(errors,[]);
  await page.getByRole('button',{name:'Увійти',exact:true}).hover();
  await page.getByRole('button',{name:'Увійти',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).waitFor({timeout:15000});
  await page.screenshot({path:`/tmp/home-auth-assets-${width}.png`});
  await page.close();
 }
}finally{await browser.close();}
