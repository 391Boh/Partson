import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { build, stop } from 'esbuild';
const { chromium } = await import(process.argv[2] || 'playwright');
const css = readFileSync('public/styles/dev-site.css');
const result = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import HeroAccountClient from './app/components/HeroAccountClient';
    createRoot(document.getElementById('root')).render(<div className="home-static">
      <div className="hero-account-surface hero-bonus-surface flex min-w-0 flex-col justify-center gap-3 rounded-[24px] border border-white/30 bg-slate-950/70 p-3.5 sm:p-4 lg:p-4"><HeroAccountClient variant="panel" /></div>
      <div id="following-section">Наступний блок</div>
    </div>);
  ` },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'delayed-profile', setup(b) {
    b.onResolve({ filter: /^(next\/navigation|next\/dynamic|app\/lib\/(firebase-auth-state|firebase-firestore|partner-status-client|auth-modal-loader)|\.\.\/\.\.\/firebase|firebase\/firestore)$/ }, args => ({ path: args.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ loader: 'tsx', resolveDir: process.cwd(), contents:
      path === 'next/navigation' ? 'export const useRouter=()=>({push(){}});' :
      path === 'next/dynamic' ? `import React from 'react'; export default load=>{const C=React.lazy(load);return props=><React.Suspense fallback={null}><C {...props}/></React.Suspense>};` :
      path === 'app/lib/auth-modal-loader' ? 'export const preloadAuthModal=()=>{};' :
      path === 'app/lib/partner-status-client' ? 'export const fetchPartnerStatus=async()=>({isPartner:false});' :
      (path === '../../firebase' || path === 'app/lib/firebase-firestore') ? 'export const db={};' :
      path === 'app/lib/firebase-auth-state' ? `
        import {useSyncExternalStore} from 'react';
        let snapshot={ready:false,user:null}; const listeners=new Set();
        window.restoreGuest=()=>{snapshot={ready:true,user:null};listeners.forEach(fn=>fn())};
        window.restoreUser=()=>{snapshot={ready:true,user:{uid:'test',displayName:'Дуже довге ім’я користувача для перевірки перенесення'}};listeners.forEach(fn=>fn())};
        export const useFirebaseAuthState=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>snapshot);
      ` : `
        export const doc=()=>({}),collection=()=>({}),query=(...parts)=>({parts}),where=()=>({}),limit=count=>({limit:count}),setDoc=async()=>{};
        export const getDocs=async request=>{window.heroOrderLimit=request.parts.find(part=>part.limit)?.limit;return {docs:[],empty:true}};
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
const finishClosing = async closing => {
  let timer;
  try {
    await Promise.race([closing, new Promise(resolve => { timer = setTimeout(resolve, 3000); })]);
  } finally { clearTimeout(timer); }
};
try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const geometry = () => page.evaluate(() => ({
      panel: document.querySelector('.hero-account-surface').getBoundingClientRect().height,
      buttons: document.querySelector('.hero-account-actions')?.getBoundingClientRect().top ?? null,
      following: document.querySelector('#following-section').getBoundingClientRect().top,
      // The animated list changes containing blocks with its transform.
      // External geometry and stable row heights are the regression contract.
      benefitRows: [...document.querySelectorAll('.hero-benefit')].map(el => ({height:el.offsetHeight})),
    }));
    const initial = await geometry();
    const metrics = await page.evaluate(() => ({
      panelHeight: document.querySelector('.hero-account-surface').getBoundingClientRect().height,
      actionHeight: document.querySelector('.hero-account-actions')?.getBoundingClientRect().height ?? 0,
      labels: [...document.querySelectorAll('.hero-benefits button > span:last-child')].map(el => ({ visible: el.clientHeight, content: el.scrollHeight })),
    }));
    assert(metrics.labels.every(label => label.content <= label.visible + 1), `Benefit labels fit at ${width}px`);
    const toggle = page.locator('.hero-bonus-toggle');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('.hero-benefit:visible').count(), 0, 'Initial introduction hides bonus actions');
    await toggle.focus();
    await toggle.press('Enter');
    await page.waitForTimeout(400);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('.hero-benefit:visible').count(), 4, 'Keyboard activation reveals four actionable benefits');
    assert.equal(await page.locator('.hero-benefit-list').getAttribute('inert'), null);
    assert.deepEqual(await geometry(), initial, 'Opening bonuses does not shift the layout');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Revealed bonuses fit the viewport');
    await toggle.press('Enter');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.hero-benefit:visible').count(), 0, 'Second activation restores introduction');
    assert.deepEqual(await geometry(), initial, 'Closing bonuses restores the compact introduction');
    await page.evaluate(() => window.restoreGuest());
    await page.waitForTimeout(100);
    assert.equal(await page.getByRole('button', { name: 'Увійти', exact: true }).count(), 0, 'Bonus panel has no login button');
    assert.equal(await page.getByRole('button', { name: 'Реєстрація', exact: true }).count(), 0, 'Bonus panel has no registration button');
    assert.equal(await page.locator('.hero-account-actions').count(), 0, 'Guests have no empty account footer');
    assert.equal(await page.locator('.hero-bonus-symbol svg').count(), 1, 'Guest introduction has a gift icon');
    assert.deepEqual(await geometry(), initial, `Guest restoration keeps geometry at ${width}px`);
    await page.evaluate(() => window.restoreUser());
    await page.getByRole('button', { name: 'Відкрити профіль', exact: true }).waitFor();
    const signedIn = await geometry();
    await page.getByRole('list', { name: 'Збережені дані профілю' }).waitFor();
    assert.deepEqual(await geometry(), signedIn, `Late profile/chunk keeps geometry at ${width}px`);
    assert.equal(await page.evaluate(() => window.heroOrderLimit), 1, 'First-order check reads at most one order');
    assert(await toggle.evaluate(button => button.getBoundingClientRect().height >= 44 && button.getBoundingClientRect().width >= 44), 'Bonus action retains a 44px target');
    // Signed in: the saved car/VIN live in the intro's fixed track, so the
    // card keeps the guest height (no layout shift on sign-in).
    assert(await page.locator('.hero-bonus-intro[data-profile]').evaluate(el => el.scrollHeight <= el.clientHeight + 1), 'Saved profile fits the intro track');
    assert.equal((await geometry()).panel, initial.panel, `Signed-in card keeps the guest height at ${width}px`);
    assert.equal(await page.locator('.hero-profile-invitation').count(), 0, 'Profile invitation stays hidden for signed-in users');
    await page.screenshot({ path: `/tmp/home-auth-layout-${width}.png` });
    console.log(JSON.stringify({ width, ...metrics, stableGeometry: true, actionTargets: "44px+" }));
    await finishClosing(context.close());
  }
} finally {
  const closingBrowser = browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  // Some Chrome channels finish disconnecting after their process has exited.
  // Tear down the fixture server/service even if that close acknowledgment stalls.
  await finishClosing(closingBrowser);
  stop();
}
