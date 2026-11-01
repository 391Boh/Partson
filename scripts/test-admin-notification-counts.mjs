import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let allowed = false, limited = false, failed = false, queries = 0, now = 1000;
const rows = {
  messages: [{ sender: 'user' }, { sender: 'user', readByAdmin: false }, { sender: 'user', readByAdmin: true }, { sender: 'manager' }],
  orders: [{}, { read: false }, { read: true }], zvyaz: [{}, { read: true }],
};
const query = (name, filters = []) => ({
  where: (field, op, value) => { assert.equal(op, '=='); return query(name, [...filters, [field, value]]); },
  count: () => ({ get: async () => { queries++; if (failed) throw new Error('offline'); return { data: () => ({ count: rows[name].filter(row => filters.every(([key, value]) => row[key] === value)).length }) }; } }),
});
const exports = {};
const mocks = {
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  'app/api/_lib/admin-auth': { verifyAdminRequest: async () => allowed },
  'app/api/_lib/rateLimit': { checkRateLimit: () => ({ ok: !limited }) },
  'app/lib/firebase-admin': { getFirebaseAdminDb: () => ({ collection: name => query(name) }) },
};
vm.runInNewContext(ts.transpileModule(readFileSync('app/api/admin/notification-counts/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports, require: name => { assert(name in mocks, name); return mocks[name]; }, Date: { now: () => now } });
const request = force => ({ nextUrl: new URL(`http://local/counts${force ? '?refresh=1' : ''}`) });
assert.equal((await exports.GET(request())).status, 403); assert.equal(queries, 0);
allowed = true;
const results = await Promise.all([exports.GET(request()), exports.GET(request())]);
assert.deepEqual(await results[0].json(), { messages: 2, orders: 2, calls: 1, total: 5 });
assert.equal(queries, 6, 'Concurrent administrators share six aggregate reads, without loading documents');
assert.match(results[1].headers.get('cache-control'), /private.*no-store/);
await exports.GET(request()); assert.equal(queries, 6);
rows.orders.push({});
assert.equal((await (await exports.GET(request(true))).json()).total, 6, 'Read/write events can refresh immediately');
now += 5001; await exports.GET(request()); assert.equal(queries, 18);
limited = true; assert.equal((await exports.GET(request())).status, 429); limited = false;
failed = true; assert.equal((await exports.GET(request(true))).status, 503);
failed = false; assert.equal((await exports.GET(request(true))).status, 200);
allowed = false; assert.equal((await exports.GET(request())).status, 403, 'Cached counts still require authorization');
console.log('PASS aggregate counts, legacy unread fields, authorization, deduplication, cache, refresh, limits and recovery');
