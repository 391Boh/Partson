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
  const home = menu.buildBotHomeKeyboard(origin, 3).inline_keyboard;
  assert.equal(home.length, 2, 'Home menu stays compact');
  assert.ok(home.flat().some(button => button.text.includes('(3)')));
  const buttons = menu.buildBotMoreKeyboard(origin).inline_keyboard.flat();
  for (const button of [...home.flat(), ...buttons]) if (button.callback_data) assert.ok(Buffer.byteLength(button.callback_data) <= 64);
  assert.ok(buttons.some(button => button.callback_data === 'home:orders'));
  assert.equal(Boolean(buttons.find(button => button.text.includes('Сайт')).web_app), origin.startsWith('https:'));
}
const sent = [], writes = [];
let searchFails = false;
const userRef = { id: 'user1', set: async patch => { writes.push(patch); }, get: async () => ({ exists: true, data: () => ({ telegramCart: [{ quantity: 2 }] }) }) };
const sessions = new Map();
const query = {
  where: () => query, limit: () => query, get: async () => ({ docs: [{ id: 'user1', ref: userRef }], empty: false }),
  doc: id => ({
    set: async value => { sessions.set(id, value); },
    get: async () => ({ exists: sessions.has(id), data: () => sessions.get(id) }),
  }),
};
const edits = [];
let snapshotItems = [];
const product = n => ({ code: `00-${n}`, article: `ART${n}`, name: `Колодки ${n}`, producer: 'BOSCH', quantity: n % 2, priceEuro: 10 });
const catalogServer = {
  fetchEuroRate: async () => 40,
  toPriceUah: value => value == null ? null : value * 40,
  listCatalogFromSnapshot: async q => q.vehicle || q.group
    ? (lastSnapshotQuery = q, { items: snapshotItems, totalCount: 20, hasMore: true, nextOffset: 6 })
    : null,
  fetchCatalogProductsByQuery: async () => { if (searchFails) throw Error('offline'); return { items: [] }; },
};
let lastSnapshotQuery = null;
const adminDb = { getFirebaseAdminDb: () => ({ collection: () => query }) };
const orderMessage = { escapeTelegramHtml: text => text, formatOrderMoney: value => `${value} грн` };
const listing = load('app/lib/telegram-listing.ts', {
  'app/lib/firebase-admin': adminDb,
  'app/lib/catalog-server': catalogServer,
  'app/lib/catalog-search': { normalizeSearchQuery: text => text.trim() },
  'app/lib/telegram-order-message': orderMessage,
  'app/lib/product-url': { buildVisibleProductName: name => name },
  'app/lib/vehicle-fitment': { readVehicleSelection: value => value && value.brand && value.model ? value : null },
  'app/components/carBrands': { carBrands: [{ name: 'Audi' }] },
  'app/lib/seo-slug': { buildPlainSeoSlug: text => text.toLowerCase() },
  'app/lib/category-icons': { getCategoryEmoji: () => '🔧' },
  'app/lib/product-tree': { getProductTreeDataset: async () => ({ groups: [{ slug: 'brakes', label: 'Гальма', subgroups: [] }] }) },
  'app/lib/telegram-catalog-nav': {},
});
const api = load('app/api/telegram/bot/route.ts', {
  'firebase-admin/firestore': { FieldValue: { delete: () => 'DELETE' } },
  'app/lib/firebase-admin': adminDb,
  'app/lib/telegram-listing': listing,
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
  'app/lib/telegram-order-message': orderMessage,
  'app/lib/catalog-server': catalogServer,
  'app/lib/telegram-callback': {
    answerTelegramCallback: async () => ({ ok: true }),
    editTelegramMessageText: async (...args) => { edits.push(args); return { ok: true }; },
    deleteTelegramMessage: async () => ({ ok: true }),
  },
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

// Car + category combine into one query, and paging edits the same message.
const chat = { chat: { id: 7 }, message_id: 50 };
const vehicle = { brand: 'Audi', model: 'A4' };
snapshotItems = [1, 2, 3, 4, 5, 6].map(product);
const combined = listing.createListing({ id: 'abc', vehicle, vehicleLabel: 'Audi A4', group: 'Гальма', categoryLabel: 'Гальма', expandHierarchy: true });
await listing.saveListing('7', combined);
await api.test.handleCallbackQuery({ id: 'c2', data: 'l:abc:p:2', from: { id: 1 }, message: chat });
assert.equal(lastSnapshotQuery.vehicle.model, 'A4');
assert.equal(lastSnapshotQuery.group, 'Гальма');
assert.equal(lastSnapshotQuery.offset, 6);
const [, messageId, text, options] = edits.at(-1);
assert.equal(messageId, 50, 'Paging edits in place');
assert.ok(text.includes('Audi A4') && text.includes('Гальма') && text.includes('Знайдено: <b>20</b>') && text.includes('стор. 2 з 4'));
assert.ok(text.includes('7. Колодки 1'), 'Numbering continues across pages');
for (const button of options.replyMarkup.inline_keyboard.flat()) assert.ok(Buffer.byteLength(button.callback_data) <= 64);
const stale = sent.length;
await api.test.handleCallbackQuery({ id: 'c3', data: 'l:old:p:2', from: { id: 1 }, message: chat });
assert.equal(sent.length, stale, 'A stale list button sends nothing');
console.log('Passed: menu, command addressing, dialog cancellation preserves cart, menu callback, search failure versus empty result, combined filters, in-place paging, stale buttons. All services mocked.');
