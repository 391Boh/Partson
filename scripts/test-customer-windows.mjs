// Renders the order and contact windows offline with fixture data and checks
// they fit every viewport. Usage: node scripts/test-customer-windows.mjs <playwright>
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';
const { chromium } = await import(process.argv[2] || 'playwright');
const shots = process.env.SHOTS_DIR || '/tmp';
mkdirSync(shots, { recursive: true });

const ORDERS = `[
  {id:'a1',orderId:'PO-10482',createdAt:{seconds:1760600000},totalAmount:4380,discountAmount:230,deliveryMethod:'Нова Пошта',paymentMethod:'Оплата при отриманні',trackingNumber:'20451234567890',warehouse:'Львів, відділення №12',read:true,shipped:true,
   cartItems:[{name:'Колодки гальмівні передні',article:'0 986 494 525',price:1450,quantity:2,code:'1'},{name:'Фільтр масляний',article:'W 712/95',price:380,quantity:1,code:'2'},{name:'Олива моторна 5W-30 5 л',article:'LM 8973',price:1100,quantity:1,code:'3'}]},
  {id:'a2',orderId:'PO-10311',createdAt:{seconds:1758000000},totalAmount:12650,deliveryMethod:'Самовивіз',paymentMethod:'Карткою онлайн',read:true,shipped:true,completed:true,cartItems:[{name:'Комплект ГРМ з помпою',article:'KP15578XS-1',price:12650,quantity:1,code:'4'}]},
  {id:'a3',orderId:'PO-10512',createdAt:{seconds:1760690000},totalAmount:860,deliveryMethod:'Нова Пошта',paymentMethod:'Оплата при отриманні',cartItems:[{name:'Свічка запалювання',article:'FR7DC+',price:215,quantity:4,code:'5'}]}
]`;
const CART = `[
  {code:'1',name:'Колодки гальмівні передні (BOSCH)',article:'0 986 494 525',producer:'BOSCH',price:1450,quantity:2},
  {code:'2',name:'Фільтр масляний',article:'W 712/95',producer:'MANN-FILTER',price:380,quantity:1},
  {code:'6',name:'Амортизатор задній газовий',article:'343 425',producer:'KYB',price:2140,originalPrice:2390,isPromoPrice:true,quantity:2}
]`;

const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import Order from './app/components/Order';import Contact from './app/components/Contact';
    const p=new URLSearchParams(location.search);const view=p.get('view')||'cart';
    const close=()=>{window.dialogClosed=true};
    createRoot(document.getElementById('root')).render(view.startsWith('contact')?<Contact onClose={close}/>:<Order onClose={close}/>);` },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, banner: { js: 'var process={env:{}};' },
  plugins: [{ name: 'offline-windows', setup(b) {
    b.onResolve({ filter: /^(firebase\/(auth|firestore)|\.\.\/\.\.\/firebase|app\/context\/CartContext)$/ }, a => ({ path: a.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ resolveDir: process.cwd(), contents:
      path === 'firebase/auth' ? `import {auth} from '../../firebase';export const onAuthStateChanged=(a,cb)=>{cb(auth.currentUser);return()=>{}};export const getAuth=()=>auth;`
      : path === 'firebase/firestore' ? `const p=new URLSearchParams(location.search);const orders=p.get('orders')==='none'?[]:${ORDERS};
          const docs=orders.map(o=>({id:o.id,data:()=>o}));
          export const collection=()=>({});export const query=()=>({});export const where=()=>({});export const orderBy=()=>({});export const limit=()=>({});export const doc=()=>({});
          export const getDocs=async()=>({empty:docs.length===0,size:docs.length,docs});
          export const getFirestore=()=>({});export const addDoc=async()=>({id:'new'});export const setDoc=async()=>{};export const updateDoc=async()=>{};export const Timestamp={now:()=>({seconds:Date.now()/1000})};
          export const getDoc=async()=>({exists:()=>true,data:()=>({name:'Олександр',phone:'+380671234567',profileBackground:p.get('cover')||'enthusiast'})});
          export const onSnapshot=(q,cb)=>{setTimeout(()=>cb({docs}),50);return()=>{}};`
      : path === 'app/context/CartContext' ? `const p=new URLSearchParams(location.search);let items=p.get('view')==='empty'?[]:${CART};
          export const useCart=()=>({cartItems:items,removeFromCart:()=>{},clearCart:()=>{},addToCart:()=>{}});`
      : `const p=new URLSearchParams(location.search);export const auth={currentUser:p.get('guest')?null:{uid:'fixture',email:'customer@example.com',getIdToken:async()=>'t'}};export const db={};export const app={};` }));
  } }],
});
const server = http.createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
  else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(readFileSync('public/styles/dev.css')); }
  else if (req.url.startsWith('/profile-covers/')) { res.setHeader('Content-Type', 'image/svg+xml'); res.end(readFileSync(`public${req.url}`)); }
  else if (req.url.startsWith('/api/partner-status')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ isPartner: true, totalSpent: 17030 })); }
  else if (req.url.startsWith('/?')) { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/bundle.js"></script></body></html>'); }
  else { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = `http://127.0.0.1:${server.address().port}`;
try {
  for (const [width, height] of [[320, 740], [390, 844], [844, 390], [1440, 950]]) {
    for (const view of ['cart', 'history', 'empty', 'checkout', 'contact', 'contact-address', 'contact-callback']) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      if (process.env.DEBUG) page.on('console', m => console.log('console:', m.text()));
      if (process.env.DEBUG) page.on('pageerror', e => console.log('pageerror:', e.message));
      await page.goto(`${base}/?view=${view}`);
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      if (view === 'history') {
        await dialog.getByRole('button', { name: /Історія/ }).click();
        await page.waitForSelector('.cw-order-card');
        await dialog.locator('.cw-order-summary').first().click();
      }
      if (view === 'checkout') await dialog.getByRole('button', { name: /Оформити замовлення/ }).click();
      if (view === 'contact-callback') await dialog.getByRole('button', { name: /зворотний дзвінок/ }).click();
      if (view === 'contact-address') await dialog.getByRole('button', { name: /Локація/ }).click();
      await page.waitForTimeout(500);
      const box = await dialog.boundingBox();
      assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `${view} ${width}: window fits the viewport`);
      assert(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1), `${view} ${width}: no horizontal overflow`);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${shots}/win-${view}-${width}.png` });
      await page.close();
    }
    console.log(`PASS ${width}x${height}: cart, history, empty cart, checkout, contacts, location, callback`);
  }
} finally { await browser.close(); server.close(); }
