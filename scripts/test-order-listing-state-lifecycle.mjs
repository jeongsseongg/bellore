import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(path.join(
  root, 'supabase', 'migrations', '20260826160000_payment_recovery_listing_state.sql',
), 'utf8');
const sqlStatuses = (fragment) => [...fragment.matchAll(/'([a-z_]+)'/g)]
  .map((match) => match[1]);
const pendingBranch = migration.match(
  /elsif new\.status in \(([^)]+)\) then([\s\S]*?)elsif new\.status in \(/i,
);
const stateBranches = migration.match(
  /elsif new\.status in \((\s*'paid',[^)]*)\) then([\s\S]*?)elsif new\.status in \(([^)]+)\) then([\s\S]*?)elsif new\.status in \(([^)]+)\) then([\s\S]*?)end if;/i,
);
assert.ok(pendingBranch && stateBranches);

const PENDING_HOLD = new Set(sqlStatuses(pendingBranch[1]));
const RESERVED = new Set(sqlStatuses(stateBranches[1]));
const SOLD = new Set(sqlStatuses(stateBranches[3]));
const RELEASED = new Set(sqlStatuses(stateBranches[5]));
assert.deepEqual([...PENDING_HOLD], ['cancel_req', 'cancel_requested', 'refund_pending']);

const POST_FULFILMENT = new Set([
  'shipping', 'shipped', 'delivered', 'confirmed',
  'return_req', 'exchange_req', 'returning', 'done',
]);

function requiresRestock(order) {
  if (order.paymentContractVersion !== 2) return false;
  return Boolean(
    order.restockRequired
    || order.shippedAt
    || order.deliveredAt
    || order.confirmedAt
    || POST_FULFILMENT.has(order.status)
    || (order.statusHistory || []).some((status) => POST_FULFILMENT.has(status)),
  );
}

function normalize(listing, order) {
  if (PENDING_HOLD.has(order.status)) {
    const ownsReservation = listing.reservedOrderId == null
      || listing.reservedOrderId === order.id;
    const ownsSale = listing.soldOrderId == null || listing.soldOrderId === order.id;
    if (!ownsReservation || !ownsSale) return listing;
    if (order.restockRequired) {
      return {
        status: 'sold', reservedOrderId: null, reservedUntil: null, soldOrderId: order.id,
      };
    }
    return {
      status: 'reserved', reservedOrderId: order.id,
      reservedUntil: 'infinity', soldOrderId: null,
    };
  }
  if (RESERVED.has(order.status)) {
    return {
      status: 'reserved', reservedOrderId: order.id,
      reservedUntil: 'infinity', soldOrderId: null,
    };
  }
  if (SOLD.has(order.status)) {
    return {
      status: 'sold', reservedOrderId: null, reservedUntil: null, soldOrderId: order.id,
    };
  }
  if (RELEASED.has(order.status)
    && (listing.reservedOrderId === order.id || listing.soldOrderId === order.id)) {
    if (order.restockRequired) {
      return {
        status: 'sold', reservedOrderId: null, reservedUntil: null, soldOrderId: order.id,
      };
    }
    return {
      status: 'on_sale', reservedOrderId: null, reservedUntil: null, soldOrderId: null,
    };
  }
  return listing;
}

// Durable evidence survives delivered -> cancel_req -> refund. The watch stays
// sold until the explicit post-inspection restock operation clears the hold.
const delivered = {
  id: 'order-delivered', status: 'delivered', paymentContractVersion: 2,
  restockRequired: false, deliveredAt: '2026-08-26T01:00:00Z',
  statusHistory: ['paid', 'shipping', 'delivered'],
};
let deliveredListing = normalize({
  status: 'reserved', reservedOrderId: delivered.id,
  reservedUntil: 'infinity', soldOrderId: null,
}, delivered);
delivered.status = 'cancel_req';
delivered.restockRequired = requiresRestock(delivered);
assert.equal(delivered.restockRequired, true);
deliveredListing = normalize(deliveredListing, delivered);
assert.equal(deliveredListing.status, 'sold');
delivered.status = 'refund_pending';
deliveredListing = normalize(deliveredListing, delivered);
assert.equal(deliveredListing.status, 'sold');
delivered.status = 'refunded';
deliveredListing = normalize(deliveredListing, delivered);
assert.deepEqual(deliveredListing, {
  status: 'sold', reservedOrderId: null, reservedUntil: null,
  soldOrderId: delivered.id,
});
delivered.restockRequired = false;
deliveredListing = {
  status: 'on_sale', reservedOrderId: null, reservedUntil: null, soldOrderId: null,
};
assert.equal(deliveredListing.status, 'on_sale');

