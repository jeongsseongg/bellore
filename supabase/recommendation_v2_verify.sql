-- BELLORE Recommendation v2 · post-migration verification
-- Read-only except for the explicitly commented manual purge/cron statements.

select
  to_regprocedure('public.grant_ai_personalization_consent(text,text,boolean)') is not null
    as consent_grant_rpc,
  to_regprocedure('public.withdraw_ai_personalization(boolean)') is not null
    as consent_withdraw_rpc,
  to_regprocedure('public.ai_purge_expired_personalization_data(integer)') is not null
    as retention_rpc,
  to_regclass('public.ai_consent_ledger') is not null as consent_ledger;

select
  to_regprocedure('public.ai_purge_expired_personalization_data()') is null
    as old_zero_arg_purge_removed,
  to_regprocedure('public.ai_purge_expired_personalization_data(integer)') is not null
    as bounded_integer_purge_present;

-- Paid recommendation outcome + payment cutover. Every boolean except the
-- explicitly labelled legacy count below must be true/zero as appropriate.
select
  to_regclass('public.ai_paid_recommendation_attributions') is not null
    as paid_recommendation_table,
  to_regprocedure(
    'public.analytics_finalize_paid_order_with_benefits(uuid,bigint,bigint,text,text,text,jsonb,integer)'
  ) is not null as atomic_payment_wrapper,
  to_regprocedure(
    'public.reconcile_existing_paid_order_benefits(uuid)'
  ) is not null as safe_benefit_retry_rpc,
  to_regprocedure(
    'public.reconcile_paid_order_benefits(uuid,integer,boolean)'
  ) is not null as internal_benefit_reconciler,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'checkout_token_hash'
  ) as checkout_hash_column,
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_checkout_token_hash_check'
  ) as checkout_hash_constraint,
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_benefit_snapshot_check'
  ) as benefit_snapshot_constraint,
  coalesce((
    select column_row.is_nullable = 'NO'
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'orders'
      and column_row.column_name = 'listing_id'
  ), false) as listing_id_not_null,
  (
    select count(*) = 1
      and bool_and(constraint_row.confrelid = 'public.listings'::regclass)
      and bool_and(constraint_row.confdeltype = 'r')
      and bool_and(constraint_row.convalidated)
    from pg_constraint constraint_row
    join pg_attribute attribute_row
      on attribute_row.attrelid = constraint_row.conrelid
     and attribute_row.attnum = constraint_row.conkey[1]
    where constraint_row.conrelid = 'public.orders'::regclass
      and constraint_row.contype = 'f'
      and array_length(constraint_row.conkey, 1) = 1
      and attribute_row.attname = 'listing_id'
  ) as exactly_one_listing_restrict_fk,
  exists (
    select 1
    from pg_index index_row
    where index_row.indexrelid = 'public.orders_listing_id_idx'::regclass
      and pg_get_indexdef(index_row.indexrelid) ~ '\(listing_id\)'
  ) as listing_lookup_index,
  exists (
    select 1
    from pg_index index_row
    where index_row.indexrelid = 'public.uq_orders_paid_listing'::regclass
      and index_row.indisunique
      and pg_get_indexdef(index_row.indexrelid) ~ '\(listing_id\)'
      and pg_get_expr(index_row.indpred, index_row.indrelid) ilike '%paid_at%is not null%'
  ) as paid_listing_partial_unique;

select
  count(*) filter (
    where analytics_attribution ? 'recommendation'
  ) as order_recommendation_objects_expected_zero,
  count(*) filter (
    where customer_id is null and status = 'pending'
      and (checkout_token_hash is null
        or checkout_token_hash !~ '^[0-9a-f]{64}$')
  ) as invalid_guest_pending_tokens_expected_zero,
  count(*) filter (
    where (benefit_point_rate_bps is null)
      <> (benefit_earned_points is null)
  ) as partial_benefit_snapshots_expected_zero,
  count(*) filter (
    where benefits_reconciled_at is not null
      and benefit_point_rate_bps is null
  ) as reconciled_without_snapshot_expected_zero,
  count(*) filter (
    where status = 'payment_review'
  ) as payment_review_requires_portone_reconciliation,
  count(*) filter (
    where paid_at is not null and benefit_point_rate_bps is null
  ) as legacy_paid_without_snapshot_informational,
  count(*) filter (where listing_id is null)
    as missing_listing_id_expected_zero
