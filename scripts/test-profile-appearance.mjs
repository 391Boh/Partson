import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const { chromium } = await import(process.argv[2] || 'playwright');
const bundle = await build({
  stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Profile from './app/components/AccountInfo';const p=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<Profile user={{uid:'fixture',email:'customer@example.com'}} onClose={()=>{window.dialogClosed=true}}/>);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'offline-profile', setup(b) {
    b.onResolve({ filter: /^(firebase\/(auth|firestore)|\.\.\/\.\.\/firebase)$/ }, a => ({ path: a.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents: a.path === 'firebase/auth'
      ? 'export const signOut=async()=>{};export const updatePassword=async()=>{};export const reauthenticateWithCredential=async()=>{};export const EmailAuthProvider={credential:()=>({})};'
      : a.path === 'firebase/firestore'
      ? `const p=new URLSearchParams(location.search);let data={name:'Олександр Коваленко',email:'customer@example.com',phone:'+380671234567',vins:[],avatar:p.get('role')==='admin'?'admin-shield':'car',avatarFrame:null,role:p.get('role')==='admin'?'admin':'user'};const snap={exists:()=>true,data:()=>data};export const doc=()=>({});export const getDoc=async()=>snap;export const onSnapshot=(ref,cb)=>{cb(snap);window.applyAppearance=patch=>{data={...data,...patch};cb(snap)};return()=>{}};export const setDoc=()=>{throw Error('No cloud writes')};export const query=()=>({});export const collection=()=>({});export const where=()=>({});export const getDocs=async()=>({empty:true,docs:[]});`
      : 'export const auth={currentUser:{uid:"fixture",getIdToken:async()=>"fixture-token"}};export const db={};' }));
  } }],
});
const server = http.createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
  else if (req.url.startsWith('/profile-covers/')) { res.setHeader('Content-Type', 'image/svg+xml'); res.end(readFileSync(`public${req.url}`)); }
  else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(readFileSync('public/styles/dev.css')); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [width, height] of (process.env.PROFILE_APPEARANCE_SMOKE ? [[390, 844], [1440, 950]] : [[320, 740], [390, 844], [844, 390], [1440, 950]])) {
    for (const role of (process.env.PROFILE_APPEARANCE_SMOKE ? ['partner'] : ['basic', 'partner', 'admin'])) {
      const page = await browser.newPage({ viewport: { width, height } });
      page.setDefaultTimeout(10000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      let failNext = false, saves = 0;
      const slowRefresh = role === 'partner' && width === 390;
      let statusComplete = false;
      if (slowRefresh) await page.addInitScript(() => sessionStorage.setItem('partson:achievement-preview:fixture', JSON.stringify({ value: { isPartner: true, totalSpent: 12500 }, savedAt: Date.now() - 60000 })));
      await page.route('**/api/partner-status', async r => {
        if (slowRefresh) await new Promise(resolve => setTimeout(resolve, 3000));
        statusComplete = true;
        await r.fulfill({ json: { isPartner: role !== 'basic', totalSpent: role === 'admin' ? 100000 : role === 'partner' ? 12500 : 0 } });
      });
      await page.route('**/api/profile-appearance', async r => {
        saves++;
        assert.equal(r.request().headers().authorization, 'Bearer fixture-token');
        const patch = r.request().postDataJSON();
        if (failNext) { failNext = false; return r.fulfill({ status: 503, json: { error: 'Тест: спробуйте ще раз' } }); }
        await page.evaluate(patch => window.applyAppearance(patch), patch);
        await r.fulfill({ json: { ok: true, ...patch } });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/?role=${role}`);
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      const main = dialog.locator('.profile-avatar-trigger .profile-avatar');
      await page.waitForFunction(role => document.querySelector('.profile-avatar-trigger .profile-avatar')?.dataset.motionTier === role, role);
      await page.waitForFunction(() => document.querySelector('.profile-avatar-trigger .profile-avatar')?.dataset.avatarMoving === 'true');
      await dialog.getByRole('button', { name: 'Змінити аватар', exact: true }).click();
      assert.equal(await dialog.locator('.profile-avatar-option [data-animated="true"]').count(), 0, 'Picker is static');
      await dialog.getByRole('button', { name: 'Рамки', exact: true }).click();
      if (slowRefresh) {
        assert.equal(statusComplete, false, 'The server refresh is still pending');
        assert.equal(await dialog.getByRole('button', { name: 'Аметист', exact: true }).isEnabled(), true, 'Previously earned frames appear immediately');
        assert.equal(await dialog.getByText('Перевіряємо доступні рамки…', { exact: true }).count(), 0);
      }
      const gold = dialog.getByRole('button', { name: /Золото/ });
      assert.equal(await gold.isDisabled(), role !== 'admin');
      if (role !== 'basic') {
        const frame = role === 'admin' ? gold : dialog.getByRole('button', { name: 'Аметист', exact: true });
        await frame.click();
        await page.waitForFunction(tone => document.querySelector('.profile-avatar-trigger .profile-avatar')?.dataset.frame === tone, role === 'admin' ? 'gold' : 'violet');
        await page.waitForFunction(() => document.querySelector('.profile-appearance-footer [role="status"]')?.textContent === 'Зміни зберігаються автоматично');
        assert.equal(saves, 1);
        failNext = true;
        await dialog.getByRole('button', { name: 'Класична', exact: true }).click();
        await page.waitForFunction(() => document.body.textContent.includes('Тест: спробуйте ще раз'));
        assert.equal(await main.getAttribute('data-frame'), role === 'admin' ? 'gold' : 'violet', 'Failed save rolls back');
      }
      await dialog.getByRole('button', { name: 'Фони', exact: true }).click();
      const goldCover = dialog.getByRole('button', { name: /Золота лінія/ });
      assert.equal(await goldCover.isDisabled(), role !== 'admin');
      assert.equal(await dialog.getByRole('button', { name: 'Тихий графіт', exact: true }).isEnabled(), true);
      if (role !== 'basic') {
        const cover = dialog.getByRole('button', { name: role === 'admin' ? 'Золота лінія' : 'Аметистова орбіта', exact: true });
        await cover.click();
        await page.waitForFunction(id => document.querySelector('.profile-cover-header')?.dataset.profileBackground === id, role === 'admin' ? 'legend' : 'enthusiast');
        await page.waitForFunction(() => document.querySelector('.profile-appearance-footer [role="status"]')?.textContent === 'Зміни зберігаються автоматично');
        failNext = true;
        await dialog.getByRole('button', { name: 'Тихий графіт', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.profile-appearance-footer [role="status"]')?.textContent === 'Зміни зберігаються автоматично');
        assert.equal(await dialog.locator('.profile-cover-header').getAttribute('data-profile-background'), role === 'admin' ? 'legend' : 'enthusiast', 'Cover save failure rolls back');
      }
      const asset = await page.request.get(new URL('/profile-covers/graphite.svg', page.url()).href);
      assert.match(asset.headers()['content-type'], /image\/svg/);
      const bounds = await dialog.boundingBox();
      assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, 'Dialog fits viewport');
      assert(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'No horizontal overflow');
      const done = dialog.getByRole('button', { name: 'Готово', exact: true });
      const doneBox = await done.boundingBox();
      assert(doneBox.y + doneBox.height <= bounds.y + bounds.height, 'Done stays reachable');
      await page.screenshot({ path: `/tmp/profile-appearance-${role}-${width}.png` });
      await done.click();
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal(await main.getAttribute('data-avatar-moving'), 'false', 'Hidden tabs pause');
      assert.equal(await dialog.locator('.profile-cover-background').getAttribute('data-avatar-moving'), 'false', 'Hidden tabs pause the cover too');
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal(await main.getAttribute('data-avatar-moving'), 'true');
      assert.equal(await dialog.locator('#profile-avatar-picker').count(), 0);
      await dialog.getByRole('button', { name: 'Змінити фон профілю', exact: true }).click();
      assert.equal(await dialog.getByRole('button', { name: 'Фони', exact: true }).getAttribute('aria-pressed'), 'true');
      await dialog.getByRole('button', { name: 'Аватар', exact: true }).click();
      await dialog.getByRole('button', { name: 'Ключ', exact: true }).click();
      await page.waitForFunction(() => localStorage.getItem('partson:avatar:fixture') === 'wrench');
      assert.equal(await main.getAttribute('data-motion-tier'), role, 'Motion follows the account, not the chosen art');
      await dialog.getByRole('button', { name: 'Готово', exact: true }).click();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await main.locator('.profile-avatar-glyph').evaluate(e => getComputedStyle(e).animationName), 'none');
      assert.equal(await main.evaluate(e => getComputedStyle(e, '::before').animationName), 'none');
      assert.equal(await dialog.locator('.profile-cover-background').evaluate(e => getComputedStyle(e).animationName), 'none', 'Reduced motion disables the background drift');
      // Simulate leaving the visible area; the shared observer must pause motion.
      await main.evaluate(e => e.style.transform = 'translateY(-5000px)');
      await page.waitForFunction(() => document.querySelector('.profile-avatar-trigger .profile-avatar')?.dataset.avatarMoving === 'false');
      await dialog.locator('.profile-cover-background').evaluate(e => e.style.translate = '0 -5000px');
      await page.waitForFunction(() => document.querySelector('.profile-cover-background')?.dataset.avatarMoving === 'false');
      assert.deepEqual(errors, []);
      console.log(`PASS ${role} ${width}x${height}: role motion, frames, persistence, rollback, responsive editor, reduced motion, offscreen pause`);
      await page.close();
    }
  }
} finally { await browser.close(); server.close(); }
