import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';
import { build } from 'esbuild';

const source = ts.transpileModule(readFileSync('app/lib/firebase-auth.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
for (const mode of ['session', 'redirect', 'blocked-storage', 'existing-instance']) {
  const exports = {};
  const instance = {};
  const persistence = [{ id: 'indexeddb' }, { id: 'local' }, { id: 'session' }];
  const resolver = { id: 'popup-redirect' };
  let options;
  let initialized = 0;
  const mocks = {
    './firebase-app': { app: {} },
    './auth-storage': { GOOGLE_REDIRECT_PENDING_KEY: 'redirect' },
    'firebase/auth': {
      indexedDBLocalPersistence: persistence[0], browserLocalPersistence: persistence[1], browserSessionPersistence: persistence[2],
      browserPopupRedirectResolver: resolver,
      initializeAuth: (_, deps) => { initialized++; options = deps; if (mode === 'existing-instance') throw { code: 'auth/already-initialized' }; return instance; },
      getAuth: () => { assert.equal(mode, 'existing-instance'); return instance; },
    },
  };
  vm.runInNewContext(source, {
    exports, require: name => { assert(name in mocks, name); return mocks[name]; },
    sessionStorage: { getItem() { if (mode === 'blocked-storage') throw new Error('blocked'); return mode === 'redirect' ? '1' : null; } },
  });
  assert.equal(initialized, 1);
  assert.equal(exports.auth, instance);
  assert.equal(instance.languageCode, 'uk');
  assert.deepEqual([...options.persistence], persistence, 'Retain all existing persistence fallbacks');
  assert.equal(options.popupRedirectResolver, mode === 'redirect' ? resolver : undefined, 'Ordinary restores never proactively start an OAuth iframe');
}

const bundle = await build({
  entryPoints: ['app/lib/firebase-auth-state.ts'], bundle: true, minify: true, write: false,
  platform: 'browser', format: 'esm', external: ['react'], metafile: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
const inputs = Object.keys(bundle.metafile.inputs);
assert(inputs.some(path => path.includes('@firebase/auth/')), 'The real Auth SDK is included');
assert(!inputs.some(path => path.includes('@firebase/firestore/')), 'Session restoration does not download Firestore');
assert(!inputs.some(path => path.includes('@firebase/storage/')), 'Session restoration does not download Storage');
assert(!inputs.includes('firebase.js'), 'Compatibility barrel stays outside the session dependency graph');
console.log(JSON.stringify({ authBundleBytes: bundle.outputFiles[0].contents.length, gzipBytes: gzipSync(bundle.outputFiles[0].contents).length, firestoreInputs: 0, storageInputs: 0 }));
console.log('PASS isolated Auth dependency graph, no proactive iframe, persistence fallbacks, redirect recovery and shared instances');
