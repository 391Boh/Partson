import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const { chromium } = await import(process.argv[2] || 'playwright');
const bundle = await build({
  stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Panel from './app/components/AdminChatPanel';createRoot(document.getElementById('root')).render(<Panel isOpen onClose={()=>{}}/>);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_ADMIN_EMAILS': '""' },
  plugins: [{ name: 'offline-chat', setup(b) {
    b.onResolve({ filter: /^(firebase\/firestore|\.\.\/\.\.\/firebase|app\/lib\/get-admin-token)$/ }, a => ({ path: a.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents: a.path === 'app/lib/get-admin-token'
      ? 'export const getAdminIdToken=async()=>"fixture-token";export const getCurrentAdminUser=async()=>({uid:"admin",displayName:"Менеджер"});'
      : a.path === 'firebase/firestore'
      ? `let customer={name:'Клієнт із аватаром',email:'customer@example.com',avatar:'partner-turbo',avatarFrame:'enthusiast',chatUserId:'legacy-chat',role:'user'};const data={users:[{id:'customer',data:()=>customer}],messages:[{id:'m1',data:()=>({userId:'legacy-chat',sender:'user',text:'Допоможіть підібрати деталь',createdAt:{seconds:1700000000}})}],orders:[{id:'o1',data:()=>({uid:'customer',totalAmount:12500,name:'Клієнт',phone:'',createdAt:{seconds:1700000000}})}]};export const collection=(db,path)=>({path});export const doc=(db,...path)=>({path:path.join('/')});export const query=ref=>ref;export const orderBy=()=>({});export const onSnapshot=(ref,cb)=>{if(ref.path.includes('/'))cb({data:()=>({})});else cb({docs:data[ref.path]??[]});if(ref.path==='users')window.changeCustomerAvatar=()=>{customer={...customer,avatar:'car',avatarFrame:'regular'};cb({docs:data.users})};return()=>{}};export const getDoc=async()=>({data:()=>({name:'Менеджер'})});export const setDoc=async()=>{};export const updateDoc=async()=>{};export const addDoc=async()=>{};export const deleteDoc=async()=>{};export const serverTimestamp=()=>({});export const arrayUnion=()=>({});export const arrayRemove=()=>({});`
      : 'export const db={};' }));
  } }],
});
const server = http.createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
  else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(readFileSync('public/styles/dev.css')); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/admin/**', r => r.fulfill({ json: r.request().url().includes('/partners') ? { uids: [] } : { activity: { m1: { viewers: { admin: { name: 'Менеджер', at: Date.now() } } } } } }));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const card = page.locator('[data-admin-card]').filter({ hasText: 'Клієнт із аватаром' });
    await card.waitFor();
    assert.equal(await card.locator('.profile-avatar--partner[data-frame="violet"]').count(), 1);
    assert.equal(await card.locator('[data-animated="true"]').count(), 0);
    await card.click();
    const active = page.locator('.admin-chat-workspace .profile-avatar[data-animated="true"]');
    await active.waitFor();
    assert.equal(await active.getAttribute('data-motion-tier'), 'partner');
    assert.equal(await active.getAttribute('data-frame'), 'violet');
    assert.equal(await page.locator('.admin-chat-sidebar .profile-avatar--partner').count(), 1);
    assert.equal(await active.locator('svg').count() > 0, true);
    await page.evaluate(() => window.changeCustomerAvatar());
    await page.waitForFunction(() => !!document.querySelector('.admin-chat-workspace .profile-avatar--basic[data-frame="blue"][data-animated="true"]'));
    assert.equal(await page.locator('.admin-chat-sidebar .profile-avatar--basic[data-frame="blue"]').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/chat-avatars-${width}.png` });
    assert.deepEqual(errors, []);
    console.log(`PASS admin chat ${width}px: customer avatar, achievement frame, legacy chat ID mapping, static lists, role animation, live appearance updates.`);
    await page.close();
  }
} finally { await browser.close(); server.close(); }
