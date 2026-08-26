import assert from 'node:assert/strict';
import {
  addReconciliationCounters,
  emptyReconciliationCounters,
  markNonActionablePaymentReview,
  preserveRefundPendingForReview,
  recordCancellationOutcome,
} from '../supabase/functions/_shared/reconciliation-outcomes.ts';

const total = emptyReconciliationCounters();
const first = emptyReconciliationCounters();
first.scanned = 1;
first.confirmed = 1;
addReconciliationCounters(total, first);
assert.deepEqual(total, {
  scanned: 1,
  confirmed: 1,
  refunded: 0,
  pending: 0,
  failed: 0,
  reviewRequired: 0,
  errors: 0,
});

recordCancellationOutcome(total, {
  state: 'succeeded', cancellationId: null, cancelledAmount: 1300, recovered: true,
  dbFinalized: true, tracked: true, providerRefunded: true,
});
assert.equal(total.refunded, 1);
recordCancellationOutcome(total, {
  state: 'requested', cancellationId: 'cancel-1', cancelledAmount: null, recovered: false,
  dbFinalized: false, tracked: true, providerRefunded: false,
});
assert.equal(total.pending, 1);

const rpcCalls = [];
const admin = {
  async rpc(name, args) {
    rpcCalls.push({ name, args });
    return { data: true, error: null };
  },
};
const reviewCounters = emptyReconciliationCounters();
await markNonActionablePaymentReview(
  admin, 'safe-order', 'confirmed_payment_provider_contradiction:partial_cancelled', reviewCounters,
);
assert.deepEqual(rpcCalls.shift(), {
  name: 'mark_order_payment_review',
  args: {
    p_order_no: 'safe-order',
    p_reason: 'confirmed_payment_provider_contradiction:partial_cancelled',
  },
});
assert.equal(reviewCounters.reviewRequired, 1);
assert.equal(reviewCounters.errors, 0);

await preserveRefundPendingForReview(
  admin, 'refund-order', 'refund_pending_partial_cancel_requires_manual_review', reviewCounters,
);
assert.deepEqual(rpcCalls.shift(), {
  name: 'mark_order_refund_pending',
  args: {
    p_order_no: 'refund-order',
    p_reason: 'refund_pending_partial_cancel_requires_manual_review',
  },
});
assert.equal(reviewCounters.reviewRequired, 2);

console.log('reconciliation outcomes runtime: ok');
