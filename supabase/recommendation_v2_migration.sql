-- BELLORE Recommendation v2 · consent-enforced migration
-- Date: 2026-08-22
--
-- Run only after supabase/recommendation_v2_preflight.sql returns no blockers.
-- This is intentionally separate from ai_advisor.sql: do not rerun the old
-- monolithic bootstrap or its historical sample-data block in production.
--
-- The migration does NOT register pg_cron. Job owner/timezone and the first
-- manual purge must be verified before scheduling (see verification script).

begin;

do $precondition$
declare
  v_missing text[];
  v_found boolean := false;
begin
  if current_user in ('anon', 'authenticated', 'service_role') then
    raise exception 'RECOMMENDATION_V2_DATABASE_OWNER_REQUIRED';
  end if;

  select array_agg(required.name order by required.name)
  into v_missing
  from (
    values
      ('public.customer_ai_profiles'),
      ('public.ai_conversations'),
      ('public.customer_watch_interests'),
      ('public.customer_events'),
      ('public.ai_customer_memories'),
      ('public.ai_recommendation_logs'),
      ('public.ai_alert_candidates'),
      ('storage.objects')
  ) as required(name)
  where to_regclass(required.name) is null;

  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'RECOMMENDATION_V2_MISSING_TABLES: %', array_to_string(v_missing, ', ');
  end if;

  -- Freeze the complete ownership graph before inspecting legacy state. The
  -- migration later needs ACCESS EXCLUSIVE for ALTER/POLICY work anyway; taking
  -- it now removes the precheck -> DDL TOCTOU window and lock-upgrade cycle.
  -- auth.users comes first to match account deletion and every v2 write path.
  lock table
    auth.users,
    public.customer_ai_profiles,
    public.ai_conversations,
    public.customer_watch_interests,
    public.customer_events,
    public.ai_customer_memories,
    public.ai_recommendation_logs,
    public.ai_alert_candidates,
    storage.objects
  in access exclusive mode;

  if to_regclass('public.ai_shop_chat_requests') is not null then
    execute 'lock table public.ai_shop_chat_requests in access exclusive mode';
  end if;

  if exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'ai-conversation-attachments'
  ) then
    raise exception 'RECOMMENDATION_V2_AI_ATTACHMENT_REVIEW_REQUIRED';
  end if;

  if exists (
    select 1
    from public.customer_ai_profiles
    where user_id is null
  ) then
    raise exception 'RECOMMENDATION_V2_ORPHAN_PROFILE_REVIEW_REQUIRED';
  end if;

  if exists (
    select 1
    from public.customer_ai_profiles
    group by user_id
    having count(*) > 1
  ) then
    raise exception 'RECOMMENDATION_V2_DUPLICATE_PROFILE_REVIEW_REQUIRED';
  end if;

  if exists (
    select 1 from public.ai_conversations where user_id is null and profile_id is null
    union all
    select 1 from public.customer_events where user_id is null and profile_id is null
    union all
    select 1 from public.ai_recommendation_logs where user_id is null and profile_id is null
    union all
    select 1 from public.ai_alert_candidates where user_id is null and profile_id is null
  ) then
    raise exception 'RECOMMENDATION_V2_ORPHAN_CHILD_REVIEW_REQUIRED';
  end if;

  if exists (
    select 1 from public.customer_events where created_at > now() + interval '1 day'
    union all
    select 1 from public.ai_conversations where created_at > now() + interval '1 day'
    union all
    select 1 from public.ai_recommendation_logs where created_at > now() + interval '1 day'
    union all
    select 1 from public.ai_alert_candidates where created_at > now() + interval '1 day'
  ) then
    raise exception 'RECOMMENDATION_V2_FUTURE_TIMESTAMP_REVIEW_REQUIRED';
  end if;

  -- Never relabel an old checkbox as consent to the v2 notice. This migration
  -- accepts only the conservative path: set every old profile false, review or
  -- delete its old personalized children, then ask the customer for v2 consent.
  -- A separate, independently reviewed migration is required to preserve any
  -- legacy consent; this file never fabricates that evidence.
  if exists (
    select 1 from public.customer_ai_profiles
    where consent_personalization is true
  ) then
    raise exception 'RECOMMENDATION_V2_LEGACY_CONSENT_REVIEW_REQUIRED';
  end if;

  -- Marketing consent is a separate purpose. An old boolean without its exact
  -- notice/source evidence must not survive into the RPC-only v2 profile.
  if exists (
    select 1 from public.customer_ai_profiles
    where consent_marketing is true
  ) then
    raise exception 'RECOMMENDATION_V2_LEGACY_MARKETING_CONSENT_REVIEW_REQUIRED';
  end if;

  -- A false checkbox also cannot carry old personal/derived payload forward.
  -- Otherwise grant_ai_personalization_consent() would reactivate it without a
  -- new collection event. Operators must review and reset these rows first.
  if exists (
    select 1
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
      )
  ) then
    raise exception 'RECOMMENDATION_V2_LEGACY_PROFILE_PAYLOAD_REVIEW_REQUIRED';
  end if;

  -- Old personalized children require an explicit preserve/delete decision.
  -- This migration never guesses whether an old row was lawfully collected,
  -- nor silently backfills a possibly mismatched owner/profile pair.
  if exists (
    select 1 from public.ai_conversations
    union all
    select 1 from public.customer_watch_interests
    union all
    select 1 from public.customer_events
    union all
    select 1 from public.ai_customer_memories
    union all
    select 1 from public.ai_recommendation_logs
    union all
    select 1 from public.ai_alert_candidates
  ) then
    raise exception 'RECOMMENDATION_V2_LEGACY_CHILD_DATA_REVIEW_REQUIRED';
  end if;

  if to_regclass('public.ai_shop_chat_requests') is not null then
    execute 'select exists (select 1 from public.ai_shop_chat_requests)'
      into v_found;
    if v_found then
      raise exception 'RECOMMENDATION_V2_LEGACY_SHOP_CHAT_REVIEW_REQUIRED';
    end if;
  end if;

  -- The legacy audit RPC locked a profile before its child INSERT acquired the
  -- auth.users FK lock. Account deletion locks those rows in the opposite
  -- order, so require the canonical bridge upgrade before this migration.
  if to_regprocedure('public.log_shop_ai_turn(jsonb)') is not null
     and position(
       'ai_lock_auth_user' in
       pg_get_functiondef(to_regprocedure('public.log_shop_ai_turn(jsonb)'))
     ) = 0 then
    raise exception 'RECOMMENDATION_V2_LOCAL_BRIDGE_UPGRADE_REQUIRED';
  end if;

  -- PostgreSQL combines permissive policies with OR. An unknown legacy policy
  -- can silently reopen writes, so stop for human review instead of ignoring it.
  if exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename in (
        'customer_ai_profiles', 'ai_conversations',
        'customer_watch_interests', 'customer_events',
        'ai_customer_memories', 'ai_recommendation_logs',
        'ai_alert_candidates'
      )
      and policy.policyname not in (
        'cap_select', 'cap_insert', 'cap_update', 'cap_delete',
        'conv_select', 'conv_insert', 'cwi_select', 'cwi_write',
        'evt_select', 'evt_insert', 'mem_select', 'mem_write',
        'rec_select', 'rec_write', 'alert_select', 'alert_write'
      )
  ) then
    raise exception 'RECOMMENDATION_V2_UNKNOWN_POLICY_REVIEW_REQUIRED';
  end if;

  -- A historical zero-argument retention job would keep calling the old,
  -- unbounded overload after this migration. It must be unscheduled first.
  if to_regclass('cron.job') is not null then
    execute $sql$
      select exists (
        select 1 from cron.job
        where command ilike '%ai_purge_expired_personalization_data%'
      )
    $sql$ into v_found;
    if v_found then
      raise exception 'RECOMMENDATION_V2_EXISTING_PURGE_JOB_REVIEW_REQUIRED';
    end if;
  end if;
