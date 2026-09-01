import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync(new URL('../supabase.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260901090420_paid_order_customer_visibility.sql', import.meta.url),
  'utf8',
);

const subscription = backend.match(/Backend\.subscribeMyOrders[\s\S]*?Backend\.listMyOrders/)?.[0] || '';
const list = backend.match(/Backend\.listMyOrders[\s\S]*?Backend\.getOrder/)?.[0] || '';
const detail = backend.match(/Backend\.getOrder[\s\S]*?Backend\.getOrderHistory/)?.[0] || '';

for (const [name, source] of [['subscription', subscription], ['list', list], ['detail', detail]]) {
  assert.match(source, /\.not\('paid_at', 'is', null\)/, `${name} must exclude unpaid checkout attempts`);
}

assert.match(migration, /drop policy if exists orders_select_own on public\.orders/);
assert.match(migration, /create policy orders_select_own[\s\S]*for select to authenticated/);
assert.match(migration, /\(select auth\.uid\(\)\) = customer_id[\s\S]*paid_at is not null/);
assert.match(migration, /Administrators retain their separate all-row policy/);

console.log('paid-order customer visibility tests passed');
