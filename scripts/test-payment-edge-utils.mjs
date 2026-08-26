import assert from 'node:assert/strict';
import {
  confirmationAuthorized,
  publicOrder,
  safeEqual,
  sanitizePaymentAttribution,
  sha256Hex,
} from '../supabase/functions/_shared/payment-edge-utils.ts';
import {
  markPaymentReviewIfUnsettled,
  paidFinalizationFailureKind,
} from '../supabase/functions/_shared/payment-recovery.ts';

const attribution = sanitizePaymentAttribution({
  event_id: ' 123E4567-E89B-12D3-A456-426614174000 ',
  anonymous_id: 'not-a-uuid',
  first_touch: { utm_source: ' newsletter ', secret: 'must-not-pass' },
});
assert.equal(attribution.event_id, '123e4567-e89b-12d3-a456-426614174000');
assert.equal(attribution.anonymous_id, null);
assert.deepEqual(attribution.first_touch, { utm_source: 'newsletter' });
assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.equal(safeEqual('same-token', 'same-token'), true);
assert.equal(safeEqual('same-token', 'different-token'), false);
assert.equal(confirmationAuthorized('customer-1', 'customer-1', false), true);
assert.equal(confirmationAuthorized('customer-1', null, true), true,
  'a server-issued order capability must survive an expired browser session');
assert.equal(confirmationAuthorized('customer-1', 'attacker', false), false);
assert.equal(confirmationAuthorized(null, null, false), false);

const exposed = publicOrder({
  id: 'order-id', order_no: 'BLR1', listing_id: 'listing-id', status: 'paid',
  amount: 1300, paid_at: '2026-08-26T00:00:00Z', receipt_url: 'https://receipt.test',
  payment_key: 'provider-secret', checkout_token_hash: 'capability-secret', customer_id: 'customer-id',
});
assert.deepEqual(Object.keys(exposed).sort(), [
  'amount', 'id', 'listing_id', 'order_no', 'paid_at', 'receipt_url', 'status',
]);
assert.equal('payment_key' in exposed, false);
assert.equal('checkout_token_hash' in exposed, false);

assert.equal(paidFinalizationFailureKind({ code: 'P0001', message: 'coupon_reserved' }), 'coupon_conflict');
assert.equal(paidFinalizationFailureKind({ code: 'P0001', message: 'listing_reserved_by_other_order' }), 'listing_conflict');
assert.equal(paidFinalizationFailureKind({
  code: 'P0001', message: 'listing_state_conflict:123e4567-e89b-12d3-a456-426614174000',
}), 'listing_conflict');
assert.equal(paidFinalizationFailureKind({ code: '23505', message: 'coupon_reserved' }), null);
assert.equal(paidFinalizationFailureKind({ code: 'P0001', message: 'prefix coupon_reserved suffix' }), null);
assert.equal(paidFinalizationFailureKind({ code: 'P0001', message: 'other', details: 'listing_reserved' }), null);

const reviewCalls = [];
const reviewAdmin = {
  rpc(name, args) {
    reviewCalls.push({ name, args });
    return Promise.resolve({ data: true, error: null });
  },
};
assert.equal(await markPaymentReviewIfUnsettled(
  reviewAdmin, 'BLR' + 'A'.repeat(24), 'provider_paid_finalize_retry:database_error',
), true);
assert.deepEqual(reviewCalls, [{
  name: 'mark_order_payment_review',
  args: {
    p_order_no: 'BLR' + 'A'.repeat(24),
    p_reason: 'provider_paid_finalize_retry:database_error',
  },
}], 'review recovery must use the state-preserving DB RPC, never a service-role table update');

console.log('payment Edge utilities and exact financial error classification: ok');