end
$precondition$;

alter table public.customer_ai_profiles alter column user_id set not null;
drop index if exists public.uq_cap_user;
create unique index uq_cap_user on public.customer_ai_profiles (user_id);

-- Repair legacy NULL collection timestamps before consent triggers exist.
-- SQL Editor/admin maintenance has no auth.uid(), so doing this after the
-- child-write guard is installed would correctly reject the backfill.
update public.customer_events set created_at = clock_timestamp() where created_at is null;
update public.ai_conversations set created_at = clock_timestamp() where created_at is null;
update public.ai_recommendation_logs set created_at = clock_timestamp() where created_at is null;
update public.ai_alert_candidates set created_at = clock_timestamp() where created_at is null;

alter table public.customer_events alter column created_at set not null;
alter table public.ai_conversations alter column created_at set not null;
alter table public.ai_recommendation_logs alter column created_at set not null;
alter table public.ai_alert_candidates alter column created_at set not null;

-- Do not trust a historical bootstrap to have left RLS enabled.
alter table public.customer_ai_profiles enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.customer_watch_interests enable row level security;
alter table public.customer_events enable row level security;
alter table public.ai_customer_memories enable row level security;
alter table public.ai_recommendation_logs enable row level security;
alter table public.ai_alert_candidates enable row level security;

-- Minimal proof ledger. It is not a behavior log and is not part of the
-- 90-day raw-event purge. Rows are removed with the account.
create table if not exists public.ai_consent_ledger (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  profile_id      uuid references public.customer_ai_profiles(id) on delete set null,
  purpose         text not null check (purpose in ('personalization', 'marketing')),
  action          text not null check (action in ('granted', 'declined', 'withdrawn')),
  notice_version  text not null,
  source          text not null,
  occurred_at     timestamptz not null default clock_timestamp()
);

create index if not exists idx_ai_consent_ledger_user_time
  on public.ai_consent_ledger (user_id, occurred_at desc);
create index if not exists idx_ai_consent_ledger_profile
  on public.ai_consent_ledger (profile_id)
  where profile_id is not null;

alter table public.ai_consent_ledger enable row level security;
drop policy if exists ai_consent_ledger_select on public.ai_consent_ledger;
create policy ai_consent_ledger_select on public.ai_consent_ledger
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));

revoke all on table public.ai_consent_ledger from public, anon, authenticated;
grant select on table public.ai_consent_ledger to authenticated;

-- Every path that can later touch a profile/child row takes the auth parent
-- first. This matches auth account deletion (auth user -> profile -> child)
-- and prevents FK/cascade deadlocks.
create or replace function public.ai_lock_auth_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  perform 1
  from auth.users auth_user
  where auth_user.id = p_user_id
  for key share;
  if not found then
    raise exception 'AUTH_USER_NOT_FOUND' using errcode = '23503';
  end if;
end
$function$;

revoke all on function public.ai_lock_auth_user(uuid)
  from public, anon, authenticated;

-- Profile creation and consent transitions are RPC-only. Backend/service/admin
-- profile enrichment may bypass the end-user owner check, but never the active
-- consent check. This prevents a stale AI job from recreating derived traits
-- after withdrawal.
create or replace function public.ai_guard_profile_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_backend boolean :=
    current_user in ('postgres', 'service_role', 'supabase_admin')
    or public.is_admin_uid(v_actor);
  v_internal_mode text := current_setting('bellore.ai_consent_rpc', true);
  v_internal_authorized boolean :=
    current_user not in ('anon', 'authenticated', 'service_role');
begin
  if tg_op = 'INSERT' then
    if not (v_internal_authorized and v_internal_mode = 'grant') then
      raise exception 'AI_PROFILE_CREATE_RPC_REQUIRED' using errcode = '42501';
    end if;
    if new.user_id is null then
      raise exception 'AI_PROFILE_OWNER_REQUIRED' using errcode = '23502';
    end if;
    new.consent_personalization := true;
    new.consent_marketing := false;
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'AI_PROFILE_OWNER_IMMUTABLE' using errcode = '42501';
  end if;

  if v_internal_authorized and v_internal_mode = 'grant' then
    if new.consent_personalization is not true
       or new.consent_marketing is distinct from old.consent_marketing then
      raise exception 'AI_CONSENT_GRANT_INVALID' using errcode = '42501';
    end if;
    return new;
  end if;

  if v_internal_authorized and v_internal_mode = 'withdraw' then
    if new.consent_personalization is not false
       or new.consent_marketing is distinct from old.consent_marketing then
      raise exception 'AI_CONSENT_WITHDRAW_INVALID' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.consent_personalization is distinct from old.consent_personalization
     or new.consent_marketing is distinct from old.consent_marketing then
    raise exception 'AI_CONSENT_RPC_REQUIRED' using errcode = '42501';
  end if;

  if old.consent_personalization is not true then
    raise exception 'AI_PERSONALIZATION_CONSENT_REQUIRED' using errcode = '42501';
  end if;
  if not v_backend and (v_actor is null or old.user_id is distinct from v_actor) then
    raise exception 'AI_PROFILE_OWNER_MISMATCH' using errcode = '42501';
  end if;
  return new;
end
$function$;

revoke all on function public.ai_guard_profile_write()
  from public, anon, authenticated;

