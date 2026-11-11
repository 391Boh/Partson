import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';

function load(file, mocks, extra = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, URL, URLSearchParams, Request, Response, process, console, ...extra,
    require: name => { assert(name in mocks, `${file}: missing mock ${name}`); return mocks[name]; },
  });
  return exports;
}

const publicPrices = { resolvePublicProductPriceEuro: entry => entry.priceEuro };
const catalog = {
  toPriceUah: (price, rate) => Number.isFinite(price) && price > 0 ? Math.round(price * rate) : null,
  getSnapshotPriceLookup: () => ({}),
  fetchConfirmedEuroRate: async () => 50,
  fetchPriceEuroMapByLookupKeys: async () => { throw new Error('Unexpected price lookup'); },
};
const pricing = load('app/lib/merchant-feed-pricing.ts', {
  'server-only': {}, 'node:crypto': crypto, './catalog-server': catalog, './public-product-price': publicPrices,
});
const entries = Array.from({ length: 1600 }, (_, index) => ({
  code: `C-${String(index + 1).padStart(5, '0')}`, article: `ARTICLE-${index + 1}`,
  name: `Деталь ${index + 1}`, producer: 'TEST', priceEuro: 10, hasPhoto: true,
  quantity: index % 10 === 0 ? 0 : 1,
}));
entries.push({ code: 'NO-PHOTO', name: 'Без фото', priceEuro: 10, hasPhoto: false });
entries.push({ code: 'NO-PRICE', name: 'Без ціни', priceEuro: 0, hasPhoto: true });
const feed = load('app/lib/google-merchant-feed.ts', {
  'server-only': {}, 'app/lib/catalog-server': catalog,
  'app/lib/product-image-variant-path': { buildProductPhotoPath: ({ code }) => `/product-image/${code}/photo/${code}.webp` },
  'app/lib/product-sitemap': { getAllProductSitemapEntries: async () => entries },
  'app/lib/catalog-label-format': { fixCatalogSpelling: value => value, formatCatalogLabel: value => value },
  'app/lib/product-seo-copy': { buildFitmentSummary: () => '' },
  'app/lib/product-fitment-format': { splitProductFitmentLine: () => [] },
  'app/lib/product-url': { buildProductPath: entry => `/product/${entry.code}`, buildVisibleProductName: value => value },
  'app/lib/firebase-admin': { getFirebaseAdminDb: () => ({ collectionGroup: () => ({ get: async () => ({ docs: [] }) }) }) },
  'app/lib/site-url': { getSiteUrl: () => 'https://partson.shop' },
  'app/lib/public-product-price': publicPrices, 'app/lib/merchant-feed-pricing': pricing,
  'app/lib/shipping-policy': load('app/lib/shipping-policy.ts', {}),
}, { process: { env: { MERCHANT_FEED_MAX_ITEMS: '1000', MERCHANT_FEED_ENABLE_PRICE_LOOKUP: '0' } } });

const capped = await feed.getGoogleMerchantFeedSnapshot();
assert.equal(capped.itemCount, 1000, 'Reproduce the legacy cap in the environment');
for (const prepared of [null, { ...capped, pricing: { ...capped.pricing, generatedAt: Date.now() - 3_600_001 } }]) {
  const writes = [];
  const route = load('app/google-merchant-feed.xml/route.ts', {
    'app/lib/google-merchant-feed': feed, 'app/lib/catalog-server': catalog,
    'app/lib/merchant-feed-pricing': pricing,
    'app/lib/merchant-feed-store': { readMerchantFeedSnapshot: async () => prepared, writeMerchantFeedSnapshot: async value => { writes.push(value); } },
    'app/lib/site-url': { getSiteUrl: () => 'https://partson.shop' },
    'app/lib/xml-entities': { normalizeInvalidXmlEntities: value => value },
  });
  const response = await route.GET(new Request('https://partson.shop/google-merchant-feed.xml'));
  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.equal((xml.match(/<item>/g) || []).length, 1600, 'Both initial and hourly HTTP regeneration must preserve the full catalog despite the environment cap');
  assert(xml.includes('<g:id>C-01600</g:id>'), 'Products after number 1000 remain advertised');
  assert(!xml.includes('<g:id>NO-PHOTO</g:id>') && !xml.includes('<g:id>NO-PRICE</g:id>'));
  assert.equal((xml.match(/<g:availability>out of stock<\/g:availability>/g) || []).length, 160);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].itemCount, 1600, 'The shared XML snapshot must not be overwritten with a capped subset');
}
console.log('PASS Merchant HTTP refresh: 1000-item environment cap cannot truncate 1600 public products; initial/hourly refresh, stock, photos and prices verified.');