from public.orders;

select
  count(*) filter (
    where order_row.paid_at is not null and lower(listing.status) <> 'sold'
  ) as paid_listing_not_sold_expected_zero,
  count(*) filter (where listing.id is null)
    as orphan_listing_expected_zero
from public.orders order_row
left join public.listings listing on listing.id = order_row.listing_id;

select count(*) as duplicate_paid_listing_groups_expected_zero
from (
  select listing_id
  from public.orders
  where paid_at is not null
  group by listing_id having count(*) > 1
) duplicate;

select
  trigger_name,
  action_timing,
  string_agg(event_manipulation, ',' order by event_manipulation) as events
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'orders'
  and trigger_name in (
    'trg_ai_strip_order_recommendation',
    'trg_ai_guard_paid_order_state',
    'trg_ai_guard_paid_order_delete',
    'trg_ai_reserve_order_coupon',
    'trg_ai_release_pending_order_coupon'
  )
group by trigger_name, action_timing
order by trigger_name;

select
  trigger_row.tgname,
  trigger_row.tgenabled in ('O', 'A') as enabled,
  trigger_row.tgfoid = expected.function_oid as correct_function
from (
  values
    ('public.orders'::regclass, 'trg_ai_guard_paid_order_state',
      to_regprocedure('public.ai_guard_paid_order_state()')),
    ('public.orders'::regclass, 'trg_ai_guard_paid_order_delete',
      to_regprocedure('public.ai_guard_paid_order_delete()')),
    ('public.listings'::regclass, 'trg_ai_guard_paid_listing_status',
      to_regprocedure('public.ai_guard_paid_listing_status()'))
) expected(relation_id, trigger_name, function_oid)
join pg_trigger trigger_row
  on trigger_row.tgrelid = expected.relation_id
 and trigger_row.tgname = expected.trigger_name
 and not trigger_row.tgisinternal
order by trigger_row.tgname;

select
  pg_get_functiondef(to_regprocedure('public.ai_guard_paid_order_state()'))
    like '%bellore.payment_finalize_rpc%' as paid_transition_rpc_gate,
  pg_get_functiondef(to_regprocedure(
    'public.analytics_finalize_paid_order(uuid,bigint,bigint,text,text,text,jsonb)'
  )) like '%set_config(''bellore.payment_finalize_rpc'', ''on'', true)%'
    as private_finalize_sets_gate,
  pg_get_functiondef(to_regprocedure('public.ai_guard_paid_listing_status()'))
    like '%PAID_LISTING_RELIST_RPC_REQUIRED%' as paid_listing_reopen_guard,
  pg_get_functiondef(to_regprocedure('public.ai_guard_paid_order_delete()'))
    like '%PAID_ORDER_DELETE_FORBIDDEN%' as paid_order_delete_guard;

select
  trigger_row.tgname = 'trg_ai_guard_profile_points'
    and trigger_row.tgenabled in ('O', 'A')
    and trigger_row.tgfoid = to_regprocedure('public.ai_guard_profile_points()')
    as profile_points_rpc_guard
from pg_trigger trigger_row
where trigger_row.tgrelid = 'public.profiles'::regclass
  and trigger_row.tgname = 'trg_ai_guard_profile_points'
  and not trigger_row.tgisinternal;

select count(*) as negative_profile_points_expected_zero
from public.profiles
where points < 0;

with expected(column_name, referenced_table) as (
  values
    ('order_id', 'public.orders'::regclass),
    ('user_id', 'auth.users'::regclass),
    ('profile_id', 'public.customer_ai_profiles'::regclass),
    ('recommendation_event_id', 'public.customer_events'::regclass)
), actual as (
  select
    attribute_row.attname as column_name,
    constraint_row.confrelid as referenced_table,
    count(*) as fk_count,
    bool_and(constraint_row.confdeltype = 'c') as all_delete_cascade
  from pg_constraint constraint_row
  join pg_attribute attribute_row
    on attribute_row.attrelid = constraint_row.conrelid
   and attribute_row.attnum = constraint_row.conkey[1]
  where constraint_row.contype = 'f'
    and constraint_row.conrelid =
      'public.ai_paid_recommendation_attributions'::regclass
    and array_length(constraint_row.conkey, 1) = 1
  group by attribute_row.attname, constraint_row.confrelid
)
select
  expected.column_name,
  expected.referenced_table,
  coalesce(actual.fk_count, 0) = 1
    and coalesce(actual.all_delete_cascade, false) as exactly_one_cascade_fk
