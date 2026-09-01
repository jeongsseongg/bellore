import assert from 'node:assert/strict';
import {
  CLOSED_ORDER_FINALIZATION_ERROR,
  CONFIRMATION_RETRY_DELAYS_MS,
  NOT_FOUND_RELEASE_AGE_MS,
  PENDING_REVIEW_AGE_MS,
  RECONCILIATION_ROTATION_MS,
  adminCancellationAction,
  confirmedPaymentReconciliationAction,
  confirmationRetryDelayMs,
  fairReconciliationBatch,
  pendingCheckoutAbandonmentAction,
  paidFinalizationDatabaseFailureKind,
  paidFinalizationRecoveryAction,
  paidRecoveryAction,
  providerCancelledAmount,
  providerPaidAmount,
  providerStatusKind,
  providerTotalAmount,
  reconciliationSummaryOk,
  rotatingReconciliationWindowOffset,
  shouldEscalatePendingOrder,
  shouldFinalizeDuringRecovery,
  shouldReleaseNotFoundOrder,
  shouldRetryConfirmation,
} from '../supabase/functions/_shared/payment-recovery-policy.mjs';

assert.deepEqual(CONFIRMATION_RETRY_DELAYS_MS, [400, 800, 1200]);
assert.equal(NOT_FOUND_RELEASE_AGE_MS, 3_600_000);
assert.equal(PENDING_REVIEW_AGE_MS, 86_400_000);
assert.equal(RECONCILIATION_ROTATION_MS, 300_000);
assert.equal(providerStatusKind('PAID'), 'paid');
assert.equal(providerStatusKind('READY'), 'pending');
assert.equal(providerStatusKind('PENDING'), 'pending');
assert.equal(providerStatusKind('PAY_PENDING'), 'pending');
assert.equal(providerStatusKind('VIRTUAL_ACCOUNT_ISSUED'), 'pending');
assert.equal(providerStatusKind('FAILED'), 'failed');
assert.equal(providerStatusKind('CANCELLED'), 'cancelled');
assert.equal(providerStatusKind('PARTIAL_CANCELLED'), 'partial_cancelled');
assert.equal(providerStatusKind('unexpected'), 'unknown');
assert.equal(pendingCheckoutAbandonmentAction('READY', true), 'close_unsettled');
for (const status of ['PENDING', 'PAY_PENDING', 'VIRTUAL_ACCOUNT_ISSUED', 'PAID']) {
  assert.equal(pendingCheckoutAbandonmentAction(status, true), 'wait');
}
assert.equal(pendingCheckoutAbandonmentAction('READY', false), 'wait');

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
assert.equal(providerPaidAmount({ amount: { total: 1500, paid: 1300, cancelled: 0 } }), 1300);
assert.equal(providerCancelledAmount({ amount: { total: 1500, paid: 1300, cancelled: 1300 } }), 1300);
assert.equal(providerPaidAmount({ amount: { total: 1300 } }), null);
assert.equal(providerCancelledAmount({ amount: { total: 1300 } }), null);
assert.equal(providerPaidAmount({ amount: { total: 1300, paid: 0 } }), null);
assert.equal(providerCancelledAmount({ amount: { total: 1300, cancelled: 0 } }), null);

assert.equal(paidRecoveryAction('pending', true), 'finalize');
assert.equal(paidRecoveryAction('payment_review', true), 'finalize');
assert.equal(paidRecoveryAction('refund_pending', true), 'continue_cancellation');
assert.equal(paidRecoveryAction('paid', true), 'none');
assert.equal(paidRecoveryAction('pending', false, true), 'cancel_amount_mismatch');
assert.equal(paidRecoveryAction('pending', false, false), 'review_amount_missing');
assert.equal(paidRecoveryAction('failed', true, true), 'cancel_late_payment');
assert.equal(paidRecoveryAction('canceled', true, true), 'cancel_late_payment');
assert.equal(paidRecoveryAction('refund_pending', false), 'continue_cancellation');
const confirmedInput = {
  locallyConfirmed: true,
  providerStatus: 'PAID',
  paidAmount: 1300,
  expectedAmount: 1300,
  storedPaymentKey: 'payment-live-1',
  lookupPaymentId: 'payment-live-1',
  paidAt: '2026-08-26T12:00:00.000Z',
};
assert.equal(confirmedPaymentReconciliationAction(confirmedInput), 'healthy');
assert.equal(confirmedPaymentReconciliationAction({ ...confirmedInput, locallyConfirmed: false }), 'not_applicable');
assert.equal(confirmedPaymentReconciliationAction({ ...confirmedInput, providerStatus: 'CANCELLED' }), 'finalize_cancelled');
for (const providerStatus of ['PARTIAL_CANCELLED', 'FAILED', 'PENDING', 'UNEXPECTED']) {
  assert.equal(confirmedPaymentReconciliationAction({ ...confirmedInput, providerStatus }), 'review');
}
for (const override of [
  { paidAmount: 1299 },
  { storedPaymentKey: null },
  { lookupPaymentId: 'payment-other' },
  { paidAt: null },
]) {
  assert.equal(confirmedPaymentReconciliationAction({ ...confirmedInput, ...override }), 'review');
}
assert.deepEqual(CLOSED_ORDER_FINALIZATION_ERROR, {
  code: 'P0001',
  message: 'order_closed_before_paid_finalization',
});
assert.equal(
  paidFinalizationDatabaseFailureKind(
    CLOSED_ORDER_FINALIZATION_ERROR.code,
    CLOSED_ORDER_FINALIZATION_ERROR.message,
  ),
  'locally_closed',
);
assert.equal(
  paidFinalizationDatabaseFailureKind('P0001', 'ORDER_CLOSED_BEFORE_PAID_FINALIZATION'),
  null,
  'the closed-order refund authority must match the exact database message',
);
assert.equal(
  paidFinalizationDatabaseFailureKind(' P0001 ', CLOSED_ORDER_FINALIZATION_ERROR.message),
  null,
  'the closed-order refund authority must match the exact SQLSTATE',
);
assert.equal(
  paidFinalizationDatabaseFailureKind('23505', CLOSED_ORDER_FINALIZATION_ERROR.message),
  null,
  'a matching message with the wrong SQLSTATE must never authorize a refund',
);
assert.equal(
  paidFinalizationDatabaseFailureKind('P0001', `${CLOSED_ORDER_FINALIZATION_ERROR.message}:failed`),
  null,
  'a message prefix must never authorize a refund',
);
assert.equal(paidFinalizationRecoveryAction('listing_conflict'), 'cancel_conflict');
assert.equal(paidFinalizationRecoveryAction('coupon_conflict'), 'cancel_conflict');
assert.equal(paidFinalizationRecoveryAction('locally_closed'), 'cancel_conflict');
assert.equal(paidFinalizationRecoveryAction(null), 'review');

