const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'recommendation_v2_migration.sql'), 'utf8');
const preflight = fs.readFileSync(path.join(root, 'supabase', 'recommendation_v2_preflight.sql'), 'utf8');
const verify = fs.readFileSync(path.join(root, 'supabase', 'recommendation_v2_verify.sql'), 'utf8');
const localBridge = fs.readFileSync(path.join(root, 'local_ai_bridge.sql'), 'utf8');
const outcomeMigration = fs.readFileSync(path.join(root, 'supabase', 'recommendation_v2_outcome_attribution.sql'), 'utf8');

assert.match(migration, /create table if not exists public\.ai_consent_ledger/);
assert.match(migration, /create or replace function public\.grant_ai_personalization_consent/);
assert.match(migration, /AI_PROFILE_CREATE_RPC_REQUIRED/);
assert.match(migration, /set_config\('bellore\.ai_consent_rpc', 'grant', true\)/);
assert.match(migration, /set_config\('bellore\.ai_consent_rpc', 'withdraw', true\)/);
assert.doesNotMatch(migration, /create policy cap_insert/i);
assert.doesNotMatch(migration, /grant\s+select\s*,\s*insert\s+on table public\.customer_ai_profiles/i);
assert.doesNotMatch(migration, /if\s+v_privileged\s+then\s+return new/i);
assert.doesNotMatch(migration, /v_privileged\s+boolean\s*:=\s*current_user/i);
assert.match(migration, /RECOMMENDATION_V2_DATABASE_OWNER_REQUIRED/);
assert.match(migration, /lock table[\s\S]*auth\.users[\s\S]*in access exclusive mode/);
assert.match(migration, /lock table public\.ai_shop_chat_requests in access exclusive mode/);
assert.match(migration, /RECOMMENDATION_V2_AI_ATTACHMENT_REVIEW_REQUIRED/);
assert.match(migration, /create or replace function public\.ai_lock_auth_user/);
assert.match(migration, /for key share/);
assert.match(migration, /RECOMMENDATION_V2_LOCAL_BRIDGE_UPGRADE_REQUIRED/);
assert.match(migration, /create or replace function public\.ai_guard_personalization_write/);
assert.match(migration, /for update;/);
assert.match(migration, /AI_PERSONALIZATION_CONSENT_REQUIRED/);
assert.match(migration, /new\.created_at := clock_timestamp\(\)/);
assert.match(migration, /new\.created_at := old\.created_at/);
assert.match(migration, /price_sensitivity = 50/);
assert.match(migration, /resale_importance = 50/);
assert.match(migration, /foreign key \(user_id\) references auth\.users\(id\) on delete cascade/g);
assert.match(migration, /drop policy if exists ai_bucket_insert on storage\.objects/);
assert.doesNotMatch(migration, /perform cron\.schedule|select cron\.schedule/);
assert.match(migration, /drop function if exists public\.ai_purge_expired_personalization_data\(\)/);
assert.match(migration, /remaining_expired_by_table/);
assert.match(migration, /pg_try_advisory_xact_lock/);
assert.match(migration, /RECOMMENDATION_V2_LEGACY_CONSENT_REVIEW_REQUIRED/);
assert.match(migration, /RECOMMENDATION_V2_LEGACY_MARKETING_CONSENT_REVIEW_REQUIRED/);
assert.match(migration, /RECOMMENDATION_V2_LEGACY_PROFILE_PAYLOAD_REVIEW_REQUIRED/);
assert.match(migration, /RECOMMENDATION_V2_LEGACY_CHILD_DATA_REVIEW_REQUIRED/);
assert.match(migration, /RECOMMENDATION_V2_UNKNOWN_POLICY_REVIEW_REQUIRED/);
assert.match(migration, /RECOMMENDATION_V2_UNKNOWN_TABLE_ACL_REVIEW_REQUIRED/);
assert.match(migration, /RECOMMENDATION_V2_UNKNOWN_FUNCTION_ACL_REVIEW_REQUIRED/);
assert.match(migration, /alter table public\.customer_ai_profiles enable row level security/);
assert.match(migration, /revoke all on table public\.customer_events from public, anon, authenticated/);
assert.match(migration, /create unique index uq_cap_user on public\.customer_ai_profiles \(user_id\)/);
assert.match(migration, /idx_ai_consent_ledger_profile/);
assert.match(migration, /drop function if exists public\.ai_profile_owned_and_consented\(uuid, uuid\)/);
assert.doesNotMatch(migration, /ai_profile_owned_and_consented\(profile_id, auth\.uid\(\)\)/);
assert.match(migration, /ai_guard_shop_chat_request_insert/);
assert.match(migration, /ai_guard_shop_chat_request_update/);
assert.match(migration, /request\.user_id = auth\.uid\(\)/);
assert.match(migration, /AI_PERSONALIZATION_WITHDRAWAL_REQUIRES_HISTORY_DELETE/);

