import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.argv[3] || 'http://localhost:3105';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route(/\/styles\/(site\.[^/]+|dev)\.css/, async route => { await gate; await route.continue(); });
    try {
      const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
      assert(!/<link[^>]+rel="preload"[^>]+href="\/styles\/site\./.test(await response.text()), 'React must not hoist full CSS preload from the noscript fallback');
      await page.getByRole('button', { name: 'Увійти', exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const geometry = () => page.evaluate(() => Object.fromEntries(['header', '.home-hero-grid', '.home-highlights[data-server-resolved]'].map(selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return [selector, { width: rect.width, height: rect.height, top: rect.top + scrollY }];
      })));
      const before = await geometry();
      assert(before['.home-hero-grid'].height > 100, 'Hero has its real layout before full CSS');
      assert(await page.getByRole('heading', { level: 1 }).isVisible());
      assert.equal(await page.locator('.home-slot-auto .home-deferred-content').count(), 0, 'Deferred controls wait for full CSS');
      release();
      await page.evaluate(() => window.__partsonCssReady);
      const after = await geometry();
      for (const selector of Object.keys(before)) for (const key of ['width', 'height', 'top']) {
        assert(Math.abs(before[selector][key] - after[selector][key]) <= 2, `${width}px ${selector} ${key}: critical/full CSS geometry differs`);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      console.log(`PASS ${width}px: styled hero/header/blog while full CSS is stalled; stable geometry after release`);
    } finally { release(); await page.unrouteAll({ behavior: 'ignoreErrors' }); await page.close(); }
  }
} finally { await browser.close(); }
