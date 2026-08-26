-- BELLORE Recommendation v2 · read-only production preflight
-- Run in Supabase SQL Editor and save the result before migration.

select
  current_database() as database_name,
  current_user as executing_role,
  now() as checked_at,
  current_setting('TimeZone', true) as database_timezone,
  current_setting('cron.timezone', true) as cron_timezone,
  exists (select 1 from pg_extension where extname = 'pg_cron') as pg_cron_installed;

-- BLOCKER for the optional local-AI bridge when false. Its worker verifier
-- deliberately resolves pgcrypto through `extensions.digest(text,text)`.
select
  exists (select 1 from pg_extension where extname = 'pgcrypto') as pgcrypto_installed,
  to_regprocedure('extensions.digest(text,text)') is not null as pgcrypto_digest_in_extensions,
  coalesce((
    select namespace.nspname
    from pg_extension extension
    join pg_namespace namespace on namespace.oid = extension.extnamespace
    where extension.extname = 'pgcrypto'
  ), 'not_installed') as pgcrypto_schema;

select
  to_regclass('public.customer_ai_profiles') is not null as profiles_exists,
  to_regclass('public.customer_events') is not null as events_exists,
  to_regclass('public.ai_conversations') is not null as conversations_exists,
  to_regclass('public.customer_watch_interests') is not null as interests_exists,
  to_regclass('public.ai_recommendation_logs') is not null as recommendation_logs_exists;

-- Paid-outcome/payment-security readiness. `existing_paid_attribution_table`
-- must be false before the one-shot outcome migration. The benefit schema
-- flags must all be true. The consent-v2 flags become true only after the core
-- recommendation migration and gate the later outcome migration.
select
  to_regclass('public.orders') is not null as orders_exists,
  to_regclass('public.listings') is not null as listings_exists,
  to_regclass('public.profiles') is not null as account_profiles_exists,
  to_regclass('public.coupons') is not null as coupons_exists,
  to_regclass('public.user_coupons') is not null as user_coupons_exists,
  to_regclass('public.point_ledger') is not null as point_ledger_exists,
  to_regclass('public.ai_paid_recommendation_attributions') is not null
    as existing_paid_attribution_table,
  to_regclass('public.ai_consent_ledger') is not null as consent_v2_ledger_installed,
  to_regprocedure('public.withdraw_ai_personalization(boolean)') is not null
    as consent_v2_withdraw_installed;

do $payment_outcome_preflight$
declare
  v_has_attribution boolean;
  v_has_checkout_hash boolean;
  v_has_status boolean;
  v_has_customer boolean;
  v_has_paid_at boolean;
  v_has_payment_key boolean;
  v_has_listing_id boolean;
  v_has_listings boolean;
  v_has_coupon_column boolean;
  v_has_point_columns boolean;
  v_has_profile_points boolean;
  v_row record;
  v_count bigint;
