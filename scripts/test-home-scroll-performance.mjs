import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const baseURL = process.argv[3] || 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    const stage = page.locator('.home-highlights[data-server-resolved]:visible .home-highlights-stage');
    await stage.waitFor();
    const initialHeight = await stage.evaluate(el => el.getBoundingClientRect().height);
    // Cross the entire former expansion range, forwards and backwards.
    const heights = await page.evaluate(async () => {
      const stage = document.querySelector('.home-highlights[data-server-resolved] .home-highlights-stage');
      const section = document.querySelector('.home-highlights[data-server-resolved]');
      const top = section.getBoundingClientRect().top + scrollY;
      const heights = [];
      for (const direction of [1, -1]) {
        for (let i = 0; i <= 20; i++) {
          window.scrollTo(0, Math.max(0, top - 700 + (direction === 1 ? i : 20 - i) * 40));
          await new Promise(requestAnimationFrame);
          heights.push(stage.getBoundingClientRect().height);
        }
      }
      return heights;
    });
    assert(heights.every(height => Math.abs(height - initialHeight) < 1), `Promo must not relayout on scroll at ${width}px`);
    assert.equal(await page.locator('.home-static [data-page-motion]').count(), 0, 'Homepage layers stay outside global parallax');
    assert.equal(await page.locator('.home-highlights[data-parallax]').count(), 0, 'Promo has no scroll-driven layers');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
    console.log(`PASS ${width}px: stable ${initialHeight}px promo in both scroll directions; no parallax layers.`);
    await page.close();
  }
} finally {
  await browser.close();
}