from expected
left join actual using (column_name, referenced_table)
order by expected.column_name;

select
  relation.relrowsecurity as paid_attribution_rls_enabled,
  has_table_privilege('anon', relation.oid, 'SELECT') as anon_can_select_expected_false,
  has_table_privilege('authenticated', relation.oid, 'SELECT')
    as authenticated_can_select_expected_false,
  has_table_privilege('service_role', relation.oid, 'SELECT')
    as service_can_select_expected_true
from pg_class relation
where relation.oid = 'public.ai_paid_recommendation_attributions'::regclass;

select
  has_function_privilege(
    'service_role',
    'public.analytics_finalize_paid_order(uuid,bigint,bigint,text,text,text,jsonb)',
    'EXECUTE'
  ) as old_finalize_service_execute_expected_false,
  has_function_privilege(
    'service_role',
    'public.analytics_finalize_paid_order_with_benefits(uuid,bigint,bigint,text,text,text,jsonb,integer)',
    'EXECUTE'
  ) as wrapper_service_execute_expected_true,
  has_function_privilege(
    'service_role',
    'public.reconcile_paid_order_benefits(uuid,integer,boolean)',
    'EXECUTE'
  ) as internal_reconcile_service_execute_expected_false,
  has_function_privilege(
    'service_role',
    'public.reconcile_existing_paid_order_benefits(uuid)',
    'EXECUTE'
  ) as retry_service_execute_expected_true;

select
  coalesce(role_row.rolname, 'PUBLIC') as grantee,
  acl.privilege_type,
  coalesce(role_row.rolname, 'PUBLIC') not in (
    pg_get_userbyid(procedure.proowner), 'service_role'
  ) as unexpected_retry_execute_expected_false
from pg_proc procedure
cross join lateral aclexplode(
  coalesce(procedure.proacl, acldefault('f', procedure.proowner))
) acl
left join pg_roles role_row on role_row.oid = acl.grantee
where procedure.oid = to_regprocedure(
  'public.reconcile_existing_paid_order_benefits(uuid)'
)
order by grantee, acl.privilege_type;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'uq_point_ledger_order_earn';

select
  count(*) = 1 as point_order_exactly_one_fk,
  bool_and(constraint_row.confrelid = 'public.orders'::regclass)
    as point_order_references_orders,
  bool_and(constraint_row.confdeltype = 'r') as point_order_delete_restrict,
  bool_and(constraint_row.convalidated) as point_order_fk_validated
from pg_constraint constraint_row
join pg_attribute attribute_row
  on attribute_row.attrelid = constraint_row.conrelid
 and attribute_row.attnum = constraint_row.conkey[1]
where constraint_row.contype = 'f'
  and constraint_row.conrelid = 'public.point_ledger'::regclass
  and array_length(constraint_row.conkey, 1) = 1
  and attribute_row.attname = 'order_id';

select count(*) as point_ledger_order_orphans_expected_zero
from public.point_ledger ledger
left join public.orders order_row on order_row.id = ledger.order_id
where ledger.order_id is not null and order_row.id is null;

select count(*) as invalid_or_duplicate_order_earn_expected_zero
from (
  select ledger.order_id
  from public.point_ledger ledger
  left join public.orders order_row on order_row.id = ledger.order_id
  where ledger.reason = 'order_earn'
  group by ledger.order_id
  having count(*) > 1
     or bool_or(
       ledger.order_id is null
       or order_row.id is null
       or order_row.paid_at is null
       or ledger.user_id is distinct from order_row.customer_id
       or ledger.delta is null
       or ledger.delta < 0
       or ledger.balance_after is null
       or ledger.balance_after < 0
     )
) invalid;

