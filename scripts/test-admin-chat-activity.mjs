import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const records = new Map([
  ['users/admin-a', { name: 'Олена' }], ['users/admin-b', { name: 'Тарас' }],
  ['messages/m1', { userId: 'customer', sender: 'user' }],
  ['messages/other', { userId: 'another', sender: 'user' }],
]);
const merge = (a, b) => {
  for (const [key, value] of Object.entries(b)) {
    a[key] = value && typeof value === 'object' && !(value instanceof Date) ? merge(a[key] || {}, value) : value;
  }
  return a;
};
const ref = path => ({ path, id: path.split('/').at(-1), collection: name => collection(`${path}/${name}`),
  get: async () => ({ id: path.split('/').at(-1), exists: records.has(path), data: () => records.get(path), ref: ref(path) }) });
const collection = path => ({ doc: id => ref(`${path}/${id}`), get: async () => ({ docs: [...records.entries()].filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/')).map(([key, value]) => ({ id: key.split('/').at(-1), data: () => value })) }) });
const db = { collection, runTransaction: async fn => fn({
  get: doc => doc.get(), getAll: (...docs) => Promise.all(docs.map(doc => doc.get())),
  set: (doc, data) => records.set(doc.path, merge(records.get(doc.path) || {}, data)),
  update: (doc, data) => records.set(doc.path, merge(records.get(doc.path), data)),
  create: (doc, data) => { assert.ok(!records.has(doc.path)); records.set(doc.path, data); },
}) };
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('app/api/admin/chat-activity/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, require: name => ({
  'next/server': { NextResponse: { json: (data, options) => ({ data, ...options }) } },
  'app/api/_lib/admin-auth': { verifyAdminRequest: async request => request.admin ? { uid: request.admin } : null },
  'app/lib/firebase-admin': { getFirebaseAdminDb: () => db },
})[name] });
const post = (admin, body) => exports.POST({ admin, json: async () => body });
const get = admin => exports.GET({ admin, nextUrl: new URL('http://test?userId=customer') });
assert.equal((await post(null, {})).status, 403);
assert.equal((await get(null)).status, 403);
assert.equal((await post('admin-a', { userId: '../bad', action: 'view', messageIds: ['m1'] })).status, 400);
for (const admin of ['admin-a', 'admin-b']) {
  assert.equal((await post(admin, { userId: 'customer', action: 'view', messageIds: ['m1', 'other'] })).status, 200);
  await post(admin, { userId: 'customer', action: 'mark', messageIds: ['m1'], active: true });
}
await post('admin-a', { userId: 'customer', action: 'mark', messageIds: ['m1'], active: false });
const activity = (await get('admin-b')).data.activity;
assert.deepEqual(Object.keys(activity.m1.viewers).sort(), ['admin-a', 'admin-b']);
assert.equal(activity.m1.marks['admin-a'].active, false);
assert.equal(activity.m1.marks['admin-b'].active, true);
assert.equal(activity.other, undefined);
assert.equal(records.get('messages/m1').readByAdmin, true);
const reply = { userId: 'customer', action: 'reply', requestId: 'r1', type: 'text', text: 'Вітаю', repliedByName: 'Forged' };
assert.equal((await post('admin-a', reply)).status, 200);
assert.equal((await post('admin-a', reply)).status, 200);
assert.equal(records.get('messages/r1').repliedByName, 'Олена');
assert.equal((await post('admin-b', reply)).status, 409);
assert.equal((await post('admin-a', { ...reply, requestId: 'p1', type: 'product', product: { name: 'Товар', price: 42 } })).status, 200);
assert.equal(records.get('messages/p1').repliedByUid, 'admin-a');
assert.equal((await post('admin-a', { ...reply, text: '' })).status, 400);
assert.equal((await post('admin-a', { userId: 'customer', action: 'view', messageIds: Array(101).fill('m1') })).status, 400);
console.log('Admin chat passed: access control, two administrators, independent marks, thread isolation, trusted reply authors, idempotent text/product replies, validation.');
