import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8').replace(/\r\n?/g, '\n');

const migration = read('supabase/migrations/20260826170000_checkout_claim_integrity.sql');
const recoveryMigration = read('supabase/migrations/20260826160000_payment_recovery_listing_state.sql');
const finalizationContractMigration = read('supabase/migrations/20260826190000_payment_finalization_closed_order_contract.sql');
const workflow = read('.github/workflows/db-maintenance.yml');
const guide = read('docs/PAYMENTS_SETUP.md');

// The schema distinguishes legacy rows from the provider-terminal v2 contract.
assert.match(migration, /add column if not exists payment_contract_version smallint/);
assert.match(migration, /orders_payment_contract_version_allowed[\s\S]*payment_contract_version is null or payment_contract_version = 2/);
assert.doesNotMatch(migration, /update\s+public\.orders\s+set\s+payment_contract_version/i);

// Late-payment recovery is anchored to the first terminal transition, not the
// checkout creation time. Existing v2 terminal rows are safely backfilled.
assert.match(recoveryMigration, /add column if not exists payment_terminal_at timestamptz/);
assert.match(recoveryMigration, /set payment_terminal_at = least\([\s\S]{0,500}orders\.canceled_at[\s\S]{0,300}to_jsonb\(orders\)->>'updated_at'[\s\S]{0,200}orders\.created_at/);
assert.match(recoveryMigration, /where orders\.payment_contract_version = 2[\s\S]{0,100}orders\.status in \('failed','canceled'\)[\s\S]{0,100}orders\.payment_terminal_at is null/);
assert.match(recoveryMigration, /orders_v2_terminal_timestamp_required[\s\S]{0,300}payment_terminal_at is not null[\s\S]{0,200}validate constraint orders_v2_terminal_timestamp_required/);
assert.match(recoveryMigration, /orders_recent_payment_terminal_v2_idx[\s\S]{0,160}payment_terminal_at,id[\s\S]{0,200}status in \('failed','canceled'\)/);
const terminalStamp = recoveryMigration.match(
  /create or replace function public\.stamp_order_payment_terminal_at_v1\(\)[\s\S]*?end \$\$;/i,
)?.[0] || '';
assert.match(terminalStamp, /old\.payment_terminal_at is not null[\s\S]{0,100}new\.payment_terminal_at := old\.payment_terminal_at/);
assert.match(terminalStamp, /new\.status in \('failed','canceled'\)[\s\S]{0,100}old\.status not in \('failed','canceled'\)[\s\S]{0,100}new\.payment_terminal_at := now\(\)/);
assert.doesNotMatch(terminalStamp, /v_had_post_fulfilment_status/);
assert.match(recoveryMigration, /create trigger trg_stamp_order_payment_terminal_at_v1[\s\S]{0,100}before insert or update on public\.orders/);
const restockHelper = recoveryMigration.match(
  /create or replace function public\.order_requires_restock_v1\([\s\S]*?end \$\$;/i,
)?.[0] || '';
assert.match(
  restockHelper,
  /declare\s+v_had_post_fulfilment_status boolean := false;[\s\S]*into v_had_post_fulfilment_status/,
  'post-fulfilment history variable must be declared inside the restock helper',
);

// Both physical-watch and coupon ownership are partial, unique, v2-only claims.
assert.match(
  migration,
  /create unique index if not exists orders_one_unresolved_listing_v2_idx[\s\S]{0,180}on public\.orders\(listing_id\)[\s\S]{0,180}payment_contract_version = 2[\s\S]{0,180}status not in \('failed','canceled','refunded','refund_pending'\)/,
);
assert.match(
  migration,
  /create unique index if not exists orders_one_unresolved_coupon_idx[\s\S]{0,220}on public\.orders\(coupon_user_id\)[\s\S]{0,220}coupon_user_id is not null[\s\S]{0,220}payment_contract_version = 2[\s\S]{0,220}status not in \('failed','canceled','refunded','refund_pending'\)/,
);
assert.equal(
  (migration.match(/status not in \('failed','canceled','refunded','refund_pending'\)/g) || []).length,
  6,
  'preflight, indexes, and insert guards must all release refund_pending claims',
);

// A stale Edge snapshot cannot revive a row that was closed while provider
// truth was being fetched. The status is checked only after the row lock, and
// the exact SQLSTATE/message pair is the sole automatic-refund authority.
const finalizer = finalizationContractMigration.match(
  /create or replace function public\.finalize_paid_order_v2\([\s\S]*?end \$\$;/i,
)?.[0] || '';
const orderLock = finalizer.indexOf('for update;');
const closedGuard = finalizer.indexOf("if v_order.status in ('failed','canceled')");
const paidWrite = finalizer.indexOf("set status = 'paid'");
assert(orderLock >= 0 && closedGuard > orderLock && paidWrite > closedGuard,
  'closed-order guard must execute after locking and before any paid write');
assert.match(
  finalizer,
  /if v_order\.status in \('failed','canceled'\) then[\s\S]{0,180}errcode = 'P0001',[\s\S]{0,100}message = 'order_closed_before_paid_finalization'/,
);

// Only the Edge wrapper can opt in, and the response has no timer-based expiry.
assert.match(migration, /current_setting\('app\.payment_contract_version', true\)[\s\S]{0,180}checkout_contract_forbidden/);
assert.match(migration, /set_config\('app\.payment_contract_version', '2', true\)/);
const oldWrapperSignature = 'text,uuid,uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb';
const amountOnlyWrapperSignature = 'text,uuid,uuid,text,bigint,uuid,text,text,text,text,text,text,text,text,jsonb';
const newWrapperSignature = 'text,uuid,uuid,text,text,bigint,uuid,text,text,text,text,text,text,text,text,jsonb';
assert.match(migration, new RegExp(`drop function if exists public\\.create_checkout_order_edge_v1\\(\\s*${oldWrapperSignature}`));
assert.match(migration, new RegExp(`drop function if exists public\\.create_checkout_order_edge_v1\\(\\s*${amountOnlyWrapperSignature}`));
assert.match(migration, /p_checkout_request_key_hash text,\s*p_checkout_token_hash text,\s*p_expected_amount bigint,\s*p_coupon_user_id uuid default null/);
const coreCall = migration.indexOf('v_result := public.create_checkout_order(');
const amountGuard = migration.indexOf("jsonb_typeof(v_result->'amount')", coreCall);
const amountRaise = migration.indexOf("raise exception 'checkout_amount_changed'", amountGuard);
const wrapperReturn = migration.indexOf("return (v_result - 'expiresAt')", amountRaise);
assert(coreCall >= 0 && amountGuard > coreCall && amountRaise > amountGuard && wrapperReturn > amountRaise,
  'amount mismatch must raise after core writes and before wrapper return so the transaction rolls back');
assert.match(migration, new RegExp(`revoke all on function public\\.create_checkout_order_edge_v1\\(\\s*${newWrapperSignature}`));
assert.match(migration, /v_result - 'expiresAt'/);
assert.match(migration, /'reservationMode','provider_terminal'/);
assert.match(migration, /'paymentContractVersion',2/);

// The rollback gate validates catalog metadata as well as the runtime wrapper
// result and persisted order version. The live gate repeats schema metadata.
for (const marker of [
  "column_name='payment_contract_version'",
  "conname='orders_payment_contract_version_allowed'",
  "c.convalidated",
  "i.relname='orders_one_unresolved_listing_v2_idx'",
  "i.relname='orders_one_unresolved_coupon_idx'",
  "pg_get_expr(x.indpred,x.indrelid)",
  "tgrelid='public.orders'::regclass",
  "tgfoid=to_regprocedure('public.guard_new_checkout_claims_v1()')",
  "tgrelid='public.listings'::regclass",
  "tgfoid=to_regprocedure('public.guard_listing_reservation_owner_v1()')",
  "'provider_terminal'",
  "'paymentContractVersion'",
  "payment_contract_row_ok",
  "column_name='payment_terminal_at'",
  "orders_v2_terminal_timestamp_required",
  "orders_recent_payment_terminal_v2_idx",
  "trg_stamp_order_payment_terminal_at_v1",
  "failed transition did not stamp payment terminal time",
  "canceled rewrite changed first payment terminal time",
]) assert.ok(workflow.includes(marker), `DB release workflow is missing: ${marker}`);
assert(!workflow.includes(`pg_get_functiondef('public.create_checkout_order_edge_v1(${oldWrapperSignature})'`),
  'workflow still resolves the obsolete amount-less wrapper');
assert(!workflow.includes(`pg_get_functiondef('public.create_checkout_order_edge_v1(${amountOnlyWrapperSignature})'`),
  'workflow still resolves the non-idempotent amount-only wrapper');
assert(workflow.includes(`public.create_checkout_order_edge_v1(${newWrapperSignature})`),
  'workflow does not validate the amount-bound wrapper signature');
assert.match(workflow, /p_expected_amount => :'expected_amount'::bigint/);
assert.match(workflow, /p_expected_amount => v_expected \+ 1[\s\S]{0,900}checkout_amount_changed[\s\S]{0,900}checkout amount mismatch left an order or reservation/);
assert.match(workflow, /not \(:'checkout_contract'::jsonb \? 'expiresAt'\)/);
assert.match(workflow, /select order_no, amount[\s\S]{0,500}payment_contract_version=2[\s\S]{0,100}payment_contract_row_ok/);
assert.match(
  workflow,
  /update public\.orders set status='failed' where order_no=:'closed_order_no'[\s\S]{0,1800}update public\.orders set status='canceled'[\s\S]{0,900}order_closed_before_paid_finalization/,
  'rollback validation must execute both stale failed and stale canceled finalization attempts',
);
assert.match(
  workflow,
  /closed order changed despite paid-finalization rejection[\s\S]{0,500}set constraints all immediate;[\s\S]{0,100}set constraints all deferred;/,
  'rollback validation must verify no financial write and execute deferred listing cleanup',
);
assert.equal(
  (workflow.match(/pg_get_expr\(x\.indpred,x\.indrelid\)\) like '%payment_contract_version = 2%'/g) || []).length,
  6,
  'rollback and live gates must verify all three indexes are v2-only',
);

const validateStart = workflow.indexOf('Validate authority and payment migration (always rollback)');
const rollback = workflow.indexOf('          rollback;', validateStart);
assert(validateStart >= 0 && rollback > validateStart, 'rollback validation step must exist');
const validateBlock = workflow.slice(validateStart, rollback);
assert.match(validateBlock, /if: inputs\.task == 'validate-authority-payment'/);
assert.doesNotMatch(validateBlock, /apply-authority-payment/,
  'production apply must never execute rollback fixtures');
assert.match(validateBlock, /PGCONN: \$\{\{ secrets\.SUPABASE_VALIDATION_DB_URL \}\}/);
assert.doesNotMatch(validateBlock, /PGCONN: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/,
  'rollback fixtures must not receive the production DB URL');
for (const file of [
  '20260826160000_payment_recovery_listing_state.sql',
  '20260826170000_checkout_claim_integrity.sql',
  '20260826180000_order_financial_state_guard.sql',
  '20260826190000_payment_finalization_closed_order_contract.sql',
]) assert(validateBlock.includes(file), `rollback validation omits ${file}`);
assert.doesNotMatch(validateBlock, /20260824090000_authority_payment_hardening\.sql/,
  'an applied historical migration must not be replayed by validation');

const applyStart = workflow.indexOf('Apply authority and payment migration');
const liveStart = workflow.indexOf('Verify live authority and payment ACL', applyStart);
const applyBlock = workflow.slice(applyStart, liveStart);
assert.doesNotMatch(applyBlock, /20260824090000_authority_payment_hardening\.sql/,
  'an applied historical migration must not be replayed in production');
for (const file of [
  '20260826160000_payment_recovery_listing_state.sql',
  '20260826170000_checkout_claim_integrity.sql',
  '20260826180000_order_financial_state_guard.sql',
  '20260826190000_payment_finalization_closed_order_contract.sql',
]) assert(applyBlock.includes(file), `production apply omits ${file}`);
assert.match(applyBlock, /PGOPTIONS: "-c lock_timeout=5000 -c statement_timeout=300000/);
assert.match(applyBlock, /PGCONNECT_TIMEOUT: "10"/);
assert.match(applyBlock, /migration_ledger_missing/);
assert.match(applyBlock, /migration_ledger_noncanonical/);
assert.match(applyBlock, /version='20260824090000'/);
assert.match(applyBlock, /version='20260826150000'/);
assert.match(applyBlock, /payment_release_migration_already_recorded/);
assert.match(applyBlock, /migration_ledger_ahead_of_release/);
assert.match(
  applyBlock,
  /begin;[\s\S]*insert into supabase_migrations\.schema_migrations\(version,name,statements\)[\s\S]{0,700}'20260826160000'[\s\S]{0,700}'20260826190000'[\s\S]{0,120}commit;/,
  'all release migrations must be recorded in the Supabase ledger inside the apply transaction',
);

// Production apply is an independently acknowledged, locked path. Validation
// uses a separate secret, while backup inspection is not overstated as a
// successful restore.
assert.match(workflow, /production_apply_ack:[\s\S]{0,220}APPLY_AUTHORITY_PAYMENT_TO_PRODUCTION/);
assert.match(workflow, /payment_locks_ack:[\s\S]{0,220}PAYMENT_CHECKOUT_AND_RECONCILE_LOCKED/);
assert.match(workflow, /PRODUCTION_DEPLOY_FLAG: \$\{\{ vars\.PRODUCTION_DEPLOY_ENABLED \}\}/);
assert.match(workflow, /RECONCILE_REPOSITORY_FLAG: \$\{\{ vars\.PAYMENT_RECONCILE_ENABLED \}\}/);
assert.match(workflow, /PRODUCTION_DEPLOY_ENABLED must be explicitly false/);
assert.match(workflow, /PAYMENT_RECONCILE_ENABLED repository variable must be explicitly false/);
assert.match(workflow, /Verify deployed payment Edge locks before production apply/);
assert.equal((workflow.match(/--connect-timeout 10 --max-time 20/g) || []).length, 2,
  'both deployed Edge lock probes must fail within a bounded time');
assert.match(workflow, /checkout_status" != "503"[\s\S]{0,220}checkout_temporarily_unavailable/);
assert.match(workflow, /reconcile_status" != "503"[\s\S]{0,220}reconciliation_temporarily_disabled/);
assert.ok(
  workflow.indexOf('Verify deployed payment Edge locks before production apply') <
    workflow.indexOf('Apply authority and payment migration'),
  'deployed Edge locks must be proven before the production DB apply step',
);
assert.match(workflow, /This check does not prove that the dump can be restored/);
assert.doesNotMatch(workflow, /recoverable backup|prove the artifact is recoverable/i);
assert.match(workflow, /SUPABASE_VALIDATION_DB_URL/);
assert.match(workflow, /VALIDATION_DB_URL" = "\$PRODUCTION_DB_URL"/);

// Operator guidance mirrors executable invariants, including real provider
// cancellation amounts instead of the requested or expected amount.
assert.match(guide, /payment_contract_version=2/);
assert.match(guide, /NULL.*레거시 주문/);
assert.match(guide, /자동 확정·해제·취소 대상에 포함하지 않습니다/);
assert.match(guide, /provider_terminal/);
assert.match(guide, /`PENDING`은 결제 실패가 아니며 24시간 뒤 검토 상태에서도 자동 해제하지 않습니다/);
assert.match(guide, /`NOT_FOUND`도 단일 응답으로는 해제하지 않고[\s\S]{0,100}예외에서만 종료합니다/);
assert.match(guide, /15분 age 값은 확정된 PG 보장이 아닌 보수적 운영 후보입니다/);
assert.match(guide, /늦은 `PAID`[\s\S]{0,80}전액 자동 취소합니다/);
assert.match(guide, /cancellation\.totalAmount/);
assert.match(guide, /payment\.amount\.cancelled/);
assert.match(guide, /실제 취소액을 확인할 수 없으면 `refund_pending`/);
assert.match(guide, /별도 검증 DB/);
assert.match(guide, /실제 복원이 된다는 증거가 아닙니다/);
assert.match(guide, /production_apply_ack=APPLY_AUTHORITY_PAYMENT_TO_PRODUCTION/);
assert.match(guide, /payment_locks_ack=PAYMENT_CHECKOUT_AND_RECONCILE_LOCKED/);
assert.match(guide, /이미 적용된 역사 마이그레이션/);
assert.match(guide, /supabase_migrations\.schema_migrations/);
assert.match(guide, /DB 잠금은 5초, 문장 실행은 5분/);

console.log('payment DB release gate contracts: ok');
