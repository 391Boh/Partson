import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const active = page => page.locator('.home-highlights[data-server-resolved]:visible .home-highlight-feature:not(.is-previous)');
const waitForTitle = (page, title) => page.waitForFunction(expected => [...document.querySelectorAll('.home-highlights[data-server-resolved] .home-highlight-feature:not(.is-previous) h3')].some(node => node.textContent === expected), title);
const next = page => page.getByRole('button', { name: 'Наступний матеріал' });
try {
  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 }, reducedMotion: 'reduce', hasTouch: width < 768 });
    await page.clock.install();
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const section = page.locator('.home-highlights[data-server-resolved]:visible');
    await section.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.home-highlight-feature:not(.is-previous) .home-highlight-action')?.getAttribute('href')?.startsWith('/blog/'));
    const initial = await section.boundingBox();
    const title = await active(page).locator('h3').textContent();
    assert.equal(await section.locator('.home-highlights-controls, [aria-roledescription="карусель"]').count(), 0, 'One article and one service use a static block');
    assert.equal(await section.locator('.home-highlight-feature').count(), 1);
    const service = section.locator('.home-highlight-service-link');
    assert.equal(await service.getAttribute('href'), '/inform/diagnostics');
    assert(await service.locator('img').evaluate(img => img.complete ? img.naturalWidth > 0 : new Promise(resolve => { img.onload = () => resolve(img.naturalWidth > 0); img.onerror = () => resolve(false); })));
    await page.clock.fastForward(11000);
    assert.equal(await active(page).locator('h3').textContent(), title, 'No automatic rotation with current content');
    await active(page).locator('.home-highlight-action').focus();
    await page.keyboard.press('ArrowRight');
    if (width < 768) {
      await active(page).dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: 280, clientY: 200 });
      await active(page).dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, clientX: 80, clientY: 205 });
    }
    assert.equal(await active(page).locator('h3').textContent(), title, 'Keyboard and swipe do not switch a static block');
    assert.equal((await section.boundingBox()).height, initial.height);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const action = await active(page).locator('.home-highlight-action').boundingBox();
    const copy = await active(page).locator('.home-highlight-copy').boundingBox();
    const serviceBox = await service.boundingBox();
    const heading = await active(page).locator('h3').boundingBox();
    assert(action.y + action.height <= copy.y + copy.height, 'Primary action fits');
    assert(serviceBox.height >= (width < 768 ? 64 : width < 1024 ? 78 : 88), 'Diagnostics button is more prominent');
    if (width < 1024) assert(serviceBox.y + serviceBox.height < heading.y, 'Service button clears the heading');
    else assert(copy.x + copy.width < serviceBox.x, 'Desktop content clears the service button');
    await section.locator('.home-highlight-cover').evaluateAll(images => Promise.all(images.map(img => img.complete ? undefined : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; }))));
    await section.screenshot({ path: `/tmp/home-highlights-static-${width}.png` });
    console.log(`PASS ${width}: static content, no autoplay/arrows/swipe, prominent diagnostics link and no overlap or overflow.`);
    await page.close();
  }

  const fallback = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await fallback.route('**/api/home-blog?view=all', route => route.fulfill({ status: 503, body: '{}' }));
  await fallback.goto(origin, { waitUntil: 'domcontentloaded' });
  await fallback.locator('.home-highlights[data-server-resolved]:visible').scrollIntoViewIfNeeded();
  assert.match(await active(fallback).locator('.home-highlight-action').getAttribute('href'), /^\/blog(?:\/|$)/, 'API failure preserves the server article or generic blog fallback');
  assert.equal(await fallback.locator('.home-highlight-service-link').getAttribute('href'), '/inform/diagnostics');
  assert.equal(await fallback.locator('.home-highlights-controls').count(), 0);
  await fallback.close();

  const expanded = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'no-preference' });
  await expanded.clock.install();
  await expanded.route('**/api/home-blog?view=all', route => route.fulfill({ json: { items: Array.from({ length: 6 }, (_, i) => ({
    id: `test-article-${i}`, kind: 'article', title: `Тестова стаття ${i + 1}`, description: 'Матеріал для перевірки навігації.',
    href: `/blog/test-${i}`, image: '/Car-parts-fullwidth.webp', imageAlt: '', meta: '1 хв читання', action: 'Читати статтю',
  })) } }));
  await expanded.goto(origin, { waitUntil: 'domcontentloaded' });
  const section = expanded.locator('.home-highlights[data-server-resolved]:visible');
  await section.scrollIntoViewIfNeeded();
  await expanded.waitForFunction(() => document.querySelector('.home-highlight-feature:not(.is-previous) h3')?.textContent === 'Тестова стаття 1');
  await expanded.mouse.move(0, 0);
  assert.equal(await section.getByRole('button').count(), 2, 'Only manual navigation buttons remain');
  await expanded.clock.runFor(4800);
  assert.equal(await active(expanded).locator('h3').textContent(), 'Тестова стаття 1', 'Keeps each slide readable for five seconds');
  await expanded.clock.runFor(400);
  await waitForTitle(expanded, 'Тестова стаття 2');
  assert.equal(await active(expanded).locator('h3').textContent(), 'Тестова стаття 2', 'Automatically advances after five seconds');
  await section.hover();
  await expanded.clock.runFor(5100);
  await waitForTitle(expanded, 'Тестова стаття 3');
  assert.equal(await active(expanded).locator('h3').textContent(), 'Тестова стаття 3', 'Hover does not stop automatic rotation');
  await active(expanded).locator('.home-highlight-action').focus();
  await expanded.clock.runFor(5100);
  await waitForTitle(expanded, 'Тестова стаття 4');
  assert.equal(await active(expanded).locator('h3').textContent(), 'Тестова стаття 4', 'Focus does not stop automatic rotation');
  await next(expanded).click();
  await waitForTitle(expanded, 'Тестова стаття 5');
  assert.equal(await active(expanded).locator('h3').textContent(), 'Тестова стаття 5');
  await expanded.clock.runFor(5100);
  await waitForTitle(expanded, 'Тестова стаття 6');
  assert.equal(await active(expanded).locator('h3').textContent(), 'Тестова стаття 6', 'Automatic rotation continues after manual navigation');
  for (let i = 0; i < 2; i++) {
    const before = await active(expanded).locator('h3').textContent();
    await next(expanded).click();
    await expanded.waitForFunction(title => document.querySelector('.home-highlights[data-server-resolved] .home-highlight-feature:not(.is-previous) h3')?.textContent !== title, before);
  }
  assert.equal(await active(expanded).locator('h3').textContent(), 'Тестова стаття 1', 'Navigation wraps across articles and services');
  await expanded.emulateMedia({ reducedMotion: 'reduce' });
  await expanded.clock.runFor(5100);
  await waitForTitle(expanded, 'Тестова стаття 2');
  assert.equal(await active(expanded).locator('h3').textContent(), 'Тестова стаття 2', 'Reduced motion keeps automatic changes with no transition');
  await expanded.close();
  console.log('PASS API failure fallback, six future articles, five-second autoplay, uninterrupted hover/focus, manual navigation, reduced motion and wraparound.');
} finally { await browser.close(); }