begin
  if to_regclass('public.orders') is null then
    raise notice 'orders: not installed';
    return;
  end if;

  select
    count(*) filter (where column_name = 'status') = 1,
    count(*) filter (where column_name = 'customer_id') = 1,
    count(*) filter (where column_name = 'paid_at') = 1,
    count(*) filter (where column_name = 'payment_key') = 1,
    count(*) filter (where column_name = 'coupon_user_id') = 1,
    count(*) filter (where column_name = 'listing_id') = 1
  into v_has_status, v_has_customer, v_has_paid_at,
    v_has_payment_key, v_has_coupon_column, v_has_listing_id
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders';
  v_has_listings := to_regclass('public.listings') is not null;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'analytics_attribution' and data_type = 'jsonb'
  ) into v_has_attribution;
  if v_has_attribution and v_has_status then
    for v_row in execute $sql$
      select status, count(*) as rows
      from public.orders
      where analytics_attribution ? 'recommendation'
      group by status
      order by status
    $sql$ loop
      raise notice 'order recommendation blocker: status=%, rows=%',
        v_row.status, v_row.rows;
    end loop;
  elsif not v_has_attribution then
    raise notice 'orders.analytics_attribution: not installed';
  else
    raise notice 'orders.status: not installed; recommendation-by-status check skipped';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'checkout_token_hash'
  ) into v_has_checkout_hash;
  if v_has_checkout_hash and v_has_customer and v_has_status then
    execute $sql$
      select count(*)
      from public.orders
      where checkout_token_hash is not null
        and checkout_token_hash !~ '^[0-9a-f]{64}$'
    $sql$ into v_count;
    raise notice 'invalid checkout-token hashes (blocker): %', v_count;
    execute $sql$
      select count(*)
      from public.orders
      where customer_id is null and status = 'pending'
        and (checkout_token_hash is null
          or checkout_token_hash !~ '^[0-9a-f]{64}$')
    $sql$ into v_count;
  elsif v_has_customer and v_has_status then
    execute $sql$
      select count(*) from public.orders
      where customer_id is null and status = 'pending'
    $sql$ into v_count;
  else
    v_count := null;
    raise notice 'orders customer/status columns missing; guest-token check skipped';
  end if;
  if v_count is not null then
    raise notice 'legacy guest pending orders without a valid token (blocker): %',
      v_count;
  end if;

  if v_has_status and v_has_paid_at and v_has_payment_key then
    execute $sql$
      select count(*)
      from public.orders
      where (
            paid_at is null
            and (
              status not in ('pending', 'failed', 'canceled')
              or (status = 'canceled' and payment_key is not null)
            )
          )
         or (paid_at is not null and status in ('pending', 'failed'))
    $sql$ into v_count;
    raise notice 'inconsistent paid_at/status markers (blocker): %', v_count;
  else
    raise notice 'orders payment-marker columns missing; marker check skipped';
  end if;

  if v_has_listing_id and v_has_listings then
    execute 'select count(*) from public.orders where listing_id is null'
      into v_count;
    raise notice 'orders without immutable listing id (blocker): %', v_count;
    execute $sql$
      select count(*)
      from public.orders order_row
      left join public.listings listing on listing.id = order_row.listing_id
      where order_row.listing_id is not null and listing.id is null
    $sql$ into v_count;
    raise notice 'orders with orphan listing id (blocker): %', v_count;
    if v_has_paid_at then
      execute $sql$
        select count(*)
        from public.orders order_row
        join public.listings listing on listing.id = order_row.listing_id
        where order_row.paid_at is not null
          and lower(listing.status) <> 'sold'
      $sql$ into v_count;
      raise notice 'paid orders whose one-piece listing is not sold (blocker): %', v_count;
      execute $sql$
        select count(*) from (
          select listing_id
          from public.orders
          where paid_at is not null and listing_id is not null
          group by listing_id having count(*) > 1
        ) duplicate
      $sql$ into v_count;
      raise notice 'duplicate paid orders for one listing (blocker): %', v_count;
    end if;
    raise notice 'orders_listing_id_idx name collision (blocker if definition differs): %',
      to_regclass('public.orders_listing_id_idx') is not null;
    raise notice 'uq_orders_paid_listing name collision (blocker if definition differs): %',
      to_regclass('public.uq_orders_paid_listing') is not null;
    for v_row in execute $sql$
      select status, count(*) as rows
      from public.listings group by status order by status
    $sql$ loop
      raise notice 'listing status inventory: status=%, rows=%',
        v_row.status, v_row.rows;
    end loop;
  else
    raise notice 'orders.listing_id or listings missing; one-piece inventory checks skipped';
  end if;

  if v_has_status and v_has_customer and v_has_coupon_column then
    execute $sql$
      select count(*) from public.orders
      where status = 'pending' and coupon_user_id is not null
    $sql$ into v_count;
    raise notice 'legacy pending coupon orders needing reservation review (blocker): %',
      v_count;
    execute $sql$
      select count(*) from public.orders
      where customer_id is null and coupon_user_id is not null
    $sql$ into v_count;
    raise notice 'guest orders linked to coupons (blocker): %', v_count;
  else
    raise notice 'orders coupon columns missing; coupon checks skipped';
  end if;
  if v_has_status then
    execute $sql$
      select count(*) from public.orders where status = 'payment_review'
    $sql$ into v_count;
    raise notice 'payment_review orders requiring PortOne reconciliation: %', v_count;
  end if;

  if to_regclass('public.point_ledger') is not null then
    select count(*) = 5 into v_has_point_columns
    from information_schema.columns
    where table_schema = 'public' and table_name = 'point_ledger'
      and column_name in ('order_id', 'reason', 'user_id', 'delta', 'balance_after');
    v_has_point_columns := v_has_point_columns
      and v_has_customer and v_has_paid_at;
  else
    v_has_point_columns := false;
  end if;
  if v_has_point_columns then
    execute $sql$
      select count(*)
      from public.point_ledger ledger
      left join public.orders order_row on order_row.id = ledger.order_id
      where ledger.order_id is not null and order_row.id is null
    $sql$ into v_count;
    raise notice 'point-ledger rows referencing missing orders, all reasons (blocker): %',
      v_count;
    execute $sql$
      select count(*) from (
        select order_id
        from public.point_ledger
        where reason = 'order_earn' and order_id is not null
        group by order_id having count(*) > 1
      ) duplicate
    $sql$ into v_count;
    raise notice 'duplicate order_earn rewards (blocker): %', v_count;
    execute $sql$
      select count(*)
      from public.point_ledger ledger
      left join public.orders order_row on order_row.id = ledger.order_id
      where ledger.reason = 'order_earn'
        and (
          ledger.order_id is null
          or order_row.id is null
          or order_row.paid_at is null
          or ledger.user_id is distinct from order_row.customer_id
          or ledger.delta is null
          or ledger.delta < 0
          or ledger.balance_after is null
          or ledger.balance_after < 0
        )
    $sql$ into v_count;
    raise notice 'invalid order_earn provenance/balances (blocker): %', v_count;
    raise notice 'existing uq_point_ledger_order_earn name collision (blocker): %',
      to_regclass('public.uq_point_ledger_order_earn') is not null;
  elsif to_regclass('public.point_ledger') is not null then
    raise notice 'point_ledger required columns missing; provenance checks skipped';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'points' and udt_name = 'int4'
  ) into v_has_profile_points;
  if v_has_profile_points then
    execute 'select count(*) from public.profiles where points < 0'
      into v_count;
    raise notice 'negative profile point balances (blocker): %', v_count;
    raise notice 'authenticated has direct points UPDATE (informational; outcome trigger must still enforce RPC-only): %',
      has_column_privilege('authenticated', 'public.profiles', 'points', 'UPDATE');
  else
    raise notice 'profiles.points integer column: not installed';
  end if;
