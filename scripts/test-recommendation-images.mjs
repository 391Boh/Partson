import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import sharp from 'sharp';
const { chromium } = await import(process.argv[2] || 'playwright');
const image = await sharp({ create: { width: 56, height: 56, channels: 3, background: '#0a8' } }).png().toBuffer();
const requests = [];
const batchKeys = [];
const result = await build({
  stdin: { contents: `import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import Related from './app/components/ProductRelatedItemsClientSection';import Recent from './app/components/ProductRecentlyViewedSection';import Card from './app/components/ProductCompactRecommendationCard';
  const product={code:'CURRENT',article:'CURRENT',name:'Поточний товар'};
  const item=code=>({code,article:code,name:code,producer:'Bosch',quantity:1,priceEuro:10,hasPhoto:true});
  function App(){const [similar,setSimilar]=useState([]);useEffect(()=>{const timer=setTimeout(()=>setSimilar(Array.from({length:6},(_,index)=>item(index?'SIMILAR-'+index:'SIMILAR'))),250);return ()=>clearTimeout(timer)},[]);return <><Related product={product} initialRelatedItems={Array.from({length:6},(_,index)=>item(index?'ANALOG-'+index:'ANALOG'))} initialSimilarItems={similar}/><Recent product={product}/><div style={{width:180,height:166}}><Card href='/test' item={item('STALE')} priceLabel='100 грн' prefetchedImageSrc='/bad-image.png'/></div><div style={{width:180,height:166}}><Card href='/test' item={{...item('NO-PHOTO'),hasPhoto:false}} priceLabel='100 грн'/></div></>};createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'offline-next', setup(builder) {
    builder.onResolve({ filter: /^next\/(image|link|navigation)$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'jsx', resolveDir: process.cwd(), contents:
      args.path === 'next/navigation' ? 'export const useRouter=()=>({prefetch(){}});' :
      args.path === 'next/link' ? `import React from 'react';export default React.forwardRef(({prefetch,...props},ref)=><a {...props} ref={ref}/>);` :
      `import React from 'react';export default React.forwardRef(({fill,unoptimized,...props},ref)=><img {...props} ref={ref} style={{width:'100%',height:'100%'}}/>);`
    }));
  } }],
});
const css = readFileSync('public/styles/dev.css');
const server = http.createServer(async (req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(result.outputFiles[0].text); return; }
  if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); return; }
  if (req.url === '/bad-image.png') { res.statusCode = 503; res.end(); return; }
  if (req.url.startsWith('/product-image/')) {
    requests.push(req.url);
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.endsWith('RECENT') && !url.searchParams.has('retry')) { res.statusCode = 503; res.end(); return; }
    res.setHeader('Content-Type', 'image/png'); res.end(image); return;
  }
  if (req.url === '/api/catalog-image-batch') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const { items } = JSON.parse(raw); batchKeys.push(...items.map(item => item.code));
    setTimeout(() => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({items:items.map(item=>({...item,key:item.code.toLowerCase()+'::'+item.article.toLowerCase(),status:'ready',src:'/product-image/'+item.code}))})); }, 900); return;
  }
  res.setHeader('Content-Type', 'text/html'); res.end('<html lang="uk"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    requests.length = 0; batchKeys.length = 0;
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.addInitScript(() => localStorage.setItem('partson:v2:recently-viewed-products', JSON.stringify([{code:'RECENT',article:'RECENT',name:'Нещодавній товар',producer:'Bosch',quantity:1,priceEuro:10,hasPhoto:true,viewedAt:Date.now()}])));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    for (const code of ['ANALOG', 'SIMILAR', 'RECENT', 'STALE']) {
      await page.locator(`img[src*="/product-image/${code}"]`).first().scrollIntoViewIfNeeded();
      await page.waitForFunction(code => [...document.images].some(img => img.src.includes('/product-image/'+code) && img.complete && img.naturalWidth > 0 && !img.classList.contains('opacity-0')), code);
    }
    await page.waitForTimeout(1200);
    assert(Array.from({length:6},(_,index)=>index?'SIMILAR-'+index:'SIMILAR').every(code=>batchKeys.includes(code)) && batchKeys.includes('ANALOG'), 'All six items in both lists must receive batch images');
    assert(requests.some(url => url.includes('RECENT') && url.includes('retry=')), 'Recently viewed must recover from a temporary image failure');
    assert(!requests.some(url => url.includes('NO-PHOTO')), 'Known photo-less items must not launch requests');
    assert(requests.length < 32, 'Image recovery must stay bounded across twelve recommendations');
    console.log(`PASS ${width}px: analog, similar, recently viewed, stale URL recovery, photo-less placeholder.`);
    await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