drop trigger if exists trg_ai_guard_profile_write on public.customer_ai_profiles;
create trigger trg_ai_guard_profile_write
before insert or update on public.customer_ai_profiles
for each row execute function public.ai_guard_profile_write();

-- Direct profile INSERT is never granted. Content UPDATE is allowed only while
-- consent is active; grant/withdrawal use the audited RPCs below.
revoke update on table public.customer_ai_profiles from authenticated;
grant update (
  phone, name, email, region,
  preferred_brands, preferred_models, preferred_references,
  budget_min, budget_max, actual_budget_min, actual_budget_max,
  preferred_condition, preferred_size, preferred_color, preferred_material,
  price_sensitivity, speed_preference, detail_preference, risk_tolerance,
  resale_importance, customer_type, buying_stage, buy_probability, ai_summary
) on public.customer_ai_profiles to authenticated;

create or replace function public.grant_ai_personalization_consent(
  p_notice_version text,
  p_source text,
  p_marketing_selected boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_notice_version is distinct from 'personalization-v2-20260822' then
    raise exception 'CONSENT_NOTICE_VERSION_MISMATCH' using errcode = '22023';
  end if;
  if p_source is distinct from 'ai_concierge' then
    raise exception 'CONSENT_SOURCE_INVALID' using errcode = '22023';
  end if;
  if coalesce(p_marketing_selected, false) then
    raise exception 'SEPARATE_MARKETING_CONSENT_REQUIRED' using errcode = '22023';
  end if;

  perform public.ai_lock_auth_user(v_user_id);
  perform set_config('bellore.ai_consent_rpc', 'grant', true);

  select profile.id into v_profile_id
  from public.customer_ai_profiles profile
  where profile.user_id = v_user_id
  for update;

  if v_profile_id is null then
    insert into public.customer_ai_profiles (
      user_id, consent_personalization, consent_marketing
    ) values (
      v_user_id, true, false
    )
    returning id into v_profile_id;
  else
    update public.customer_ai_profiles
    set consent_personalization = true
    where id = v_profile_id;
  end if;

  insert into public.ai_consent_ledger (
    user_id, profile_id, purpose, action, notice_version, source, occurred_at
  ) values
    (v_user_id, v_profile_id, 'personalization', 'granted', p_notice_version, p_source, v_now);

  return jsonb_build_object(
    'personalization_enabled', true,
    'marketing_selected', false,
    'profile_id', v_profile_id,
    'notice_version', p_notice_version,
    'granted_at', v_now
  );
end
$function$;

revoke all on function public.grant_ai_personalization_consent(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.grant_ai_personalization_consent(text, text, boolean)
  to authenticated;

-- INSERT takes the same profile lock as withdrawal, closing the new-row race.
-- UPDATE already owns its child row; it checks consent without a profile lock
-- so withdrawal's profile→child delete order cannot deadlock. If UPDATE wins,
-- withdrawal subsequently deletes it; if withdrawal wins, UPDATE sees no row.
create or replace function public.ai_guard_personalization_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_locked_owner uuid;
  v_privileged boolean :=
    coalesce(auth.jwt()->>'role', '') = 'service_role'
    or public.is_admin_uid(v_actor);
begin
  if new.profile_id is null then
    raise exception 'AI_PROFILE_REQUIRED' using errcode = '23502';
  end if;

  if tg_op = 'INSERT' then
    select profile.user_id into v_owner
    from public.customer_ai_profiles profile
    where profile.id = new.profile_id;
    if v_owner is null then
      raise exception 'AI_PROFILE_NOT_FOUND' using errcode = '23503';
    end if;
    if new.user_id is not null and new.user_id is distinct from v_owner then
      raise exception 'AI_CHILD_OWNER_MISMATCH' using errcode = '42501';
    end if;
    if not v_privileged and (v_actor is null or v_owner is distinct from v_actor) then
      raise exception 'AI_PROFILE_OWNER_MISMATCH' using errcode = '42501';
    end if;

    perform public.ai_lock_auth_user(v_owner);
    select profile.user_id into v_locked_owner
    from public.customer_ai_profiles profile
    where profile.id = new.profile_id
      and profile.user_id = v_owner
      and profile.consent_personalization is true
    for update;
    if v_locked_owner is null then
      raise exception 'AI_PERSONALIZATION_CONSENT_REQUIRED' using errcode = '42501';
    end if;
    v_owner := v_locked_owner;
  else
    if new.profile_id is distinct from old.profile_id
       or new.user_id is distinct from old.user_id then
      raise exception 'AI_CHILD_OWNER_IMMUTABLE' using errcode = '42501';
    end if;
    select profile.user_id into v_owner
    from public.customer_ai_profiles profile
    where profile.id = old.profile_id
      and profile.user_id = old.user_id
      and profile.consent_personalization is true;
  end if;

  if v_owner is null then
    raise exception 'AI_PERSONALIZATION_CONSENT_REQUIRED' using errcode = '42501';
  end if;
  if not v_privileged and (v_actor is null or v_owner is distinct from v_actor) then
    raise exception 'AI_PROFILE_OWNER_MISMATCH' using errcode = '42501';
  end if;

  new.user_id := v_owner;
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
  else
    -- Retention timestamps are server-owned. A customer cannot move an old
    -- event into the future to evade the 90-day purge.
    new.created_at := old.created_at;
  end if;
  return new;
end
$function$;

revoke all on function public.ai_guard_personalization_write()
  from public, anon, authenticated;

do $triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'ai_conversations',
    'customer_watch_interests',
    'customer_events',
    'ai_customer_memories',
    'ai_recommendation_logs',
    'ai_alert_candidates'
  ]
  loop
    execute format('drop trigger if exists trg_ai_consent_write on public.%I', v_table);
    execute format(
      'create trigger trg_ai_consent_write before insert or update on public.%I
       for each row execute function public.ai_guard_personalization_write()',
      v_table
    );
  end loop;
end
$triggers$;

-- Optional local-AI bridge hardening. The canonical local_ai_bridge.sql uses
-- the same rules; this block upgrades an already-installed empty legacy queue.
create or replace function public.ai_guard_shop_chat_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_profile_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform public.ai_lock_auth_user(v_actor);
  select profile.id into v_profile_id
  from public.customer_ai_profiles profile
  where profile.user_id = v_actor
    and profile.consent_personalization is true
  for update;
  if v_profile_id is null then
    raise exception 'AI_PERSONALIZATION_CONSENT_REQUIRED' using errcode = '42501';
  end if;

  new.user_id := v_actor;
  new.profile_id := v_profile_id;
  new.created_at := clock_timestamp();
  return new;
end
$function$;

revoke all on function public.ai_guard_shop_chat_request_insert()
  from public, anon, authenticated;

create or replace function public.ai_guard_shop_chat_request_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.user_id is distinct from old.user_id
     or new.profile_id is distinct from old.profile_id
     or new.client_token is distinct from old.client_token
     or new.message is distinct from old.message
     or new.candidate_list is distinct from old.candidate_list then
    raise exception 'AI_SHOP_CHAT_IMMUTABLE_FIELDS' using errcode = '42501';
  end if;

  perform 1
  from public.customer_ai_profiles profile
  where profile.id = old.profile_id
    and profile.user_id = old.user_id
    and profile.consent_personalization is true;
  if not found then
    raise exception 'AI_PERSONALIZATION_CONSENT_REQUIRED' using errcode = '42501';
  end if;

  new.created_at := old.created_at;
  return new;
end
$function$;

revoke all on function public.ai_guard_shop_chat_request_update()
  from public, anon, authenticated;

do $optional_bridge$
declare
  v_constraint record;
begin
  if to_regclass('public.ai_shop_chat_requests') is null then
    return;
  end if;

  alter table public.ai_shop_chat_requests enable row level security;
  alter table public.ai_shop_chat_requests add column if not exists profile_id uuid;

  for v_constraint in
    select constraint_row.conname
    from pg_constraint constraint_row
    join pg_attribute attribute_row
      on attribute_row.attrelid = constraint_row.conrelid
     and attribute_row.attnum = constraint_row.conkey[1]
    where constraint_row.contype = 'f'
      and constraint_row.conrelid = 'public.ai_shop_chat_requests'::regclass
      and array_length(constraint_row.conkey, 1) = 1
      and attribute_row.attname in ('user_id', 'profile_id')
  loop
    execute format(
      'alter table public.ai_shop_chat_requests drop constraint %I',
      v_constraint.conname
    );
  end loop;

  alter table public.ai_shop_chat_requests
    add constraint ai_shop_chat_requests_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade,
    add constraint ai_shop_chat_requests_profile_id_fkey
      foreign key (profile_id) references public.customer_ai_profiles(id) on delete cascade;
  alter table public.ai_shop_chat_requests alter column user_id set not null;
  alter table public.ai_shop_chat_requests alter column profile_id set not null;
  alter table public.ai_shop_chat_requests alter column created_at set not null;

  create index if not exists idx_ai_shop_chat_user_created
    on public.ai_shop_chat_requests (user_id, created_at desc);
  create index if not exists idx_ai_shop_chat_profile
    on public.ai_shop_chat_requests (profile_id);

  drop trigger if exists trg_ai_shop_chat_consent_insert on public.ai_shop_chat_requests;
  create trigger trg_ai_shop_chat_consent_insert
    before insert on public.ai_shop_chat_requests
    for each row execute function public.ai_guard_shop_chat_request_insert();
  drop trigger if exists trg_ai_shop_chat_consent_update on public.ai_shop_chat_requests;
  create trigger trg_ai_shop_chat_consent_update
    before update on public.ai_shop_chat_requests
    for each row execute function public.ai_guard_shop_chat_request_update();

  revoke all on table public.ai_shop_chat_requests from public, anon, authenticated;
  if to_regclass('public.ai_shop_chat_logs') is not null then
    alter table public.ai_shop_chat_logs enable row level security;
    revoke all on table public.ai_shop_chat_logs from public, anon, authenticated;
  end if;
  if to_regclass('public.ai_local_worker_auth') is not null then
    alter table public.ai_local_worker_auth enable row level security;
    revoke all on table public.ai_local_worker_auth from public, anon, authenticated;
  end if;

  if to_regprocedure('public.verify_local_ai_worker(text,text)') is not null then
    alter function public.verify_local_ai_worker(text, text) set search_path = '';
    revoke all on function public.verify_local_ai_worker(text, text)
      from public, anon, authenticated;
  end if;

  if to_regprocedure('public.submit_shop_ai_chat(jsonb)') is not null then
    alter function public.submit_shop_ai_chat(jsonb) set search_path = '';
    revoke all on function public.submit_shop_ai_chat(jsonb)
      from public, anon, authenticated;
    grant execute on function public.submit_shop_ai_chat(jsonb) to authenticated;
  end if;

  if to_regprocedure('public.get_shop_ai_runtime_status()') is not null then
    alter function public.get_shop_ai_runtime_status() set search_path = '';
    revoke all on function public.get_shop_ai_runtime_status()
      from public, anon, authenticated;
    grant execute on function public.get_shop_ai_runtime_status()
      to anon, authenticated;
  end if;

  if to_regprocedure('public.get_shop_ai_knowledge(text,text)') is not null then
    alter function public.get_shop_ai_knowledge(text, text) set search_path = '';
    revoke all on function public.get_shop_ai_knowledge(text, text)
      from public, anon, authenticated;
    grant execute on function public.get_shop_ai_knowledge(text, text)
      to anon, authenticated;
  end if;

  if to_regprocedure('public.get_shop_ai_chat_result(uuid)') is not null then
    execute $ddl$
      create or replace function public.get_shop_ai_chat_result(p_client_token uuid)
      returns table(
        status text,
        reply text,
        recommended_listing_ids text[],
        requires_human boolean
      )
      language sql
      security definer
      stable
      set search_path = ''
      as $body$
        select
          request.status,
          case
            when request.status in ('completed','safe_fallback')
            then request.ai_response->>'reply'
            else null
          end,
          case
            when request.status in ('completed','safe_fallback')
              and jsonb_typeof(request.ai_response->'recommended_listing_ids') = 'array'
            then array(
              select jsonb_array_elements_text(request.ai_response->'recommended_listing_ids')
            )
            else '{}'::text[]
          end,
          true
        from public.ai_shop_chat_requests request
        where request.client_token = p_client_token
          and request.user_id = auth.uid()
          and exists (
            select 1
            from public.customer_ai_profiles profile
            where profile.id = request.profile_id
              and profile.user_id = auth.uid()
              and profile.consent_personalization is true
          )
        limit 1
      $body$;
    $ddl$;
    revoke all on function public.get_shop_ai_chat_result(uuid)
      from public, anon, authenticated;
    grant execute on function public.get_shop_ai_chat_result(uuid) to authenticated;
  end if;

  if to_regprocedure('public.claim_shop_ai_chat(text,text)') is not null then
    execute $claim_ddl$
      create or replace function public.claim_shop_ai_chat(
        p_worker_name text,
        p_worker_secret text
      )
      returns table(request_id uuid, message text, candidate_list jsonb)
      language plpgsql
      security definer
      set search_path = ''
      as $claim_body$
      declare
        v_request_id uuid;
        v_profile_id uuid;
      begin
        if not public.verify_local_ai_worker(p_worker_name, p_worker_secret) then
          raise exception 'worker_unauthorized';
        end if;

        delete from public.ai_shop_chat_requests queued
        where queued.status in ('submitted', 'processing')
          and not exists (
            select 1
            from public.customer_ai_profiles profile
            where profile.id = queued.profile_id
              and profile.user_id = queued.user_id
              and profile.consent_personalization is true
          );

        select queued.id, queued.profile_id
        into v_request_id, v_profile_id
        from public.ai_shop_chat_requests queued
        join public.customer_ai_profiles profile
          on profile.id = queued.profile_id
         and profile.user_id = queued.user_id
         and profile.consent_personalization is true
        where queued.status = 'submitted'
           or (
             queued.status = 'processing'
             and queued.processing_started_at < now() - interval '15 minutes'
           )
        order by queued.created_at asc
        limit 1;
        if v_request_id is null then
          update public.ai_local_worker_auth
          set last_seen_at = now()
          where worker_name = p_worker_name;
          return;
        end if;

        perform 1
        from public.customer_ai_profiles profile
        where profile.id = v_profile_id
          and profile.consent_personalization is true
        for update;
        if not found then
          update public.ai_local_worker_auth
          set last_seen_at = now()
          where worker_name = p_worker_name;
          return;
        end if;

        return query
        update public.ai_shop_chat_requests request
        set status = 'processing', processing_started_at = now()
        where request.id = v_request_id
          and request.profile_id = v_profile_id
          and (
            request.status = 'submitted'
            or (
              request.status = 'processing'
              and request.processing_started_at < now() - interval '15 minutes'
            )
          )
        returning request.id, request.message, request.candidate_list;

        update public.ai_local_worker_auth
        set last_seen_at = now()
        where worker_name = p_worker_name;
      end
      $claim_body$;
    $claim_ddl$;
    revoke all on function public.claim_shop_ai_chat(text, text)
      from public, anon, authenticated;
    grant execute on function public.claim_shop_ai_chat(text, text)
      to anon, authenticated;
  end if;

  if to_regprocedure('public.complete_shop_ai_chat(text,text,uuid,jsonb,text,text[],text[],boolean,integer)') is not null then
    execute $complete_ddl$
      create or replace function public.complete_shop_ai_chat(
        p_worker_name text,
        p_worker_secret text,
        p_request_id uuid,
        p_response jsonb,
        p_model_name text,
        p_grounding_sources text[],
        p_validation_errors text[],
        p_fallback_used boolean,
        p_latency_ms integer
      )
      returns boolean
      language plpgsql
      security definer
      set search_path = ''
      as $complete_body$
      declare
        v_profile_id uuid;
      begin
        if not public.verify_local_ai_worker(p_worker_name, p_worker_secret) then
          raise exception 'worker_unauthorized';
        end if;

        select request.profile_id into v_profile_id
        from public.ai_shop_chat_requests request
        where request.id = p_request_id
          and request.status = 'processing';
        if v_profile_id is null then
          return false;
        end if;

        perform 1
        from public.customer_ai_profiles profile
        where profile.id = v_profile_id
          and profile.consent_personalization is true
        for update;
        if not found then
          return false;
        end if;

        perform 1
        from public.ai_shop_chat_requests request
        where request.id = p_request_id
          and request.profile_id = v_profile_id
          and request.status = 'processing'
        for update;
        if not found then
          return false;
        end if;

        if not public.validate_shop_ai_response(p_response) then
          raise exception 'invalid_ai_response';
        end if;

        if exists (
          select 1
          from jsonb_array_elements_text(p_response->'recommended_listing_ids') recommended(id)
          where not exists (
            select 1
            from public.ai_shop_chat_requests request,
                 jsonb_array_elements(request.candidate_list) candidate
            where request.id = p_request_id
              and candidate->>'id' = recommended.id
          )
        ) then
          raise exception 'ungrounded_listing_id';
        end if;

        update public.ai_shop_chat_requests
        set ai_response = p_response,
            ai_model = left(p_model_name, 120),
            ai_grounding_sources = coalesce(p_grounding_sources, '{}'),
            ai_validation_errors = coalesce(p_validation_errors, '{}'),
            ai_fallback_used = coalesce(p_fallback_used, false),
            ai_latency_ms = p_latency_ms,
            processing_started_at = null,
            status = case when coalesce(p_fallback_used, false)
                     then 'safe_fallback' else 'completed' end
        where id = p_request_id
          and profile_id = v_profile_id
          and status = 'processing';
        if not found then
          return false;
        end if;

        update public.ai_local_worker_auth
        set last_seen_at = now()
        where worker_name = p_worker_name;

        insert into public.ai_shop_chat_logs (
          request_id, model_name, grounding_sources, validation_passed,
          validation_errors, fallback_used, latency_ms
        ) values (
          p_request_id, left(p_model_name, 120), coalesce(p_grounding_sources, '{}'),
          cardinality(coalesce(p_validation_errors, '{}')) = 0,
          coalesce(p_validation_errors, '{}'), coalesce(p_fallback_used, false), p_latency_ms
        );
        return true;
      end
      $complete_body$;
    $complete_ddl$;
    revoke all on function public.complete_shop_ai_chat(
      text, text, uuid, jsonb, text, text[], text[], boolean, integer
    ) from public, anon, authenticated;
    grant execute on function public.complete_shop_ai_chat(
      text, text, uuid, jsonb, text, text[], text[], boolean, integer
    ) to anon, authenticated;
  end if;
end
$optional_bridge$;

drop function if exists public.ai_profile_owned_and_consented(uuid, uuid);
create or replace function public.ai_profile_owned_and_consented(
  p_profile_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select exists (
    select 1
    from public.customer_ai_profiles profile
    where profile.id = p_profile_id
      and profile.user_id = auth.uid()
      and profile.consent_personalization is true
  );
$function$;

revoke all on function public.ai_profile_owned_and_consented(uuid)
  from public, anon, authenticated;
grant execute on function public.ai_profile_owned_and_consented(uuid)
  to authenticated;

-- Recreate every browser-facing policy, including reads. Checking names alone
-- is insufficient because an expected legacy name may contain a broader rule.
drop policy if exists cap_select on public.customer_ai_profiles;
create policy cap_select on public.customer_ai_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));
drop policy if exists cap_insert on public.customer_ai_profiles;
drop policy if exists cap_update on public.customer_ai_profiles;
create policy cap_update on public.customer_ai_profiles
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin_uid(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin_uid(auth.uid()));
drop policy if exists cap_delete on public.customer_ai_profiles;
create policy cap_delete on public.customer_ai_profiles
  for delete to authenticated
  using (public.is_admin_uid(auth.uid()));

