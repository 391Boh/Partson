import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.argv[3] || 'http://localhost:3102';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let session;
    if (process.env.HOME_TEST_SLOW === '1') {
      session = await page.context().newCDPSession(page);
      await session.send('Network.enable');
      await session.send('Network.emulateNetworkConditions', {
        offline: false, latency: 80, downloadThroughput: 500000, uploadThroughput: 125000,
      });
      await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let releaseMap;
    const mapGate = new Promise(resolve => { releaseMap = resolve; });
    await page.route('**/maps/embed?**', async route => {
      await mapGate;
      await route.fulfill({ contentType: 'text/html', body: '<title>Map fixture</title>' });
    });
    await page.addInitScript(() => {
      window.backgroundMetrics = { cls: 0, lcp: 0, shifts: [] };
      new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) { window.backgroundMetrics.cls += e.value; window.backgroundMetrics.shifts.push({value:e.value, sources:e.sources.map(s=>({node:s.node?.className, html:s.node?.parentElement?.outerHTML?.slice(0,1600), before:s.previousRect, after:s.currentRect}))}); } }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(list => { window.backgroundMetrics.lcp = list.getEntries().at(-1).startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    try {
      const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
      assert((await response.text()).includes('section-reveal-advantages is-revealed'), 'Store content is visible in server HTML');
      const geometry = await page.locator('[class*="home-slot-"][aria-busy]').evaluateAll(els => els.map(e => e.offsetHeight));
      // Catalogue startup must work before any nearby Google iframe resolves.
      await page.locator('.home-slot-auto .home-deferred-content.is-ready').waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: 'Лише необхідні', exact: true }).click({ timeout: 1000 }).catch(() => {});
      for (const kind of ['auto', 'product', 'brands']) {
        const slot = page.locator(`.home-slot-${kind}`);
        await slot.scrollIntoViewIfNeeded();
        await slot.locator('.home-deferred-content.is-ready').waitFor();
        const art = slot.locator('.home-backdrop');
        assert.equal(await art.count(), 1, 'Backdrop arrives in the same render as its section');
        if (kind === 'product') {
          const parts = slot.locator('.tovar-part');
          assert.equal(await parts.count(), 7);
          assert(await parts.evaluateAll(els => els.every(e => e.style.backgroundImage.includes('/Parts/cutout/'))));
        }
        assert.equal(await slot.locator('.home-deferred-content').evaluate(e => getComputedStyle(e).animationName), 'none');
        await slot.screenshot({ path: `/tmp/home-fast-${kind}-${width}.png` });
      }
      assert.deepEqual(await page.locator('[class*="home-slot-"][aria-busy]').evaluateAll(els => els.map(e => e.offsetHeight)), geometry, 'Each slot preserves its initial height');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      const metrics = await page.evaluate(() => window.backgroundMetrics);
      // Browser font rasterization can register a subpixel first-paint shift.
      // Slot geometry is asserted exactly above; keep total CLS below 0.001.
      assert(metrics.cls < 0.001, JSON.stringify(metrics));
      console.log(JSON.stringify({ width, ...metrics, mapIndependent: true, stableSlotHeights: geometry }));
    } finally {
      releaseMap();
      if (session) {
        await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await session.detach();
      }
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.context().close();
    }
  }
} finally { await browser.close(); }
