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
assert.match(recoveryMigration, /where orders\.payment_contract_version = 2[\s\S]{0,240}not public\.is_payment_operation_hash_held_v1[\s\S]{0,160}orders\.status in \('failed','canceled'\)[\s\S]{0,100}orders\.payment_terminal_at is null/);
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
const prepareStart = workflow.indexOf('Prepare — 데이터 없는 일회성 Supabase 검증 DB');
const prepareBlock = workflow.slice(prepareStart, validateStart);
assert(prepareStart >= 0 && prepareStart < validateStart, 'isolated validation DB must be prepared first');
assert.match(prepareBlock, /supabase\/postgres@sha256:3e2a7ab48783077d0122dc72ed5174afb543110c38266c845716c51d130658e4/);
assert.match(prepareBlock, /postgres@sha256:d13db94ae661d517c5ed57c509a578d5ea64aae639871ba25294f4f42d83de28/);
assert.match(prepareBlock, /--platform linux\/amd64 --network none/);
assert.match(prepareBlock, /seq 1 90/,
  'Supabase initialization must have a bounded three-minute readiness window');
assert.match(prepareBlock, /State\.Health\.Status[\s\S]{0,360}rolname in \('anon','authenticated','service_role','supabase_admin'\)/,
  'readiness must require the TCP healthcheck and authenticated final-server roles');
assert.match(prepareBlock, /PAYMENT_VALIDATION_PASSWORD=\$validation_password/);
assert.match(prepareBlock, /docker exec --env PGPASSWORD="\$validation_password"[\s\S]{0,180}psql -h localhost -U supabase_admin/,
  'readiness must authenticate over localhost instead of relying on peer auth');
assert.match(prepareBlock, /docker logs --tail 120/,
  'readiness failure must retain bounded diagnostics');
assert.match(prepareBlock, /pg_dump[\s\S]{0,350}--format=custom --schema-only[\s\S]{0,350}--lock-wait-timeout=5000/);
assert.doesNotMatch(prepareBlock, /--no-owner|--no-acl/,
  'owner and ACL metadata must survive the isolated restore');
assert.match(prepareBlock, /pg_restore --data-only --list[\s\S]{0,180}production-data\.toc/,
  'PostgreSQL must classify archive data entries instead of a descriptor substring regex');
assert.match(prepareBlock, /grep -Eq '\^\[\[:digit:\]\]\+;' "\$schema_dir\/production-data\.toc"/,
  'a schema-only archive must have no active data-only TOC entries');
assert.match(prepareBlock, /\(SUBSCRIPTION\( TABLE\)\?\|USER MAPPING\)/,
  'full TOC must reject subscription and user-mapping external connections');
assert.doesNotMatch(prepareBlock, /grep -Eiq|TABLE DATA\|SEQUENCE SET|BLOB\|BLOB COMMENTS|LARGE OBJECT\|SUBSCRIPTION/,
  'archive safety must not use case-insensitive object-name substring matching');
assert.match(prepareBlock, /if not exists \(select 1 from pg_catalog\.pg_roles where rolname='supabase_realtime_admin'\)/);
assert.match(prepareBlock, /create role supabase_realtime_admin\s+nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls/,
  'the disposable DB role stub must match the verified non-privileged Cloud owner role');
assert.doesNotMatch(prepareBlock, /create role supabase_realtime_admin[\s\S]{0,160}\b(login|superuser|createdb|createrole|inherit|replication|bypassrls)\b(?!\s*;)/i,
  'the disposable owner role must not gain Cloud service privileges');
assert.match(prepareBlock, /if not exists \(select 1 from pg_catalog\.pg_roles where rolname='supabase_functions_admin'\)/);
assert.match(prepareBlock, /create role supabase_functions_admin\s+nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls/,
  'the stale Cloud ACL grantee must be an inert disposable validation placeholder');
assert.doesNotMatch(prepareBlock, /create role supabase_functions_admin[\s\S]{0,160}\b(login|superuser|createdb|createrole|inherit|replication|bypassrls)\b(?!\s*;)/i,
  'the disposable ACL placeholder must not gain Cloud service privileges');
assert.match(prepareBlock, /pg_restore --clean --if-exists --exit-on-error --single-transaction/);
assert.match(prepareBlock, /--host=localhost --username=supabase_admin --dbname=postgres/);
assert.doesNotMatch(prepareBlock, /upload-artifact|TABLE DATA.*production-schema/i,
  'validation schema must remain runner-local and contain no table data');
const validateBlock = workflow.slice(validateStart, rollback);
assert.match(validateBlock, /if: inputs\.task == 'validate-authority-payment'/);
assert.match(workflow, /if: github\.ref == 'refs\/heads\/main' \|\| inputs\.task == 'validate-authority-payment'/);
assert.doesNotMatch(validateBlock, /apply-authority-payment/,
  'production apply must never execute rollback fixtures');
assert.match(validateBlock, /docker exec --env PGPASSWORD="\$PAYMENT_VALIDATION_PASSWORD"[\s\S]{0,140}psql -h localhost -U supabase_admin -d postgres/);
assert.doesNotMatch(validateBlock, /PGCONN: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/,
  'rollback fixtures must not receive the production DB URL');
