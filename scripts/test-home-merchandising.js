const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const engine = require(path.join(root, 'app', 'vendor', 'recommendation-engine.js'));
const source = fs.readFileSync(
  path.join(root, 'app', 'features', 'home-merchandising', 'home-merchandising.js'),
  'utf8'
).replace(/^import .*listingIsPurchasable.*;\r?\n/m,
  "const listingIsPurchasable = (status) => !['reserved', 'sold', 'sold_out', 'hidden', 'unavailable'].includes(String(status || 'on_sale').toLowerCase());\n")
  .replace('export function createHomeMerchandising', 'function createHomeMerchandising') +
  '\nmodule.exports = { createHomeMerchandising };';
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(source, sandbox, { filename: 'home-merchandising.js' });
const { createHomeMerchandising } = sandbox.module.exports;

function listing(index, saleActive) {
  return {
    id: `watch-${index}`,
    image: `assets/watch-${index}.png`,
    photos: [`assets/watch-${index}.png`, `assets/watch-${index}-detail.jpg`],
    brand: index % 3 === 0 ? 'Rolex' : (index % 3 === 1 ? 'Omega' : 'Cartier'),
    model: `Model ${index}`,
    productNo: `BEL-${index}`,
    referenceNumber: `REF-${index}`,
    price: 1000000 + index * 100000,
    listPrice: saleActive ? 1500000 + index * 100000 : 1000000 + index * 100000,
    saleActive,
    condition: '8점 · 상급',
    pack: index % 2 ? '풀세트' : '단품',
    sizeMm: 40,
    material: '스틸',
    status: 'on_sale',
    createdAt: `2026-08-${String(24 - (index % 10)).padStart(2, '0')}T00:00:00Z`,
  };
}

const catalog = Array.from({ length: 16 }, (_, index) => listing(index + 1, index < 5));
const feature = createHomeMerchandising({ window: { BelloreRecommendationEngine: engine } });
const first = feature.update(catalog);
const second = feature.update(catalog);
const manual = feature.update(catalog, { weeklySpecialIds: ['watch-16', 'watch-2'] });

assert.equal(first.weeklySpecial.audit.algorithm_version, 'bellore-reco-v2.0.0');
assert.equal(first.recommended.audit.algorithm_version, 'bellore-reco-v2.0.0');
assert.equal(first.weeklySpecial.audit.personalized, false);
assert.equal(first.recommended.audit.personalized, false);
assert(first.weeklySpecial.items.length > 0 && first.weeklySpecial.items.length <= 5);
assert(first.weeklySpecial.items.every((item) => item.saleActive));
assert(first.recommended.items.length > 0 && first.recommended.items.length <= 12);
assert.equal(
  first.weeklySpecial.items.some((weekly) => first.recommended.items.some((recommended) => recommended.id === weekly.id)),
  false,
  'weekly special and recommended listings must not overlap'
);

const unavailableCatalog = catalog.map((item) => ({ ...item }));
unavailableCatalog[0].status = 'reserved';
unavailableCatalog[1].status = 'sold';
const unavailableResult = feature.update(unavailableCatalog, { weeklySpecialIds: ['watch-1', 'watch-2'] });
assert.equal(
  [...unavailableResult.weeklySpecial.items, ...unavailableResult.recommended.items]
    .some((item) => ['watch-1', 'watch-2'].includes(item.id)),
  false,
  'reserved and sold listings must not be selected for home merchandising',
);
assert.deepEqual(first.recommended.items.map((item) => item.id), second.recommended.items.map((item) => item.id));
assert.deepEqual(manual.weeklySpecial.items.slice(0, 2).map((item) => item.id), ['watch-16', 'watch-2']);
assert.equal(manual.weeklySpecial.audit.manual_selected_count, 2);
assert.equal(
  manual.recommended.items.some((item) => ['watch-16', 'watch-2'].includes(item.id)),
  false,
  'manually selected weekly products must stay out of recommendations'
);

const noSale = feature.update(catalog.map((item) => ({ ...item, saleActive: false, listPrice: item.price })));
assert.equal(noSale.weeklySpecial.items.length, 8);
assert(noSale.weeklySpecial.items.every((item) => item.saleActive === false));
assert.equal(
  noSale.weeklySpecial.items.some((weekly) => noSale.recommended.items.some((recommended) => recommended.id === weekly.id)),
  false,
  'fallback weekly special and recommended listings must not overlap'
);

console.log('home merchandising algorithm tests passed');