drop policy if exists conv_select on public.ai_conversations;
create policy conv_select on public.ai_conversations
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));

drop policy if exists conv_insert on public.ai_conversations;
create policy conv_insert on public.ai_conversations
  for insert to authenticated
  with check (
    public.is_admin_uid(auth.uid())
    or (
      user_id = auth.uid()
      and public.ai_profile_owned_and_consented(profile_id)
    )
  );

drop policy if exists cwi_select on public.customer_watch_interests;
create policy cwi_select on public.customer_watch_interests
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));

drop policy if exists cwi_write on public.customer_watch_interests;
create policy cwi_write on public.customer_watch_interests
  for all to authenticated
  using (
    public.is_admin_uid(auth.uid())
    or (
      user_id = auth.uid()
      and public.ai_profile_owned_and_consented(profile_id)
    )
  )
  with check (
    public.is_admin_uid(auth.uid())
    or (
      user_id = auth.uid()
      and public.ai_profile_owned_and_consented(profile_id)
    )
  );

drop policy if exists evt_select on public.customer_events;
create policy evt_select on public.customer_events
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));

drop policy if exists evt_insert on public.customer_events;
create policy evt_insert on public.customer_events
  for insert to authenticated
  with check (
    public.is_admin_uid(auth.uid())
    or (
      user_id = auth.uid()
      and public.ai_profile_owned_and_consented(profile_id)
    )
  );

