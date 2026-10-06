import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { chromium } = await import(process.argv[2] || 'playwright');
const baseURL = process.argv[3] || 'http://localhost:3000';
// Use the same metric implementation as next/web-vitals, including CLS
// session windows and INP interaction grouping, rather than counting shifts.
const vitals = readFileSync(new URL('../node_modules/next/dist/compiled/web-vitals/web-vitals.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  for (const width of [360, 390, 640, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript(`{
      const module = { exports: {} };
      const __dirname = '';
      ${vitals}
      window.homeVitals = { cls: 0, inp: null, shifts: [] };
      module.exports.onCLS(metric => { window.homeVitals.cls = metric.value; }, { reportAllChanges: true });
      module.exports.onINP(metric => { window.homeVitals.inp = metric.value; }, { reportAllChanges: true });
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.homeVitals.shifts.push({
            value: entry.value,
            sources: entry.sources.map(source => source.node?.className),
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    }`);
    await page.goto(baseURL, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => window.homeVitals.inp), null,
      'INP stays unmeasured until a qualifying interaction; it is not a poor score');

    for (const slot of ['auto', 'product', 'brands']) {
      const section = page.locator(`.home-slot-${slot}`);
      const reservedHeight = await section.evaluate(node => node.getBoundingClientRect().height);
      await section.scrollIntoViewIfNeeded();
      await section.locator('.home-deferred-content.is-ready').waitFor({ timeout: 15000 });
      await page.waitForTimeout(800);
      const loadedHeight = await section.evaluate(node => node.getBoundingClientRect().height);
      assert.equal(loadedHeight, reservedHeight, `${slot} at ${width}px must keep its reserved height`);
    }

    await page.locator('.home-section-stage-static').scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const footer = page.locator('[data-deferred-footer]');
    const footerHeight = await footer.evaluate(node => node.getBoundingClientRect().height);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await footer.locator('footer').waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    assert.equal(await footer.evaluate(node => node.getBoundingClientRect().height), footerHeight,
      `Footer at ${width}px must keep its reserved height`);
    // Exercise actual clicks and keyboard input so INP has real samples.
    const brands = page.locator('.home-slot-brands');
    await brands.getByRole('button', { name: 'Пошук виробника' }).click();
    const search = brands.locator('input');
    await search.pressSequentially('bosch', { delay: 80 });
    assert.equal(await search.inputValue(), 'bosch', 'Typing must remain responsive while results update');
    await page.waitForTimeout(600);
    await search.press('Backspace');
    await page.waitForTimeout(600);
    const metrics = await page.evaluate(() => window.homeVitals);
    console.log(JSON.stringify({ width, ...metrics }));
    assert(metrics.cls <= 0.01, `Unexpected homepage CLS at ${width}px: ${metrics.cls}`);
    assert(Number.isFinite(metrics.inp), 'Real interactions must produce a finite INP');
    assert(metrics.inp <= 200, `Homepage INP at ${width}px: ${metrics.inp}ms`);
    await page.close();
  }
  console.log('Passed: stable lazy slots, CLS <= 0.01, measured interaction INP <= 200ms.');
} finally {
  await Promise.all(browser.contexts().flatMap(context => context.pages()).map(page => page.close()));
  await browser.close();
}
