import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { build } from 'esbuild';
const { chromium } = await import(process.argv[2] || 'playwright');
const manifest = JSON.parse(readFileSync('public/styles/manifest.json', 'utf8'));
const css = readFileSync(`public${manifest.href}`);
const result = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import HeroAccountClient from './app/components/HeroAccountClient';
    createRoot(document.getElementById('root')).render(<div className="home-static">
      <div className="hero-account-surface flex min-w-0 flex-col justify-center gap-3 rounded-[24px] border border-white/30 bg-slate-950/70 p-3.5 sm:p-4 lg:p-4"><HeroAccountClient variant="panel" /></div>
      <div id="following-section">Наступний блок</div>
    </div>);
  ` },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'delayed-profile', setup(b) {
    b.onResolve({ filter: /^(next\/navigation|next\/dynamic|app\/lib\/(firebase-auth-state|partner-status-client|auth-modal-loader)|\.\.\/\.\.\/firebase|firebase\/firestore)$/ }, args => ({ path: args.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ loader: 'tsx', resolveDir: process.cwd(), contents:
      path === 'next/navigation' ? 'export const useRouter=()=>({push(){}});' :
      path === 'next/dynamic' ? `import React from 'react'; export default load=>{const C=React.lazy(load);return props=><React.Suspense fallback={null}><C {...props}/></React.Suspense>};` :
      path === 'app/lib/auth-modal-loader' ? 'export const preloadAuthModal=()=>{};' :
      path === 'app/lib/partner-status-client' ? 'export const fetchPartnerStatus=async()=>({isPartner:false});' :
      path === '../../firebase' ? 'export const db={};' :
      path === 'app/lib/firebase-auth-state' ? `
        import {useSyncExternalStore} from 'react';
        let snapshot={ready:false,user:null}; const listeners=new Set();
        window.restoreGuest=()=>{snapshot={ready:true,user:null};listeners.forEach(fn=>fn())};
        window.restoreUser=()=>{snapshot={ready:true,user:{uid:'test',displayName:'Дуже довге ім’я користувача для перевірки перенесення'}};listeners.forEach(fn=>fn())};
        export const useFirebaseAuthState=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>snapshot);
      ` : `
        export const doc=()=>({}),collection=()=>({}),query=()=>({}),where=()=>({}),setDoc=async()=>{};
        export const getDocs=async()=>({docs:[],empty:true});
        export const onSnapshot=(_,listener)=>{const timer=setTimeout(()=>listener({exists:()=>true,data:()=>({name:'Дуже довге ім’я користувача для перевірки перенесення',vins:Array.from({length:8},(_,i)=>'WVWZZZ1234567890'+i),selectedCars:Array.from({length:8},(_,i)=>'Volkswagen Golf, 2017, автомобіль '+i),deliveryMethod:'Самовивіз'})}),800);return()=>clearTimeout(timer)};
      `
    }));
  } }],
});
const server = http.createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(result.outputFiles[0].contents); }
  else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
  else if (req.url?.startsWith('/fonts/') && existsSync(`public${req.url}`)) { res.end(readFileSync(`public${req.url}`)); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root" style="margin:16px"></div><script src="/bundle.js"></script>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const geometry = () => page.evaluate(() => ({
      panel: document.querySelector('.hero-account-surface').getBoundingClientRect().height,
      buttons: document.querySelector('.hero-account-actions').getBoundingClientRect().top,
      following: document.querySelector('#following-section').getBoundingClientRect().top,
      greetingText: document.querySelector('.hero-benefits > div:first-child p').getBoundingClientRect().x,
      benefitRows: [...document.querySelectorAll('.hero-benefit')].map(el => ({top:el.getBoundingClientRect().top,height:el.getBoundingClientRect().height})),
    }));
    const initial = await geometry();
    const metrics = await page.evaluate(() => ({
      panelHeight: document.querySelector('.hero-account-surface').getBoundingClientRect().height,
      actionHeight: document.querySelector('.hero-account-actions').getBoundingClientRect().height,
      labels: [...document.querySelectorAll('.hero-benefits button > span:last-child')].map(el => ({ visible: el.clientHeight, content: el.scrollHeight })),
    }));
    assert(metrics.labels.every(label => label.content <= label.visible + 1), `Benefit labels fit at ${width}px`);
    await page.evaluate(() => window.restoreGuest());
    await page.getByRole('button', { name: 'Увійти', exact: true }).waitFor();
    assert.deepEqual(await geometry(), initial, `Guest restoration keeps geometry at ${width}px`);
    await page.evaluate(() => window.restoreUser());
    await page.getByRole('button', { name: 'Відкрити профіль', exact: true }).waitFor();
    assert.deepEqual(await geometry(), initial, `User restoration keeps geometry at ${width}px`);
    await page.getByRole('list', { name: 'Збережені дані профілю' }).waitFor();
    assert.deepEqual(await geometry(), initial, `Late profile/chunk keeps geometry at ${width}px`);
    assert(await page.locator('.hero-profile-actions button').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().height >= 44 && button.getBoundingClientRect().width >= 44)), 'Primary actions retain 44px targets');
    assert(await page.locator('.hero-profile-slot').evaluate(el => el.scrollHeight <= el.clientHeight + 1), 'Saved profile fits reserved space');
    assert.equal(await page.locator('.hero-profile-invitation').count(), 0, 'Profile invitation stays hidden for signed-in users');
    await page.screenshot({ path: `/tmp/home-auth-layout-${width}.png` });
    console.log(JSON.stringify({ width, ...metrics, stableGeometry: true, actionTargets: "44px+" }));
    await page.close();
  }
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
