import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [index, page, legacy, requestedActions] = await Promise.all([
  read('index.html'),
  read('pages/orders.html'),
  read('script.js'),
  read('app/features/mypage-personal-shop/mypage-requested-actions.js')
]);

assert.doesNotMatch(index, /id=["']ordersModal["']/i,
  'the main catalog shell must not retain the orders modal markup');
assert.match(page, /<body[^>]*data-bellore-standalone-page=["']orders["']/i);
assert.match(page, /id=["']ordersModal["'][^>]*hidden/i);
for (const id of [
  'ordersTabs', 'ordersList', 'orderPage', 'orderPageBody', 'orderPageActions',
  'returnPage', 'rpOrderInfo', 'rpReason', 'rpDetail', 'rpPhotos', 'rpSubmit'
]) {
  assert.match(page, new RegExp(`id=["']${id}["']`), `${id} moved with the existing design contract`);
}
assert.match(page, /type=["']module["'][^>]*app\/pages\/standalone-page\.js/i);
assert.match(legacy, /window\.location\.assign\('\/pages\/orders' \+ query\)/,
  'the existing orders entry point must deep-link to the standalone page');
assert.match(page, /rel=["']canonical["'][^>]*href=["']https:\/\/bellore\.co\.kr\/pages\/orders["']/i,
  'the extensionless orders URL must be canonical');
assert.doesNotMatch(page, /data-ofilter=["']pending["']/i,
  'customer order history must not expose an unpaid checkout filter');
assert.match(legacy, /belloreStandalonePage === 'orders'[\s\S]*history\.back\(\)/,
  'standalone close must preserve browser back navigation');
assert.match(legacy, /new URLSearchParams\(location\.search\)[\s\S]*openOrdersList\(status\)/,
  'deep links must restore the requested order status filter');
assert.match(legacy, /\['paid', 'inspecting', 'preparing', 'shipping', 'delivered'\][\s\S]*data-ocancel/,
  'paid through delivered orders may expose the customer cancellation request action');
assert.doesNotMatch(legacy, /data-opay/,
  'unpaid checkout attempts must not expose an order-level payment action');
assert.match(legacy, /data-ocancel data-order-no=[\s\S]*data-order-status=/,
  'the order detail action must carry the order identity and current state');
assert.match(requestedActions, /closest\('\[data-ocancel\]'\)[\s\S]*orderCancellation\.request/,
  'the cancellation action must use the shared state-aware request controller');
assert.match(legacy, /function orderStatusLabel\(order\)[\s\S]*정밀검수 완료 · 취소처리 대기/,
  'cancellation status exposes completed precision inspection');
assert.match(legacy, /function orderStatusLabel\(order\)[\s\S]*취소요청 · 정밀검수 중/,
  'cancellation status exposes pending precision inspection');
assert.match(legacy, /id="aopCancelInspection" data-order-no=[\s\S]*>정밀검수 완료<[\s\S]*id="aopRefund">검수완료 · 결제 취소 \/ 환불</,
  'admin refund is rendered only after precision inspection');

console.log('orders standalone: markup=1 detail=1 cancel=1 return=1 route=1 filter=1 history=1 passed');
