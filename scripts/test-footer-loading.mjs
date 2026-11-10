import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const { chromium } = await import(process.argv[2] || 'playwright');
const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Footer from './app/components/DeferredFooter';createRoot(document.getElementById('root')).render(<><main style={{height:3500}}>Контент сторінки</main><Footer/></>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'offline-next',setup(builder){builder.onResolve({filter:/^next\/(link|image|navigation)$/},args=>({path:args.path,namespace:'mock'}));builder.onLoad({filter:/.*/,namespace:'mock'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:args.path==='next/navigation'?'export const useRouter=()=>({prefetch(){}});export const usePathname=()=>"/inform/about";':args.path==='next/link'?`import React from 'react';export default React.forwardRef(({prefetch,...props},ref)=><a {...props} ref={ref}/>);`:`import React from 'react';export default ({src,...props})=><img {...props} src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='40'%3E%3C/svg%3E"/>;`}));}}]});
const css=readFileSync('public/styles/dev.css');
const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].text);return;}if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}if(req.url==='/slow.png'){setTimeout(()=>res.end(''),8000);return;}res.setHeader('Content-Type','text/html');res.end('<!DOCTYPE html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><img src="/slow.png" style="position:absolute;width:1px;height:1px"/><div id="root"></div><script src="/bundle.js"></script></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const width of [390, 1440]) for (const scrolling of [false, true]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', error => console.error('PAGE ERROR', error.message));
    await page.emulateMedia({ reducedMotion: scrolling ? 'reduce' : 'no-preference' });
    await page.addInitScript(() => {
      window.footerEntrances = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function(frames, options) {
        if (this.matches('.site-footer-intro')) window.footerEntrances.push({ frames, options });
        return animate.call(this, frames, options);
      };
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const slot = page.locator('[data-deferred-footer]');
    await slot.waitFor({ state: 'attached' });
    const height = await slot.evaluate(el => el.getBoundingClientRect().height);
    if (scrolling) {
      await page.evaluate(() => document.documentElement.classList.add('is-scrolling'));
      await slot.scrollIntoViewIfNeeded();
    }
    await slot.locator('footer').waitFor({ state: 'attached', timeout: 2500 });
    assert.equal(await page.evaluate(() => document.readyState), 'interactive', 'A stalled resource must not block the footer');
    assert.equal(await slot.evaluate(el => el.getBoundingClientRect().height), height, 'Footer mounting preserves its reserved height');
    await slot.scrollIntoViewIfNeeded();
    const link = slot.getByRole('link', { name: 'Про нас', exact: true });
    await link.waitFor({ state: 'visible' });
    assert(await link.evaluate(el => {
      for (let node = el; node && node.tagName !== 'FOOTER'; node = node.parentElement) {
        if (Number(getComputedStyle(node).opacity) === 0) return false;
      }
      return true;
    }), 'Footer text is visible without a delayed entrance');
    if (!scrolling) await page.waitForFunction(() => window.footerEntrances.length > 0);
    const entrances = await page.evaluate(() => window.footerEntrances);
    assert.equal(entrances.length > 0, !scrolling);
    for (const entrance of entrances) {
      assert(entrance.options.duration <= 300);
      assert(entrance.frames.every(frame => frame.opacity >= .8));
    }
    console.log(`PASS ${width}px ${scrolling ? 'continuous scroll' : 'early preparation'}: before window.load, visible text, stable height.`);
    await page.close();
  }
  const geometryIssues = [];
  for (const hasTouch of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch, reducedMotion: 'reduce' });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const slot = page.locator('[data-deferred-footer]');
    await slot.scrollIntoViewIfNeeded();
    await slot.locator('footer').waitFor();
    for (const width of [320, 360, 390, 640, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await slot.evaluate(el => ({
        height: el.getBoundingClientRect().height,
        reserved: parseFloat(getComputedStyle(el).getPropertyValue('--footer-reserved-height')),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
      if (geometry.height !== geometry.reserved) geometryIssues.push({ width, hasTouch, ...geometry });
      assert.equal(geometry.overflow, false);
    }
    await page.close();
  }
  assert.deepEqual(geometryIssues, [], 'Footer fits its reserved geometry at every mouse/touch breakpoint');
  const retry = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
  await retry.addInitScript(() => {
    window.__partsonCssReady = Promise.reject(new Error('controlled CSS failure'));
    window.__partsonCssReady.catch(() => {});
  });
  await retry.goto(origin, { waitUntil: 'domcontentloaded' });
  const slot = retry.locator('[data-deferred-footer]');
  const reserved = await slot.evaluate(el => el.getBoundingClientRect().height);
  await slot.scrollIntoViewIfNeeded();
  const button = slot.getByRole('button', { name: 'Повторити завантаження підвалу', exact: true });
  await button.waitFor({ timeout: 2500 });
  assert.equal(await slot.locator('footer').count(), 0);
  assert.equal(await slot.evaluate(el => el.getBoundingClientRect().height), reserved);
  await retry.evaluate(() => { window.__partsonCssReady = Promise.resolve(); });
  await button.click();
  await slot.locator('footer').waitFor({ timeout: 2500 });
  assert.equal(await slot.evaluate(el => el.getBoundingClientRect().height), reserved);
  await retry.close();
  console.log('PASS footer: 16 mouse/touch viewport sizes and explicit recovery after a failed stylesheet.');
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
