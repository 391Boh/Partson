import assert from 'node:assert/strict';
const { chromium, webkit } = await import(process.argv[2] || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
const productPath = process.env.TEST_PRODUCT_PATH || '/product/filtr-povitryanyy-megane-02-af1912';
const engine = process.env.TEST_BROWSER || 'chromium';
const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ channel: 'chrome' }));
try {
  for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + productPath, { waitUntil: 'domcontentloaded' });
    await page.locator('.product-pinned-controls').waitFor();
    await page.evaluate(async () => { await window.__partsonCssReady; await document.fonts.ready; });
    const geometry = await page.locator('.product-pinned-controls').evaluate(e => {
      const rail = e.querySelector('.product-details-nav-rail');
      return { scrollWidth: rail.scrollWidth, width: rail.clientWidth, transform: getComputedStyle(e).transform };
    });
    assert(geometry.scrollWidth <= geometry.width + 1, 'All mobile tabs fit; no horizontal scrolling layer');
    assert.equal(geometry.transform, 'none', 'Sticky wrapper has no transformed containing block');
    for (const height of [844, 790, 736, 814]) {
      await page.setViewportSize({ width, height });
      const samples = await page.evaluate(() => new Promise(resolve => {
        const controls = document.querySelector('.product-pinned-controls');
        const rail = controls.querySelector('.product-details-nav-rail');
        const samples = []; let frame = 0;
        const step = () => {
          const target = frame < 25 ? 400 + frame * 25 : 1000 - (frame - 25) * 20;
          scrollTo({ top: target, behavior: 'instant' });
          samples.push({ y: controls.getBoundingClientRect().top, x: rail.scrollLeft, scroll: scrollY });
          if (++frame < 50) requestAnimationFrame(step); else resolve(samples);
        };
        requestAnimationFrame(step);
      }));
      for (const s of samples) {
        assert(Math.abs(s.y - 64) <= 1, `${engine} ${width}x${height}: pinned top ${s.y}`);
        assert.equal(s.x, 0, 'Scroll spy never starts horizontal movement on mobile');
      }
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `/tmp/product-nav-stable-${engine}-${width}.png` });
    console.log(`PASS ${engine} ${width}px: continuous scroll, viewport-height changes and stable four-tab rail`);
    await page.close();
  }
} finally { await browser.close(); }
