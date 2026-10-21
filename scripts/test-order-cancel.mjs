// Customer order cancellation, offline: the real cancel route and
// order-stock.ts against an in-memory Firestore, a fake 1C and no Telegram.
// Checks who may cancel, when, and that sold goods come back as a receipt
// ("Поступлення") exactly once — including a sale still being written.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const t = (globalThis.__orderCancelTest = { docs: new Map(), oneC: [], telegram: [], onSale: null });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const mocks = {
  'server-only': '',
  'next/server': 'export class NextResponse extends Response { static json(data, init) { return Response.json(data, init); } }',
  'next/cache': 'export const revalidatePath = () => {}; export const revalidateTag = () => {};',
  'firebase-admin/firestore': 'export const FieldValue = { serverTimestamp: () => "ts" };',
  'app/lib/firebase-admin': `
    const t = globalThis.__orderCancelTest;
    const ref = (id) => ({
      id,
      async get() { const data = t.docs.get(id); return { exists: Boolean(data), data: () => data && structuredClone(data) }; },
      async update(patch) { t.docs.set(id, { ...t.docs.get(id), ...structuredClone(patch) }); },
    });
    export const getFirebaseAdminDb = () => ({
      collection: () => ({ doc: ref }),
      async runTransaction(fn) {
        const writes = [];
        const result = await fn({ get: (r) => r.get(), update: (r, patch) => writes.push([r, patch]) });
        for (const [r, patch] of writes) await r.update(patch);
        return result;
      },
    });
    export const getFirebaseAdminAuth = () => ({
      async verifyIdToken(token) { if (token.startsWith('uid:')) return { uid: token.slice(4) }; throw new Error('bad token'); },
    });`,
  'app/api/_lib/oneC': `
    const t = globalThis.__orderCancelTest;
    export const clearAllOneCCache = () => {};
    export const oneCRequest = async (endpoint, { body }) => {
      t.oneC.push(body);
      if (body.Реалізація && t.onSale) await t.onSale();
      return { status: 200, text: JSON.stringify({ success: true }) };
    };`,
  'app/lib/catalog-page-route-cache': 'export const clearCatalogPageRouteCache = () => {};',
  'app/lib/catalog-server': `
    export const fetchExactCatalogProductByLookup = async (code) => ({ code, quantity: 5 });
    export const patchFullCatalogSnapshotProduct = () => {};`,
  'app/lib/product-edit-overrides': 'export const setProductEditOverride = () => {};',
  'app/lib/product-url': 'export const buildProductPath = (p) => "/product/" + p.code;',
  'app/lib/telegram-notify': `
    const t = globalThis.__orderCancelTest;
    export const sendTelegramNotification = async (text) => { t.telegram.push(text); return { ok: true }; };`,
  'app/api/_lib/partner-auth': 'export const invalidatePartnerStatus = () => {};',
  'app/api/_lib/rateLimit': 'export const checkRateLimit = () => ({ ok: true }); export const setRateLimitHeaders = () => {};',
};

