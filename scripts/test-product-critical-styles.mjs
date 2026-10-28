import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
const path = process.env.TEST_PRODUCT_PATH || '/product/filtr-povitryanyy-megane-02-af1912';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    let release; const gate = new Promise(resolve => { release = resolve; });
    await page.route(/\/styles\/(site\.[^/]+|dev)\.css/, async route => { await gate; await route.continue(); });
    try {
      const response = await page.goto(origin + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
      assert.equal(response.status(), 200);
      await page.locator('.product-pinned-controls').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert(await page.getByRole('heading', { level: 1 }).isVisible());
      const geometry = () => page.evaluate(() => Object.fromEntries(['.product-pinned-controls', '.product-identity-content', '.product-hero-stage', '.product-hero-purchase'].map(selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return [selector, { width: r.width, height: r.height, top: r.top + scrollY }];
      })));
      const before = await geometry();
      release(); await page.evaluate(() => window.__partsonCssReady);
      const after = await geometry();
      for (const selector of Object.keys(before)) for (const key of ['width', 'height', 'top']) {
        assert(Math.abs(before[selector][key] - after[selector][key]) <= 2, `${width}px ${selector} ${key}: ${before[selector][key]} → ${after[selector][key]}`);
      }
      console.log(`PASS ${width}px: product critical CSS preserves image, offer and navigation geometry while full CSS is stalled`);
    } finally { release(); await page.unrouteAll({ behavior: 'ignoreErrors' }); await page.close(); }
  }
} finally { await browser.close(); }
