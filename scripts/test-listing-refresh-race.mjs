import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { refreshMarketListingStatuses } from '../app/features/listing-availability/market-static-status.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const source = await readFile(new URL('../supabase.js', import.meta.url), 'utf8');
const subscribeStart = source.indexOf('function subscribeListings(category, cb)');
const refreshStart = source.indexOf('function refreshListingFeeds()', subscribeStart);
assert(subscribeStart >= 0 && refreshStart > subscribeStart);
const subscribeSource = source.slice(subscribeStart, refreshStart);
const listingRefreshers = [];
const listingRequests = [];
const sb = {
  from() {
    const request = deferred();
    listingRequests.push(request);
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      neq() { return builder; },
      order() { return request.promise; },
    };
    return builder;
  },
};
const removeFrom = (values, value) => {
  const index = values.indexOf(value);
  if (index >= 0) values.splice(index, 1);
};
const subscribeListings = new Function(
  'sb', 'mapListing', 'listingRefreshers', 'removeFrom',
  `${subscribeSource}\nreturn subscribeListings;`,
)(sb, (row) => row, listingRefreshers, removeFrom);

const emissions = [];
const unsubscribe = subscribeListings('brand', (rows) => emissions.push(rows));
assert.equal(listingRequests.length, 1);
const firstLoad = listingRequests[0];
const secondLoadPromise = listingRefreshers[0]();
assert.equal(listingRequests.length, 2);
listingRequests[1].resolve({ data: [{ id: 'watch-1', status: 'reserved' }], error: null });
assert.equal(await secondLoadPromise, true);
firstLoad.resolve({ data: [{ id: 'watch-1', status: 'on_sale' }], error: null });
await firstLoad.promise;
await Promise.resolve();
assert.deepEqual(emissions, [[{ id: 'watch-1', status: 'reserved' }]],
  '늦게 끝난 이전 listings 응답이 최신 예약 상태를 덮으면 안 됩니다.');

const afterUnsubscribe = listingRefreshers[0]();
const thirdLoad = listingRequests[2];
unsubscribe();
thirdLoad.resolve({ data: [{ id: 'watch-1', status: 'sold' }], error: null });
assert.equal(await afterUnsubscribe, false);
assert.equal(emissions.length, 1, '구독 해제 뒤 완료된 응답은 화면에 반영하면 안 됩니다.');

function staticNode(listingId) {
  const card = { dataset: {} };
  return {
    dataset: { listingId, showOnSale: 'true', baseClass: 'product-card__status' },
    hidden: false,
    textContent: '',
    className: '',
    closest: () => card,
    card,
  };
}

const node = staticNode('watch-1');
const fakeDocument = { querySelectorAll: () => [node] };
const staticRequests = [];
const fetchImpl = () => {
  const request = deferred();
  staticRequests.push(request);
  return request.promise;
};
const config = { url: 'https://example.test', anonKey: 'anon' };
const oldRefresh = refreshMarketListingStatuses({ document: fakeDocument, config, fetchImpl });
const newRefresh = refreshMarketListingStatuses({ document: fakeDocument, config, fetchImpl });
staticRequests[1].resolve({ ok: true, json: async () => [{ id: 'watch-1', status: 'reserved' }] });
await newRefresh;
assert.equal(node.dataset.status, 'reserved');
staticRequests[0].resolve({ ok: true, json: async () => [{ id: 'watch-1', status: 'on_sale' }] });
assert.equal((await oldRefresh).stale, true);
assert.equal(node.dataset.status, 'reserved', '늦은 정적 카드 응답이 최신 예약 상태를 덮으면 안 됩니다.');

const missingRefresh = refreshMarketListingStatuses({ document: fakeDocument, config, fetchImpl });
staticRequests[2].resolve({ ok: true, json: async () => [] });
await missingRefresh;
assert.equal(node.dataset.status, 'unavailable', '정상 응답에서 사라진 상품은 예전 판매중 상태를 남기면 안 됩니다.');
assert.equal(node.textContent, '구매불가');

console.log('listing refresh latest-response and static-card fail-closed runtime: ok');
