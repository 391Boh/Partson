import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('app/lib/catalog-image-optimize.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, { exports, require: name => name === 'sharp' ? sharp : {}, Buffer });
for (const format of ['png', 'jpeg', 'webp']) {
  const source = await sharp({ create: { width: 2200, height: 1400, channels: 3, background: '#5285b3' } })[format]().toBuffer();
  const result = await exports.optimizeCatalogImage(source, `image/${format}`);
  const metadata = await sharp(result.buffer).metadata();
  assert.ok(metadata.width <= 480 && metadata.height <= 480, `${format} exceeded thumbnail dimensions`);
  assert.equal(result.contentType, 'image/webp');
}
const small = await sharp({ create: { width: 160, height: 80, channels: 3, background: '#fff' } }).webp().toBuffer();
const same = await exports.optimizeCatalogImage(small, 'image/webp');
assert.equal(same.buffer, small, 'Already optimized thumbnails should not be encoded again');
const broken = Buffer.from('invalid');
assert.equal((await exports.optimizeCatalogImage(broken, 'image/jpeg')).buffer, broken);
console.log('Image optimization passed: large PNG/JPEG/WebP resized, small WebP reused, malformed input handled.');
