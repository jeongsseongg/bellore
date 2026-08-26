import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');
const lines = (source) => source.replace(/\r\n?/g, '\n').split('\n').length;
const occurrences = (source, pattern) => (source.match(pattern) || []).length;

const shared = read('supabase/functions/_shared/payment-recovery.ts');
const edgeUtils = read('supabase/functions/_shared/payment-edge-utils.ts');
const cancellation = read('supabase/functions/_shared/portone-cancellation.ts');
const policy = read('supabase/functions/_shared/payment-recovery-policy.mjs');
const reconciliationOrders = read('supabase/functions/_shared/reconciliation-orders.ts');
const reconciliationOutcomes = read('supabase/functions/_shared/reconciliation-outcomes.ts');
const confirm = read('supabase/functions/confirm-payment/index.ts');
const cancel = read('supabase/functions/cancel-payment/index.ts');
const webhook = read('supabase/functions/payment-webhook/index.ts');
const reconcile = read('supabase/functions/reconcile-payments/index.ts');
const listingMigration = read('supabase/migrations/20260826160000_payment_recovery_listing_state.sql');
const claimMigration = read('supabase/migrations/20260826170000_checkout_claim_integrity.sql');
const reconcileWorkflow = read('.github/workflows/payment-reconcile.yml');
const dbWorkflow = read('.github/workflows/db-maintenance.yml');

for (const [name, source] of Object.entries({
  shared, edgeUtils, cancellation, reconciliationOrders, reconciliationOutcomes,
  confirm, cancel, webhook, reconcile,
})) {
  assert(lines(source) <= 400, name + ' must stay within the 400-line source ceiling');
}

