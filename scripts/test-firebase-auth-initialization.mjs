import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('app/lib/firebase-auth-state.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const user = { uid: 'returning-user', displayName: 'Test' };

function createState({ uid = null, redirect = null, fail = false } = {}) {
  const exports = {};
  const local = new Map(uid ? [['user_id', uid]] : []);
  const session = new Map(redirect ? [['redirect', '1']] : []);
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
  let releaseRestore;
  const restored = new Promise(resolve => { releaseRestore = resolve; });
  let observer;
  const calls = { imports: 0, subscriptions: 0, redirects: 0 };
  const auth = { currentUser: null, authStateReady: () => restored };
  const mocks = {
    react: { useSyncExternalStore() {} },
    'app/lib/auth-storage': { GOOGLE_REDIRECT_PENDING_KEY: 'redirect' },
    './firebase-auth': { auth },
    'firebase/auth': {
      getRedirectResult: async () => { calls.redirects++; return redirect ? { user: redirect } : null; },
      onAuthStateChanged: (_, listener) => { calls.subscriptions++; observer = listener; listener(auth.currentUser); return () => {}; },
    },
  };
  Object.assign(mocks['./firebase-auth'], mocks['firebase/auth']);
  vm.runInNewContext(source, {
    exports, require: name => {
      assert(name in mocks, name);
      if (name === './firebase-auth') { calls.imports++; if (fail) throw new Error('chunk unavailable'); }
      return mocks[name];
    },
    window: {}, localStorage: storage(local), sessionStorage: storage(session),
    console: { ...console, error() {} }, setTimeout, clearTimeout,
  });
  return { ...exports, calls, local, session, auth,
    restore(value) { auth.currentUser = value; releaseRestore(); },
    publish(value) { auth.currentUser = value; observer(value); },
  };
}

{
  const state = createState({ uid: user.uid });
  const seen = [];
  const stopA = state.subscribeToFirebaseAuthState(value => seen.push(value));
  const stopB = state.subscribeToFirebaseAuthState(value => seen.push(value));
  const waitingA = state.waitForFirebaseAuthReady();
  const waitingB = state.waitForFirebaseAuthReady();
  await tick();
  assert.equal(state.calls.subscriptions, 0);
  assert.equal(state.calls.imports, 1, 'Concurrent consumers share one SDK import');
  assert.equal(state.getFirebaseAuthSnapshot().ready, false);
  assert(!seen.some(value => value.ready && !value.user), 'Never flash guest state during restoration');
  state.restore(user);
  const [a, b] = await Promise.all([waitingA, waitingB]);
  assert.equal(a.user, user); assert.equal(b.user, user);
  assert.equal(state.calls.subscriptions, 1);
  const notifications = seen.length;
  state.publish(user);
  assert.equal(seen.length, notifications, 'An identical SDK callback does not re-render consumers');
  state.publish(null);
  assert.equal(state.local.has('user_id'), false, 'Confirmed sign-out clears the returning-user hint');
  stopA(); stopB();
}
for (const restoredUser of [null, user]) {
  const state = createState();
  const stop = state.subscribeToFirebaseAuthState(() => {});
  await tick();
  assert.equal(state.calls.imports, 0, 'Guest rendering downloads no Firebase SDK');
  assert.equal(state.getFirebaseAuthSnapshot().ready, true);
  let resolved = false;
  const waiting = state.waitForFirebaseAuthReady().then(value => { resolved = true; return value; });
  await tick();
  assert.equal(resolved, false, 'A guest hint is insufficient for a protected action');
  state.restore(restoredUser);
  const value = await waiting;
  assert.equal(value.user, restoredUser, 'Wait for the real session even when user_id is missing');
  assert.equal(state.local.get('user_id') ?? null, restoredUser?.uid ?? null, 'Persist the hint immediately after Firebase confirms');
  assert.equal((await state.waitForFirebaseAuthReady()).user, restoredUser, 'Confirmed guest sessions also settle without hanging');
  assert.equal(state.calls.imports, 1);
  stop();
}
{
  const state = createState({ redirect: user });
  state.subscribeToFirebaseAuthState(() => {});
  const waiting = state.waitForFirebaseAuthReady();
  await tick();
  assert.equal(state.calls.redirects, 1);
  assert.equal(state.getFirebaseAuthSnapshot().ready, false);
  state.restore(user);
  assert.equal((await waiting).user, user);
  assert.equal(state.session.has('redirect'), false);
}
{
  const state = createState({ uid: user.uid });
  state.subscribeToFirebaseAuthState(() => {});
  const waiting = state.waitForFirebaseAuthReady();
  state.restore(null);
  assert.equal((await waiting).user, null);
  assert.equal(state.local.has('user_id'), false, 'An expired session cannot keep a stale signed-in hint');
}
for (const uid of [null, user.uid]) {
  const state = createState({ uid, fail: true });
  assert.equal((await state.waitForFirebaseAuthReady()).user, null, 'Chunk failures settle rather than hanging the page');
  assert.equal(state.local.get('user_id') ?? null, uid, 'A download failure does not erase a potentially valid persisted session');
}
console.log('PASS shared restoration, SDK-free guests, authoritative protected actions, no guest flash, duplicate notifications, redirects, sign-out, expired hints and load failures');
