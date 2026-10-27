import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';

const source = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#648597' } }).jpeg().toBuffer();
let reads = 0;
const posts = [{ slug: 'legacy', imageDataUrl: `data:image/jpeg;base64,${source.toString('base64')}` }, { slug: 'remote', imageDataUrl: 'https://example.com/cover.jpg' }];
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../app/lib/home-blog-cover.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
vm.runInNewContext(code, {
  exports, Buffer,
  require: name => {
    if (name === 'server-only') return {};
    if (name === 'sharp') return sharp;
    if (name === './blog') return { getPublishedBlogPostsOrThrow: async () => { reads++; return posts; } };
    if (name === 'next/cache') return { unstable_cache: fn => {
      const cache = new Map();
      return (...args) => {
        const key = JSON.stringify(args);
        if (!cache.has(key)) cache.set(key, fn(...args));
        return cache.get(key);
      };
    } };
    throw new Error(`Unexpected dependency: ${name}`);
  },
});
const read = exports.getHomeBlogCover;
const preview = Buffer.from(await read('legacy', 'v1'), 'base64');
const metadata = await sharp(preview).metadata();
assert.equal(metadata.format, 'webp');
assert.equal(metadata.width, 960);
assert.equal(metadata.height, 540);
assert(preview.length < source.length);
assert.equal(await read('legacy', 'v1'), preview.toString('base64'));
assert.equal(reads, 1, 'Repeated preview uses its cache');
await read('legacy', 'v2');
assert.equal(reads, 2, 'An edited article gets a new preview');
assert.equal(await read('missing', ''), null);
assert.equal(await read('remote', ''), null, 'Remote URLs are not fetched by this endpoint');
console.log('PASS homepage cover: resized WebP, smaller payload, cached result, version changes and missing/remote sources');