select
  indexname,
  indexdef,
  indexdef ilike 'create unique index%on public.customer_ai_profiles using btree (user_id)%'
    and indexdef not ilike '%where%' as full_unique_user_index
from pg_indexes
where schemaname = 'public' and indexname = 'uq_cap_user';

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_ai_consent_ledger_user_time',
    'idx_ai_consent_ledger_profile'
  )
order by indexname;

select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in ('trg_ai_guard_profile_write', 'trg_ai_consent_write')
order by table_name, trigger_name, event_manipulation;

-- Every row must be true. Table owners/service functions may deliberately
-- bypass RLS; browser roles may not.
select
  relation.relname as table_name,
  relation.relrowsecurity as rls_enabled
from pg_class relation
join pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in (
    'customer_ai_profiles', 'ai_conversations',
    'customer_watch_interests', 'customer_events',
    'ai_customer_memories', 'ai_recommendation_logs',
    'ai_alert_candidates', 'ai_consent_ledger', 'ai_shop_chat_requests',
    'ai_shop_chat_logs', 'ai_local_worker_auth',
    'ai_paid_recommendation_attributions'
  )
order by relation.relname;

select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'customer_ai_profiles',
    'ai_conversations',
    'customer_watch_interests',
    'customer_events',
    'ai_customer_memories',
    'ai_recommendation_logs',
    'ai_alert_candidates',
    'ai_consent_ledger',
    'ai_paid_recommendation_attributions'
  )
order by tablename, policyname;

select
  table_schema,
  table_name,
  grantee,
  privilege_type
-- role_table_grants omits PUBLIC-derived access, so it cannot prove that a
-- historical PUBLIC grant was removed.
from information_schema.table_privileges
where table_schema = 'public'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
  and table_name in (
    'customer_ai_profiles', 'ai_conversations',
    'customer_watch_interests', 'customer_events',
    'ai_customer_memories', 'ai_recommendation_logs',
    'ai_alert_candidates', 'ai_consent_ledger',
    'ai_shop_chat_requests', 'ai_shop_chat_logs', 'ai_local_worker_auth',
    'ai_paid_recommendation_attributions'
  )
order by table_name, grantee, privilege_type;

select
  namespace.nspname as table_schema,
  relation.relname as table_name,
  role_row.rolname as grantee,
  acl.privilege_type,
  true as unexpected_custom_acl_expected_zero
from pg_class relation
join pg_namespace namespace on namespace.oid = relation.relnamespace
cross join lateral aclexplode(
  coalesce(relation.relacl, acldefault('r', relation.relowner))
) acl
join pg_roles role_row on role_row.oid = acl.grantee
where namespace.nspname = 'public'
  and relation.relname in (
    'customer_ai_profiles', 'ai_conversations',
    'customer_watch_interests', 'customer_events',
    'ai_customer_memories', 'ai_recommendation_logs',
    'ai_alert_candidates', 'ai_consent_ledger',
    'ai_shop_chat_requests', 'ai_shop_chat_logs', 'ai_local_worker_auth',
    'ai_paid_recommendation_attributions'
  )
  and acl.grantee <> relation.relowner
  and role_row.rolname not in (
    current_user, 'postgres', 'supabase_admin',
    'anon', 'authenticated', 'service_role'
  )
order by table_schema, table_name, grantee, privilege_type;

select
  conrelid::regclass as table_name,
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and conrelid in (
    'public.customer_ai_profiles'::regclass,
    'public.ai_conversations'::regclass,
    'public.customer_watch_interests'::regclass,
    'public.customer_events'::regclass,
    'public.ai_customer_memories'::regclass,
    'public.ai_recommendation_logs'::regclass,
    'public.ai_alert_candidates'::regclass
  )
  and pg_get_constraintdef(oid) ilike '%auth.users%'
order by conrelid::regclass::text;