const backfillPosition = migration.indexOf('update public.customer_events set created_at');
const childTriggerPosition = migration.indexOf("create trigger trg_ai_consent_write");
assert(backfillPosition >= 0 && childTriggerPosition > backfillPosition,
  'legacy timestamp backfill must happen before consent child triggers');

const disablePosition = migration.indexOf('set consent_personalization = false');
const firstHistoryDelete = migration.indexOf('delete from public.ai_alert_candidates row');
assert(disablePosition >= 0 && firstHistoryDelete > disablePosition,
  'withdrawal must disable consent before deleting history');

const guardedTables = [
  'ai_conversations',
  'customer_watch_interests',
  'customer_events',
  'ai_customer_memories',
  'ai_recommendation_logs',
  'ai_alert_candidates'
];
guardedTables.forEach((table) => assert(migration.includes("'" + table + "'")));

for (const tag of [
  '$precondition$', '$function$', '$triggers$', '$optional_bridge$', '$foreign_keys$',
  '$optional_rpc$', '$ddl$', '$body$', '$claim_ddl$', '$claim_body$',
  '$complete_ddl$', '$complete_body$', '$sql$'
]) {
  const count = migration.split(tag).length - 1;
  assert.equal(count % 2, 0, tag + ' dollar quote must be balanced');
}

assert.match(preflight, /ORPHAN|orphan/i);
assert.match(preflight, /future_timestamp/);
assert.match(preflight, /ai-conversation-attachments/);
assert.match(preflight, /duplicate_user_profiles/);
assert.match(preflight, /marketing_consent_true/);
assert.match(preflight, /legacy_profile_payload_rows/);
assert.match(preflight, /pgcrypto_digest_in_extensions/);
assert.match(preflight, /unexpected_policy_blocker/);
assert.match(preflight, /unexpected_custom_acl_blocker/);
assert.match(preflight, /max_daily_rows_30d/);
assert.match(preflight, /legacy_local_bridge_lock_order_blocker/);
assert.match(preflight, /information_schema\.table_privileges/);
assert.doesNotMatch(preflight, /from information_schema\.role_table_grants/);
assert.match(preflight, /coupons_exists/);
assert.match(preflight, /v_has_coupon_column/);
assert.match(preflight, /v_has_point_columns/);
assert.match(preflight, /negative profile point balances/);
assert.match(preflight, /point-ledger rows referencing missing orders, all reasons/);
assert.match(verify, /concurrently in separate sessions/);
assert.match(verify, /information_schema\.table_privileges/);
assert.doesNotMatch(verify, /from information_schema\.role_table_grants/);
assert.match(verify, /ai_shop_chat_requests/);
assert.match(verify, /ai_local_worker_auth/);
assert.match(verify, /cron\.job_run_details/);
assert.match(verify, /old_zero_arg_purge_removed/);
assert.match(verify, /all_delete_cascade/);
assert.match(verify, /unexpected_custom_acl_expected_zero/);
assert.match(verify, /point_order_delete_restrict/);
assert.match(verify, /point_order_fk_validated/);
assert.match(verify, /point_ledger_order_orphans_expected_zero/);
assert.match(verify, /profile_points_rpc_guard/);
assert.match(verify, /unexpected_retry_execute_expected_false/);

assert.match(localBridge, /profile_id uuid not null references public\.customer_ai_profiles\(id\) on delete cascade/);
assert.match(localBridge, /create extension if not exists pgcrypto with schema extensions/);
assert.match(localBridge, /to_regprocedure\('extensions\.digest\(text,text\)'\)/);
assert.match(localBridge, /LOCAL_AI_BRIDGE_PGCRYPTO_SCHEMA_REQUIRED/);
assert.match(localBridge, /LOCAL_AI_BRIDGE_PROFILE_BACKFILL_REQUIRED/);
assert.match(localBridge, /add column if not exists profile_id uuid/);
assert.match(localBridge, /create or replace function public\.ai_lock_auth_user/);
assert.match(localBridge, /perform public\.ai_lock_auth_user\(v_user_id\)/);
assert.match(localBridge, /revoke all on public\.ai_shop_chat_requests from public, anon, authenticated/);
assert.match(localBridge, /new\.profile_id := v_profile_id/);
assert.match(localBridge, /create trigger trg_ai_shop_chat_consent_update/);
assert.doesNotMatch(localBridge, /for update of queued, profile/);
assert.match(localBridge, /Choose without locking, then lock profile/);
assert.match(localBridge, /Lock profile first, then request/);
assert.doesNotMatch(localBridge, /update public\.ai_shop_chat_requests\s+set status = 'submitted'/);
assert.match(localBridge, /queued\.processing_started_at < now\(\) - interval '15 minutes'/);
assert.match(localBridge, /request\.user_id = auth\.uid\(\)/);
assert.match(localBridge, /grant execute on function public\.submit_shop_ai_chat\(jsonb\) to authenticated/);
assert.doesNotMatch(localBridge, /grant execute on function public\.submit_shop_ai_chat\(jsonb\) to anon/);
assert.doesNotMatch(localBridge, /grant execute on function public\.get_shop_ai_chat_result\(uuid\) to anon/);
assert.doesNotMatch(localBridge, /grant execute on function public\.log_shop_ai_turn\(jsonb\) to anon/);
assert.doesNotMatch(localBridge, /insert into public\.ai_local_worker_auth/i);
assert.doesNotMatch(localBridge, /f0006c94c6bb5feac3106b80e814e53ab918e28715b5e7e7ec9d44d5300d0210/i);
assert.match(localBridge, /LOCAL_AI_BRIDGE_UNKNOWN_TABLE_ACL_REVIEW_REQUIRED/);
assert.match(localBridge, /LOCAL_AI_BRIDGE_UNKNOWN_FUNCTION_ACL_REVIEW_REQUIRED/);

