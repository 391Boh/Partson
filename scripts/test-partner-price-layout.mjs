// A shared skeleton waits for the applicable price without shifting controls.
// Usage: node scripts/test-partner-price-layout.mjs <playwright>
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const { chromium } = await import(process.argv[2] || 'playwright');

const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';
    import ProductCard from './app/components/ProductCard';
    const p = new URLSearchParams(location.search);
    const item = { code: '00-00000056', name: 'Трос ручн. гальм. лів. AUDI 80 бараб,', article: 'AD030213', producer: 'ADRIAUTO', quantity: 2, priceEuro: 8 };
    const noop = () => {};
    function Fixture() {
      const [partner, setPartner] = useState(p.get('state') === 'final');
      const [status, setStatus] = useState(p.get('loading') === '1' ? 'loading' : 'ready');
      window.verifyPartner = () => { setPartner(true); setStatus('ready'); };
      window.finishPublicPrice = () => setStatus('ready');
      window.finishNoPrice = () => setStatus('request');
      return <div style={{ width: Number(p.get('w')) || 340, margin: 16 }}>
        <ProductCard item={item} productHref="/product/x" qty={1} cartQty={0} priceUAH={397}
          promoPriceUAH={partner ? 353 : null} isPartner={partner} hasPromo promoPercent={11}
          priceStatus={status} isAdmin={p.get('admin') === '1'} costPriceUAH={250} costPriceEuro={5} onAdminEdit={async () => ({ ok: true })} isFlipped={false} imageLoadingMode="eager"
          onAddToCart={noop} onRequestPrice={noop} onRemoveFromCart={noop} onQtyChange={noop} onFlip={noop} onImageOpen={noop} />
      </div>;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);` },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic',
  plugins: [{ name: 'plain-links', setup(b) {
    b.onResolve({ filter: /^(app\/components\/SmartLink|next\/link)$/ }, a => ({ path: a.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ resolveDir: process.cwd(), loader: 'jsx', contents: "import React from 'react'; export default function Link({ href, prefetch, ...props }) { return <a href={typeof href === 'string' ? href : '#'} {...props} />; }" }));
  } }],
  define: { 'process.env.NODE_ENV': '"production"' }, banner: { js: 'var process={env:{}};' },
});
const server = http.createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
  else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(readFileSync('public/styles/dev.css')); }
  else if (req.url.startsWith('/?')) {
    const hint = new URL(req.url, 'http://x').searchParams.get('hint') === '1';
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html lang="uk"${hint ? ' data-partner-hint' : ''}><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="background:#eef3f8"><div id="root"></div><script src="/bundle.js"></script></body></html>`);
  } else { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const geometry = page => page.evaluate(() => {
  const box = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  return { row: box('.catalog-card-price-row'), pill: box('.catalog-card-price-pill'), actions: box('.catalog-card-actions'),
    teaser: !!document.querySelector('.catalog-card-discount-teaser') && getComputedStyle(document.querySelector('.catalog-card-discount-teaser')).display !== 'none' };
});
try {
  for (const w of [300, 340, 420]) {
    const page = await browser.newPage({ viewport: { width: w + 40, height: 700 } });
    page.on('pageerror', e => console.log('pageerror', e.message));
    await page.goto(`${base}/?hint=1&loading=1&w=${w}`); await page.waitForSelector('.catalog-card-price-pill');
    const pending = await geometry(page);
    assert.equal(pending.teaser, false, 'A returning partner never sees the public teaser');
    assert.equal(await page.getByRole('status', { name: 'Завантажуємо ціну' }).count(), 1, 'The shared skeleton is shown');
    assert.equal(await page.locator('.catalog-card-price-value').count(), 0, 'No interim regular price appears');
    await page.screenshot({ path: `/tmp/partner-price-pending-${w}.png`, clip: { x: 0, y: 0, width: w + 40, height: 380 } });
    await page.evaluate(() => window.verifyPartner()); await page.waitForTimeout(100);
    const final = await geometry(page);
    await page.screenshot({ path: `/tmp/partner-price-final-${w}.png`, clip: { x: 0, y: 0, width: w + 40, height: 380 } });
    assert.deepEqual(final.row, pending.row, `${w}: the price row keeps its box`);
    assert.deepEqual(final.actions, pending.actions, `${w}: the actions below do not move`);
    assert(Math.abs(final.pill[0] + final.pill[2] - (pending.pill[0] + pending.pill[2])) <= 1, `${w}: the pill stays right-aligned`);
    assert.equal(final.pill[3], pending.pill[3], 'The price surface keeps its height');

    await page.goto(`${base}/?w=${w}`); await page.waitForSelector('.catalog-card-price-pill');
    const visitor = await geometry(page);
    assert.equal(visitor.teaser, true, 'Other visitors still see the partner teaser');
    assert.equal(await page.locator('.catalog-price-skeleton').count(), 0);
    assert.deepEqual(visitor.actions, final.actions, `${w}: the card has the same height for everyone`);
    await page.goto(`${base}/?hint=1&admin=1&loading=1&w=${w}`); await page.waitForSelector('.catalog-card-price-pill');
    assert.equal(await page.locator('.catalog-card-price-row--awaiting-partner').count(), 0, 'Admins see the sale price immediately, without the partner placeholder');
    assert.equal(await page.locator('.catalog-price-skeleton').count(), 1, 'Admins wait for the verified price too');
    const adminInitial = await geometry(page);
    await page.evaluate(() => window.verifyPartner()); await page.waitForTimeout(100);
    const adminPartner = await geometry(page);
    assert.deepEqual(adminPartner.row, adminInitial.row, 'Admin price row keeps its height when the partner price arrives');
    assert.deepEqual(adminPartner.actions, adminInitial.actions, 'Admin actions do not jump when the teaser disappears');
    assert.equal(adminPartner.pill[3], adminInitial.pill[3], 'Admin price pill has a stable height');
    assert.match(await page.locator('.catalog-card-price-pill').textContent(), /353/);
    await page.getByRole('button', { name: 'Закуп', exact: true }).click();
    const adminCost = await geometry(page);
    assert.deepEqual(adminCost.row, adminInitial.row, 'Switching to cost price keeps the row stable');
    assert.deepEqual(adminCost.actions, adminInitial.actions, 'Switching prices does not move admin actions');
    assert.match(await page.locator('.catalog-card-price-pill').textContent(), /250/);
    await page.getByRole('button', { name: 'Прод', exact: true }).click();
    assert.match(await page.locator('.catalog-card-price-pill').textContent(), /353/, 'Switching back restores the verified partner price');
    await page.screenshot({ path: `/tmp/admin-price-stable-${w}.png` });
    await page.goto(`${base}/?loading=1&w=${w}`); await page.waitForSelector('.catalog-price-skeleton');
    const publicLoading = await geometry(page);
    await page.evaluate(() => window.finishPublicPrice());
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.catalog-price-skeleton').count(), 0);
    assert.equal(await page.locator('.catalog-card-price-value').textContent(), '397');
    assert.deepEqual((await geometry(page)).actions, publicLoading.actions, 'Public price loading keeps actions fixed');
    await page.goto(`${base}/?loading=1&w=${w}`); await page.waitForSelector('.catalog-price-skeleton');
    const noPriceLoading = await geometry(page);
    await page.evaluate(() => window.finishNoPrice());
    await page.waitForTimeout(100);
    assert.match(await page.locator('.catalog-card-price-pill').textContent(), /за запитом/);
    assert.equal(await page.locator('.catalog-price-skeleton').count(), 0);
    assert.deepEqual((await geometry(page)).actions, noPriceLoading.actions, 'A confirmed missing price releases the skeleton without moving actions');
    console.log(`PASS ${w}px: pending ${pending.pill[2]}px → verified ${final.pill[2]}px, row and actions unmoved; visitors keep the teaser`);
    await page.close();
  }
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  await desktop.goto(`${base}/?admin=1&loading=1&w=300`); await desktop.waitForSelector('.catalog-card-price-pill');
  const desktopInitial = await geometry(desktop);
  await desktop.evaluate(() => window.verifyPartner()); await desktop.waitForTimeout(100);
  const desktopPartner = await geometry(desktop);
  assert.deepEqual(desktopPartner.row, desktopInitial.row, 'Desktop admin row stays stable');
  assert.deepEqual(desktopPartner.actions, desktopInitial.actions, 'Desktop admin actions stay stable');
  assert(await desktop.locator('.catalog-card-face-front').evaluate(e => e.scrollHeight <= e.clientHeight + 1), 'Desktop admin controls fit inside the card');
  await desktop.screenshot({ path: '/tmp/admin-price-stable-desktop.png' });
  await desktop.close();
} finally { await browser.close(); server.close(); }
