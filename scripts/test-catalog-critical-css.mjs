import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.argv[3] || 'http://localhost:3102';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const width of [390, 1440]) for (const path of ['/katalog', '/auto', '/groups', '/manufacturers']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/styles/site.*.css', async route => { await gate; await route.continue(); });
    try {
      await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('link[rel=stylesheet][href*="critical-catalog."]').count(), 1);
      const title = page.locator('h1').first();
      await title.waitFor();
      const snapshot = () => title.evaluate(e => {
        const rect = e.getBoundingClientRect(), css = getComputedStyle(e);
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, fontSize: css.fontSize, lineHeight: css.lineHeight };
      });
      await page.waitForTimeout(400);
      const before = await snapshot();
      release();
      await page.waitForFunction(() => [...document.styleSheets].some(s => /\/site\.[^/]+\.css/.test(s.href || '')));
      await page.evaluate(() => window.__partsonCssReady);
      const after = await snapshot();
      assert.equal(after.fontSize, before.fontSize, `${path}: critical typography is complete`);
      assert.equal(after.lineHeight, before.lineHeight);
      for (const property of ['width', 'height']) assert(Math.abs(after[property] - before[property]) <= 1,
        `${path}: full CSS changed title ${property}`);
      // Live catalogue data can change the long page's height by a rounded
      // pixel while the stylesheet is held. This is independent of typography.
      for (const property of ['x', 'y']) assert(Math.abs(after[property] - before[property]) <= 2,
        `${path}: full CSS moved the title`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      console.log(`PASS ${path} ${width}px: critical styles survive delayed full CSS without a title/layout jump`);
    } finally { release(); await page.unrouteAll({ behavior: 'ignoreErrors' }); await page.close(); }
  }
} finally { await browser.close(); }