assert.match(outcomeMigration, /RECOMMENDATION_V2_ANALYTICS_V3_REQUIRED/);
assert.match(outcomeMigration, /RECOMMENDATION_V2_CONSENT_MIGRATION_REQUIRED/);
assert.match(outcomeMigration, /RECOMMENDATION_V2_EXISTING_ORDER_RECOMMENDATION_REVIEW_REQUIRED/);
assert.match(outcomeMigration, /RECOMMENDATION_V2_EXISTING_PAID_ATTRIBUTION_REVIEW_REQUIRED/);
assert.match(outcomeMigration, /lock table auth\.users, public\.profiles, public\.customer_ai_profiles, public\.customer_events, public\.listings, public\.orders, public\.coupons, public\.user_coupons, public\.point_ledger in access exclusive mode/);
assert.match(preflight, /paid orders whose one-piece listing is not sold/);
assert.match(preflight, /duplicate paid orders for one listing/);
assert.match(verify, /exactly_one_listing_restrict_fk/);
assert.match(verify, /paid_listing_partial_unique/);
assert.match(verify, /paid_transition_rpc_gate/);
assert.match(outcomeMigration, /actual\.udt_name <> requirement\.udt_name/);
assert.match(outcomeMigration, /actual\.is_nullable <> requirement\.is_nullable/);
assert.match(outcomeMigration, /checkout_token_hash/);
assert.match(outcomeMigration, /orders_checkout_token_hash_check/);
assert.match(outcomeMigration, /RECOMMENDATION_V2_LEGACY_GUEST_PENDING_REVIEW_REQUIRED/);
assert.match(outcomeMigration, /create table public\.ai_paid_recommendation_attributions/);
assert.match(outcomeMigration, /trg_ai_strip_order_recommendation/);
assert.match(outcomeMigration, /last_recommendation_click_7d/);
assert.match(outcomeMigration, /idx_customer_events_recommendation_click_attribution/);
assert.match(outcomeMigration, /- 'recommendation'/);
assert.match(outcomeMigration, /from public\.customer_events event/);
assert.match(outcomeMigration, /insert into public\.ai_paid_recommendation_attributions/);
assert.match(outcomeMigration, /p_attribution := v_order\.analytics_attribution/);
assert.match(outcomeMigration, /uq_point_ledger_order_earn/);
assert.match(outcomeMigration, /point_ledger_order_id_fkey/);
assert.match(outcomeMigration, /RECOMMENDATION_V2_POINT_LEDGER_ORDER_ORPHAN_REVIEW_REQUIRED/);
assert.match(outcomeMigration, /on delete restrict/);
assert.match(outcomeMigration, /create or replace function public\.ai_guard_paid_order_state/);
assert.match(outcomeMigration, /create or replace function public\.ai_guard_profile_points/);
assert.match(outcomeMigration, /PROFILE_POINTS_RPC_REQUIRED/);
assert.match(outcomeMigration,
  /before insert or update of order_no, customer_id, listing_id, coupon_user_id,[\s\S]*pay_type, amount, discount, method, status, payment_key, receipt_url, paid_at,[\s\S]*on public\.orders/);
assert.match(outcomeMigration, /create or replace function public\.ai_reserve_order_coupon/);
assert.match(outcomeMigration, /coupon\.status = 'reserved'/);
assert.match(outcomeMigration, /create or replace function public\.ai_release_pending_order_coupon/);
assert.match(outcomeMigration, /analytics_finalize_paid_order_with_benefits/);
assert.match(outcomeMigration, /reconcile_existing_paid_order_benefits/);
assert.match(outcomeMigration, /benefit_retry_acl/);
assert.match(outcomeMigration, /POINT_REWARD_REFUND_RPC_REQUIRED/);
assert.match(outcomeMigration, /reconcile_paid_order_benefits\(uuid, integer, boolean\)[\s\S]*from public, anon, authenticated, service_role/);

console.log('recommendation SQL migration invariants: ok');
