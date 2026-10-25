import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.argv[3] || 'http://localhost:3102';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/home-blog?view=all', async route => { await gate; await route.continue(); });
    await page.route('**/_next/image?*', async route => {
      const image = new URL(route.request().url()).searchParams.get('url') ?? '';
      if (image.includes('/api/blog/og-image/') || image.includes('storage.googleapis.com')) await gate;
      await route.continue();
    });
    await page.route('**/maps/embed?**', route => route.fulfill({ body: '<title>Map fixture</title>' }));
    try {
      const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
      const article = page.locator('.home-highlights[data-server-resolved]:visible .home-highlight-feature:not(.is-previous)');
      const link = article.locator('.home-highlight-action');
      assert.match(await link.getAttribute('href'), /^\/blog\/.+/);
      assert((await response.text()).includes(await article.locator('h3').textContent()), 'Actual article is streamed in server HTML');
      assert(await article.locator('h3').isVisible(), 'Text is visible while cover and client API are deliberately stalled');
      const height = await page.locator('.home-highlights[data-server-resolved]:visible').evaluate(e => e.offsetHeight);
      release();
      await article.locator('img').evaluate(img => img.decode());
      await page.waitForTimeout(300);
      assert.equal(await page.locator('.home-highlight-preload').count(), 0, 'Identical API refresh does not preload/reveal the same cover again');
      assert.equal(await page.locator('.home-highlights[data-server-resolved]:visible').evaluate(e => e.offsetHeight), height);
      console.log(`PASS ${width}px: first article precedes image/API completion; stable geometry and no duplicate cover transition`);
    } finally {
      release();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.context().close();
    }
  }
} finally { await browser.close(); }
