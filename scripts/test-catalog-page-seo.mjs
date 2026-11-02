import assert from 'node:assert/strict';
import {
  resolveCatalogSeoState, applyProducerPageAvailability,
  buildCatalogBreadcrumbJsonLd, buildCatalogCollectionJsonLd,
} from '../app/lib/catalog-page-seo.ts';
import { buildPageMetadata } from '../app/lib/seo-metadata.ts';
import { safeJsonLd } from '../app/lib/safe-json-ld.ts';

const site = 'https://partson.shop';
const plain = resolveCatalogSeoState({});
assert.equal(plain.indexable, true);
assert.equal(plain.canonicalPath, '/katalog');
for (const tracking of [
  { utm_source: 'google', utm_campaign: 'parts', gclid: 'click-id' },
  { srsltid: 'merchant-center', fbclid: 'click-id' },
  { utm_id: 'campaign-id', msclkid: 'click-id' },
]) {
  const state = resolveCatalogSeoState(tracking);
  assert.equal(state.indexable, true, 'Attribution must not noindex the unfiltered catalog');
  assert.equal(state.canonicalPath, plain.canonicalPath);
  assert.equal(state.pagePath, '/katalog', 'Click IDs must not create new structured-data entities');
}
for (const params of [
  { search: 'BOSCH 123' }, { group: 'Гальмівні диски' },
  { producer: 'BOSCH', utm_source: 'google' }, { promo: '1' },
  { params: 'diameter:100' }, { vehicle: 'audi' }, { reset: '1' },
  { priceFrom: '100' }, { sort: 'asc' }, { page: '2' }, { arbitrary: 'value' },
]) {
  const state = resolveCatalogSeoState(params);
  const metadata = buildPageMetadata({ ...state, index: state.indexable });
  assert.equal(state.indexable, false, 'Filtered/unsupported query URLs must not expand the index');
  assert.equal(metadata.robots.index, false);
  assert.equal(metadata.robots.follow, true);
  assert.equal(metadata.robots.googleBot.index, false);
  assert.equal(metadata.robots['max-image-preview'], 'large');
}
const producer = resolveCatalogSeoState({ producer: 'BOSCH', utm_source: 'google' });
assert.equal(producer.canonicalPath, '/manufacturers/bosch-2wkr2o');
assert.equal(producer.pagePath, '/katalog?producer=BOSCH');
const repeated = resolveCatalogSeoState({ group: ' Фільтри ', subcategory: 'фільтри', search: ['AB123', 'other'] });
assert.equal(repeated.subcategory, '');
assert.equal(repeated.searchQuery, 'AB123');
assert(repeated.title.includes('AB123'));
const promo = resolveCatalogSeoState({ promo: '1', producer: 'BOSCH' });
assert(promo.title.includes('Акційні'));
assert(promo.description.includes('зі знижкою'));

const unknownProducer = resolveCatalogSeoState({ producer: 'QH' });
assert.equal(applyProducerPageAvailability(unknownProducer, { producers: [] }).canonicalPath, unknownProducer.canonicalPath,
  'An unavailable facet source is not proof a clean landing is missing');
const missingProducer = applyProducerPageAvailability(unknownProducer, { producers: [{ slug: 'bosch' }] });
assert.equal(missingProducer.producerHasPage, false);
assert(missingProducer.canonicalPath.startsWith('/katalog?'));

for (const state of [plain, producer, repeated, promo, missingProducer]) {
  const breadcrumb = buildCatalogBreadcrumbJsonLd(site, state);
  const collection = buildCatalogCollectionJsonLd(site, state, true);
  const emptyCollection = buildCatalogCollectionJsonLd(site, state, false);
  assert.equal(collection.url, site + state.pagePath);
  assert.equal(collection.breadcrumb['@id'], breadcrumb['@id']);
  assert.equal(collection.mainEntity['@id'], `${site}${state.pagePath}#catalog-products`);
  assert.equal(emptyCollection.mainEntity, undefined, 'Do not reference a nonexistent empty ItemList');
  assert(collection.description.length <= 160);
  assert.equal(breadcrumb.itemListElement[0].item, site);
  assert(breadcrumb.itemListElement.every((item, index) => item.position === index + 1));
  if (state.searchQuery || state.promoOnly) {
    assert.equal(breadcrumb.itemListElement.at(-1).item, collection.url);
    assert.equal(breadcrumb.itemListElement[1].name, 'Каталог');
  }
}
const hostile = resolveCatalogSeoState({ search: '</script><script>alert(1)</script>' });
const json = safeJsonLd(buildCatalogCollectionJsonLd(site, hostile));
assert(!json.includes('</script>'));
assert.equal(JSON.parse(json).name, hostile.title);
console.log('Catalog SEO passed: attribution, canonical routes, noindex filters, promo copy, breadcrumbs and listing identities.');
