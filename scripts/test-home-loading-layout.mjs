import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const baseURL = process.argv[3] || 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of (process.env.HOME_TEST_WIDTHS || "320,360,390,640,768,1024,1440").split(",").map(Number)) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.addInitScript(() => {
      window.loadingShifts = [];
      new PerformanceObserver(list => list.getEntries().forEach(entry => {
        if (!entry.hadRecentInput) window.loadingShifts.push({ value: entry.value, sources: entry.sources.map(source => ({ node: source.node?.className, before: source.previousRect, after: source.currentRect })) });
      })).observe({ type: 'layout-shift', buffered: true });
    });
    await page.route('**/api/home-blog?view=all', async route => {
      await gate;
      await route.fulfill({ json: { items: Array.from({ length: 3 }, (_, index) => ({
        id: `layout-${index}`, kind: 'article', title: `Стаття для перевірки ${index + 1}`,
        description: 'Відкладене завантаження статей не змінює висоту секції.', href: '/blog',
        image: '/Car-parts-fullwidth.webp', imageAlt: '', meta: 'Блог', action: 'Читати',
      })) } });
    });
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
      const stage = page.locator('.home-highlights[data-server-resolved]:visible .home-highlights-stage');
      await stage.waitFor();
      const geometry = () => page.evaluate(() => ({
        blogHeight: document.querySelector('.home-highlights[data-server-resolved]').getBoundingClientRect().height,
        autoTop: document.querySelector('.home-slot-auto').getBoundingClientRect().top + scrollY,
      }));
      const initial = await geometry();
      release();
      await page.waitForFunction(() => document.querySelector('.home-highlights[data-server-resolved] .home-highlight-feature:not(.is-previous) h3')?.textContent === 'Стаття для перевірки 1');
      await page.waitForTimeout(1200);
      assert.deepEqual(await geometry(), initial, `Late carousel keeps all following geometry at ${width}px`);
      const shifts = await page.evaluate(() => window.loadingShifts);
      const cls = shifts.reduce((sum, entry) => sum + entry.value, 0);
      console.log(JSON.stringify({ width, cls, ...initial, shifts }));
      assert.equal(cls, 0, `Loading must not shift visible content at ${width}px`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
    } finally {
      release();
      await page.close();
    }
  }
} finally { await browser.close(); }
