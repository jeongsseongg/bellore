import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [index, page, legacy] = await Promise.all([
  read('index.html'),
  read('pages/orders.html'),
  read('script.js')
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
assert.match(legacy, /belloreStandalonePage === 'orders'[\s\S]*history\.back\(\)/,
  'standalone close must preserve browser back navigation');
assert.match(legacy, /new URLSearchParams\(location\.search\)[\s\S]*openOrdersList\(status\)/,
  'deep links must restore the requested order status filter');
assert.match(legacy, /\['pending', 'paid', 'inspecting', 'preparing'\][\s\S]*data-ocancel/,
  'pending and paid order details must retain the customer cancellation action');
assert.match(legacy, /data-ocancel[\s\S]*NWBackend\.requestCancel\(_orderCache\.orderNo, reason\)/,
  'the cancellation action must remain connected to the server RPC');

console.log('orders standalone: markup=1 detail=1 cancel=1 return=1 route=1 filter=1 history=1 passed');
