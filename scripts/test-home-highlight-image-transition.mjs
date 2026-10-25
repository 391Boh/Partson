import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const baseURL = process.argv[3] || 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let releaseImage;
const imageGate = new Promise(resolve => { releaseImage = resolve; });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: 'no-preference' });
  await page.clock.install();
  await page.route('**/api/home-blog?view=all', route => route.fulfill({ json: { items: [
    { id: 'first', kind: 'article', title: 'Перша стаття', image: '/Car-parts-fullwidth.webp' },
    { id: 'second', kind: 'article', title: 'Друга стаття', image: '/images/information/diagnostics-hero-v1.webp' },
  ].map(item => ({ ...item, description: 'Перевірка плавної зміни обкладинки.', href: '/blog', imageAlt: '', meta: 'Блог', action: 'Читати' })) } }));
  await page.route('**/_next/image?*', async route => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get('url')?.includes('diagnostics-hero-v1') && Number(query.get('w')) >= 360) await imageGate;
    await route.continue();
  });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  const section = page.locator('.home-highlights[data-server-resolved]:visible');
  await section.scrollIntoViewIfNeeded();
  const active = section.locator('.home-highlight-feature:not(.is-previous)');
  await page.waitForFunction(() => document.querySelector('.home-highlights[data-server-resolved] .home-highlight-feature:not(.is-previous) h3')?.textContent === 'Перша стаття');
  await active.locator('img[data-loaded="true"]').waitFor();
  const height = await section.evaluate(el => el.getBoundingClientRect().height);
  await section.getByRole('button', { name: 'Наступна стаття' }).click();
  await section.locator('.home-highlight-preload').waitFor({ state: 'attached' });
  assert.equal(await active.locator('h3').textContent(), 'Перша стаття', 'Keep current slide visible while next cover is stalled');
  assert(await active.locator('img').evaluate(img => img.complete && img.naturalWidth > 0));
  assert.equal(await section.evaluate(el => el.getBoundingClientRect().height), height);
  releaseImage();
  await page.waitForFunction(() => document.querySelector('.home-highlights[data-server-resolved] .home-highlight-feature:not(.is-previous) h3')?.textContent === 'Друга стаття');
  await active.locator('img[data-loaded="true"]').waitFor();
  assert.equal(await section.locator('.home-highlight-feature.is-previous').count(), 1, 'Keep decoded outgoing cover beneath the fade');
  await page.clock.runFor(650);
  assert.equal(await section.locator('.home-highlight-feature').count(), 1, 'Release outgoing slide after transition');
  assert.equal(await section.evaluate(el => el.getBoundingClientRect().height), height);
  await page.screenshot({ path: '/tmp/home-highlight-image-transition.png' });
  console.log('PASS: stalled cover keeps current slide; decoded replacement fades in without layout shift; outgoing layer is released.');
} finally {
  releaseImage();
  await browser.close();
}