end
$payment_outcome_preflight$;

-- BLOCKER when consent_true, marketing_consent_true, or
-- duplicate_user_profiles is greater than zero. consent_not_true is
-- informational; an otherwise neutral non-consenting profile may remain.
-- v2 does not fabricate a new notice ledger from an old boolean checkbox.
select
  count(*) filter (where consent_personalization is true) as consent_true,
  count(*) filter (where consent_marketing is true) as marketing_consent_true,
  count(*) filter (where consent_personalization is not true) as consent_not_true,
  (
    select count(*)
    from (
      select user_id
      from public.customer_ai_profiles
      where user_id is not null
      group by user_id
      having count(*) > 1
    ) duplicate
  ) as duplicate_user_profiles
from public.customer_ai_profiles;

-- BLOCKER when greater than zero. A false legacy checkbox is not permission to
-- retain old identity, preference, budget, derived-trait, or summary payload.
-- Clean/review these rows explicitly before v2; otherwise a later grant would
-- silently reactivate old values.
select count(*) as legacy_profile_payload_rows
from public.customer_ai_profiles profile
where profile.consent_personalization is not true
  and (
    nullif(btrim(profile.phone), '') is not null
    or nullif(btrim(profile.name), '') is not null
    or nullif(btrim(profile.email), '') is not null
    or nullif(btrim(profile.region), '') is not null
    or coalesce(profile.preferred_brands, '{}') <> '{}'
    or coalesce(profile.preferred_models, '{}') <> '{}'
    or coalesce(profile.preferred_references, '{}') <> '{}'
    or profile.budget_min is not null
    or profile.budget_max is not null
    or profile.actual_budget_min is not null
    or profile.actual_budget_max is not null
    or nullif(btrim(profile.preferred_condition), '') is not null
    or nullif(btrim(profile.preferred_size), '') is not null
    or nullif(btrim(profile.preferred_color), '') is not null
    or nullif(btrim(profile.preferred_material), '') is not null
    or coalesce(profile.price_sensitivity, 50) <> 50
    or coalesce(profile.speed_preference, 50) <> 50
    or coalesce(profile.detail_preference, 50) <> 50
    or coalesce(profile.risk_tolerance, 50) <> 50
    or coalesce(profile.resale_importance, 50) <> 50
    or nullif(btrim(profile.customer_type), '') is not null
    or coalesce(nullif(btrim(profile.buying_stage), ''), 'unknown') <> 'unknown'
    or coalesce(profile.buy_probability, 0) <> 0
    or nullif(btrim(profile.ai_summary), '') is not null
  );

