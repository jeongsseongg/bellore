import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');
const lines = (source) => source.replace(/\r\n?/g, '\n').split('\n').length;
const occurrences = (source, pattern) => (source.match(pattern) || []).length;

const shared = read('supabase/functions/_shared/payment-recovery.ts');
const cancellation = read('supabase/functions/_shared/portone-cancellation.ts');
const policy = read('supabase/functions/_shared/payment-recovery-policy.mjs');
const confirm = read('supabase/functions/confirm-payment/index.ts');
const webhook = read('supabase/functions/payment-webhook/index.ts');
const reconcile = read('supabase/functions/reconcile-payments/index.ts');
const reconcileWorkflow = read('.github/workflows/payment-reconcile.yml');

for (const [name, source] of Object.entries({ shared, cancellation, confirm, webhook, reconcile })) {
  assert(lines(source) <= 400, `${name} must stay within the 400-line source ceiling`);
}

assert.match(shared, /provider_payment_id_mismatch/);
assert.match(shared, /provider_payment_id_missing/);
assert.match(shared, /provider_store_mismatch/);
assert.match(shared, /provider_currency_mismatch/);
assert.match(shared, /provider_channel_not_live/);
assert.match(shared, /finalize_paid_order_v2/);
assert.match(shared, /hasConfirmedPaymentStatus/);
assert.match(shared, /\.in\("status", statuses\)/);
assert.match(cancellation, /"Idempotency-Key": idempotencyKey/);
assert.match(cancellation, /idempotencyKeyRaw = `bellore-cancel-\$\{input\.paymentId\}`\.slice\(0, 254\)/);
assert.match(cancellation, /idempotencyKey = `\\"\$\{idempotencyKeyRaw\}\\"`/);
assert.equal(occurrences(cancellation, /AbortSignal\.timeout\(10000\)/g), 2);
assert.doesNotMatch(cancellation, /mark_order_payment_review/);
assert.equal(occurrences(cancellation, /mark_order_refund_pending/g), 3);

assert.match(confirm, /retryDelaysMs: CONFIRMATION_RETRY_DELAYS_MS/);
assert.match(confirm, /retryPendingStatus: true/);
assert.match(confirm, /notFoundResult: "pending"/);
assert.match(confirm, /payment_confirmation_pending/);
assert.match(confirm, /retryAfterMs: 2000/);
assert.match(confirm, /provider_paid_finalize_retry/);
assert.match(confirm, /reason: "amount_mismatch_auto_cancel"/);
assert.doesNotMatch(confirm, /order_finalize_failed_auto_cancel/);
assert.equal(occurrences(confirm, /cancelAndReconcile\(\{/g), 1);

assert.match(webhook, /cancel_pending_without_local_request/);
assert.match(webhook, /provider_paid_amount_mismatch/);
assert.match(webhook, /amount_mismatch_review/);
assert.match(webhook, /webhook_refund_pending_recovery/);
assert.match(webhook, /provider_paid_finalize_retry/);
assert.match(webhook, /order_finalize_pending/);
assert.doesNotMatch(webhook, /(?:amount_mismatch|finalize_failed)_auto_cancel/);
assert.equal(occurrences(webhook, /cancelAndReconcile\(\{/g), 1);
assert.match(webhook, /MAX_WEBHOOK_BYTES = 16_384/);
assert.match(webhook, /order_not_found/);
assert(webhook.indexOf('order_not_found') < webhook.indexOf('lookupPortOnePayment({'), 'unknown orders must be rejected before provider lookup');

for (const status of ['payment_review', 'refund_pending']) {
  assert.match(
    reconcile,
    new RegExp(`\\.eq\\("status", "${status}"\\)[\\s\\S]{0,180}\\.limit\\(MAX_ORDERS_PER_GROUP\\)`),
    `${status} must have its own oldest-first reconciliation quota`,
  );
}
assert.equal(
  occurrences(reconcile, /\.limit\(MAX_ORDERS_PER_GROUP\)/g),
  2,
  'tracked reconciliation statuses must each receive an independent quota',
);
assert.match(reconcile, /\.select\("id", \{ count: "exact", head: true \}\)[\s\S]{0,100}\.eq\("status", "pending"\)/);
assert.match(reconcile, /rotatingPendingWindowOffset\([\s\S]{0,120}MAX_ORDERS_PER_GROUP[\s\S]{0,120}nowMs/);
assert.match(
  reconcile,
  /\.eq\("status", "pending"\)[\s\S]{0,220}\.order\("created_at", \{ ascending: true \}\)[\s\S]{0,100}\.order\("id", \{ ascending: true \}\)[\s\S]{0,120}\.range\(pendingOffset, pendingOffset \+ MAX_ORDERS_PER_GROUP - 1\)/,
  'pending recovery must rotate a stable, bounded window instead of repeating the oldest 20 rows',
);
assert.doesNotMatch(
  reconcile,
  /\.in\("status", \["payment_review", "refund_pending"\]\)/,
  'payment_review must not consume the refund_pending quota',
);
assert.match(
  reconcile,
  /const groupResults = \[refundPendingResult, paymentReviewResult, pendingResult\]/,
  'refund_pending must win if independent query snapshots observe the same transitioning order',
);
assert.match(reconcile, /fairReconciliationBatch\([\s\S]*MAX_ORDERS_PER_GROUP/);
assert.match(reconcile, /notFoundResult: "not_found"/);
assert.match(reconcile, /provider_payment_not_found_expired/);
assert.match(reconcile, /finalizePaidOrderFromProvider/);
assert.match(reconcile, /provider_paid_amount_mismatch/);
assert.match(reconcile, /scheduled_refund_pending_recovery/);
assert.match(reconcile, /reconciliationSummaryOk\(summary\)/);
assert.doesNotMatch(reconcile, /scheduled_(?:amount_mismatch|payment_reconciliation)/);
assert.equal(occurrences(reconcile, /cancelAndReconcile\(\{/g), 1);

assert.match(policy, /status === 'pending' \|\| status === 'payment_review'/);
assert.match(policy, /status === 'refund_pending'.*continue_cancellation/);
assert.match(policy, /review_amount_mismatch/);
assert.match(policy, /PENDING_RECOVERY_EXPIRY_MS = 24 \* 60 \* 60 \* 1000/);
assert.match(policy, /export function fairReconciliationBatch/);
assert.match(policy, /export function rotatingPendingWindowOffset/);
assert.match(policy, /PENDING_RECOVERY_ROTATION_MS = 5 \* 60 \* 1000/);
assert.match(reconcileWorkflow, /cron: ['"]\*\/5 \* \* \* \*['"]/);

console.log('payment backend recovery contracts: ok');
