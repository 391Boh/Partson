import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let identity = { uid: 'customer', email: 'customer@example.com' };
let totalSpent = 0, isPartner = false, role = 'user', unavailable = false;
const writes = [];
const mocks = {
  'next/server': { NextResponse: { json: (data, options = {}) => ({ data, status: options.status ?? 200 }) } },
  'app/lib/firebase-admin': {
    getFirebaseAdminAuth: () => ({ verifyIdToken: async token => { if (token !== 'valid') throw Error('Unauthorized'); return identity; } }),
    getFirebaseAdminDb: () => ({ collection: collection => ({ doc: uid => ({ get: async () => ({ data: () => ({ role }) }), set: async (patch, options) => writes.push({ collection, uid, patch, options }) }) }) }),
  },
  'app/api/_lib/partner-auth': { resolvePartnerStatusByUid: async () => { if (unavailable) throw Error('Offline'); return { totalSpent, isPartner }; } },
};
const cache = new Map();
function load(name) {
  if (mocks[name]) return mocks[name];
  if (cache.has(name)) return cache.get(name);
  const exports = {};
  cache.set(name, exports);
  vm.runInNewContext(ts.transpileModule(readFileSync(`${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: load, process: { env: { NEXT_PUBLIC_ADMIN_EMAILS: 'bootstrap@example.com' } }, console });
  return exports;
}
const { POST } = load('app/api/profile-appearance/route');
const { PROFILE_AVATAR_FRAMES, PROFILE_BACKGROUNDS, getProfileAvatarTier } = load('app/lib/profile-appearance');
const post = (body, token = 'valid') => POST({ headers: new Headers(token ? { Authorization: `Bearer ${token}` } : {}), text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
for (const token of ['', 'invalid']) assert.equal((await post({ avatar: 'car' }, token)).status, 401);
for (const body of [null, [], {}, { uid: 'someone', avatar: 'car' }, { avatar: 123 }, { avatar: 'invented' }, { avatarFrame: 'invented' }, { profileBackground: 'invented' }, { profileBackground: 1 }, '{', 'x'.repeat(2049)]) assert.equal((await post(body)).status, 400);
assert.equal(writes.length, 0);
assert.equal((await post({ avatar: 'car' })).status, 200);
assert.equal(writes.at(-1).uid, 'customer');
assert.equal(writes.at(-1).options.merge, true);
assert.equal((await post({ avatar: 'partner-turbo' })).status, 403);
assert.equal((await post({ avatar: 'admin-shield' })).status, 403);
isPartner = true;
assert.equal((await post({ avatar: 'partner-turbo' })).status, 200);
assert.equal((await post({ avatarFrame: 'partner' })).status, 403, 'Manual partnership must not forge an earned frame');
for (const frame of PROFILE_AVATAR_FRAMES) {
  totalSpent = frame.threshold - .01;
  const before = writes.length;
  assert.equal((await post({ avatarFrame: frame.id })).status, 403);
  assert.equal(writes.length, before);
  totalSpent = frame.threshold;
  assert.equal((await post({ avatarFrame: frame.id })).status, 200);
}
assert.equal((await post({ profileBackground: null })).status, 200);
assert.equal((await post({ profileBackground: 'default' })).status, 200);
for (const background of PROFILE_BACKGROUNDS.filter(background => background.threshold > 0)) {
  totalSpent = background.threshold - .01;
  const before = writes.length;
  assert.equal((await post({ profileBackground: background.id, avatar: 'car' })).status, 403);
  assert.equal(writes.length, before, 'A locked background must not partially save other fields');
  totalSpent = background.threshold;
  assert.equal((await post({ profileBackground: background.id })).status, 200);
}
role = 'admin';
assert.equal((await post({ avatar: 'admin-shield' })).status, 200);
role = 'user'; identity = { uid: 'bootstrap', email: 'bootstrap@example.com' };
assert.equal((await post({ avatar: 'admin-wheel' })).status, 200);
unavailable = true;
assert.equal((await post({ avatarFrame: 'legend' })).status, 503);
assert.equal((await post({ avatar: null, avatarFrame: null, profileBackground: null })).status, 200, 'Resetting appearance works without order history');
assert.equal((await post({ avatar: 'wrench' })).status, 200);
const artIds = [...readFileSync('app/components/ProfileAvatar.tsx', 'utf8').matchAll(/id: "([\w-]+)",\s*tier: "(basic|partner|admin)"/g)];
assert.equal(artIds.length, 18);
for (const [, id, tier] of artIds) assert.equal(getProfileAvatarTier(id), tier, `Server permits shipped art ${id}`);
for (const background of PROFILE_BACKGROUNDS) assert.match(readFileSync(`public${background.image}`, 'utf8'), /<svg /);
console.log('PASS appearance API and cover assets: authentication, role checks, six exact achievement boundaries, owner-only writes, invalid payloads, atomic denied changes, offline reset and shared avatar IDs.');