drop policy if exists mem_select on public.ai_customer_memories;
create policy mem_select on public.ai_customer_memories
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));

drop policy if exists mem_write on public.ai_customer_memories;
create policy mem_write on public.ai_customer_memories
  for all to authenticated
  using (
    public.is_admin_uid(auth.uid())
    or (
      user_id = auth.uid()
      and public.ai_profile_owned_and_consented(profile_id)
    )
  )
  with check (
    public.is_admin_uid(auth.uid())
    or (
      user_id = auth.uid()
      and public.ai_profile_owned_and_consented(profile_id)
    )
  );

drop policy if exists rec_select on public.ai_recommendation_logs;
create policy rec_select on public.ai_recommendation_logs
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));

drop policy if exists rec_write on public.ai_recommendation_logs;
create policy rec_write on public.ai_recommendation_logs
  for all to authenticated
  using (
    public.is_admin_uid(auth.uid())
    or (
      user_id = auth.uid()
      and public.ai_profile_owned_and_consented(profile_id)
    )
  )
  with check (
    public.is_admin_uid(auth.uid())
    or (
      user_id = auth.uid()
      and public.ai_profile_owned_and_consented(profile_id)
    )
  );

drop policy if exists alert_select on public.ai_alert_candidates;
create policy alert_select on public.ai_alert_candidates
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));
drop policy if exists alert_write on public.ai_alert_candidates;
create policy alert_write on public.ai_alert_candidates
  for all to authenticated
  using (public.is_admin_uid(auth.uid()))
  with check (public.is_admin_uid(auth.uid()));