const result = await build({
  entryPoints: { route: 'app/api/orders/cancel/route.ts', stock: 'app/api/_lib/order-stock.ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', outdir: 'out', splitting: false,
  plugins: [{ name: 'mocks', setup(b) {
    b.onResolve({ filter: new RegExp(`^(${Object.keys(mocks).map((k) => k.replace(/[/.-]/g, '\\$&')).join('|')})$`) }, (a) => ({ path: a.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, (a) => ({ contents: mocks[a.path], loader: 'js' }));
  } }],
});
const load = (name) => import('data:text/javascript;base64,' + Buffer.from(result.outputFiles.find((f) => f.path.endsWith(`${name}.js`)).text).toString('base64'));
// Each bundle carries its own copy of order-stock; they share state through globalThis only.
const route = await load('route');
const stock = await load('stock');

const call = async (orderId, { uid, token } = {}) => {
  const response = await route.POST(new Request('http://local/api/orders/cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(uid ? { authorization: `Bearer uid:${uid}` } : {}) },
    body: JSON.stringify({ orderId, cancelToken: token }),
  }));
  return { status: response.status, body: await response.json() };
};
const order = (id, extra = {}) => t.docs.set(id, {
  orderId: id, uid: 'owner', name: 'Покупець', phone: '+380', totalAmount: 900,
  paymentStatus: 'cash_on_delivery',
  cartItems: [{ code: 'A', quantity: 2 }, { code: 'B', quantity: 1 }],
  ...extra,
});
const receipts = () => t.oneC.filter((body) => body.Поступлення).map((body) => `${body.Код}×${body.Поступлення}`);

// Owner, sale already written: cancelled, and only what 1C accepted returns.
order('o1', { stockDeduction: { status: 'partial', items: [
  { code: 'A', quantity: 2, ok: true }, { code: 'B', quantity: 1, ok: false },
] } });
let res = await call('o1', { uid: 'owner' });
assert.equal(res.status, 200); assert.equal(res.body.ok, true);
assert.equal(t.docs.get('o1').cancelled, true);
assert.equal(t.docs.get('o1').cancelledBy, 'customer');
assert.deepEqual(receipts(), ['A×2'], 'Only the sold lines go back, as a receipt');
assert.equal(t.docs.get('o1').stockReturn.status, 'done');
assert.match(t.telegram.at(-1), /скасував замовлення №o1/);

// Repeat: idempotent, nothing written to 1C again.
res = await call('o1', { uid: 'owner' });
assert.equal(res.body.alreadyCancelled, true);
assert.deepEqual(receipts(), ['A×2']);

// Someone else's order, or no proof at all.
order('o2');
assert.equal((await call('o2', { uid: 'stranger' })).status, 403);
assert.equal((await call('o2')).status, 403);

// Manager already opened / shipped it, or it is prepaid: refused, untouched.
order('o3', { read: true });
res = await call('o3', { uid: 'owner' });
assert.equal(res.status, 409); assert.equal(res.body.code, 'in_progress');
assert.notEqual(t.docs.get('o3').cancelled, true);
order('o4', { shipped: true, read: true });
assert.equal((await call('o4', { uid: 'owner' })).body.code, 'in_progress');
order('o5', { paymentStatus: 'paid' });
res = await call('o5', { uid: 'owner' });
assert.equal(res.body.code, 'prepaid');
order('o6', { paymentStatus: 'pending' });
assert.equal((await call('o6', { uid: 'owner' })).body.code, 'prepaid');

// Guest: only the browser holding the cancel token.
order('g1', { uid: null, cancelTokenHash: sha256('secret-token') });
assert.equal((await call('g1', { token: 'wrong' })).status, 403);
res = await call('g1', { token: 'secret-token' });
assert.equal(res.status, 200);
assert.equal(t.docs.get('g1').stockReturn, undefined, 'Nothing sold yet, nothing to return');

// Cancelled before the sale: the sale is never written.
const salesBefore = t.oneC.filter((body) => body.Реалізація).length;
assert.equal((await stock.deductOrderStock('g1')).status, 'cancelled');
assert.equal(t.oneC.filter((body) => body.Реалізація).length, salesBefore);

// Cancelled while the sale is being written: returned once it finishes.
order('o7');
t.onSale = async () => { t.onSale = null; assert.equal((await call('o7', { uid: 'owner' })).status, 200); };
const before = receipts().length;
await stock.deductOrderStock('o7');
assert.deepEqual(receipts().slice(before).sort(), ['A×2', 'B×1']);
assert.equal(t.docs.get('o7').stockReturn.status, 'done');
await stock.returnOrderStock('o7');
assert.equal(receipts().length, before + 2, 'A second return is a no-op');

console.log('Order cancel passed: owner/guest proof, manager-opened and prepaid refused, idempotent, receipts only for sold lines, sale-in-flight returned once.');
