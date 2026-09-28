import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.argv[2] || 'playwright');
const source = readFileSync('app/components/AdminChatPanel.tsx', 'utf8');
const shellClass = source.match(/className="(admin-panel-shell[^\"]+)"/)[1];
const cssName = JSON.parse(readFileSync('public/styles/manifest.json', 'utf8'));
const cssPath = typeof cssName === 'string' ? cssName : Object.values(cssName).find(value => typeof value === 'string' && value.endsWith('.css'));
assert.ok(cssPath, 'Built CSS manifest');
const css = readFileSync(`public${cssPath.startsWith('/') ? '' : '/styles/'}${cssPath}`, 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  for (const width of [390, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<style>${css}</style><div class="${shellClass}"><header style="height:100px;flex-shrink:0">Панель адміністратора</header><main class="flex-1 min-h-0 p-2"><div class="admin-chat-workspace"><aside class="admin-chat-sidebar">Діалоги</aside><div class="min-w-0 min-h-0 flex flex-col"><div class="flex-1 min-h-0 overflow-y-auto">${'<p>Повідомлення адміністратора</p>'.repeat(60)}</div><input placeholder="Написати повідомлення"></div></div></main></div>`);
    const result = await page.evaluate(() => {
      const shell = document.querySelector('.admin-panel-shell').getBoundingClientRect();
      const input = document.querySelector('input').getBoundingClientRect();
      return { left: shell.left, right: shell.right, width: shell.width, bottom: shell.bottom, inputBottom: input.bottom, sidebar: getComputedStyle(document.querySelector('aside')).display, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.ok(result.left >= 0 && result.right <= width, JSON.stringify(result));
    if (width >= 768) {
      const expected = Math.min(width * 0.5, 1100);
      assert.ok(Math.abs(result.width - expected) < 2, `Half-width panel at ${width}: ${result.width}, expected ~${expected}`);
    } else {
      assert.ok(result.width > width - 80, `Full-bleed panel at ${width}: ${result.width}`);
    }
    assert.equal(result.sidebar === 'none', width < 1024);
    assert.equal(result.overflow, false);
    assert.ok(result.inputBottom <= result.bottom, 'Composer remains in panel');
  }
  console.log('Admin layout passed at 390, 768, 1440 and 2560 px: half-width panel from md up, full-bleed on mobile, responsive sidebar, visible composer, no horizontal overflow.');
} finally { await browser.close(); }
