import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
let releaseRestore;
const restored = new Promise(resolve => { releaseRestore = resolve; });
let subscriptions = 0;
const user = { uid: 'returning-user', displayName: 'Test' };
const auth = { currentUser: null, authStateReady: () => restored };
const storage = { getItem: key => key === 'user_id' ? user.uid : null, removeItem() {} };
const mocks = {
  react: { useSyncExternalStore() {} },
  'app/lib/auth-storage': { GOOGLE_REDIRECT_PENDING_KEY: 'redirect' },
  '../../firebase': { auth },
  'firebase/auth': {
    getRedirectResult: async () => null,
    onAuthStateChanged: (_, listener) => { subscriptions++; listener(user); return () => {}; },
  },
};
vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/firebase-auth-state.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports, require: name => { assert(name in mocks, name); return mocks[name]; },
  window: {}, localStorage: storage, sessionStorage: storage, console, setTimeout, clearTimeout,
});
const seen = [];
const stopA = exports.subscribeToFirebaseAuthState(value => seen.push(value));
const stopB = exports.subscribeToFirebaseAuthState(value => seen.push(value));
const waitingA = exports.waitForFirebaseAuthReady();
const waitingB = exports.waitForFirebaseAuthReady();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(subscriptions, 0, 'Do not attach duplicate subscriptions while initialization is pending');
assert.equal(exports.getFirebaseAuthSnapshot().ready, false, 'Restoration must finish before publishing ready');
assert(!seen.some(value => value.ready && !value.user), 'Never flash guest state while restoring a returning user');
auth.currentUser = user;
releaseRestore();
const [a, b] = await Promise.all([waitingA, waitingB]);
assert.equal(a.user, user);
assert.equal(b.user, user);
assert.equal(subscriptions, 1, 'Hero, header and protected actions share one Firebase subscription');
stopA(); stopB();
console.log('PASS: concurrent auth subscribers share initialization; returning users never receive a premature guest state.');