// A direct shipped state still leaves durable history even if an older stamp
// trigger failed to populate shipped_at before cancel_requested replaced it.
assert.equal(requiresRestock({
  status: 'cancel_requested', paymentContractVersion: 2,
  restockRequired: false, statusHistory: ['paid', 'shipped'],
}), true);
for (const status of ['return_req', 'exchange_req', 'returning', 'done']) {
  assert.equal(requiresRestock({
    status, paymentContractVersion: 2, restockRequired: false,
  }), true, `${status} must remain physically held`);
}

// Pre-fulfilment cancellation has no shipping evidence and is released after
// the full provider refund instead of being trapped behind a restock hold.
const pre = {
  id: 'order-pre', status: 'cancel_req', paymentContractVersion: 2,
  restockRequired: false, statusHistory: ['paid', 'preparing'],
};
pre.restockRequired = requiresRestock(pre);
assert.equal(pre.restockRequired, false);
let preListing = normalize({
  status: 'reserved', reservedOrderId: pre.id,
  reservedUntil: 'infinity', soldOrderId: null,
}, pre);
assert.equal(preListing.status, 'reserved');
pre.status = 'refund_pending';
preListing = normalize(preListing, pre);
assert.equal(preListing.status, 'reserved');
pre.status = 'refunded';
preListing = normalize(preListing, pre);
assert.deepEqual(preListing, {
  status: 'on_sale', reservedOrderId: null, reservedUntil: null, soldOrderId: null,
});
assert.equal(requiresRestock({
  status: 'delivered', paymentContractVersion: null,
  restockRequired: false, deliveredAt: '2026-08-26T01:00:00Z',
}), false, 'legacy orders remain outside the v2 restock contract');

// Owner checks prevent a late recovery from stealing a newer reservation or
// sale for the same listing.
const lateRefund = {
  id: 'order-a', status: 'refund_pending', restockRequired: false,
};
const otherReservation = {
  status: 'on_sale', reservedOrderId: 'order-b',
  reservedUntil: 'infinity', soldOrderId: null,
};
const otherSale = {
  status: 'sold', reservedOrderId: null, reservedUntil: null, soldOrderId: 'order-b',
};
assert.equal(normalize(otherReservation, lateRefund), otherReservation);
assert.equal(normalize(otherSale, lateRefund), otherSale);

const markPaymentReview = (candidate) => candidate.paymentContractVersion === 2
  ? {
      ...candidate,
      status: ['pending', 'payment_review'].includes(candidate.status)
        ? 'payment_review' : candidate.status,
      paymentReviewRequired: !['pending', 'payment_review'].includes(candidate.status),
    }
  : { ...candidate, status: 'payment_review', paymentReviewRequired: false };
for (const status of ['shipped', 'delivered', 'confirmed', 'done', 'failed', 'canceled']) {
  const reviewed = markPaymentReview({ status, paymentContractVersion: 2 });
  assert.equal(reviewed.status, status);
  assert.equal(reviewed.paymentReviewRequired, true);
}

// A released A may coexist with a newer unresolved B without losing B's claim.
const CLAIM_RELEASED = new Set(['failed', 'canceled', 'refunded', 'refund_pending']);
const orders = [{ id: 'order-a', listingId: 'watch-1', status: 'failed' }];
orders.push({ id: 'order-b', listingId: 'watch-1', status: 'pending' });
orders[0].status = 'refund_pending';
assert.deepEqual(
  orders.filter((order) => !CLAIM_RELEASED.has(order.status)).map((order) => order.id),
  ['order-b'],
);

const canReplaceReservation = (oldOwner, oldUntil, newOwner, nowMs) =>
  oldOwner == null || oldOwner === newOwner
  || (oldUntil != null && oldUntil !== 'infinity' && Date.parse(oldUntil) <= nowMs);
const now = Date.parse('2026-08-26T12:00:00.000Z');
assert.equal(canReplaceReservation('order-a', '2026-08-26T11:59:59Z', 'order-b', now), true);
assert.equal(canReplaceReservation('order-a', 'infinity', 'order-b', now), false);

console.log('order-listing-state lifecycle: ok');
