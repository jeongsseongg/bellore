import assert from 'node:assert/strict';
import {
  CONFIRMATION_RETRY_DELAYS_MS,
  PENDING_RECOVERY_EXPIRY_MS,
  PENDING_RECOVERY_ROTATION_MS,
  confirmationRetryDelayMs,
  fairReconciliationBatch,
  paidRecoveryAction,
  providerStatusKind,
  providerTotalAmount,
  reconciliationSummaryOk,
  rotatingPendingWindowOffset,
  shouldExpirePendingOrder,
  shouldFinalizeDuringRecovery,
  shouldRetryConfirmation,
} from '../supabase/functions/_shared/payment-recovery-policy.mjs';

assert.deepEqual(CONFIRMATION_RETRY_DELAYS_MS, [400, 800, 1200]);
assert.equal(PENDING_RECOVERY_EXPIRY_MS, 86_400_000);
assert.equal(PENDING_RECOVERY_ROTATION_MS, 300_000);
assert.equal(providerStatusKind('PAID'), 'paid');
assert.equal(providerStatusKind('READY'), 'pending');
assert.equal(providerStatusKind('PENDING'), 'pending');
assert.equal(providerStatusKind('PAY_PENDING'), 'pending');
assert.equal(providerStatusKind('VIRTUAL_ACCOUNT_ISSUED'), 'pending');
assert.equal(providerStatusKind('FAILED'), 'failed');
assert.equal(providerStatusKind('CANCELLED'), 'cancelled');
assert.equal(providerStatusKind('PARTIAL_CANCELLED'), 'partial_cancelled');
assert.equal(providerStatusKind('unexpected'), 'unknown');

assert.equal(shouldRetryConfirmation('READY', 0), true);
assert.equal(shouldRetryConfirmation('PAY_PENDING', 2), true);
assert.equal(shouldRetryConfirmation('PAY_PENDING', 3), false);
assert.equal(shouldRetryConfirmation('PAID', 0), false);
assert.equal(confirmationRetryDelayMs(0), 400);
assert.equal(confirmationRetryDelayMs(2), 1200);
assert.equal(confirmationRetryDelayMs(3), 0);

assert.equal(shouldFinalizeDuringRecovery('pending', 'PAID'), true);
assert.equal(shouldFinalizeDuringRecovery('payment_review', 'PAID'), true);
assert.equal(shouldFinalizeDuringRecovery('pending', 'READY'), false);

assert.equal(providerTotalAmount({ amount: { total: 1300 } }), 1300);
assert.equal(providerTotalAmount({ amount: 1300 }), 1300);
assert.equal(providerTotalAmount({ amount: { total: '1300' } }), 1300);
assert.equal(providerTotalAmount({ amount: { total: 1300.5 } }), null);
assert.equal(providerTotalAmount({ amount: { total: -1 } }), null);
assert.equal(providerTotalAmount({ amount: { total: null } }), null);
assert.equal(providerTotalAmount({ amount: '' }), null);
assert.equal(providerTotalAmount({}), null);

assert.equal(paidRecoveryAction('pending', true), 'finalize');
assert.equal(paidRecoveryAction('payment_review', true), 'finalize');
assert.equal(paidRecoveryAction('refund_pending', true), 'continue_cancellation');
assert.equal(paidRecoveryAction('paid', true), 'none');
assert.equal(paidRecoveryAction('pending', false), 'review_amount_mismatch');
assert.equal(paidRecoveryAction('refund_pending', false), 'review_amount_mismatch');

const now = Date.parse('2026-08-26T12:00:00.000Z');
assert.equal(shouldExpirePendingOrder('pending', now - PENDING_RECOVERY_EXPIRY_MS, now), true);
assert.equal(shouldExpirePendingOrder('pending', now - PENDING_RECOVERY_EXPIRY_MS + 1, now), false);
assert.equal(shouldExpirePendingOrder('payment_review', now - PENDING_RECOVERY_EXPIRY_MS, now), false);
assert.equal(shouldExpirePendingOrder('pending', 'invalid-date', now), false);

const overQuotaGroups = ['payment_review', 'refund_pending', 'pending'].map((status) =>
  Array.from({ length: 25 }, (_, index) => ({ order_no: `${status}-${index}`, status, index }))
);
const fairBatch = fairReconciliationBatch(overQuotaGroups, 20);
assert.equal(fairBatch.length, 60, 'one busy status must not reduce another status quota');
assert.deepEqual(fairBatch.slice(0, 6).map((order) => order.status), [
  'payment_review', 'refund_pending', 'pending',
  'payment_review', 'refund_pending', 'pending',
]);
for (const status of ['payment_review', 'refund_pending', 'pending']) {
  const selected = fairBatch.filter((order) => order.status === status);
  assert.equal(selected.length, 20);
  assert.equal(selected.at(-1).index, 19);
}
assert.deepEqual(
  fairReconciliationBatch(
    [[{ order_no: 'same', status: 'refund_pending' }], [{ order_no: 'same', status: 'payment_review' }]],
    20,
  ),
  [{ order_no: 'same', status: 'refund_pending' }],
  'the first, safety-priority status wins when two queries observe one transitioning order',
);

const pendingRows = Array.from({ length: 45 }, (_, index) => ({ index }));
const repeatedOffsets = [0, 1, 2, 3].map((slot) =>
  rotatingPendingWindowOffset(pendingRows.length, 20, slot * PENDING_RECOVERY_ROTATION_MS)
);
assert.deepEqual(repeatedOffsets, [0, 20, 40, 0]);
const visitedPendingIndexes = new Set(
  repeatedOffsets.slice(0, 3).flatMap((offset) =>
    pendingRows.slice(offset, offset + 20).map((row) => row.index)
  ),
);
assert.equal(visitedPendingIndexes.size, 45, 'three scheduled runs must visit every pending row');
assert.equal(
  pendingRows.slice(repeatedOffsets[1], repeatedOffsets[1] + 20).some((row) => row.index === 20),
  true,
  'twenty unchanged READY/404 rows must not hide the twenty-first PAID row on the next run',
);
assert.equal(rotatingPendingWindowOffset(45, 20, Number.NaN), 0);

assert.equal(reconciliationSummaryOk({ pending: 7, errors: 0, reviewRequired: 0 }), true);
assert.equal(reconciliationSummaryOk({ pending: 7, errors: 1, reviewRequired: 0 }), false);
assert.equal(reconciliationSummaryOk({ pending: 7, errors: 0, reviewRequired: 1 }), false);

console.log('payment recovery policy: ok');
