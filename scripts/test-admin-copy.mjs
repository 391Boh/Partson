import assert from 'node:assert/strict';
const { chromium } = await import(process.argv[2] || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.adminCopy !== undefined);
  const check = async isAdmin => page.evaluate(admin => {
    window.dispatchEvent(new CustomEvent('partson:adminStateChange', { detail: { isAdmin: admin } }));
    const el = document.createElement('div');
    el.className = 'select-none';
    el.textContent = 'Admin copy test';
    el.addEventListener('copy', event => event.preventDefault());
    document.body.append(el);
    const allowed = type => el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    return { copy: allowed('copy'), context: allowed('contextmenu'), select: allowed('selectstart'),
      css: getComputedStyle(el).userSelect,
      shortcut: el.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true })) };
  }, isAdmin);
  assert.equal((await check(false)).copy, false);
  const admin = await check(true);
  assert.equal(admin.copy, true);
  assert.equal(admin.context, true);
  assert.equal(admin.select, true);
  assert.equal(admin.shortcut, true);
  assert.equal(admin.css, 'text');
  assert.equal((await check(false)).copy, false);
  console.log('Admin copy browser checks passed: selection, copy, context menu, Ctrl+C and logout.');
} finally { await browser.close(); }
