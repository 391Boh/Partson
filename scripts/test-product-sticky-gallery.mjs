import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
const productPath = process.env.TEST_PRODUCT_PATH || '/product/filtr-povitryanyy-megane-02-af1912';
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  for(const [width,height] of [[1440,900],[1024,768],[768,1024],[390,844],[320,640],[1440,540]]) {
    const page = await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
    try {
      await page.goto(`${origin}${productPath}`,{waitUntil:'domcontentloaded',timeout:60000});
      await page.locator('.product-overview-sticky').waitFor();
      for(const id of ['product-description','product-faq','product-alternatives','product-reviews']) {
        assert.equal(await page.locator(`.product-hero-content #${id}`).count(),1);
      }
      assert.equal(await page.locator('.product-overview-sticky .product-hero-gallery').count(),1);
      assert.equal(await page.locator('.product-overview-sticky .product-summary-details').count(),1);
      assert.equal(await page.locator('.product-overview-sticky .product-summary-highlights').count(),1);
      assert.equal(await page.locator('.product-overview-sticky .product-hero-purchase').count(),1);
      const inset=await page.locator('.product-overview-sticky').evaluate(e=>parseFloat(getComputedStyle(e).top));
      await page.evaluate(()=>scrollTo(0,300));
      await page.waitForTimeout(600);
      const overview=await page.locator('.product-overview-sticky').boundingBox();
      assert(Math.abs(overview.y-inset)<2,'Combined overview stays pinned');
      assert(overview.y+overview.height<=height-90,'Overview leaves space to read below');
      const cartButton=await page.locator('.product-overview-sticky button[data-cart-state]').boundingBox();
      if(cartButton)assert(cartButton.y+cartButton.height<=overview.y+overview.height+1,'Order button stays visible inside the overview');
      if(width>=768){
        const gallery=await page.locator('.product-hero-gallery').boundingBox();
        const identity=await page.locator('.product-identity-details').boundingBox();
        const purchase=await page.locator('.product-hero-purchase').boundingBox();
        assert(gallery.x+gallery.width<=identity.x,'Image sits to left of identity');
        assert(identity.x+identity.width<=purchase.x,'Price sits to right of identity');
      }
      await page.screenshot({path:`/tmp/partson-overview-${width}x${height}.png`});
      const nav=await page.locator('.product-details-nav').boundingBox();
      const crumbs=await page.locator('.product-breadcrumbs').boundingBox();
      assert(Math.abs((crumbs.y+crumbs.height/2)-(nav.y+nav.height/2))<2);
      await page.locator('a[href="#product-faq"]').click();
      await page.waitForTimeout(600);
      const pinned=await page.locator('.product-overview-sticky').boundingBox();
      const faq=await page.locator('#product-faq').boundingBox();
      assert(Math.abs(pinned.y-inset)<2);
      assert(faq.y>=pinned.y+pinned.height-2,'Anchor clears the entire fixed overview');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
      console.log(`PASS ${width}×${height}: combined overview, aligned price, navigation and visible anchors.`);
    } finally {await page.close();}
  }
} finally {await browser.close();}
