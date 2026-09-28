import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const records = new Map([['users/customer', { name: 'Test' }]]);
let totalSpent = 0;
const db = { collection: name => ({
  doc: uid => ({ get: async () => ({ exists: records.has(`${name}/${uid}`), data: () => records.get(`${name}/${uid}`) }), set: async data => records.set(`${name}/${uid}`, data) }),
  where: () => ({ get: async () => ({ docs: name === 'orders' ? [{ data: () => ({ totalAmount: totalSpent }) }] : [...records.entries()].filter(([key, data]) => key.startsWith('partnerGrants/') && data.active).map(([key]) => ({ id: key.split('/')[1] })) }) }),
}) };
const load = path => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: name => ({
      'server-only': {}, 'next/server': { NextResponse: { json: (data, options = {}) => ({ data, status: options.status || 200 }) } },
      'app/api/_lib/admin-auth': { verifyAdminRequest: async req => req.admin ? { uid: 'admin-a' } : null },
      'app/lib/firebase-admin': { getFirebaseAdminDb: () => db },
      'app/lib/partnership-discount': { PARTNER_THRESHOLD_UAH: 2000 },
    })[name],
  });
  return exports;
};
const api = load('app/api/admin/partners/route.ts');
const partner = load('app/api/_lib/partner-auth.ts');
const post = (body, admin = true) => api.POST({ admin, json: async () => body });
assert.equal((await post({ uid: 'customer', active: true }, false)).status, 403);
assert.equal((await api.GET({})).status, 403);
assert.equal((await post({ uid: '../bad', active: true })).status, 400);
assert.equal((await post({ uid: 'customer', active: 'true' })).status, 400);
assert.equal((await post({ uid: 'missing', active: true })).status, 404);
assert.equal((await partner.resolvePartnerStatusByUid('customer')).isPartner, false);
assert.equal((await post({ uid: 'customer', active: true })).status, 200);
assert.equal((await partner.resolvePartnerStatusByUid('customer')).isPartner, true, 'Grant overrides already cached automatic status');
assert.equal(records.get('partnerGrants/customer').updatedByUid, 'admin-a');
assert.equal((await api.GET({ admin: true })).data.uids[0], 'customer');
await post({ uid: 'customer', active: false });
assert.equal((await partner.resolvePartnerStatusByUid('customer')).isPartner, false, 'Removal is immediate');
totalSpent = 2100;
assert.equal((await partner.resolvePartnerStatusByUid('automatic')).isPartner, true, 'Automatic qualification retained');
records.set('partnerGrants/automatic', { active: false });
assert.equal((await partner.resolvePartnerStatusByUid('automatic')).isPartner, true, 'Removing manual grant does not remove earned partnership');
records.set('users/customer', { isPartner: true, role: 'partner' });
assert.equal((await partner.resolvePartnerStatusByUid('customer')).isPartner, false, 'Editable profile cannot self-grant');
console.log('Partner grants passed: authorization, validation, grant/remove, cache freshness, automatic qualification, protected storage.');