assert.match(validateBlock, /set local session_replication_role=replica;[\s\S]{0,900}generate_series\(1,6\)[\s\S]{0,120}set local session_replication_role=origin;/);
for (const file of [
  '20260826155000_payment_operation_hold.sql',
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
  '20260826155000_payment_operation_hold.sql',
  '20260826160000_payment_recovery_listing_state.sql',
  '20260826170000_checkout_claim_integrity.sql',
  '20260826180000_order_financial_state_guard.sql',
  '20260826190000_payment_finalization_closed_order_contract.sql',
]) assert(applyBlock.includes(file), `production apply omits ${file}`);
assert.match(applyBlock, /PGOPTIONS: "-c lock_timeout=5000 -c statement_timeout=300000/);
assert.match(applyBlock, /PGCONNECT_TIMEOUT: "10"/);
assert.match(applyBlock, /migration_ledger_missing/);
assert.match(applyBlock, /migration_ledger_noncanonical/);
assert.match(applyBlock, /name='customer_shipping_addresses'/);
assert.match(applyBlock, /authority_payment_schema_baseline_missing/);
assert.match(applyBlock, /authority_payment_column_fingerprint_mismatch/);
assert.match(applyBlock, /authority_payment_rpc_fingerprint_mismatch/);
assert.match(applyBlock, /authority_payment_trigger_or_rls_fingerprint_mismatch/);
assert.match(applyBlock, /authority_payment_function_security_fingerprint_mismatch/);
assert.match(applyBlock, /checkout_core_body_fingerprint_mismatch/);
assert.match(applyBlock, /checkout_rate_limiter_body_fingerprint_mismatch/);
assert.match(applyBlock, /authority_payment_acl_fingerprint_mismatch/);
for (const role of ['anon', 'authenticated']) {
  for (const privilege of ['select', 'insert', 'update', 'delete']) {
    const marker = `has_table_privilege('${role}','public.checkout_rate_limits','${privilege}')`;
    assert.equal(
      workflow.split(marker).length - 1,
      2,
      `${role} ${privilege} checkout-rate ACL must be checked before and after production apply`,
    );
  }
}
assert.equal(
  workflow.split("tablename='checkout_rate_limits'").length - 1,
  2,
  'checkout-rate RLS policy absence must be checked before and after production apply',
);
assert.match(applyBlock, /payment_release_partial_schema_detected/);
assert.match(applyBlock, /payment_release_migration_already_recorded/);
assert.match(applyBlock, /migration_ledger_ahead_of_release/);
assert.match(
  applyBlock,
  /begin;[\s\S]*insert into supabase_migrations\.schema_migrations\(version,name,statements\)[\s\S]{0,900}'20260826155000'[\s\S]{0,900}'20260826190000'[\s\S]{0,180}commit;/,
  'all release migrations must be recorded in the Supabase ledger inside the apply transaction',
);

// Production apply is an independently acknowledged, locked path. Validation
// uses a separate secret, while backup inspection is not overstated as a
// successful restore.
assert.match(workflow, /production_apply_ack:[\s\S]{0,220}APPLY_AUTHORITY_PAYMENT_TO_PRODUCTION/);
assert.match(workflow, /payment_locks_ack:[\s\S]{0,220}PAYMENT_CHECKOUT_AND_RECONCILE_LOCKED/);
assert.match(workflow, /payment_hold_ack:[\s\S]{0,220}SEED_HASH_ONLY_PAYMENT_OPERATION_HOLD/);
assert.match(workflow, /payment_hold_sha256 must be a 64-character lowercase SHA-256/);
assert.match(workflow, /PRODUCTION_DEPLOY_FLAG: \$\{\{ vars\.PRODUCTION_DEPLOY_ENABLED \}\}/);
assert.match(workflow, /RECONCILE_REPOSITORY_FLAG: \$\{\{ vars\.PAYMENT_RECONCILE_ENABLED \}\}/);
assert.match(workflow, /PRODUCTION_DEPLOY_ENABLED must be explicitly false/);
assert.match(workflow, /PAYMENT_RECONCILE_ENABLED repository variable must be explicitly false/);
assert.match(workflow, /Verify all deployed payment Edge locks before production apply/);
assert.match(workflow, /--connect-timeout 10 --max-time 20/);
assert.equal((workflow.match(/probe_lock (?:create-checkout|confirm-payment|cancel-payment|payment-webhook|reconcile-payments)/g) || []).length, 5,
  'all five deployed Edge paths must be probed through the bounded helper');
assert.match(workflow, /status" != "503"[\s\S]{0,220}payment_operations_temporarily_unavailable/);
assert.match(workflow, /Waiting 180 seconds[\s\S]*sleep 180/);
assert.ok(
  workflow.indexOf('Verify all deployed payment Edge locks before production apply') <
    workflow.indexOf('Apply authority and payment migration'),
  'deployed Edge locks must be proven before the production DB apply step',
);
assert.match(workflow, /This check does not prove that the dump can be restored/);
assert.doesNotMatch(workflow, /recoverable backup|prove the artifact is recoverable/i);
assert.doesNotMatch(workflow, /SUPABASE_VALIDATION_DB_URL/);
assert.match(workflow, /validation_system_id/);
assert.match(workflow, /production_system_id/);
assert.match(workflow, /pg_control_system\(\)/);
assert.match(workflow, /검증 DB와 운영 DB가 같은 물리 클러스터입니다/);
assert.match(workflow, /Cleanup — 일회성 Supabase 검증 DB[\s\S]{0,300}docker rm --force bellore-payment-validation-db/);

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
assert.match(guide, /데이터 없는 일회성 검증 DB/);
assert.match(guide, /실제 복원이 된다는 증거가 아닙니다/);
assert.match(guide, /production_apply_ack=APPLY_AUTHORITY_PAYMENT_TO_PRODUCTION/);
assert.match(guide, /payment_locks_ack=PAYMENT_CHECKOUT_AND_RECONCILE_LOCKED/);
assert.match(guide, /이미 적용된 역사 마이그레이션/);
assert.match(guide, /supabase_migrations\.schema_migrations/);
assert.match(guide, /DB 잠금은 5초, 문장 실행은 5분/);

console.log('payment DB release gate contracts: ok');
