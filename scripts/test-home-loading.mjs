import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const baseURL = process.argv[3] || 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript(() => {
      window.homeMetrics = { cls: 0, lcp: 0, longTasks: 0 };
      new PerformanceObserver(list => list.getEntries().forEach(e => {
        if (!e.hadRecentInput) window.homeMetrics.cls += e.value;
      })).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(list => {
        window.homeMetrics.lcp = list.getEntries().at(-1).startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { window.homeMetrics.longTasks += list.getEntries().length; })
        .observe({ type: 'longtask', buffered: true });
    });
    await page.goto(baseURL, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    console.log(JSON.stringify({ width, ...await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return { ...window.homeMetrics, ttfb: nav.responseStart, dom: nav.domContentLoadedEventEnd,
        load: nav.loadEventEnd, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
        mountedSections: document.querySelectorAll('.home-deferred-content').length };
    }) }));
    assert.equal(await page.locator('.home-slot-brands .home-deferred-content').count(), 0,
      'Offscreen manufacturers must wait for scroll intent');
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let releaseImage;
  const imageGate = new Promise(resolve => { releaseImage = resolve; });
  await page.route('**/_next/image?*', async route => {
    if (route.request().url().includes('partson-store-1')) await imageGate;
    await route.continue();
  });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.home-slot-auto .home-deferred-content').count(), 0);
  await page.locator('.home-slot-auto').scrollIntoViewIfNeeded();
  await page.locator('.home-slot-auto .home-deferred-content').waitFor({ state: 'attached', timeout: 8000 });
  assert.notEqual(await page.evaluate(() => document.readyState), 'complete',
    'Section must mount without waiting for a stalled hero image');
  releaseImage();
  await page.close();
  console.log('Passed: offscreen modules deferred; scrolling bypasses a stalled window.load.');
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser.close();
}