-- Do not inherit project-specific default privileges. Anonymous callers get no
-- direct access; authenticated access is explicit and still narrowed by RLS.
revoke all on table public.customer_ai_profiles from public, anon, authenticated;
revoke all on table public.ai_conversations from public, anon, authenticated;
revoke all on table public.customer_watch_interests from public, anon, authenticated;
revoke all on table public.customer_events from public, anon, authenticated;
revoke all on table public.ai_customer_memories from public, anon, authenticated;
revoke all on table public.ai_recommendation_logs from public, anon, authenticated;
revoke all on table public.ai_alert_candidates from public, anon, authenticated;

grant select on table public.customer_ai_profiles to authenticated;
grant update (
  phone, name, email, region,
  preferred_brands, preferred_models, preferred_references,
  budget_min, budget_max, actual_budget_min, actual_budget_max,
  preferred_condition, preferred_size, preferred_color, preferred_material,
  price_sensitivity, speed_preference, detail_preference, risk_tolerance,
  resale_importance, customer_type, buying_stage, buy_probability, ai_summary
) on public.customer_ai_profiles to authenticated;
grant select, insert on table public.ai_conversations to authenticated;
grant select, insert, update, delete on table public.customer_watch_interests to authenticated;
grant select, insert on table public.customer_events to authenticated;
grant select, insert, update, delete on table public.ai_customer_memories to authenticated;
grant select, insert, update, delete on table public.ai_recommendation_logs to authenticated;
grant select, insert, update, delete on table public.ai_alert_candidates to authenticated;

-- Authenticated customers do not currently upload AI-chat attachments. Remove
-- the old broad policy that also allowed writes into team/expert buckets.
drop policy if exists ai_bucket_insert on storage.objects;

-- The unified chat audit RPC is a logged-in, consented feature.
do $optional_rpc$
begin
  if to_regprocedure('public.log_shop_ai_turn(jsonb)') is not null then
    alter function public.log_shop_ai_turn(jsonb) set search_path = '';
    execute 'revoke all on function public.log_shop_ai_turn(jsonb) from public, anon, authenticated';
    execute 'grant execute on function public.log_shop_ai_turn(jsonb) to authenticated';
  end if;
end
$optional_rpc$;

-- Account deletion must remove the AI profile and every directly-linked row.
-- Constraint names are not assumed: remove every legacy single-column FK on
-- these ownership columns, then create exactly one CASCADE FK per column.
do $foreign_keys$
declare
  v_target record;
  v_constraint record;