// Provider identity and automatic-finance classification are fail closed.
for (const marker of [
  'provider_payment_id_mismatch', 'provider_payment_id_missing', 'provider_store_mismatch',
  'provider_currency_mismatch', 'provider_channel_not_live', 'finalize_paid_order_v2',
]) assert.match(shared, new RegExp(marker));
assert.match(shared, /paidFinalizationDatabaseFailureKind\([\s\S]{0,80}source\.code,[\s\S]{0,40}source\.message/);
assert.match(policy, /errorCode !== CLOSED_ORDER_FINALIZATION_ERROR\.code/);
assert.doesNotMatch(shared, /source\.details|source\.hint/);
assert.match(edgeUtils, /sanitizePaymentAttribution/);
assert.match(edgeUtils, /safeEqual/);
const safeReviewHelper = shared.match(
  /export async function markPaymentReviewIfUnsettled\([\s\S]*?^}/m,
)?.[0] || '';
assert.match(safeReviewHelper, /\.rpc\("mark_order_payment_review"/);
assert.match(safeReviewHelper, /p_order_no: orderNo/);
assert.doesNotMatch(safeReviewHelper, /\.from\("orders"\)|\.update\(/,
  'generic review recovery must not bypass the state-preserving SQL RPC');
for (const source of [confirm, webhook, reconcile]) {
  assert.doesNotMatch(source, /markPaymentReviewIfUnsettled\(\s*admin,\s*order\.id/);
}

// Cancellation persists intent first, requests an exact amount, and records only
// the amount returned by PortOne.
assert.match(cancellation, /"Idempotency-Key": idempotencyKey/);
assert.match(cancellation, /reason: PROVIDER_CANCELLATION_REASON/);
assert.match(cancellation, /amount: input\.refundAmount/);
assert.match(cancellation, /currentCancellableAmount: input\.refundAmount/);
assert.match(cancellation, /cancelledAmount = positiveInteger\(cancellation\?\.totalAmount\)/);
assert.match(cancellation, /providerCancelledAmount\(payment\)/);
assert.match(cancellation, /p_refund_amount: cancellation\.cancelledAmount/);
assert.match(cancellation, /provider_refunded_amount_missing/);
assert.match(cancellation, /tracked: true/);
const intentMarker = cancellation.indexOf('const intentMarker = await input.admin.rpc("mark_order_refund_pending"');
const providerPost = cancellation.indexOf('cancellation = await cancelPortOnePayment(input)');
assert(intentMarker >= 0 && providerPost > intentMarker, 'cancellation intent must precede provider POST');
assert.match(cancellation, /export async function queueCancellationIntent[\s\S]{0,300}mark_order_refund_pending/);
const queuedIntent = cancellation.match(
  /export async function queueCancellationIntent\([\s\S]*?^}/m,
)?.[0] || '';
assert.doesNotMatch(queuedIntent, /fetch\(|cancelPortOnePayment|finalize_order_refund_v2/,
  'webhook queue helper must persist only; reconciliation owns provider cancellation');
for (const [name, source] of Object.entries({ confirm, cancel, webhook, reconcile })) {
  assert.equal(
    occurrences(source, /cancelAndReconcile\(\{/g),
    occurrences(source, /intentCode: /g),
    name + ': every cancellation call needs a trusted intent code',
  );
}

// Browser confirmation: only a bounded true NOT_FOUND after an explicit checkout
// abandonment may release immediately. Provider pending/errors always hold.
assert.match(confirm, /retryDelaysMs: CONFIRMATION_RETRY_DELAYS_MS/);
assert.match(confirm, /const checkoutAbandoned = body\.checkoutAbandoned === true/);
assert.match(confirm, /notFoundResult: "not_found"/);
assert.match(confirm, /\.eq\("payment_contract_version", 2\)/);
assert.equal(occurrences(confirm, /fail_unsettled_order/g), 2);
const notFoundBlock = confirm.match(
  /if \(lookup\.result === "not_found"\)([\s\S]*?)if \(lookup\.error \|\| !lookup\.payment\)/,
)?.[1] || '';
assert.match(notFoundBlock, /if \(!checkoutAbandoned\)[\s\S]*payment_confirmation_pending[\s\S]*202/);
assert.match(notFoundBlock, /provider_payment_not_found_after_checkout_abandonment/);
assert.match(notFoundBlock, /fail_unsettled_order[\s\S]*payment_terminal_state_pending[\s\S]*202/);
assert.match(notFoundBlock, /payment_canceled[\s\S]*409/);
const lookupErrorBlock = confirm.match(
  /if \(lookup\.error \|\| !lookup\.payment\)([\s\S]*?)const payment = lookup\.payment/,
)?.[1] || '';
assert.doesNotMatch(lookupErrorBlock, /fail_unsettled_order/);
const pendingBlock = confirm.match(/if \(statusKind === "pending"\)([\s\S]*?)if \(statusKind !== "paid"\)/)?.[1] || '';
assert.doesNotMatch(pendingBlock, /fail_unsettled_order/);
const terminalBlock = confirm.match(/if \(statusKind !== "paid"\)([\s\S]*?)if \(paidAmount === null\)/)?.[1] || '';
assert.match(terminalBlock, /statusKind === "failed" \|\| statusKind === "cancelled"/);
assert.match(terminalBlock, /fail_unsettled_order/);
assert.match(terminalBlock, /payment_terminal_state_pending[\s\S]*202/);
assert.match(confirm, /cancel_amount_mismatch/);
assert.match(confirm, /paid_finalization_conflict_auto_cancel/);
assert.match(confirm, /late_payment_provider_paid_amount_missing/);
assert.match(confirm, /late_payment_partially_cancelled_review/);
assert.match(confirm, /locallyClosed \? "mark_order_refund_pending" : "mark_order_payment_review"/);
assert.equal(occurrences(confirm, /cancelAndReconcile\(\{/g), 2);

// A locally confirmed row is success only with complete provider identity. The
// same integrity requirement applies to webhook idempotency and race rereads.
const confirmedBlock = confirm.match(
  /if \(hasConfirmedPaymentStatus\(order\.status\)\)([\s\S]*?)const lookup =/,
)?.[1] || '';
assert.match(confirmedBlock, /order\.payment_key === paymentId && Boolean\(order\.paid_at\)/);
assert.match(confirmedBlock, /confirmed_order_integrity/);
assert.match(confirmedBlock, /payment_confirmation_pending[\s\S]*202/);
assert.match(shared, /data\.payment_key === paymentId &&[\s\S]{0,80}Boolean\(data\.paid_at\)/);
assert.match(webhook, /order\.payment_key === paymentId && Boolean\(order\.paid_at\) &&[\s\S]{0,80}paidAmount === Number\(order\.amount\)/);

// Manual admin cancellation still supports legacy orders but verifies provider
// truth and never uses order.amount as proof.
assert(cancel.indexOf('lookupPortOnePayment({') < cancel.indexOf('cancelAndReconcile({'));
assert.match(cancel, /providerPaidAmount/);
assert.match(cancel, /providerCancelledAmount/);
assert.match(cancel, /refundAmount: providerAmount/);
assert.doesNotMatch(cancel, /refundAmount: Number\(order\.amount\)/);
assert.doesNotMatch(cancel, /payment_contract_version/);

// Automated webhook and reconciliation are contract-v2 only.
assert.match(webhook, /\.eq\("payment_contract_version", 2\)/);
assert.match(webhook, /order_not_in_payment_contract/);
assert(webhook.indexOf('order_not_in_payment_contract') < webhook.indexOf('lookupPortOnePayment({'));
assert.match(webhook, /recoveryAction === "cancel_amount_mismatch"/);
assert.match(webhook, /queueCancellationIntent/);
assert.match(webhook, /"amount_mismatch_auto_cancel"/);
assert.match(webhook, /paid_finalization_conflict_auto_cancel/);
assert.match(webhook, /late_payment_provider_paid_amount_missing/);
assert.match(webhook, /late_payment_partial_cancel_review:provider/);
assert.match(webhook, /cancelledAmount === null[\s\S]{0,180}mark_order_payment_review[\s\S]{0,180}provider_cancelled_amount_missing/);
assert.match(webhook, /statusKind === "partial_cancelled"[\s\S]{0,180}mark_order_payment_review/);
assert.match(webhook, /recoveryAction === "review_amount_missing"[\s\S]{0,180}if \(locallyClosed\)[\s\S]{0,180}mark_order_refund_pending/);
assert.equal(occurrences(webhook, /cancelAndReconcile\(\{/g), 0);
assert.equal(occurrences(webhook, /queueCancellationIntent\(/g), 2);

assert.equal(occurrences(reconciliationOrders, /\.select\("id", \{ count: "exact", head: true \}\)/g), 5);
assert.equal(occurrences(reconciliationOrders, /\.eq\("payment_contract_version", 2\)/g), 10);
assert.equal(occurrences(reconciliationOrders, /\.range\(/g), 5);
assert.match(reconciliationOrders, /RECENT_TERMINAL_RECONCILIATION_AGE_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
assert.equal(occurrences(reconciliationOrders, /\.in\("status", \["failed", "canceled"\]\)/g), 2);
assert.equal(occurrences(reconciliationOrders, /\.gte\("payment_terminal_at", recentTerminalAfter\)/g), 2);
assert.doesNotMatch(reconciliationOrders, /\.gte\("created_at", recentTerminalAfter\)/);
assert.match(reconciliationOrders, /CONFIRMED_RECONCILIATION_STATUSES = \[[\s\S]{0,220}"paid"[\s\S]{0,220}"done"/);
assert.equal(occurrences(reconciliationOrders, /\.in\("status", CONFIRMED_RECONCILIATION_STATUSES\)/g), 2);
assert.match(reconciliationOrders, /payment_key,paid_at,payment_terminal_at,created_at/);
assert.match(reconciliationOrders, /\.order\("payment_terminal_at", \{ ascending: true \}\)/);
assert.match(
  reconciliationOrders,
  /const groupResults = \[[\s\S]{0,140}refundPendingResult, recentTerminalResult, confirmedResult, paymentReviewResult, pendingResult/,
);
assert.match(reconciliationOrders, /fairReconciliationBatch/);
assert.match(reconciliationOrders, /RECONCILIATION_GROUP_COUNT = 5/);
assert.match(reconciliationOrders, /MAX_ORDERS_PER_RECONCILIATION_GROUP = 1/);
assert.match(reconciliationOrders, /RECONCILIATION_CONCURRENCY = 5/);
assert.match(reconciliationOrders, /PROVIDER_CANCELLATION_MAX_MS = 120_000/);
assert.match(reconciliationOrders, /SUPABASE_REQUEST_IDLE_TIMEOUT_MS = 150_000/);
assert.match(reconciliationOrders, /providerWorstCaseMs < SUPABASE_REQUEST_IDLE_TIMEOUT_MS/);
assert.match(reconcile, /limit: MAX_ORDERS_PER_RECONCILIATION_GROUP/);
assert.match(reconcile, /index \+= RECONCILIATION_CONCURRENCY/);
assert.match(reconcile, /index \+ RECONCILIATION_CONCURRENCY/);
assert.doesNotMatch(reconcile, /MAX_ORDERS_PER_GROUP = 6|RECONCILE_CONCURRENCY/);
assert.match(reconcile, /notFoundResult: "not_found"/);
assert.match(reconcile, /provider_payment_not_found_after_grace/);
assert.match(reconcile, /provider_payment_pending_review/);
assert.match(reconcile, /shouldEscalatePendingOrder/);
assert.doesNotMatch(reconcile, /provider_payment_(?:not_found|pending)_expired|expirePendingOrder/);
assert.equal(occurrences(reconcile, /fail_unsettled_order/g), 2);
const notFoundPendingBlock = reconcile.match(
  /if \(lookup\.result === "not_found" && order\.status === "pending"\)([\s\S]*?)if \(lookup\.result === "not_found" && locallyClosed\)/,
)?.[1] || '';
assert.match(notFoundPendingBlock, /shouldReleaseNotFoundOrder\(order\.status, order\.created_at, Date\.now\(\)\)[\s\S]*fail_unsettled_order/);
assert.match(notFoundPendingBlock, /else \{[\s\S]*counters\.pending \+= 1/);
const providerPendingBlock = reconcile.match(
  /if \(statusKind === "pending"\)([\s\S]*?)if \(order\.status === "refund_pending"/,
)?.[1] || '';
assert.doesNotMatch(providerPendingBlock, /fail_unsettled_order/,
  'provider PENDING must never release inventory solely because time passed');
assert.match(providerPendingBlock, /shouldReviewPending\(order\)/,
  'provider PENDING must keep the independent 24-hour review path');
assert.match(reconcile, /scheduled_amount_mismatch_auto_cancel/);
assert.match(reconcile, /paid_finalization_conflict_auto_cancel/);
assert.equal(occurrences(reconcile, /cancelAndReconcile\(\{/g), 3);
assert.match(reconcile, /secretByteLength\(RECONCILE_TOKEN\) < 32/);
assert.match(reconcile, /lookup\.result === "not_found" && locallyClosed\) return counters/);
assert.match(reconcile, /locallyClosed && statusKind === "failed"/);
assert.doesNotMatch(reconcile, /locallyClosed && \(statusKind === "failed" \|\| statusKind === "cancelled"\)/);
assert.match(
  reconcile,
  /statusKind === "cancelled" && hasRefundablePaymentStatus\(order\.status\)[\s\S]{0,520}finalizeKnownProviderCancellation\([\s\S]{0,220}expectedOrderAmount: Number\(order\.amount\)/,
  'provider cancellation must be reconciled even when the local order was already failed or canceled',
);
assert.match(
  reconcile,
  /action === "review_amount_missing"[\s\S]{0,220}if \(locallyClosed\)[\s\S]{0,220}late_payment_provider_paid_amount_missing/,
  'a late charge without a provider amount must use non-claiming refund review, not payment_review',
);
assert.match(reconcile, /statusKind === "partial_cancelled"[\s\S]{0,120}refund_pending" \|\| locallyClosed/);
assert.match(reconcile, /order\.status === "refund_pending" \|\| locallyClosed[\s\S]{0,180}refund_pending_unknown_provider_status/);
assert.match(policy, /confirmedPaymentReconciliationAction/);
assert.match(reconcile, /const locallyConfirmed = hasConfirmedPaymentStatus\(order\.status\)/);
assert.match(reconcile, /confirmedPaymentReconciliationAction\(\{[\s\S]{0,360}paidAt: order\.paid_at/);
assert.match(reconcile, /confirmedAction === "healthy"[\s\S]{0,260}clear_confirmed_payment_review_v1[\s\S]{0,220}return counters/);
assert.match(reconcile, /confirmedAction === "review"[\s\S]{0,220}markNonActionablePaymentReview[\s\S]{0,180}confirmed_payment_provider_contradiction/);
assert.match(reconcile, /lookup\.result === "not_found" && locallyConfirmed[\s\S]{0,180}confirmed_payment_missing_at_provider/);
assert.match(reconcile, /PROVIDER_INTEGRITY_ERRORS = new Set\([\s\S]{0,300}provider_payment_id_mismatch[\s\S]{0,300}provider_response_invalid/);
assert.match(reconcile, /locallyConfirmed && lookup\.error && PROVIDER_INTEGRITY_ERRORS\.has\(lookup\.error\)[\s\S]{0,220}confirmed_payment_provider_integrity/);
assert(
  reconcile.indexOf('confirmedAction === "review"') < reconcile.indexOf('if (statusKind === "failed")'),
  'a locally confirmed provider contradiction must be reserved for review before any failure path',
);
assert.match(reconciliationOutcomes, /mark_order_refund_pending/);
assert.match(reconciliationOutcomes, /markNonActionablePaymentReview[\s\S]{0,300}mark_order_payment_review/);
const confirmedReviewBlock = reconcile.match(
  /const confirmedAction = confirmedPaymentReconciliationAction\(\{([\s\S]*?)\/\/ CANCELLED/,
)?.[1] || '';
assert.doesNotMatch(confirmedReviewBlock, /preserveRefundPendingForReview|fail_unsettled_order/);
assert.match(
  reconcile,
  /cancelledAmount === null[\s\S]{0,180}markNonActionablePaymentReview[\s\S]{0,160}provider_cancelled_amount_missing/,
);

assert.match(policy, /PENDING_REVIEW_AGE_MS = 24 \* 60 \* 60 \* 1000/);
assert.match(policy, /NOT_FOUND_RELEASE_AGE_MS = 15 \* 60 \* 1000/);
assert.match(policy, /shouldReleaseNotFoundOrder/);
assert.match(policy, /cancel_amount_mismatch/);
assert.match(policy, /cancel_late_payment/);
assert.match(policy, /continue_cancellation/);
assert.match(policy, /failureKind === 'locally_closed'[\s\S]{0,80}'cancel_conflict'/);
assert.match(shared, /paidFinalizationDatabaseFailureKind\([\s\S]{0,120}source\.message/);
for (const source of [confirm, reconcile]) {
  assert.match(
    source,
    /paidFinalizationRecoveryAction\(finalized\.failureKind\) === "cancel_conflict"[\s\S]{0,300}cancelAndReconcile\(\{/,
    'every provider-paid finalization entrypoint must auto-cancel an atomically detected closed-order race',
  );
}
assert.match(
  webhook,
  /paidFinalizationRecoveryAction\(finalized\.failureKind\) === "cancel_conflict"[\s\S]{0,300}queueCancellationIntent\(/,
  'webhook must durably queue an atomically detected conflict without waiting on PortOne',
);

// Migrations add no blanket legacy writes and make v2 claims deterministic.
assert.match(listingMigration, /where refund_intent_code is null[\s\S]{0,700}cancellation_intent:amount_mismatch_auto_cancel/);
assert.match(listingMigration, /p_refund_amount:?[\s\S]*paid_finalization_conflict_auto_cancel/);
const refundPendingRpc = listingMigration.match(
  /create or replace function public\.mark_order_refund_pending\([\s\S]*?end \$\$;/,
)?.[0] || '';
assert.match(
  refundPendingRpc,
  /p_reason,''\) = 'late_payment_provider_paid_amount_missing'[\s\S]*late_payment_unknown_amount_auto_cancel/,
  'the missing provider amount marker must create the narrow late-payment cancellation intent',
);
assert.match(
  refundPendingRpc,
  /v_intent_code = 'late_payment_unknown_amount_auto_cancel'[\s\S]*status in \('failed','canceled'\)/,
  'the late-payment amount exception must require an atomically observed closed source state',
);
assert.match(
  refundPendingRpc,
  /p_reason,''\) = 'cancellation_intent:refund_pending_recovery'[\s\S]*status = 'refund_pending'[\s\S]*late_payment_provider_paid_amount_missing\(\[\|\]\|\$\)/,
  'a pre-contract row may resume only from the exact refund state, retry reason, and delimited trusted marker',
);
const refundMismatchGuard = listingMigration.match(
  /if p_refund_amount <> v_order\.amount[\s\S]*?raise exception 'refund_amount_mismatch'/,
)?.[0] || '';
assert.match(refundMismatchGuard, /late_payment_unknown_amount_auto_cancel/);
assert.doesNotMatch(
  refundMismatchGuard,
  /refund_pending_recovery/,
  'a generic refund-pending retry must never authorize an amount mismatch',
);
assert.doesNotMatch(
  listingMigration.match(/create or replace function public\.fail_unsettled_order[\s\S]*?end \$\$/)?.[0] || '',
  /refund_pending/,
);
assert.match(claimMigration, /add column if not exists payment_contract_version smallint/);
assert.match(claimMigration, /payment_contract_version is null or payment_contract_version = 2/);
assert.match(claimMigration, /orders_one_unresolved_listing_v2_idx/);
assert.match(claimMigration, /orders_one_unresolved_coupon_idx/);
assert.match(claimMigration, /current_setting\('app\.payment_contract_version', true\)/);
assert.match(claimMigration, /checkout_contract_forbidden/);
assert.match(claimMigration, /set_config\('app\.payment_contract_version', '2', true\)/);
assert.match(claimMigration, /'reservationMode','provider_terminal'/);
assert.match(claimMigration, /'paymentContractVersion',2/);
assert.equal(
  occurrences(claimMigration, /status not in \('failed','canceled','refunded','refund_pending'\)/g),
  6,
  'refund_pending releases listing and coupon claims while late-charge cancellation remains tracked',
);
assert.match(claimMigration, /where existing\.listing_id = new\.listing_id[\s\S]{0,150}status not in/);
assert.doesNotMatch(
  claimMigration.match(/where existing\.listing_id = new\.listing_id[\s\S]{0,200}status not in/)?.[0] || '',
  /payment_contract_version/,
  'legacy unresolved listing claims must still block a new physical-watch checkout',
);

assert.match(reconcileWorkflow, /cron: ['"]\*\/5 \* \* \* \*['"]/);
for (const migration of [
  '20260826160000_payment_recovery_listing_state.sql',
  '20260826170000_checkout_claim_integrity.sql',
  '20260826180000_order_financial_state_guard.sql',
  '20260826190000_payment_finalization_closed_order_contract.sql',
]) assert.match(dbWorkflow, new RegExp(migration.replace('.', '\\.')));
assert.doesNotMatch(dbWorkflow, /-f \/repo\/supabase\/migrations\/20260824090000_authority_payment_hardening\.sql/);

console.log('payment backend recovery contracts: ok');
