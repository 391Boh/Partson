import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/lib/home-blog-preview-cache.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let now = 1000, calls = 0, warnings = 0;
let fetchPosts = async () => [{ id: 'first' }];
function createReader() {
  const exports = {};
  vm.runInNewContext(code, {
    exports, Date: { now: () => now },
    console: { warn: () => { warnings++; } },
    require: name => {
      if (name === 'server-only') return {};
      if (name === 'next/cache') return { unstable_cache: fn => fn };
      if (name === './blog') return { getPublishedBlogPostsOrThrow: () => { calls++; return fetchPosts(); } };
      if (name === './home-blog-highlights') return { buildHomeBlogHighlights: posts => posts };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exports.getHomeBlogHighlights;
}
const read = createReader();
assert.deepEqual(JSON.parse(JSON.stringify(await read())), [{ id: 'first' }]);
fetchPosts = async () => { throw new Error('Blog posts query timed out after 8000ms'); };
const concurrent = [read(), read()];
assert.equal(concurrent[0], concurrent[1], 'Concurrent requests share the failed query');
assert.equal((await concurrent[0])[0].id, 'first', 'Keep the last successful preview');
const failedCalls = calls;
await read(); await read();
assert.equal(calls, failedCalls, 'Cooldown prevents repeated database timeouts');
assert.equal(warnings, 1);
now += 30_001;
fetchPosts = async () => [{ id: 'updated' }];
assert.equal((await read())[0].id, 'updated', 'Recover after the cooldown');
fetchPosts = async () => [];
assert.equal((await read()).length, 0, 'Successful empty result clears removed articles');
fetchPosts = async () => { throw new Error('offline'); };
assert.equal((await createReader()()).length, 0, 'Cold failure degrades to the normal blog overview');
console.log('PASS blog timeout: shared request, last successful preview, bounded retry, recovery and cold fallback');