begin
  for v_target in
    select * from (values
      ('customer_ai_profiles', 'user_id',    'customer_ai_profiles_user_id_fkey',       'auth',   'users',                'id'),
      ('ai_conversations',     'user_id',    'ai_conversations_user_id_fkey',           'auth',   'users',                'id'),
      ('ai_conversations',     'profile_id', 'ai_conversations_profile_id_fkey',        'public', 'customer_ai_profiles', 'id'),
      ('customer_watch_interests','user_id', 'customer_watch_interests_user_id_fkey',   'auth',   'users',                'id'),
      ('customer_watch_interests','profile_id','customer_watch_interests_profile_id_fkey','public','customer_ai_profiles','id'),
      ('customer_events',      'user_id',    'customer_events_user_id_fkey',            'auth',   'users',                'id'),
      ('customer_events',      'profile_id', 'customer_events_profile_id_fkey',         'public', 'customer_ai_profiles', 'id'),
      ('ai_customer_memories', 'user_id',    'ai_customer_memories_user_id_fkey',       'auth',   'users',                'id'),
      ('ai_customer_memories', 'profile_id', 'ai_customer_memories_profile_id_fkey',    'public', 'customer_ai_profiles', 'id'),
      ('ai_recommendation_logs','user_id',   'ai_recommendation_logs_user_id_fkey',     'auth',   'users',                'id'),
      ('ai_recommendation_logs','profile_id','ai_recommendation_logs_profile_id_fkey',  'public', 'customer_ai_profiles', 'id'),
      ('ai_alert_candidates',  'user_id',    'ai_alert_candidates_user_id_fkey',        'auth',   'users',                'id'),
      ('ai_alert_candidates',  'profile_id', 'ai_alert_candidates_profile_id_fkey',     'public', 'customer_ai_profiles', 'id')
    ) as target(table_name, column_name, constraint_name, ref_schema, ref_table, ref_column)
  loop
    for v_constraint in
      select constraint_row.conname
      from pg_constraint constraint_row
      join pg_attribute attribute_row
        on attribute_row.attrelid = constraint_row.conrelid
       and attribute_row.attnum = constraint_row.conkey[1]
      where constraint_row.contype = 'f'
        and constraint_row.conrelid = format('public.%I', v_target.table_name)::regclass
        and array_length(constraint_row.conkey, 1) = 1
        and attribute_row.attname = v_target.column_name
    loop
      execute format(
        'alter table public.%I drop constraint %I',
        v_target.table_name,
        v_constraint.conname
      );
    end loop;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references %I.%I(%I) on delete cascade',
      v_target.table_name,
      v_target.constraint_name,
      v_target.column_name,
      v_target.ref_schema,
      v_target.ref_table,
      v_target.ref_column
    );
  end loop;
end
$foreign_keys$;

alter table public.ai_conversations alter column user_id set not null;
alter table public.ai_conversations alter column profile_id set not null;
alter table public.customer_watch_interests alter column user_id set not null;
alter table public.customer_watch_interests alter column profile_id set not null;
alter table public.customer_events alter column user_id set not null;
alter table public.customer_events alter column profile_id set not null;
alter table public.ai_customer_memories alter column user_id set not null;
alter table public.ai_customer_memories alter column profile_id set not null;
alter table public.ai_recommendation_logs alter column user_id set not null;
alter table public.ai_recommendation_logs alter column profile_id set not null;
alter table public.ai_alert_candidates alter column user_id set not null;
alter table public.ai_alert_candidates alter column profile_id set not null;

create index if not exists idx_ai_conversations_user_id on public.ai_conversations (user_id);
create index if not exists idx_customer_watch_interests_user_id on public.customer_watch_interests (user_id);
create index if not exists idx_customer_events_user_id on public.customer_events (user_id);
create index if not exists idx_ai_customer_memories_user_id on public.ai_customer_memories (user_id);
create index if not exists idx_ai_recommendation_logs_user_id on public.ai_recommendation_logs (user_id);
create index if not exists idx_ai_alert_candidates_user_id on public.ai_alert_candidates (user_id);

create index if not exists idx_customer_events_created_at
  on public.customer_events (created_at);
create index if not exists idx_customer_events_recommendation_click_attribution
  on public.customer_events (user_id, product_id, created_at desc)
  where event_type = 'recommendation_click';
create index if not exists idx_ai_conversations_created_at
  on public.ai_conversations (created_at);
create index if not exists idx_ai_recommendation_logs_created_at
  on public.ai_recommendation_logs (created_at);
create index if not exists idx_ai_alert_candidates_created_at
  on public.ai_alert_candidates (created_at);

