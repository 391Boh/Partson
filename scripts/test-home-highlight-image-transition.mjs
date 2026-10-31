import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const { chromium } = await import(process.argv[2] || 'playwright');
const baseURL = process.argv[3] || 'http://localhost:3000';
// A deterministic two-slide fixture: production may legitimately have one
// published article and now no longer refetches successful server previews.
const bundle = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Slider from './app/components/HomeHighlightsSlider';
    const articles=[{id:'first',title:'Перша стаття',image:'/storefront/photos/partson-store-1-768.webp'},{id:'second',title:'Друга стаття',image:'/images/information/diagnostics-hero-v1.webp'}].map(x=>({...x,kind:'article',description:'Перевірка плавної зміни обкладинки.',href:'/blog',imageAlt:'',meta:'Блог',action:'Читати'}));
    createRoot(document.getElementById('root')).render(<Slider services={[]} initialArticles={articles} serverResolved/>);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'next-fixture', setup(builder) {
    builder.onResolve({ filter: /^next\/(image|link)$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'jsx', resolveDir: process.cwd(), contents: args.path === 'next/link'
      ? `import React from 'react';export default ({prefetch,...props})=><a {...props}/>;`
      : `import React from 'react';export default ({fill,loader,preload,...props})=><img {...props} style={fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:undefined}/>;` }));
  } }],
});
const stylesheet = JSON.parse(readFileSync('public/styles/manifest.json', 'utf8')).href;
const server = http.createServer(async (req,res) => {
  if (req.url === '/bundle.js') { res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].text);return; }
  if (req.url === '/') { res.setHeader('content-type','text/html');res.end(`<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${stylesheet}"><div class="home-static" id="root"></div><script src="/bundle.js"></script></html>`);return; }
  try { const response=await fetch(new URL(req.url,baseURL));res.setHeader('content-type',response.headers.get('content-type')||'application/octet-stream');res.end(Buffer.from(await response.arrayBuffer())); }
  catch { res.statusCode=502;res.end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const fixtureURL=`http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let releaseImage;
const imageGate = new Promise(resolve => { releaseImage = resolve; });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: 'no-preference' });
  await page.clock.install();
  await page.goto(fixtureURL, { waitUntil: 'domcontentloaded' });
  const section = page.locator('.home-highlights[data-server-resolved]:visible');
  await section.scrollIntoViewIfNeeded();
  const active = section.locator('.home-highlight-feature:not(.is-previous)');
  await active.locator('img[data-loaded="true"]').waitFor();
  const firstTitle = await active.locator('h3').textContent();
  // Stall the next prepared preview after the server's first cover decoded.
  await page.route('**/images/information/diagnostics-hero-v1.webp', async route => { await imageGate; await route.continue(); });
  await page.route('**/_next/image?*', async route => { await imageGate; await route.continue(); });
  const height = await section.evaluate(el => el.getBoundingClientRect().height);
  await section.getByRole('button', { name: 'Наступна стаття' }).click();
  await section.locator('.home-highlight-preload').waitFor({ state: 'attached' });
  assert.equal(await active.locator('h3').textContent(), firstTitle, 'Keep current slide visible while next cover is stalled');
  assert(await active.locator('img').evaluate(img => img.complete && img.naturalWidth > 0));
  assert.equal(await section.evaluate(el => el.getBoundingClientRect().height), height);
  releaseImage();
  await page.waitForFunction(title => document.querySelector('.home-highlights[data-server-resolved] .home-highlight-feature:not(.is-previous) h3')?.textContent !== title, firstTitle);
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
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
