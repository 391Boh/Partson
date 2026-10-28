import assert from 'node:assert/strict';
const { chromium, webkit } = await import(process.argv[2] || 'playwright');
const engine = process.env.TEST_BROWSER || 'chromium';
const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ channel: 'chrome' }));
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const html = await response.text();
    await page.evaluate(async () => { await window.__partsonCssReady; await document.fonts.ready; });
    const faq = page.locator('.home-store-faq');
    await faq.scrollIntoViewIfNeeded();
    const buttons = faq.locator('button');
    assert.equal(await buttons.count(), 3);
    const schema = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes =>
      nodes.map(n => JSON.parse(n.textContent)).find(data => data['@type'] === 'FAQPage'));
    assert.equal(schema.mainEntity.length, 3);
    for (let i = 0; i < 3; i++) {
      assert.equal(schema.mainEntity[i].name, await buttons.nth(i).locator('span').innerText());
      assert.equal(schema.mainEntity[i].acceptedAnswer.text, await page.locator(`#home-faq-answer-${i} p`).textContent());
      assert(html.includes(schema.mainEntity[i].acceptedAnswer.text), 'Answer is in SSR HTML');
    }
    const measure = () => faq.evaluate(e => ({ height: e.getBoundingClientRect().height,
      width: e.getBoundingClientRect().width }));
    const baseline = await measure();
    for (const index of [1, 2, 2, 0]) {
      await buttons.nth(index).click();
      const open = await buttons.filter({ has: page.locator('span') }).evaluateAll(nodes => nodes.filter(n => n.getAttribute('aria-expanded') === 'true').length);
      assert(open <= 1, 'Only one answer can be open');
      assert.equal(await faq.locator('.home-store-faq-answer[aria-hidden="false"]').count(), open);
      if (open) {
        const panel = faq.locator('.home-store-faq-answer[aria-hidden="false"]');
        assert(await panel.evaluate(e => e.previousElementSibling?.classList.contains('home-store-faq-heading')), 'Answer sits directly after its own question');
      }
      assert.deepEqual(await measure(), baseline, 'Overall FAQ height remains fixed');
    }
    await buttons.nth(0).focus();
    await page.keyboard.press('Enter');
    assert.equal(await buttons.nth(0).getAttribute('aria-expanded'), 'false');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
    await buttons.nth(0).click();
    await buttons.nth(0).evaluate(el => el.blur());
    await page.locator('.home-store-help').screenshot({ path: `/tmp/home-faq-${engine}-${width}.png` });
    console.log(`PASS ${engine} ${width}px: single answer, stable layout, keyboard, SSR and matching FAQ schema`);
    await page.close();
  }
  const noJs = await browser.newPage({ javaScriptEnabled: false });
  await noJs.goto(origin);
  assert.equal(await noJs.locator('.home-store-faq-fallback').count(), 3);
  await noJs.close();
} finally { await browser.close(); }
