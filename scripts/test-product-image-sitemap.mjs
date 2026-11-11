import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const mocks = {
 'app/lib/catalog-server': { fetchConfirmedEuroRate: async () => 51.37 },
 'app/lib/product-image-variant-path': { buildProductPhotoPath: ({code}) => `/product-image/${code}/photo/${code}.webp?article=A&b=1` },
 'app/lib/product-url': { buildProductPath: ({code}) => `/product/${code}` },
 'app/lib/product-sitemap': { getPricedProductEntriesBySitemapId: async () => [{code:'one',hasPhoto:true},{code:'two',hasPhoto:false},{code:'three'}] },
 'app/lib/sitemap-dates': { getConfiguredSitemapLastModified: () => undefined },
 'app/lib/site-url': { getSiteUrl: () => 'https://partson.shop' },
 'app/lib/google-merchant-feed': { getMerchantGalleryImages: async () => new Map([['one',['/product-gallery/one-2.webp']]]) },
 'app/lib/product-sitemap-lastmod': { getProductSitemapLastModified: async () => new Map([['one','2026-10-15T00:00:00.000Z']]) },
};
vm.runInNewContext(ts.transpileModule(readFileSync('app/product/sitemap.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{assert.ok(mocks[name],name);return mocks[name];}});
const entries = await exports.default({id:Promise.resolve('0')});
assert.equal(entries[0].images[0],'https://partson.shop/product-image/one/photo/one.webp?article=A&amp;b=1','The stable photo URL, XML-escaped');
assert.equal(entries[0].images[1],'https://partson.shop/product-gallery/one-2.webp','Gallery photos follow the primary photo');
assert.equal(entries[0].lastModified,'2026-10-15T00:00:00.000Z');
assert.equal(entries[1].images,undefined);
assert.equal(entries[2].images,undefined);
console.log('Image sitemap passed: confirmed photos only, gallery after primary, per-product lastmod, XML-safe stable image URLs.');
