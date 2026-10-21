import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const baseURL = process.argv[3] || 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    const intro = page.locator('.home-intro-refined');
    await intro.getByRole('heading', { level: 1 }).waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
    const sizes = await intro.locator('.home-part-path').evaluateAll(links => links.map(link => {
      const box = link.getBoundingClientRect();
      const hint = link.querySelector('.home-part-path-hint');
      return { x: box.x, y: box.y, width: box.width, height: box.height, textFits: hint.scrollWidth <= hint.clientWidth + 1 && hint.scrollHeight <= hint.clientHeight + 1 };
    }));
    assert.equal(sizes.length, 3);
    assert(await intro.locator('.home-part-path').evaluateAll(links => links.every(link => getComputedStyle(link, '::after').animationName === 'none')), 'Reduced motion disables the specular sweep');
    assert(sizes[0].x < sizes[1].x && sizes[1].x < sizes[2].x, 'Three vertical columns stay side by side');
    assert(Math.max(...sizes.map(size => size.y)) - Math.min(...sizes.map(size => size.y)) < 1, 'Columns start on one baseline');
    assert(sizes.every(size => size.height >= 44 && size.textFits), 'Action targets and descriptions fit');
    assert(Math.max(...sizes.map(size => size.height)) - Math.min(...sizes.map(size => size.height)) < 1, 'All paths have equal height');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
    const car = intro.getByRole('link', { name: /Оберіть авто/ });
    const categories = intro.getByRole('link', { name: /Відкрийте каталог/ });
    assert.equal(await car.getAttribute('href'), '#pidbir-za-avto');
    assert.equal(await categories.getAttribute('href'), '#katehorii-zapchastyn');
    if (width === 390) {
      await car.click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'pidbir-za-avto');
      await categories.click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'katehorii-zapchastyn');
      await page.evaluate(() => scrollTo(0, 0));
      await intro.getByRole('button', { name: /Перевірте за VIN-кодом/ }).click();
      await page.getByRole('dialog').getByLabel('Email', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    }
    if (width === 320 || width === 1440) await intro.screenshot({ path: `/tmp/home-intro-${width}.png` });
    console.log(JSON.stringify({ width, paths: sizes }));
    await page.close();
  }
} finally { await browser.close(); }