assert.equal(adminCancellationAction('PAID', 1300), 'cancel_paid');
assert.equal(adminCancellationAction('PAID', null), 'review');
assert.equal(adminCancellationAction('PENDING', 1300), 'wait');
assert.equal(adminCancellationAction('READY', 1300), 'wait');
assert.equal(adminCancellationAction('FAILED', 1300), 'close_unsettled');
assert.equal(adminCancellationAction('PARTIAL_CANCELLED', 1300), 'review');
assert.equal(adminCancellationAction('CANCELLED', 1300), 'finalize_cancelled');
assert.equal(adminCancellationAction('CANCELLED', null), 'review');
assert.equal(adminCancellationAction('UNEXPECTED', 1300), 'review');

const now = Date.parse('2026-08-26T12:00:00.000Z');
assert.equal(shouldReleaseNotFoundOrder('pending', now - NOT_FOUND_RELEASE_AGE_MS, now), true);
assert.equal(shouldReleaseNotFoundOrder('pending', now - NOT_FOUND_RELEASE_AGE_MS + 1, now), false);
assert.equal(shouldReleaseNotFoundOrder('payment_review', now - NOT_FOUND_RELEASE_AGE_MS, now), false);
assert.equal(shouldReleaseNotFoundOrder('pending', 'invalid-date', now), false);
assert.equal(shouldEscalatePendingOrder('pending', now - PENDING_REVIEW_AGE_MS, now), true);
assert.equal(shouldEscalatePendingOrder('pending', now - PENDING_REVIEW_AGE_MS + 1, now), false);
assert.equal(shouldEscalatePendingOrder('payment_review', now - PENDING_REVIEW_AGE_MS, now), false);
assert.equal(shouldEscalatePendingOrder('pending', 'invalid-date', now), false);
for (const age of [15 * 60 * 1000, PENDING_REVIEW_AGE_MS + 1, 7 * 24 * 60 * 60 * 1000]) {
  assert.notEqual(providerStatusKind('READY'), 'failed', `READY must never become terminal after ${age}ms`);
  assert.notEqual(providerStatusKind('PENDING'), 'cancelled', `PENDING must never become terminal after ${age}ms`);
  assert.equal(providerStatusKind('NOT_FOUND'), 'unknown', 'not-found is not provider terminal truth');
}

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

for (const status of ['payment_review', 'refund_pending', 'pending']) {
  const rows = Array.from({ length: 45 }, (_, index) => ({
    status,
    index,
    providerStatus: index === 20 ? 'PAID' : 'UNCHANGED',
  }));
  const repeatedOffsets = [0, 1, 2, 3].map((slot) =>
    rotatingReconciliationWindowOffset(rows.length, 20, slot * RECONCILIATION_ROTATION_MS)
  );
  assert.deepEqual(repeatedOffsets, [0, 20, 40, 0]);
  const visitedIndexes = new Set(repeatedOffsets.slice(0, 3).flatMap((offset) =>
    rows.slice(offset, offset + 20).map((row) => row.index)
  ));
  assert.equal(visitedIndexes.size, 45, `three runs must visit every ${status} row`);
  assert.equal(
    rows.slice(repeatedOffsets[1], repeatedOffsets[1] + 20)
      .some((row) => row.index === 20 && row.providerStatus === 'PAID'),
    true,
    `twenty unchanged ${status} rows must not hide the twenty-first PAID row`,
  );
}
assert.equal(rotatingReconciliationWindowOffset(45, 20, Number.NaN), 0);

assert.equal(reconciliationSummaryOk({ pending: 7, errors: 0, reviewRequired: 0 }), true);
assert.equal(reconciliationSummaryOk({ pending: 7, errors: 1, reviewRequired: 0 }), false);
assert.equal(reconciliationSummaryOk({ pending: 7, errors: 0, reviewRequired: 1 }), false);

console.log('payment recovery policy: ok');
