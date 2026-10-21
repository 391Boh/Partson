import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { chromium } = await import(process.argv[2] || 'playwright');
const baseURL = process.argv[3] || 'http://localhost:3000';
const cpuRate = Number(process.env.HOME_TEST_CPU_RATE || 4);
const vitals = readFileSync(new URL('../node_modules/next/dist/compiled/web-vitals/web-vitals.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    await page.addInitScript(`{
      const module = { exports: {} }; const __dirname = '';
      ${vitals}
      window.responseMetrics = { inp: null, events: [] };
      module.exports.onINP(metric => { window.responseMetrics.inp = metric.value; }, { reportAllChanges: true });
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.interactionId) window.responseMetrics.events.push({
            type: entry.name, duration: entry.duration,
            inputDelay: entry.processingStart - entry.startTime,
            processing: entry.processingEnd - entry.processingStart,
            target: entry.target?.tagName,
          });
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    }`);
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    const login = page.getByRole('button', { name: 'Увійти', exact: true });
    await login.waitFor();
    await page.waitForTimeout(1200);
    // Do not warm the modal with an artificial hover: exercise the first tap.
    await login.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email', { exact: true }).waitFor();
    await dialog.getByLabel('Email', { exact: true }).pressSequentially('test@example.test', { delay: 80 });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    for (const [slot, button, query] of [
      ['auto', 'Пошук марки', 'bmw'],
      ['product', 'Пошук категорії', 'фільтр'],
      ['brands', 'Пошук виробника', 'bosch'],
    ]) {
      const section = page.locator(`.home-slot-${slot}`);
      await section.scrollIntoViewIfNeeded();
      await section.locator('.home-deferred-content.is-ready').waitFor({ timeout: 20000 });
      await section.getByRole('button', { name: button, exact: true }).click();
      const input = section.locator('input').first();
      await input.pressSequentially(query, { delay: 80 });
      assert.equal(await input.inputValue(), query);
    }
    await page.waitForTimeout(800);
    const metrics = await page.evaluate(() => window.responseMetrics);
    console.log(JSON.stringify({ width, cpuRate, inp: metrics.inp, slowestEvents: [...metrics.events].sort((a, b) => b.duration - a.duration).slice(0, 6) }));
    assert(Number.isFinite(metrics.inp), 'Actual clicks and typing must produce a measured INP');
    assert(metrics.inp <= 200, `Homepage INP at ${width}px / ${cpuRate}x CPU: ${metrics.inp}ms`);
    await page.close();
  }
} finally {
  await browser.close();
}
