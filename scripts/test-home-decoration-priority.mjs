import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.argv[3] || 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
let release;
const gate = new Promise(resolve => { release = resolve; });
let blocked = 0;
try {
  await page.route('**/Carlogo/**', async route => {
    blocked++;
    await gate;
    await route.abort();
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => { await window.__partsonCssReady; });
  await page.getByRole('button', { name: 'Лише необхідні', exact: true }).click({ timeout: 1200 }).catch(() => {});
  const slot = page.locator('.home-slot-auto');
  const started = Date.now();
  await slot.scrollIntoViewIfNeeded();
  await slot.locator('.home-deferred-content.is-ready').waitFor({ timeout: 15000 });
  assert(blocked > 0, 'Decorative images remain stalled');
  assert(await slot.locator('.home-auto-navigation').isVisible(), 'Car selection works without decorative artwork');
  console.log(`PASS catalogue ready with ${blocked} stalled images (${Date.now() - started}ms including chunk/data loading)`);
} finally {
  release();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await browser.close();
}
