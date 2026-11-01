import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const timers = new Map(), observers = new Map(), exports = {};
let now = 1000, nextTimer = 1, subscriptions = 0, stopped = 0;
const code = ts.transpileModule(readFileSync('app/lib/user-profile-store.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const fixtures = new Map([['a', { name: 'First', role: 'user' }], ['b', { name: 'Second', role: 'admin' }]]);
vm.runInNewContext(code, {
  exports, Date: { now: () => now },
  setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
  clearTimeout: id => timers.delete(id),
  require: name => name === 'app/lib/firebase-firestore' ? { db: {} } : name === 'firebase/firestore' ? {
    doc: (_, __, uid) => uid,
    onSnapshot: (uid, next, error) => {
      subscriptions++; observers.set(uid, { next, error });
      next({ exists: () => fixtures.has(uid), data: () => fixtures.get(uid) });
      return () => { stopped++; observers.delete(uid); };
    },
  } : assert.fail(name),
});
const tick = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const seen = [[], [], []];
const stops = seen.map(list => exports.subscribeUserProfile('a', value => list.push(value)));
const first = exports.readUserProfile('a');
await tick();
assert.equal(subscriptions, 1, 'Hero, shell, window and a one-shot read share one listener');
assert.equal((await first).name, 'First');
now += 60_000;
assert.equal((await exports.readUserProfile('a')).name, 'First', 'A live unchanged snapshot does not expire and hang a new consumer');
exports.updateUserProfileCache('a', data => ({ ...data, name: 'Optimistic' }));
assert(seen.every(list => list.at(-1).name === 'Optimistic'));
observers.get('a').next({ exists: () => true, data: () => ({ name: 'Confirmed' }) });
assert(seen.every(list => list.at(-1).name === 'Confirmed'));
for (const stop of stops) stop();
assert.equal(stopped, 0, 'A modal/page handoff keeps the live subscription briefly');
const handoff = exports.subscribeUserProfile('a', () => {});
await tick(); assert.equal(subscriptions, 1);
handoff();
for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); }
assert.equal(stopped, 1, 'The last consumer eventually releases Firestore');
const other = await exports.readUserProfile('b');
assert.equal(other.name, 'Second', 'Account changes never reuse another user document');
assert.equal(subscriptions, 2);
const errors = [];
const errorStop = exports.subscribeUserProfile('b', () => {}, error => errors.push(error));
observers.get('b').error(new Error('offline'));
assert.equal(errors.length, 1);
const retry = exports.subscribeUserProfile('b', () => {});
await tick(); assert.equal(subscriptions, 3, 'A failed subscription can recover on the next consumer');
errorStop(); retry();
console.log('PASS shared profile reads, active snapshots, optimistic updates, account isolation, handoff, release and retry');