-- BLOCKER when any result is greater than zero. Historical sample/guest rows
-- need an explicit owner/delete decision; the migration never guesses.
select 'customer_ai_profiles.user_id_null' as check_name, count(*) as row_count
from public.customer_ai_profiles where user_id is null
union all
select 'ai_conversations.double_orphan', count(*)
from public.ai_conversations where user_id is null and profile_id is null
union all
select 'customer_events.double_orphan', count(*)
from public.customer_events where user_id is null and profile_id is null
union all
select 'ai_recommendation_logs.double_orphan', count(*)
from public.ai_recommendation_logs where user_id is null and profile_id is null
union all
select 'ai_alert_candidates.double_orphan', count(*)
from public.ai_alert_candidates where user_id is null and profile_id is null;

-- Conservative v2 path: every legacy personalized child count must be zero.
-- Preserve/migrate old data only through a separately reviewed consent-evidence
-- migration; do not relabel it as v2 consent.
select 'ai_conversations.legacy_rows' as check_name, count(*) as row_count
from public.ai_conversations
union all
select 'customer_watch_interests.legacy_rows', count(*)
from public.customer_watch_interests
union all
select 'customer_events.legacy_rows', count(*)
from public.customer_events
union all
select 'ai_customer_memories.legacy_rows', count(*)
from public.ai_customer_memories
union all
select 'ai_recommendation_logs.legacy_rows', count(*)
from public.ai_recommendation_logs
union all
select 'ai_alert_candidates.legacy_rows', count(*)
from public.ai_alert_candidates;

-- Optional local-AI queue. Any existing raw request is a migration blocker and
-- needs an explicit preserve/delete decision. The DO block is read-only.
do $optional_bridge_preflight$
declare
  v_rows bigint;
  v_null_users bigint;
  v_future bigint;
begin
  if to_regclass('public.ai_shop_chat_requests') is null then
    raise notice 'ai_shop_chat_requests: not installed';
    return;
  end if;
  execute $sql$
    select count(*),
           count(*) filter (where user_id is null),
           count(*) filter (where created_at > now() + interval '1 day')
    from public.ai_shop_chat_requests
  $sql$ into v_rows, v_null_users, v_future;
  raise notice 'ai_shop_chat_requests blockers: rows=%, null_users=%, future=%',
    v_rows, v_null_users, v_future;
end
$optional_bridge_preflight$;