-- Exactly one CASCADE FK must exist for each ownership column.
with expected(table_name, column_name, referenced_table) as (
  values
    ('public.customer_ai_profiles'::regclass, 'user_id',    'auth.users'::regclass),
    ('public.ai_conversations'::regclass,     'user_id',    'auth.users'::regclass),
    ('public.ai_conversations'::regclass,     'profile_id', 'public.customer_ai_profiles'::regclass),
    ('public.customer_watch_interests'::regclass, 'user_id','auth.users'::regclass),
    ('public.customer_watch_interests'::regclass, 'profile_id','public.customer_ai_profiles'::regclass),
    ('public.customer_events'::regclass,      'user_id',    'auth.users'::regclass),
    ('public.customer_events'::regclass,      'profile_id', 'public.customer_ai_profiles'::regclass),
    ('public.ai_customer_memories'::regclass, 'user_id',    'auth.users'::regclass),
    ('public.ai_customer_memories'::regclass, 'profile_id', 'public.customer_ai_profiles'::regclass),
    ('public.ai_recommendation_logs'::regclass,'user_id',   'auth.users'::regclass),
    ('public.ai_recommendation_logs'::regclass,'profile_id','public.customer_ai_profiles'::regclass),
    ('public.ai_alert_candidates'::regclass,  'user_id',    'auth.users'::regclass),
    ('public.ai_alert_candidates'::regclass,  'profile_id', 'public.customer_ai_profiles'::regclass)
), actual as (
  select
    constraint_row.conrelid as table_name,
    attribute_row.attname as column_name,
    constraint_row.confrelid as referenced_table,
    count(*) as fk_count,
    bool_and(constraint_row.confdeltype = 'c') as all_delete_cascade
  from pg_constraint constraint_row
  join pg_attribute attribute_row
    on attribute_row.attrelid = constraint_row.conrelid
   and attribute_row.attnum = constraint_row.conkey[1]
  where constraint_row.contype = 'f'
    and array_length(constraint_row.conkey, 1) = 1
  group by constraint_row.conrelid, attribute_row.attname, constraint_row.confrelid
)
select
  expected.table_name,
  expected.column_name,
  expected.referenced_table,
  coalesce(actual.fk_count, 0) as fk_count,
  coalesce(actual.all_delete_cascade, false) as delete_cascade,
  coalesce(actual.fk_count, 0) = 1
    and coalesce(actual.all_delete_cascade, false) as verified
from expected
left join actual using (table_name, column_name, referenced_table)
order by expected.table_name::text, expected.column_name;

select
  procedure.oid::regprocedure as function_signature,
  pg_get_userbyid(procedure.proowner) as owner,
  procedure.prosecdef as security_definer,
  procedure.proconfig,
  procedure.proacl
from pg_proc procedure
join pg_namespace namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname in (
    'ai_guard_profile_write',
    'ai_lock_auth_user',
    'ai_guard_personalization_write',
    'ai_guard_shop_chat_request_insert',
    'ai_guard_shop_chat_request_update',
    'ai_profile_owned_and_consented',
    'grant_ai_personalization_consent',
    'withdraw_ai_personalization',
    'ai_purge_expired_personalization_data',
    'submit_shop_ai_chat',
    'get_shop_ai_chat_result',
    'log_shop_ai_turn',
    'ai_strip_order_recommendation',
    'ai_guard_paid_order_state',
    'ai_guard_profile_points',
    'ai_reserve_order_coupon',
    'ai_release_pending_order_coupon',
    'reconcile_paid_order_benefits',
    'reconcile_existing_paid_order_benefits',
    'analytics_finalize_paid_order_with_benefits'
  )
order by procedure.oid::regprocedure::text;

select
  table_name,
  older_than_90_days
from (
  select 'customer_events'::text as table_name,
    count(*) filter (where created_at < now() - interval '90 days') as older_than_90_days
  from public.customer_events
  union all
  select 'ai_conversations',
    count(*) filter (where created_at < now() - interval '90 days')
  from public.ai_conversations
  union all
  select 'ai_recommendation_logs',
    count(*) filter (where created_at < now() - interval '90 days')
  from public.ai_recommendation_logs
  union all
  select 'ai_alert_candidates',
    count(*) filter (where created_at < now() - interval '90 days')
  from public.ai_alert_candidates
) retention;

-- Optional bridge verification. Expected when installed: 0 anon/authenticated
-- table privileges, authenticated-only submit/result RPCs, consent trigger,
-- user/profile CASCADE FKs, and no cross-user bearer-token access.
do $optional_bridge_verify$
declare
  v_trigger_count bigint;
  v_bad_fk_count bigint;
