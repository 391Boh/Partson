// Browser-only fixtures: no writes to customer profiles or the 1C service.
import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.argv[3] || 'http://localhost:3102';
const fixtures = [
  { 'Марка': 'BMW', 'Модель': 'X5 I (E53)', 'Рік': 2006, 'РікПочаток': 2000, 'РікКінець': 2006, 'Обєм': '2.0', 'Потужність': 150, 'Коробка': 'Механічна', 'Привід': 'Задній' },
  { 'Марка': 'BMW', 'Модель': 'X5 I (E53)', 'Рік': 2006, 'РікПочаток': 2000, 'РікКінець': 2006, 'Обєм': '3.0', 'Потужність': 231, 'Коробка': 'Автомат', 'Привід': 'Повний' },
];
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    await page.addInitScript(() => localStorage.setItem('partson:selectedCars', JSON.stringify(['AUDI A4 2010', 'VOLVO V60 2018'])));
    await page.route('**/api/proxy?*', async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('endpoint') === 'getauto' && (url.searchParams.get('q') || '').includes('BMW')) {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixtures) });
      } else await route.continue();
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Лише необхідні', exact: true }).click({ timeout: 2000 }).catch(() => {});
    const section = page.locator('.home-slot-auto');
    await section.scrollIntoViewIfNeeded();
    await section.locator('.home-deferred-content.is-ready').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const geometry = () => section.evaluate(element => {
      const height = selector => Math.round((selector ? element.querySelector(selector) : element).getBoundingClientRect().height);
      return { section: height(), layout: height('.home-picker-layout'), results: height('.home-picker-results') };
    });
    const initial = await geometry();
    await section.getByRole('button', { name: 'Обрати BMW', exact: true }).click();
    await section.locator('.vehicle-model-choice').first().click();
    await page.waitForFunction(() => {
      const year = document.querySelector('.home-slot-auto .vehicle-year-control select');
      return year && !year.disabled && year.options.length > 1;
    });
    await section.locator('.vehicle-year-control select').first().selectOption({ index: 1 });
    const modifications = section.locator('.vehicle-modifications');
    await modifications.waitFor();
    await page.waitForTimeout(700);
    assert.deepEqual(await geometry(), initial, 'Modification step keeps its height');
    for (let step = 0; step < 10; step++) {
      const confirm = modifications.locator('.vehicle-mod-confirm');
      if (await confirm.isVisible()) {
        await confirm.click();
        break;
      }
      await modifications.locator('.vehicle-mod-choice').first().click();
      await page.waitForTimeout(250);
    }
    await section.locator('.home-auto-summary').waitFor();
    assert.deepEqual(await geometry(), initial, 'Summary keeps its height');
    assert.equal(await section.locator('.home-auto-saved-row').count(), 2);
    const title = await section.locator('.home-auto-selected > div > span:last-child').innerText();
    assert(!title.includes('Механічна') && !title.includes('150'), 'Specifications do not repeat in the title');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await section.getByRole('button', { name: 'Видалити авто AUDI A4 2010', exact: true }).click();
    assert.equal(await section.locator('.home-auto-saved-row').count(), 1);
    await section.getByRole('button', { name: 'Видалити вибране авто', exact: true }).click();
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('partson:selectedCars') || '[]').some(label => label.includes('BMW')) && !localStorage.getItem('partson:selectedCarSelection'));
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('partson:selectedCars'))), ['VOLVO V60 2018']);
    await section.getByRole('button', { name: 'Обрати BMW', exact: true }).waitFor();
    assert.deepEqual(await geometry(), initial, 'Deletion keeps its height');
    console.log('PASS', width, 'stable vehicle steps, compact summary and removal persistence');
    await page.close();
  }
} finally {
  await browser.close();
}