-- NULL timestamps are retained conservatively from migration time. Future
-- timestamps are a blocker because they can evade the retention cutoff.
select 'customer_events.created_at_null' as check_name, count(*) as row_count
from public.customer_events where created_at is null
union all
select 'ai_conversations.created_at_null', count(*)
from public.ai_conversations where created_at is null
union all
select 'ai_recommendation_logs.created_at_null', count(*)
from public.ai_recommendation_logs where created_at is null
union all
select 'ai_alert_candidates.created_at_null', count(*)
from public.ai_alert_candidates where created_at is null
union all
select 'customer_events.future_timestamp', count(*)
from public.customer_events where created_at > now() + interval '1 day'
union all
select 'ai_conversations.future_timestamp', count(*)
from public.ai_conversations where created_at > now() + interval '1 day'
union all
select 'ai_recommendation_logs.future_timestamp', count(*)
from public.ai_recommendation_logs where created_at > now() + interval '1 day'
union all
select 'ai_alert_candidates.future_timestamp', count(*)
from public.ai_alert_candidates where created_at > now() + interval '1 day';

-- Existing AI attachment objects are a blocker. The current web client does
-- not upload them, and SQL row deletion is not a valid Storage-object delete.
-- Remove reviewed objects through the Supabase Storage API before rollout.
select
  bucket_id,
  count(*) as object_count,
  min(created_at) as oldest_object,
  max(created_at) as newest_object
from storage.objects
where bucket_id = 'ai-conversation-attachments'
group by bucket_id;

select
  table_name,
  total_rows,
  older_than_90_days
from (
  select 'customer_events'::text as table_name, count(*) as total_rows,
    count(*) filter (where created_at < now() - interval '90 days') as older_than_90_days
  from public.customer_events
  union all
  select 'ai_conversations', count(*),
    count(*) filter (where created_at < now() - interval '90 days')
  from public.ai_conversations
  union all
  select 'ai_recommendation_logs', count(*),
    count(*) filter (where created_at < now() - interval '90 days')
  from public.ai_recommendation_logs
  union all
  select 'ai_alert_candidates', count(*),
    count(*) filter (where created_at < now() - interval '90 days')
  from public.ai_alert_candidates
) retention;

-- Use these measured peaks to choose a bounded batch size. A daily cron whose
-- capacity is below daily ingestion will accumulate an expired backlog.
with daily as (
  select 'customer_events'::text as table_name, created_at::date as day, count(*) as rows
  from public.customer_events
  where created_at >= current_date - interval '30 days'
  group by created_at::date
  union all
  select 'ai_conversations', created_at::date, count(*)
  from public.ai_conversations
  where created_at >= current_date - interval '30 days'
  group by created_at::date
  union all
  select 'ai_recommendation_logs', created_at::date, count(*)
  from public.ai_recommendation_logs
  where created_at >= current_date - interval '30 days'
  group by created_at::date
  union all
  select 'ai_alert_candidates', created_at::date, count(*)
  from public.ai_alert_candidates
  where created_at >= current_date - interval '30 days'
  group by created_at::date
)
select
  table_name,
  coalesce(max(rows) filter (where day >= current_date - 6), 0) as max_daily_rows_7d,
  coalesce(max(rows), 0) as max_daily_rows_30d
from daily
group by table_name
order by table_name;

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
order by conrelid::regclass::text, conname;

-- BLOCKER when rls_enabled=false or an unexpected permissive policy appears.
select
  namespace.nspname as schema_name,
  relation.relname as table_name,
  relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as rls_forced
from pg_class relation
join pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in (
    'customer_ai_profiles', 'ai_conversations',
    'customer_watch_interests', 'customer_events',
    'ai_customer_memories', 'ai_recommendation_logs',
    'ai_alert_candidates'
  )
