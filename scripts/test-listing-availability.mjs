import assert from 'node:assert/strict';
import {
  effectiveListingStatus,
  listingAvailability,
  listingIsPurchasable,
  normalizeListingStatus,
} from '../app/core/listing-display.js';
import { createListingCatalog } from '../app/services/listings/listing-catalog-service.js';

assert.equal(normalizeListingStatus(), 'on_sale');
assert.equal(normalizeListingStatus('SOLD_OUT'), 'sold');
assert.equal(effectiveListingStatus({ status: 'on_sale', reserved_order_id: 'order-1', reserved_until: 'infinity' }), 'reserved');
assert.equal(effectiveListingStatus({ status: 'on_sale', reserved_order_id: 'order-1', reserved_until: '2026-08-26T01:00:01Z' }, Date.parse('2026-08-26T01:00:00Z')), 'reserved');
assert.equal(effectiveListingStatus({ status: 'on_sale', reserved_order_id: 'order-1', reserved_until: '2026-08-26T00:59:59Z' }, Date.parse('2026-08-26T01:00:00Z')), 'on_sale');
assert.equal(effectiveListingStatus({ status: 'on_sale', reserved_until: 'infinity' }), 'on_sale');
assert.equal(listingIsPurchasable('on_sale'), true);
assert.equal(listingIsPurchasable('reserved'), false);
assert.equal(listingIsPurchasable('sold'), false);
assert.deepEqual(
  { label: listingAvailability('reserved').label, message: listingAvailability('reserved').message },
  {
    label: '예약중',
    message: '현재 구매가 진행 중인 상품입니다. 구매가 취소되면 다시 구매할 수 있습니다.',
  },
);
assert.equal(listingAvailability('sold').label, 'SOLD OUT');
assert.equal(listingAvailability('draft').label, '구매불가');

let catalogRows = null;
const rawRows = [
  { id: 'sale-1', title: 'ROLEX', description: 'DATEJUST', status: 'on_sale', reserved_order_id: 'order-1', reserved_until: 'infinity', price: 1000, photos: ['watch-1.png'] },
  { id: 'sale-2', title: 'OMEGA', description: 'SPEEDMASTER', status: 'sold', price: 2000, photos: ['watch-2.png'] },
];
const windowObject = {
  NWBackend: {
    subscribeProducts(handler) { handler(rawRows); return () => {}; },
  },
  belloreSaleActive() { return false; },
};
assert.equal(createListingCatalog({ window: windowObject }).subscribe((rows) => { catalogRows = rows; }), true);
assert.deepEqual(catalogRows.map((row) => row.status), ['reserved', 'sold']);

console.log('listing availability and catalog status preservation: ok');
