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
const integrityMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260826170000_checkout_claim_integrity.sql',
);
const workflowPath = path.join(root, '.github', 'workflows', 'payment-reconcile.yml');

const migration = fs.readFileSync(migrationPath, 'utf8');
const integrityMigration = fs.readFileSync(integrityMigrationPath, 'utf8');
const workflow = fs.readFileSync(workflowPath, 'utf8');

function sqlStatuses(fragment) {
  return [...fragment.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

const reviewBranch = migration.match(
  /if new\.status = 'payment_review' then([\s\S]*?)elsif new\.status in \(/i,
);
const refundPendingBranch = migration.match(
  /elsif new\.status in \('cancel_req', 'cancel_requested', 'refund_pending'\) then([\s\S]*?)elsif new\.status in \(/i,
);
const stateBranches = migration.match(
  /elsif new\.status in \((\s*'paid',[\s\S]*?)\) then([\s\S]*?)elsif new\.status in \(([\s\S]*?)\) then([\s\S]*?)elsif new\.status in \(([\s\S]*?)\) then([\s\S]*?)end if;/i,
);

assert.ok(reviewBranch, 'payment review compatibility branch must remain explicit');
assert.ok(refundPendingBranch, 'refund_pending must remain separate from ordinary paid states');
assert.ok(stateBranches, 'order-to-listing status branches must remain explicit');
assert.match(reviewBranch[1], /status = 'on_sale'/i);
assert.match(reviewBranch[1], /reserved_order_id = new\.id/i);
assert.match(reviewBranch[1], /reserved_until = 'infinity'::timestamptz/i);

assert.match(refundPendingBranch[1], /status = 'reserved'/i);
assert.match(refundPendingBranch[1], /coalesce\(new\.restock_required, false\)/i);
assert.match(refundPendingBranch[1], /status = 'sold'[\s\S]*sold_order_id = new\.id/i);
assert.match(refundPendingBranch[1], /reserved_order_id = new\.id/i);
assert.match(refundPendingBranch[1], /reserved_until = 'infinity'::timestamptz/i);
assert.match(refundPendingBranch[1], /sold_order_id is null or sold_order_id = new\.id/i);
assert.match(refundPendingBranch[1], /reserved_order_id is null or reserved_order_id = new\.id/i);

assert.deepEqual(sqlStatuses(stateBranches[1]), [
  'paid',
  'inspecting',
  'preparing',
  'shipping',
  'shipped',
  'delivered',
]);
assert.match(stateBranches[2], /status = 'reserved'/i);
assert.match(stateBranches[2], /reserved_order_id = new\.id/i);
assert.match(stateBranches[2], /reserved_until = 'infinity'::timestamptz/i);
assert.match(stateBranches[2], /sold_order_id = null/i);

assert.deepEqual(sqlStatuses(stateBranches[3]), [
  'confirmed',
  'return_req',
  'exchange_req',
  'returning',
  'done',
]);
assert.match(stateBranches[4], /status = 'sold'/i);
assert.match(stateBranches[4], /sold_order_id = new\.id/i);
assert.match(stateBranches[4], /reserved_order_id = null/i);

assert.deepEqual(sqlStatuses(stateBranches[5]), ['refunded', 'canceled', 'failed']);
assert.match(stateBranches[6], /coalesce\(new\.restock_required, false\)/i);
assert.match(stateBranches[6], /status = 'sold'[\s\S]*sold_order_id = new\.id/i);
assert.match(stateBranches[6], /status = 'on_sale'/i);
assert.match(stateBranches[6], /sold_order_id = new\.id[\s\S]*or reserved_order_id = new\.id/i);

assert.match(
  migration,
  /create constraint trigger trg_sync_listing_state_from_order_v1[\s\S]*update of status, listing_id, payment_contract_version, restock_required[\s\S]*deferrable initially deferred/i,
  'the state sync must run after the legacy finalize RPC listing write',
);
assert.doesNotMatch(
  migration,
  /create\s+(?:or\s+replace\s+)?function\s+public\.finalize_paid_order_v2/i,
  'the migration must not copy or replace payment finalization',
);
const completeRestockRpc = migration.match(
  /create or replace function public\.complete_order_restock_v1\([\s\S]*?end \$\$;/i,
)?.[0] || '';
assert.match(completeRestockRpc, /payment_contract_version = 2/);
assert.match(completeRestockRpc, /status = 'refunded'/);
assert.match(completeRestockRpc, /and restock_required/);
assert.match(completeRestockRpc, /status='on_sale'/);
assert.match(completeRestockRpc, /get diagnostics v_updated = row_count/);
assert.match(completeRestockRpc, /raise exception 'listing_state_conflict:%'/);
assert.match(completeRestockRpc, /set restock_required=false/);
assert.match(
  migration,
  /revoke all on function public\.complete_order_restock_v1\(text\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/i,
);
assert.match(
  migration,
  /create or replace function public\.release_expired_checkout_reservations\(\)[\s\S]*status in \('refunded', 'canceled', 'failed'\)[\s\S]*not coalesce\(restock_required, false\)/i,
);
const restockEvidenceRpc = migration.match(
  /create or replace function public\.order_requires_restock_v1\([\s\S]*?end \$\$;/i,
)?.[0] || '';
for (const evidence of ['p_shipped_at', 'p_delivered_at', 'p_confirmed_at', 'order_status_history']) {
  assert.match(restockEvidenceRpc, new RegExp(evidence), `restock evidence missing: ${evidence}`);
}
assert.match(restockEvidenceRpc, /to_regclass\('public\.order_status_history'\) is null/);
assert.match(restockEvidenceRpc, /execute \$query\$[\s\S]*using p_order_id/);
for (const status of ['shipping', 'shipped', 'delivered', 'confirmed', 'return_req', 'exchange_req', 'returning', 'done']) {
  assert.match(restockEvidenceRpc, new RegExp(`'${status}'`), `restock lifecycle missing: ${status}`);
}
assert.match(restockEvidenceRpc, /p_payment_contract_version is distinct from 2 then return false/);
assert.match(
  migration,
  /set restock_required=true[\s\S]*public\.order_requires_restock_v1\([\s\S]*orders\.shipped_at[\s\S]*orders\.delivered_at[\s\S]*orders\.confirmed_at/i,
  'backfill must establish durable lifecycle evidence before terminal release',
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
assert.match(
  integrityMigration,
  /old\.reserved_order_id is not null[\s\S]*old\.reserved_order_id <> new\.reserved_order_id[\s\S]*coalesce\(old\.reserved_until, 'infinity'::timestamptz\) > now\(\)[\s\S]*raise exception 'listing_reserved'/i,
  'a later checkout must not replace an existing reservation owner',
);
assert.match(
  integrityMigration,
  /new\.reserved_until := 'infinity'::timestamptz/i,
  'provider-terminal reservations must not expire while payment is unresolved',
);
assert.match(
  integrityMigration,
  /return \(v_result - 'expiresAt'\) \|\| jsonb_build_object\([\s\S]*'reservationMode','provider_terminal'[\s\S]*'paymentContractVersion',2/i,
  'new checkout responses must expose the provider-terminal versioned contract without a false expiry',
);
assert.equal(
  (integrityMigration.match(/status not in \('failed','canceled','refunded','refund_pending'\)/g) || []).length,
  6,
  'refund_pending must be excluded from preflight, unique-index, and insert claim predicates',
);

const cronSchedules = [...workflow.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map(
  (match) => match[1],
);
assert.deepEqual(cronSchedules, ['*/5 * * * *']);
assert.match(workflow, /group: production-database-maintenance/);

const mismatchIntentFragment = migration.match(
  /p_refund_amount <> v_order\.amount[\s\S]*?raise exception 'refund_amount_mismatch'/,
)?.[0] || '';
assert.match(mismatchIntentFragment, /amount_mismatch_auto_cancel/);
assert.match(mismatchIntentFragment, /paid_finalization_conflict_auto_cancel/);
assert.match(mismatchIntentFragment, /late_payment_unknown_amount_auto_cancel/);
assert.match(mismatchIntentFragment, /administrator_provider_verified_refund/);
assert.doesNotMatch(
  mismatchIntentFragment,
  /refund_pending_recovery/,
  'a generic refund-pending retry must not authorize a provider amount mismatch',
);
assert.doesNotMatch(
  mismatchIntentFragment,
  /provider_already_cancelled_recovery/,
  'a provider-already marker alone must not authorize an amount mismatch',
);

const paymentReviewRpc = migration.match(
  /create or replace function public\.mark_order_payment_review\([\s\S]*?end \$\$;/i,
)?.[0] || '';
assert.match(
  paymentReviewRpc,
  /payment_contract_version = 2[\s\S]*status not in \('pending','payment_review'\) then status/i,
  'v2 fulfilment and terminal states must not be replaced by payment_review',
);
assert.match(
  paymentReviewRpc,
  /payment_review_required=coalesce\([\s\S]*payment_contract_version = 2[\s\S]*status not in \('pending','payment_review'\)[\s\S]*false[\s\S]*\)/i,
  'non-actionable provider contradictions need a durable server-owned review flag',
);

const refundPendingRpc = migration.match(
  /create or replace function public\.mark_order_refund_pending\([\s\S]*?end \$\$;/i,
)?.[0] || '';
assert.match(refundPendingRpc, /payment_review_required=false/);
assert.match(
  refundPendingRpc,
  /p_reason,''\) = 'late_payment_provider_paid_amount_missing'[\s\S]*late_payment_unknown_amount_auto_cancel/,
);
assert.match(
  refundPendingRpc,
  /v_intent_code = 'late_payment_unknown_amount_auto_cancel'[\s\S]*status in \('failed','canceled'\)/,
  'the late-payment amount exception must be minted only from a closed order state',
);
assert.match(
  refundPendingRpc,
  /p_reason,''\) = 'cancellation_intent:refund_pending_recovery'[\s\S]*status = 'refund_pending'[\s\S]*late_payment_provider_paid_amount_missing\(\[\|\]\|\$\)/,
  'compatibility recovery must require the exact retry plus a delimited trusted marker',
);
assert.match(
  refundPendingRpc,
  /restock_required=public\.order_requires_restock_v1\([\s\S]*shipped_at[\s\S]*delivered_at[\s\S]*confirmed_at/i,
);

const clearConfirmedReviewRpc = migration.match(
  /create or replace function public\.clear_confirmed_payment_review_v1\([\s\S]*?end \$\$;/i,
)?.[0] || '';
for (const exact of [
  /payment_contract_version=2/, /payment_key=p_payment_key/, /amount=p_amount/,
  /paid_at is not null/, /set payment_review_required=false/,
]) assert.match(clearConfirmedReviewRpc, exact);
for (const status of ['paid', 'delivered', 'confirmed', 'cancel_req', 'return_req', 'done']) {
  assert.match(clearConfirmedReviewRpc, new RegExp(`'${status}'`));
}
assert.match(
  migration,
  /revoke all on function public\.clear_confirmed_payment_review_v1\(text,text,bigint\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/i,
);

console.log('order-listing-state contract: ok');
