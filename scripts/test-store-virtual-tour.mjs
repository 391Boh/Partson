import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.argv[3] || 'http://localhost:3102';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    let tourRequests = 0;
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/maps/embed?**', route => {
      if (new URL(route.request().url()).searchParams.get('pb')?.includes('!6m8')) tourRequests++;
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>PartsON tour fixture</title>' });
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const tour = page.locator('.home-store-tour');
    assert.equal(await tour.locator('iframe').count(), 0, 'No panorama request or iframe on first screen');
    assert.equal(tourRequests, 0);
    assert(await page.evaluate(() => Boolean(document.querySelector('.home-store-tour').compareDocumentPosition(document.querySelector('.home-store-help')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'Tour comes before questions');
    assert.equal(new URL(await tour.locator('a').getAttribute('href')).searchParams.get('map_action'), 'pano', 'External link opens the matching panorama');
    const height = await tour.evaluate(e => e.offsetHeight);
    await page.getByRole('button', { name: 'Лише необхідні', exact: true }).click({ timeout: 1200 }).catch(() => {});
    await tour.scrollIntoViewIfNeeded();
    const iframe = tour.locator('iframe');
    await iframe.waitFor();
    const start = tour.getByRole('button', { name: 'Розпочати тур 360°' });
    await start.waitFor();
    assert.match(await iframe.getAttribute('src'), /CAoSHENJQUJJaERweU82YUFqUGxzLVlzYjl1U2lUTm0%3D/);
    assert.equal(await iframe.getAttribute('tabindex'), '-1');
    assert.equal(await iframe.evaluate(e => getComputedStyle(e).pointerEvents), 'none', 'Scrolling is not captured before activation');
    assert.equal(await tour.evaluate(e => e.offsetHeight), height, 'Loaded iframe preserves the reserved geometry');
    await iframe.evaluate(e => { e.dataset.instance = 'first'; });
    await start.focus();
    await start.press('Enter');
    assert.equal(await iframe.getAttribute('tabindex'), '0');
    assert.equal(await iframe.evaluate(e => getComputedStyle(e).pointerEvents), 'auto');
    assert.equal(await tour.evaluate(e => e.offsetHeight), height, 'Activation does not resize the block');
    await tour.getByRole('button', { name: 'Завершити огляд' }).click();
    await start.waitFor();
    assert.equal(await iframe.getAttribute('tabindex'), '-1');
    assert.equal(await iframe.getAttribute('data-instance'), 'first', 'Stopping retains the loaded panorama');
    assert.equal(tourRequests, 1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: delayed owner panorama, correct placement, keyboard controls, no scroll capture or layout shift`);
    await page.context().close();
  }
} finally { await browser.close(); }
