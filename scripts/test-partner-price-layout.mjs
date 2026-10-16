// The partner promo price must not move the catalog card when it arrives:
// a returning partner's card is drawn in the promo layout before first paint
// (html[data-partner-hint]) and the verified price takes the placeholder's
// place. Usage: node scripts/test-partner-price-layout.mjs <playwright>
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
      window.verifyPartner = () => setPartner(true);
      return <div style={{ width: Number(p.get('w')) || 340, margin: 16 }}>
        <ProductCard item={item} productHref="/product/x" qty={1} cartQty={0} priceUAH={397}
          promoPriceUAH={partner ? 353 : null} isPartner={partner} hasPromo promoPercent={11}
          priceStatus="ready" isFlipped={false} imageLoadingMode="eager"
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
    await page.goto(`${base}/?hint=1&w=${w}`); await page.waitForSelector('.catalog-card-price-pill');
    const pending = await geometry(page);
    assert.equal(pending.teaser, false, 'A returning partner never sees the public teaser');
    assert.notEqual(await page.locator('.catalog-card-promo-pending').evaluate(e => getComputedStyle(e).display), 'none', 'The price placeholder is shown');
    await page.screenshot({ path: `/tmp/partner-price-pending-${w}.png`, clip: { x: 0, y: 0, width: w + 40, height: 380 } });
    await page.evaluate(() => window.verifyPartner()); await page.waitForTimeout(100);
    const final = await geometry(page);
    await page.screenshot({ path: `/tmp/partner-price-final-${w}.png`, clip: { x: 0, y: 0, width: w + 40, height: 380 } });
    assert.deepEqual(final.row, pending.row, `${w}: the price row keeps its box`);
    assert.deepEqual(final.actions, pending.actions, `${w}: the actions below do not move`);
    assert(Math.abs(final.pill[0] + final.pill[2] - (pending.pill[0] + pending.pill[2])) <= 1, `${w}: the pill stays right-aligned`);
    assert(Math.abs(final.pill[2] - pending.pill[2]) <= 12, `${w}: the placeholder is about the price's width (${pending.pill[2]} → ${final.pill[2]})`);

    await page.goto(`${base}/?w=${w}`); await page.waitForSelector('.catalog-card-price-pill');
    const visitor = await geometry(page);
    assert.equal(visitor.teaser, true, 'Other visitors still see the partner teaser');
    assert.equal(await page.locator('.catalog-card-promo-pending').evaluate(e => getComputedStyle(e).display), 'none');
    assert.deepEqual(visitor.actions, final.actions, `${w}: the card has the same height for everyone`);
    console.log(`PASS ${w}px: pending ${pending.pill[2]}px → verified ${final.pill[2]}px, row and actions unmoved; visitors keep the teaser`);
    await page.close();
  }
} finally { await browser.close(); server.close(); }