create or replace function public.withdraw_ai_personalization(
  p_delete_history boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_profile_ids uuid[] := '{}';
  v_now timestamptz := clock_timestamp();
  v_count bigint := 0;
  v_counts jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_delete_history is not true then
    raise exception 'AI_PERSONALIZATION_WITHDRAWAL_REQUIRES_HISTORY_DELETE'
      using errcode = '22023';
  end if;

  perform public.ai_lock_auth_user(v_user_id);
  perform set_config('bellore.ai_consent_rpc', 'withdraw', true);

  -- Same lock used by ai_guard_personalization_write().
  perform 1
  from public.customer_ai_profiles profile
  where profile.user_id = v_user_id
  for update;

  select coalesce(array_agg(profile.id), '{}') into v_profile_ids
  from public.customer_ai_profiles profile
  where profile.user_id = v_user_id;

  -- Disable first. Any later child write wakes after this transaction and fails.
  update public.customer_ai_profiles profile
  set consent_personalization = false,
      phone = null,
      name = null,
      email = null,
      region = null,
      preferred_brands = '{}',
      preferred_models = '{}',
      preferred_references = '{}',
      budget_min = null,
      budget_max = null,
      actual_budget_min = null,
      actual_budget_max = null,
      preferred_condition = null,
      preferred_size = null,
      preferred_color = null,
      preferred_material = null,
      price_sensitivity = 50,
      speed_preference = 50,
      detail_preference = 50,
      risk_tolerance = 50,
      resale_importance = 50,
      customer_type = null,
      buying_stage = 'unknown',
      buy_probability = 0,
      ai_summary = null
  where profile.user_id = v_user_id;

  insert into public.ai_consent_ledger (
    user_id, profile_id, purpose, action, notice_version, source, occurred_at
  )
  select
    v_user_id, profile.id, 'personalization', 'withdrawn',
    'personalization-v2-20260822', 'ai_concierge', v_now
  from public.customer_ai_profiles profile
  where profile.user_id = v_user_id;

  -- v2 withdrawal has one meaning: stop collection and delete personalized
  -- raw/derived history. This keeps the concurrency contract deterministic.
  if to_regclass('public.ai_shop_chat_requests') is not null then
    execute $sql$
      delete from public.ai_shop_chat_requests request
      where (request.user_id = $1 or request.profile_id = any($2))
    $sql$ using v_user_id, v_profile_ids;
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('ai_shop_chat_requests', v_count);
  end if;

  delete from public.ai_alert_candidates row
      where row.user_id = v_user_id or row.profile_id = any(v_profile_ids);
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('ai_alert_candidates', v_count);

  delete from public.ai_recommendation_logs row
      where row.user_id = v_user_id or row.profile_id = any(v_profile_ids);
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('ai_recommendation_logs', v_count);

  delete from public.ai_customer_memories row
      where row.user_id = v_user_id or row.profile_id = any(v_profile_ids);
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('ai_customer_memories', v_count);

  delete from public.customer_events row
      where row.user_id = v_user_id or row.profile_id = any(v_profile_ids);
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('customer_events', v_count);

  delete from public.ai_conversations row
      where row.user_id = v_user_id or row.profile_id = any(v_profile_ids);
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('ai_conversations', v_count);

  delete from public.customer_watch_interests row
      where row.user_id = v_user_id or row.profile_id = any(v_profile_ids);
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('customer_watch_interests', v_count);
  return jsonb_build_object(
    'personalization_enabled', false,
    'history_deleted', true,
    'deleted_rows_by_table', v_counts,
    'withdrawn_at', v_now
  );
end
$function$;

revoke all on function public.withdraw_ai_personalization(boolean)
  from public, anon, authenticated;
grant execute on function public.withdraw_ai_personalization(boolean)
  to authenticated;

-- One bounded purge step. Run manually first; schedule only after measuring.
drop function if exists public.ai_purge_expired_personalization_data();
create or replace function public.ai_purge_expired_personalization_data(
  p_batch_size integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cutoff timestamptz := clock_timestamp() - interval '90 days';
  v_limit integer := greatest(1, least(coalesce(p_batch_size, 5000), 20000));
  v_count bigint;
  v_remaining_count bigint;
  v_counts jsonb := '{}'::jsonb;
  v_remaining jsonb := '{}'::jsonb;
begin
  if not pg_try_advisory_xact_lock(2026082202) then
    return jsonb_build_object(
      'already_running', true,
      'retention_days', 90,
      'ran_at', clock_timestamp()
    );
  end if;

  if to_regclass('public.ai_shop_chat_requests') is not null then
    execute $sql$
      delete from public.ai_shop_chat_requests row
      where row.ctid in (
        select candidate.ctid
        from public.ai_shop_chat_requests candidate
        where candidate.created_at < $1
        order by candidate.created_at
        limit $2
      )
    $sql$ using v_cutoff, v_limit;
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('ai_shop_chat_requests', v_count);

    execute 'select count(*) from public.ai_shop_chat_requests where created_at < $1'
      into v_remaining_count using v_cutoff;
    v_remaining := v_remaining || jsonb_build_object('ai_shop_chat_requests', v_remaining_count);
  end if;

  delete from public.ai_recommendation_logs row
  where row.ctid in (
    select candidate.ctid
    from public.ai_recommendation_logs candidate
    where candidate.created_at < v_cutoff
    order by candidate.created_at
    limit v_limit
  );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('ai_recommendation_logs', v_count);

  delete from public.customer_events row
  where row.ctid in (
    select candidate.ctid
    from public.customer_events candidate
    where candidate.created_at < v_cutoff
    order by candidate.created_at
    limit v_limit
  );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('customer_events', v_count);

  delete from public.ai_conversations row
  where row.ctid in (
    select candidate.ctid
    from public.ai_conversations candidate
    where candidate.created_at < v_cutoff
    order by candidate.created_at
    limit v_limit
  );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('ai_conversations', v_count);

  delete from public.ai_alert_candidates row
  where row.ctid in (
    select candidate.ctid
    from public.ai_alert_candidates candidate
    where candidate.created_at < v_cutoff
    order by candidate.created_at
    limit v_limit
  );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('ai_alert_candidates', v_count);

  select count(*) into v_remaining_count
  from public.ai_recommendation_logs where created_at < v_cutoff;
  v_remaining := v_remaining || jsonb_build_object('ai_recommendation_logs', v_remaining_count);
  select count(*) into v_remaining_count
  from public.customer_events where created_at < v_cutoff;
  v_remaining := v_remaining || jsonb_build_object('customer_events', v_remaining_count);
  select count(*) into v_remaining_count
  from public.ai_conversations where created_at < v_cutoff;
  v_remaining := v_remaining || jsonb_build_object('ai_conversations', v_remaining_count);
  select count(*) into v_remaining_count
  from public.ai_alert_candidates where created_at < v_cutoff;
  v_remaining := v_remaining || jsonb_build_object('ai_alert_candidates', v_remaining_count);

  return jsonb_build_object(
    'already_running', false,
    'deleted_rows_by_table', v_counts,
    'remaining_expired_by_table', v_remaining,
    'retention_days', 90,
    'batch_size_per_table', v_limit,
    'cutoff', v_cutoff,
    'ran_at', clock_timestamp()
  );
end
$function$;

revoke all on function public.ai_purge_expired_personalization_data(integer)
  from public, anon, authenticated;
grant execute on function public.ai_purge_expired_personalization_data(integer)
  to service_role;

-- Fail closed when project-specific default privileges or legacy grants would
-- leave a custom role on the protected graph. The transaction rolls back so an
-- operator can review the role instead of silently deleting an intentional ACL.
do $acl_invariant$
begin
  if exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) acl
    left join pg_roles role_row on role_row.oid = acl.grantee
    where namespace.nspname = 'public'
      and relation.relname in (
        'customer_ai_profiles', 'ai_conversations',
        'customer_watch_interests', 'customer_events',
        'ai_customer_memories', 'ai_recommendation_logs',
        'ai_alert_candidates', 'ai_consent_ledger',
        'ai_shop_chat_requests', 'ai_shop_chat_logs', 'ai_local_worker_auth'
      )
      and acl.grantee <> relation.relowner
      and (
        acl.grantee = 0
        or coalesce(role_row.rolname, '') not in (
          current_user, 'postgres', 'supabase_admin',
          'anon', 'authenticated', 'service_role'
        )
      )
  ) then
    raise exception 'RECOMMENDATION_V2_UNKNOWN_TABLE_ACL_REVIEW_REQUIRED';
  end if;

  if exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) acl
    left join pg_roles role_row on role_row.oid = acl.grantee
    where namespace.nspname = 'public'
      and procedure.proname in (
        'ai_lock_auth_user', 'ai_guard_profile_write',
        'grant_ai_personalization_consent',
        'ai_guard_personalization_write',
        'ai_guard_shop_chat_request_insert',
        'ai_guard_shop_chat_request_update',
        'ai_profile_owned_and_consented', 'withdraw_ai_personalization',
        'ai_purge_expired_personalization_data', 'submit_shop_ai_chat',
        'get_shop_ai_chat_result', 'log_shop_ai_turn'
      )
      and acl.grantee <> procedure.proowner
      and (
        acl.grantee = 0
        or coalesce(role_row.rolname, '') not in (
          current_user, 'postgres', 'supabase_admin',
          'anon', 'authenticated', 'service_role'
        )
      )
  ) then
    raise exception 'RECOMMENDATION_V2_UNKNOWN_FUNCTION_ACL_REVIEW_REQUIRED';
  end if;
end
$acl_invariant$;

commit;