begin
  if to_regclass('public.ai_shop_chat_requests') is null then
    raise notice 'ai_shop_chat_requests: not installed';
    return;
  end if;

  select count(*) into v_trigger_count
  from information_schema.triggers
  where trigger_schema = 'public'
    and event_object_table = 'ai_shop_chat_requests'
    and trigger_name in (
      'trg_ai_shop_chat_consent_insert',
      'trg_ai_shop_chat_consent_update'
    );

  select count(*) into v_bad_fk_count
  from pg_constraint constraint_row
  join pg_attribute attribute_row
    on attribute_row.attrelid = constraint_row.conrelid
   and attribute_row.attnum = constraint_row.conkey[1]
  where constraint_row.contype = 'f'
    and constraint_row.conrelid = 'public.ai_shop_chat_requests'::regclass
    and attribute_row.attname in ('user_id', 'profile_id')
    and constraint_row.confdeltype <> 'c';

  raise notice 'ai_shop_chat_requests verification: consent_triggers=% (expected 2), noncascade_fks=%',
    v_trigger_count, v_bad_fk_count;
end
$optional_bridge_verify$;

select
  bucket_id,
  count(*) as object_count
from storage.objects
where bucket_id = 'ai-conversation-attachments'
group by bucket_id;

-- Required authenticated test (perform with a disposable test account):
-- 1. grant_ai_personalization_consent(...)
-- 2. insert one conversation/event/interest/recommendation row
-- 3. withdraw_ai_personalization(true)
-- 4. confirm all six child-table counts and optional shop-chat requests/logs
--    are 0 and all derived profile fields
--    are null/empty/default 50
-- 5. retry a direct event/interest insert; expect SQLSTATE 42501
-- 6. delete the auth test user through the normal server account-delete flow;
--    confirm profile, child rows, and consent ledger rows are 0
-- 7. repeat steps 2 and 3 concurrently in separate sessions; after both
--    commit, consent=false and child rows must be 0
-- 8. repeat a consented child INSERT and the normal auth account-delete flow
--    concurrently; neither session may deadlock, and profile/child/ledger rows
--    must all be 0 after account deletion commits
-- 9. when the local bridge is installed, confirm anon submit/result EXECUTE is
--    denied and account B cannot read account A's client_token result
-- 10. with checkout stopped, run two concurrent confirms for one order; exactly
--    one paid transition, one order_earn row, and one coupon use must remain
-- 11. create two pending orders with one coupon concurrently; exactly one order
--    may reserve it. A verified terminal FAILED/CANCELLED releases it, while a
--    READY/PENDING payment keeps the reservation for webhook/operator review
-- 12. verify a member cannot confirm another member's order; verify a guest
--    needs the 256-bit checkout token and the response contains only allowlisted
--    order/payment fields
-- 13. race paid confirmation with personalization withdrawal/account deletion;
--    the order may remain as the legal ledger but recommendation evidence must
--    be zero after withdrawal/deletion commits
-- 14. a paid/fulfilled/refunded order retry must keep paid_at, status, coupon,
--    point-rate snapshot, and earned-points snapshot unchanged
-- 15. reconcile every payment_review row against PortOne before reopening
--    checkout; never release a coupon on an unverified transient payment state

-- First retention run must be manual, measured, and backed up:
-- select public.ai_purge_expired_personalization_data(500);
-- Repeat with a measured batch until remaining_expired_by_table is all zero,
-- then re-run the retention count query above and compare before/after.

-- pg_cron is NOT installed or scheduled by the migration. After confirming
-- current_setting('cron.timezone', true) is GMT/UTC and choosing one fixed
-- owner role, choose a batch above measured daily peak (maximum 20,000), and
-- schedule exactly one job:
--
-- select cron.schedule(
--   'bellore-ai-personalization-retention',
--   '30 18 * * *',
--   'select public.ai_purge_expired_personalization_data(5000)'
-- );
--
-- Then verify (only when pg_cron exists):
-- select jobid, jobname, schedule, command, username, active
-- from cron.job
-- where jobname = 'bellore-ai-personalization-retention';
-- select jobid, status, return_message, start_time, end_time
-- from cron.job_run_details
-- where jobid = <verified_jobid>
-- order by start_time desc
-- limit 10;
