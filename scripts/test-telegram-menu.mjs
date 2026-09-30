import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, mocks = {}, extra = '') {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => mocks[name] || {}, console, Buffer, setTimeout, clearTimeout });
  return exports;
}
const menu = load('app/lib/telegram-menu.ts');
assert.equal(menu.parseBotCommand('/find@PartsON_bot фільтр').args, 'фільтр');
assert.equal(menu.parseBotCommand('/catalogue').name, 'catalogue');
assert.equal(menu.parseBotCommand('фільтр'), null);
for (const origin of ['http://localhost:3000', 'https://partson.shop']) {
  const buttons = menu.buildBotHomeKeyboard(origin).inline_keyboard.flat();
  for (const button of buttons) if (button.callback_data) assert.ok(Buffer.byteLength(button.callback_data) <= 64);
  assert.ok(buttons.some(button => button.callback_data === 'home:orders'));
  assert.equal(Boolean(buttons.at(-1).web_app), origin.startsWith('https:'));
}
const sent = [], writes = [];
let searchFails = false;
const userRef = { id: 'user1', set: async patch => { writes.push(patch); } };
const query = { where: () => query, limit: () => query, get: async () => ({ docs: [{ id: 'user1', ref: userRef }], empty: false }) };
const api = load('app/api/telegram/bot/route.ts', {
  'firebase-admin/firestore': { FieldValue: { delete: () => 'DELETE' } },
  'app/lib/firebase-admin': { getFirebaseAdminDb: () => ({ collection: () => query }) },
  'app/lib/telegram-menu': menu,
  'app/lib/telegram-bot': {
    getTelegramBotName: () => 'PartsON_bot',
    ensureBotCommandsRegistered() {}, ensureBotMenuButtonConfigured() {}, ensureBotProfileConfigured() {},
    sendTelegramMessage: async (...args) => { sent.push(args); return { ok: true }; },
    sendTelegramChatAction: async () => ({}),
  },
  'app/lib/telegram-analytics': { recordTelegramBotEvent: async () => {} },
  'app/lib/telegram-notify': { readTelegramNotifyChatIds: () => [] },
  'app/lib/site-url': { getSiteUrl: () => 'https://partson.shop' },
  'app/lib/telegram-order-message': { escapeTelegramHtml: text => text },
  'app/lib/catalog-server': {
    fetchEuroRate: async () => 40,
    fetchCatalogProductsByQuery: async () => { if (searchFails) throw Error('offline'); return { items: [] }; },
  },
  'app/lib/telegram-callback': { answerTelegramCallback: async () => ({ ok: true }) },
}, '\nexports.test = { processUpdate, handleFind, handleCallbackQuery };');
const message = text => ({ message: { text, from: { id: 1 }, chat: { id: 1 } } });
await api.test.processUpdate(message('/cancel'));
assert.equal(writes.at(-1).supportMode, false);
assert.equal(writes.at(-1).checkoutStep, 'DELETE');
assert.ok(!('telegramCart' in writes.at(-1)), 'Cancel preserves cart');
assert.equal(sent.at(-1)[1], menu.BOT_HOME_TEXT);
await api.test.processUpdate(message('/find@PartsON_bot'));
assert.ok(sent.at(-1)[1].includes('Напишіть'));
const count = sent.length;
await api.test.processUpdate(message('/find@OtherBot'));
assert.equal(sent.length, count);
await api.test.handleCallbackQuery({ id: 'c1', data: 'home:menu', from: { id: 1 }, message: { chat: { id: 1 } } });
assert.equal(sent.at(-1)[1], menu.BOT_HOME_TEXT);
searchFails = true;
await api.test.handleFind('1', 'filter');
assert.ok(sent.at(-1)[1].includes('тимчасово недоступний'));
searchFails = false;
await api.test.handleFind('1', 'filter');
assert.ok(sent.at(-1)[1].includes('Нічого не знайдено'));
console.log('Passed: menu, command addressing, dialog cancellation preserves cart, menu callback, search failure versus empty result. All services mocked.');
