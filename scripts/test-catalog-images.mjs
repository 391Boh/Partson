import assert from 'node:assert/strict';
import sharp from 'sharp';
const { chromium } = await import(process.argv[2] || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const image = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#0a8' } }).png().toBuffer();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(30_000);
  const requests = [];
  const makeItems = start => Array.from({ length: 16 }, (_, i) => ({ code: `IMAGE-${start + i}`, article: `ART-${start + i}`, name: `Фото тест ${start + i}`, quantity: 2, priceEuro: 10, hasPhoto: true }));
  await page.route('**/api/catalog-page', route => {
    const body = route.request().postDataJSON();
    const start = body.directPage ? body.offset : Number(body.cursor) || (body.page - 1) * 16;
    return route.fulfill({ json: { items: makeItems(start), totalCount: 32, hasMore: start === 0, nextCursor: start === 0 ? '16' : '', ...(body.directPage ? { directOffset: start } : {}) } });
  });
  await page.route('**/api/catalog-image-batch', async route => {
    const { items } = route.request().postDataJSON();
    await new Promise(resolve => setTimeout(resolve, 3500));
    await route.fulfill({ json: { items: items.map(item => ({ key: `${item.code.toLowerCase()}::${item.article.toLowerCase()}`, ...item, status: 'ready', src: `/product-image/${item.code}?iv=5&catalog=1&article=${item.article}` })) } }).catch(() => {});
  });
  await page.route('**/product-image/IMAGE-*', route => {
    const url = new URL(route.request().url());
    requests.push(url);
    if (url.pathname.endsWith('IMAGE-4') && !url.searchParams.has('retry')) return route.fulfill({ status: 503, body: '' });
    return route.fulfill({ contentType: 'image/png', body: image });
  });
  await page.goto('http://localhost:3000/katalog?search=image-regression', { waitUntil: 'domcontentloaded' });
  const recovered = page.locator('img[src*="/product-image/IMAGE-4?"]');
  await recovered.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const img = document.querySelector('img[src*="/product-image/IMAGE-4?"]');
    return img?.complete && img.naturalWidth > 0 && !img.classList.contains('opacity-0');
  });
  await page.waitForTimeout(4000);
  assert.equal(requests.filter(url => url.pathname.endsWith('IMAGE-4') && !url.searchParams.has('retry')).length, 1, 'Late batch restarted the failed image');
  assert.equal(requests.filter(url => url.pathname.endsWith('IMAGE-4') && url.searchParams.has('retry')).length, 1, 'Image retry loop');
  const pager = page.getByRole('group', { name: 'Перемикання сторінок каталогу' });
  await pager.locator('button[data-page="2"]').click();
  await page.locator('img[src*="/product-image/IMAGE-16?"]').waitFor();
  assert.equal(await page.locator('img[src*="/product-image/IMAGE-0?"]').count(), 0, 'Old page image remained');
  console.log('Catalog images passed: failed image recovers during pending batch, late batch does not reload it, page changes use new images.');
} finally { await browser.close(); }
