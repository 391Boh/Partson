import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
const path = process.env.TEST_PRODUCT_PATH || '/product/filtr-povitryanyy-megane-02-af1912';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const requests = [];
  const errors = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__productLoading = { lcp: 0, cls: 0 };
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__productLoading.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__productLoading.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(`${origin}${path}`, { waitUntil: 'load', timeout: 60000 });
  await page.locator('.product-reviews').waitFor();
  await page.waitForTimeout(2200);
  const initialRequests = [...requests];
  const metrics = await page.evaluate(() => ({
    ...window.__productLoading,
    ttfb: performance.getEntriesByType('navigation')[0]?.responseStart,
  }));
  assert.equal(initialRequests.filter(url => url.includes('react-icons_si')).length, 0,
    'Footer must not load the full Simple Icons catalogue');
  const reviews = page.locator('.product-reviews');
  const bounds = await reviews.boundingBox();
  const belowViewport = bounds && bounds.y > 844 + 300;
  if (belowViewport) {
    assert.equal(initialRequests.filter(url => url.includes('/api/reviews?')).length, 0,
      'Reviews must not compete with initial rendering while offscreen');
  }
  const reviewRequest = belowViewport
    ? page.waitForRequest(request => request.url().includes('/api/reviews?'), { timeout: 15000 })
    : null;
  // Install the request waiter before scrolling, including fast cached responses.
  await reviews.scrollIntoViewIfNeeded();
  if (reviewRequest) await reviewRequest;
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    metrics,
    initialGalleryRequests: initialRequests.filter(url => url.includes('/api/product-gallery?')).length,
    initialReviewRequests: initialRequests.filter(url => url.includes('/api/reviews?')).length,
  }, null, 2));
  console.log('PASS: lightweight footer, deferred reviews and no browser errors.');
} finally {
  await browser.close();
}
