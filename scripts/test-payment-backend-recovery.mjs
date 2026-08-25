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
const cancel = read('supabase/functions/cancel-payment/index.ts');
const webhook = read('supabase/functions/payment-webhook/index.ts');
const reconcile = read('supabase/functions/reconcile-payments/index.ts');
const listingStateMigration = read('supabase/migrations/20260826160000_payment_recovery_listing_state.sql');
const reconcileWorkflow = read('.github/workflows/payment-reconcile.yml');

for (const [name, source] of Object.entries({ shared, cancellation, confirm, cancel, webhook, reconcile })) {
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
assert.match(cancellation, /reason: PROVIDER_CANCELLATION_REASON/);
assert.doesNotMatch(cancellation, /body: JSON\.stringify\(\{ storeId: input\.storeId, reason: input\.reason \}\)/);
assert.equal(occurrences(cancellation, /AbortSignal\.timeout\(10000\)/g), 2);
assert.doesNotMatch(cancellation, /mark_order_payment_review/);
assert.equal(occurrences(cancellation, /mark_order_refund_pending/g), 6);
const intentMarker = cancellation.indexOf('const intentMarker = await input.admin.rpc("mark_order_refund_pending"');
const providerCancel = cancellation.indexOf('cancellation = await cancelPortOnePayment(input)');
assert(intentMarker >= 0 && providerCancel > intentMarker, 'cancellation intent must persist before provider POST');
assert.match(cancellation, /intentMarker\.error \|\| intentMarker\.data !== true/);
assert.match(cancellation, /tracked: false[\s\S]{0,180}providerRefunded: false/);
assert.match(cancellation, /p_refund_amount: input\.refundAmount/);
assert.match(cancellation, /cancellation_intent:\$\{input\.intentCode\}/);
assert.match(cancellation, /provider_already_cancelled_recovery/);
assert.doesNotMatch(shared, /includeRefundPending/);
assert.equal(
  occurrences([confirm, cancel, webhook, reconcile].join('\n'), /intentCode: /g),
  4,
  'every provider cancellation call must use a trusted machine intent code',
);

assert.match(confirm, /retryDelaysMs: CONFIRMATION_RETRY_DELAYS_MS/);
assert.match(confirm, /retryPendingStatus: true/);
assert.match(confirm, /notFoundResult: "pending"/);
assert.match(confirm, /payment_confirmation_pending/);
assert.match(confirm, /retryAfterMs: 2000/);
assert.match(confirm, /provider_paid_finalize_retry/);
assert.match(confirm, /reason: "amount_mismatch_auto_cancel"/);
assert.match(confirm, /provider_paid_amount_missing/);
assert.match(confirm, /refundAmount: paidAmount/);
assert.doesNotMatch(confirm, /order_finalize_failed_auto_cancel/);
assert.equal(occurrences(confirm, /cancelAndReconcile\(\{/g), 1);

const cancelLookup = cancel.indexOf('const lookup = await lookupPortOnePayment({');
const cancelProvider = cancel.indexOf('const cancellation = await cancelAndReconcile({');
assert(cancelLookup >= 0 && cancelProvider > cancelLookup, 'admin refund must verify provider state first');
assert.match(cancel, /providerPaidAmount/);
assert.match(cancel, /providerCancelledAmount/);
assert.match(cancel, /refundAmount: providerAmount/);
assert.match(cancel, /intentCode: "administrator_provider_verified_refund"/);
assert.match(cancel, /action === "wait"/);
assert.match(cancel, /action === "close_unsettled"/);
assert.match(cancel, /action === "review"/);
assert.match(cancel, /action === "finalize_cancelled"/);
assert.doesNotMatch(cancel, /refundAmount: Number\(order\.amount\)/);
assert.equal(occurrences(cancel, /cancelAndReconcile\(\{/g), 1);

assert.match(webhook, /cancel_pending_without_local_request/);
assert.match(webhook, /provider_paid_amount_mismatch/);
assert.match(webhook, /refund_pending_provider_paid_amount_missing/);
assert.match(webhook, /provider_cancelled_amount_missing/);
assert.match(webhook, /finalizeKnownProviderCancellation/);
assert.match(webhook, /refundAmount: paidAmount/);
assert.match(webhook, /providerPaidAmount\(payment\)/);
assert.match(webhook, /providerCancelledAmount\(payment\)/);
assert.doesNotMatch(webhook, /providerTotalAmount\(payment\)/);
assert.match(webhook, /amount_mismatch_review/);
assert.match(webhook, /webhook_refund_pending_recovery/);
assert.match(webhook, /provider_paid_finalize_retry/);
assert.match(webhook, /order_finalize_pending/);
assert.doesNotMatch(webhook, /(?:amount_mismatch|finalize_failed)_auto_cancel/);
assert.equal(occurrences(webhook, /cancelAndReconcile\(\{/g), 1);
assert.match(webhook, /MAX_WEBHOOK_BYTES = 16_384/);
assert.match(webhook, /order_not_found/);
assert(webhook.indexOf('order_not_found') < webhook.indexOf('lookupPortOnePayment({'), 'unknown orders must be rejected before provider lookup');

for (const status of ['payment_review', 'refund_pending', 'pending']) {
  assert.match(
    reconcile,
    new RegExp(`\\.select\\("id", \\{ count: "exact", head: true \\}\\)[\\s\\S]{0,100}\\.eq\\("status", "${status}"\\)`),
    `${status} must have its own exact count for rotating quota`,
  );
}
assert.equal(occurrences(reconcile, /\.select\("id", \{ count: "exact", head: true \}\)/g), 3);
assert.equal(occurrences(reconcile, /\.limit\(MAX_ORDERS_PER_GROUP\)/g), 0);
assert.equal(
  occurrences(reconcile, /\.range\(\w+Offset, \w+Offset \+ MAX_ORDERS_PER_GROUP - 1\)/g),
  3,
  'every reconciliation status must receive an independent rotating range',
);
assert.equal(occurrences(reconcile, /rotatingReconciliationWindowOffset\(/g), 1);
for (const [status, offset] of [
  ['payment_review', 'paymentReviewOffset'],
  ['refund_pending', 'refundPendingOffset'],
  ['pending', 'pendingOffset'],
]) {
  assert.match(
    reconcile,
    new RegExp(`\\.eq\\("status", "${status}"\\)[\\s\\S]{0,240}\\.order\\("created_at", \\{ ascending: true \\}\\)[\\s\\S]{0,100}\\.order\\("id", \\{ ascending: true \\}\\)[\\s\\S]{0,130}\\.range\\(${offset}, ${offset} \\+ MAX_ORDERS_PER_GROUP - 1\\)`),
    `${offset} must use stable ordering and a bounded rotating range`,
  );
}
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
assert.match(reconcile, /refund_pending_provider_paid_amount_missing/);
assert.match(reconcile, /provider_cancelled_amount_missing/);
assert.match(reconcile, /finalizeKnownProviderCancellation/);
assert.match(reconcile, /refundAmount: paidAmount/);
assert.match(reconcile, /providerPaidAmount\(payment\)/);
assert.match(reconcile, /providerCancelledAmount\(payment\)/);
assert.doesNotMatch(reconcile, /providerTotalAmount\(payment\)/);
assert.match(reconcile, /refund_pending_partial_cancel_requires_manual_review/);
assert.match(reconcile, /refund_pending_unknown_provider_status/);
assert.match(reconcile, /scheduled_refund_pending_recovery/);
assert.match(reconcile, /reconciliationSummaryOk\(summary\)/);
assert.doesNotMatch(reconcile, /scheduled_(?:amount_mismatch|payment_reconciliation)/);
assert.equal(occurrences(reconcile, /cancelAndReconcile\(\{/g), 1);

assert.match(policy, /status === 'pending' \|\| status === 'payment_review'/);
assert.match(policy, /status === 'refund_pending'[\s\S]{0,120}continue_cancellation/);
assert.match(policy, /review_amount_mismatch/);
assert.match(reconcile, /const MAX_ORDERS_PER_GROUP = 6/);
assert.match(listingStateMigration, /status not in \('refunded','refund_pending'\)/);
assert.match(listingStateMigration, /cancellation_intent:amount_mismatch_auto_cancel/);
assert.match(listingStateMigration, /cancellation_intent:administrator_provider_verified_refund/);
assert.match(listingStateMigration, /cancellation_intent:provider_already_cancelled_recovery/);
assert.match(listingStateMigration, /add column if not exists refund_intent_code text/);
assert.match(listingStateMigration, /refund_intent_code=coalesce\(refund_intent_code,v_intent_code\)/);
assert.match(listingStateMigration, /concat_ws\('\|',[\s\S]{0,120}coalesce\(p_reason,'refund_recovery_required'\),nullif\(admin_memo,''\)/);
assert.doesNotMatch(listingStateMigration, /concat_ws\('\|',\s*nullif\(admin_memo,''\)/);
assert.match(listingStateMigration, /new\.refund_intent_code is distinct from old\.refund_intent_code/);
assert.match(listingStateMigration, /refund_amount=p_refund_amount/);
assert.match(listingStateMigration, /p_refund_amount is null or p_refund_amount <= 0/);
assert.match(listingStateMigration, /status in \('pending','payment_review','failed'\)/);
assert.doesNotMatch(
  listingStateMigration.match(/create or replace function public\.fail_unsettled_order[\s\S]*?end \$\$/)?.[0] ?? '',
  /refund_pending/,
);
assert.match(policy, /PENDING_RECOVERY_EXPIRY_MS = 24 \* 60 \* 60 \* 1000/);
assert.match(policy, /export function fairReconciliationBatch/);
assert.match(policy, /export function rotatingReconciliationWindowOffset/);
assert.match(policy, /RECONCILIATION_ROTATION_MS = 5 \* 60 \* 1000/);
assert.match(reconcileWorkflow, /cron: ['"]\*\/5 \* \* \* \*['"]/);

console.log('payment backend recovery contracts: ok');
