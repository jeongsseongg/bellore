import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260826160000_payment_recovery_listing_state.sql',
);
const workflowPath = path.join(root, '.github', 'workflows', 'payment-reconcile.yml');

const migration = fs.readFileSync(migrationPath, 'utf8');
const workflow = fs.readFileSync(workflowPath, 'utf8');

function sqlStatuses(fragment) {
  return [...fragment.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

const reviewBranch = migration.match(
  /if new\.status = 'payment_review' then([\s\S]*?)elsif new\.status in \(/i,
);
const stateBranches = migration.match(
  /elsif new\.status in \(([\s\S]*?)\) then([\s\S]*?)elsif new\.status in \(([\s\S]*?)\) then([\s\S]*?)elsif new\.status in \(([\s\S]*?)\) then([\s\S]*?)end if;/i,
);

assert.ok(reviewBranch, 'payment review compatibility branch must remain explicit');
assert.ok(stateBranches, 'order-to-listing status branches must remain explicit');
assert.match(reviewBranch[1], /status = 'on_sale'/i);
assert.match(reviewBranch[1], /reserved_order_id = new\.id/i);
assert.match(reviewBranch[1], /reserved_until = 'infinity'::timestamptz/i);

assert.deepEqual(sqlStatuses(stateBranches[1]), [
  'paid',
  'inspecting',
  'preparing',
  'shipping',
  'shipped',
  'delivered',
  'refund_pending',
]);
assert.match(stateBranches[2], /status = 'reserved'/i);
assert.match(stateBranches[2], /reserved_order_id = new\.id/i);
assert.match(stateBranches[2], /reserved_until = 'infinity'::timestamptz/i);
assert.match(stateBranches[2], /sold_order_id = null/i);

assert.deepEqual(sqlStatuses(stateBranches[3]), ['confirmed', 'done']);
assert.match(stateBranches[4], /status = 'sold'/i);
assert.match(stateBranches[4], /sold_order_id = new\.id/i);
assert.match(stateBranches[4], /reserved_order_id = null/i);

assert.deepEqual(sqlStatuses(stateBranches[5]), ['refunded', 'canceled', 'failed']);
assert.match(stateBranches[6], /status = 'on_sale'/i);
assert.match(stateBranches[6], /sold_order_id = new\.id[\s\S]*or reserved_order_id = new\.id/i);

assert.match(
  migration,
  /create constraint trigger trg_sync_listing_state_from_order_v1[\s\S]*deferrable initially deferred/i,
  'the state sync must run after the legacy finalize RPC listing write',
);
assert.doesNotMatch(
  migration,
  /create\s+(?:or\s+replace\s+)?function\s+public\.finalize_paid_order_v2/i,
  'the migration must not copy or replace payment finalization',
);
assert.match(
  migration,
  /create or replace function public\.release_expired_checkout_reservations\(\)[\s\S]*status in \('refunded', 'canceled', 'failed'\)/i,
);
const cleanupBody = migration.match(
  /create or replace function public\.release_expired_checkout_reservations\(\)([\s\S]*?)\$\$;/i,
)?.[1] || '';
assert.doesNotMatch(cleanupBody, /update public\.orders/i);
assert.doesNotMatch(cleanupBody, /status\s*=\s*'canceled'/i);
assert.doesNotMatch(cleanupBody, /where status\s*=\s*'pending'/i);
assert.match(
  migration,
  /listing\.reserved_order_id = terminal\.id/i,
  'cleanup must never release another order\'s reservation',
);
assert.doesNotMatch(
  migration,
  /update public\.orders\s+set status = status/i,
  'backfill must not re-fire unrelated order triggers',
);
assert.match(migration, /multiple_active_orders_for_listing/);

const cronSchedules = [...workflow.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map(
  (match) => match[1],
);
assert.deepEqual(cronSchedules, ['*/5 * * * *']);
assert.match(workflow, /group: production-database-maintenance/);

// Executable transition model: verify the intended end-of-transaction result
// around the existing RPC, which writes `sold` after setting the order paid.
const RESERVED = new Set(sqlStatuses(stateBranches[1]));
const SOLD = new Set(sqlStatuses(stateBranches[3]));
const RELEASED = new Set(sqlStatuses(stateBranches[5]));

function normalize(listing, order) {
  if (RESERVED.has(order.status)) {
    return {
      status: 'reserved',
      reservedOrderId: order.id,
      reservedUntil: 'infinity',
      soldOrderId: null,
    };
  }
  if (SOLD.has(order.status)) {
    return {
      status: 'sold',
      reservedOrderId: null,
      reservedUntil: null,
      soldOrderId: order.id,
    };
  }
  if (
    RELEASED.has(order.status)
    && (listing.reservedOrderId === order.id || listing.soldOrderId === order.id)
  ) {
    return {
      status: 'on_sale',
      reservedOrderId: null,
      reservedUntil: null,
      soldOrderId: null,
    };
  }
  return listing;
}

const order = { id: 'order-a', status: 'paid' };
let listing = {
  status: 'sold',
  reservedOrderId: null,
  reservedUntil: null,
  soldOrderId: order.id,
};

listing = normalize(listing, order);
assert.deepEqual(listing, {
  status: 'reserved',
  reservedOrderId: order.id,
  reservedUntil: 'infinity',
  soldOrderId: null,
});

order.status = 'delivered';
listing = normalize(listing, order);
assert.equal(listing.status, 'reserved');
assert.equal(listing.reservedOrderId, order.id);

order.status = 'refund_pending';
listing = normalize(listing, order);
assert.equal(listing.status, 'reserved');
assert.equal(listing.reservedUntil, 'infinity');

order.status = 'confirmed';
listing = normalize(listing, order);
assert.deepEqual(listing, {
  status: 'sold',
  reservedOrderId: null,
  reservedUntil: null,
  soldOrderId: order.id,
});

order.status = 'refunded';
listing = normalize(listing, order);
assert.deepEqual(listing, {
  status: 'on_sale',
  reservedOrderId: null,
  reservedUntil: null,
  soldOrderId: null,
});

const otherReservation = {
  status: 'on_sale',
  reservedOrderId: 'order-b',
  reservedUntil: 'infinity',
  soldOrderId: null,
};
assert.equal(normalize(otherReservation, order), otherReservation);

console.log('order-listing-state contract: ok');