order by relation.relname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check,
  policyname not in (
    'cap_select', 'cap_insert', 'cap_update', 'cap_delete',
    'conv_select', 'conv_insert', 'cwi_select', 'cwi_write',
    'evt_select', 'evt_insert', 'mem_select', 'mem_write',
    'rec_select', 'rec_write', 'alert_select', 'alert_write'
  ) as unexpected_policy_blocker
from pg_policies
where schemaname = 'public'
  and tablename in (
    'customer_ai_profiles', 'ai_conversations',
    'customer_watch_interests', 'customer_events',
    'ai_customer_memories', 'ai_recommendation_logs',
    'ai_alert_candidates'
  )
order by tablename, policyname;

select
  table_schema,
  table_name,
  grantee,
  privilege_type
-- role_table_grants intentionally omits privileges inherited through PUBLIC.
-- table_privileges keeps those grants visible to the migration owner.
from information_schema.table_privileges
where table_schema in ('public', 'storage')
  and grantee in ('PUBLIC', 'anon', 'authenticated')
  and table_name in (
    'customer_ai_profiles', 'ai_conversations',
    'customer_watch_interests', 'customer_events',
    'ai_customer_memories', 'ai_recommendation_logs',
    'ai_alert_candidates', 'ai_shop_chat_requests', 'ai_shop_chat_logs',
    'ai_local_worker_auth', 'ai_paid_recommendation_attributions', 'objects'
  )
order by table_schema, table_name, grantee, privilege_type;

-- BLOCKER when this returns rows. Standard Supabase roles are normalized by
-- the migration; a project-specific grantee requires an explicit human review.
select
  namespace.nspname as table_schema,
  relation.relname as table_name,
  role_row.rolname as grantee,
  acl.privilege_type as privilege_type,
  true as unexpected_custom_acl_blocker
from pg_class relation
join pg_namespace namespace on namespace.oid = relation.relnamespace
cross join lateral aclexplode(
  coalesce(relation.relacl, acldefault('r', relation.relowner))
) acl
join pg_roles role_row on role_row.oid = acl.grantee
where namespace.nspname in ('public', 'storage')
  and relation.relname in (
    'customer_ai_profiles', 'ai_conversations',
    'customer_watch_interests', 'customer_events',
    'ai_customer_memories', 'ai_recommendation_logs',
    'ai_alert_candidates', 'ai_consent_ledger',
    'ai_shop_chat_requests', 'ai_shop_chat_logs', 'ai_local_worker_auth',
    'ai_paid_recommendation_attributions', 'objects'
  )
  and acl.grantee <> relation.relowner
  and role_row.rolname not in (
    current_user, 'postgres', 'supabase_admin',
    'anon', 'authenticated', 'service_role'
  )
order by table_schema, table_name, grantee, privilege_type;

select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- BLOCKER when true: update the canonical local_ai_bridge.sql first. The old
-- audit RPC used profile -> auth FK lock order and can deadlock account delete.
select
  to_regprocedure('public.log_shop_ai_turn(jsonb)') is not null
  and position(
    'ai_lock_auth_user' in coalesce(
      pg_get_functiondef(to_regprocedure('public.log_shop_ai_turn(jsonb)')),
      ''
    )
  ) = 0 as legacy_local_bridge_lock_order_blocker;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_userbyid(p.proowner) as owner,
  p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'log_shop_ai_turn',
    'submit_shop_ai_chat',
    'get_shop_ai_chat_result',
    'withdraw_ai_personalization',
    'ai_purge_expired_personalization_data'
  )
order by p.proname;

-- BLOCKER if the zero-argument historical overload is present. A scheduled
-- call to it could bypass the bounded v2 function.
select
  to_regprocedure('public.ai_purge_expired_personalization_data()') is not null
    as old_zero_arg_purge_exists,
  to_regprocedure('public.ai_purge_expired_personalization_data(integer)') is not null
    as bounded_integer_purge_exists;

-- Run only when pg_cron_installed=true.
-- select jobid, jobname, schedule, command, username, active
-- from cron.job
-- where jobname = 'bellore-ai-personalization-retention'
-- order by jobid;
