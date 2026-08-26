-- Server-authoritative, auditable member profile lifecycle operations.

alter table public.profiles
  add column if not exists admin_operation_version bigint not null default 1,
  add column if not exists admin_modified_at timestamptz,
  add column if not exists admin_delete_pending_at timestamptz,
  add column if not exists admin_auth_transition_id uuid,
  add column if not exists admin_auth_transition_action text,
  add column if not exists admin_auth_transition_event_id uuid,
  add column if not exists admin_auth_transition_started_at timestamptz;

alter table public.member_admin_events
  drop constraint if exists member_admin_events_action_check;
alter table public.member_admin_events
  add constraint member_admin_events_action_check
  check (action in ('update_profile', 'suspend', 'resume', 'delete'));

revoke delete on table public.profiles from anon, authenticated;

create or replace function public.guard_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('supabase_auth_admin', 'supabase_admin', 'postgres') then
    raise exception using errcode = '42501', message = 'PROFILE_DELETE_SERVER_ONLY';
  end if;
  return old;
end $$;

drop trigger if exists trg_guard_profile_delete on public.profiles;
create trigger trg_guard_profile_delete
  before delete on public.profiles
  for each row execute function public.guard_profile_delete();
revoke all on function public.guard_profile_delete() from public, anon, authenticated;

create or replace function public.is_active_member_session()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and coalesce(suspended, false) = false
  )
$$;
revoke all on function public.is_active_member_session() from public, anon;
grant execute on function public.is_active_member_session() to authenticated;

-- A deleted/suspended member may still hold a previously issued JWT until it
-- expires. A restrictive policy on every RLS-protected public table makes the
-- live profile row an additional session revocation gate.
do $$
declare target record;
begin
  for target in
    select cls.relname
    from pg_class cls
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname = 'public' and cls.relkind in ('r','p') and cls.relrowsecurity
  loop
    execute format('drop policy if exists active_member_session_gate on public.%I', target.relname);
    execute format(
      'create policy active_member_session_gate on public.%I as restrictive for all to authenticated using (public.is_active_member_session()) with check (public.is_active_member_session())',
      target.relname
    );
  end loop;
end $$;

-- Browser sessions, including administrator sessions, cannot directly alter
-- lifecycle/authority fields. Edge Functions use service_role and the RPCs
-- below, which independently re-check the active administrator.
create or replace function public.lock_privileged_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if is_service then
    return new;
  end if;

  if new.phone is distinct from old.phone then
    new.phone_verified := false;
    new.phone_verified_at := null;
    new.phone_verification_provider := null;
  else
    new.phone_verified := old.phone_verified;
    new.phone_verified_at := old.phone_verified_at;
    new.phone_verification_provider := old.phone_verification_provider;
  end if;
  if row(new.business_no, new.biz_open_date, new.ceo_name)
      is distinct from row(old.business_no, old.biz_open_date, old.ceo_name) then
    new.biz_verified := false;
    new.biz_verified_at := null;
    new.biz_verification_provider := null;
  else
    new.biz_verified := old.biz_verified;
    new.biz_verified_at := old.biz_verified_at;
    new.biz_verification_provider := old.biz_verification_provider;
  end if;
  if row(new.bank_name, new.bank_account, new.bank_holder)
      is distinct from row(old.bank_name, old.bank_account, old.bank_holder) then
    new.account_verified := false;
    new.account_verified_at := null;
    new.account_verification_provider := null;
  else
    new.account_verified := old.account_verified;
    new.account_verified_at := old.account_verified_at;
    new.account_verification_provider := old.account_verification_provider;
  end if;

  new.email_verified := old.email_verified;
  new.email_verified_at := old.email_verified_at;
  new.email_verification_provider := old.email_verification_provider;
  new.role := old.role;
  new.approved := old.approved;
  new.suspended := old.suspended;
  new.vip := old.vip;
  new.commission_rate := old.commission_rate;
  new.admin_operation_version := old.admin_operation_version;
  new.admin_modified_at := old.admin_modified_at;
  new.admin_delete_pending_at := old.admin_delete_pending_at;
  new.admin_auth_transition_id := old.admin_auth_transition_id;
  new.admin_auth_transition_action := old.admin_auth_transition_action;
  new.admin_auth_transition_event_id := old.admin_auth_transition_event_id;
  new.admin_auth_transition_started_at := old.admin_auth_transition_started_at;
  return new;
end $$;

create or replace function public.admin_manage_member_profile(
  p_actor_id uuid,
  p_target_id uuid,
  p_action text,
  p_patch jsonb default '{}'::jsonb,
  p_reason text default '',
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
  event_id uuid;
  changed_fields text[] := '{}';
  next_display_name text;
  next_phone text;
  next_company_name text;
  next_approved boolean;
  next_vip boolean;
  next_commission numeric;
  next_suspended boolean;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and approved = true
      and coalesce(suspended, false) = false
  ) then raise exception using errcode = '42501', message = 'ADMIN_FORBIDDEN'; end if;
  if p_target_id = p_actor_id then
    raise exception using errcode = '22023', message = 'SELF_OPERATION_FORBIDDEN';
  end if;
  if p_action <> 'update_profile' then
    raise exception using errcode = '22023', message = 'BAD_ACTION';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'BAD_PATCH';
  end if;
  if exists (
    select 1 from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) key
    where key not in ('display_name','phone','company_name','approved','vip','commission_rate')
  ) then raise exception using errcode = '22023', message = 'BAD_PATCH_FIELD'; end if;

  select * into target from public.profiles where id = p_target_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND'; end if;
  if target.role::text not in ('customer','vendor','partner') then
    raise exception using errcode = '42501', message = 'PROTECTED_ROLE';
  end if;
  if p_expected_version is null then
    raise exception using errcode = '22023', message = 'VERSION_REQUIRED';
  end if;
  if target.admin_operation_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  next_display_name := target.display_name;
  next_phone := target.phone;
  next_company_name := target.company_name;
  next_approved := target.approved;
  next_vip := coalesce(target.vip, false);
  next_commission := target.commission_rate;
  next_suspended := coalesce(target.suspended, false);

  if p_action = 'update_profile' then
    if p_patch ? 'display_name' then
      next_display_name := nullif(trim(p_patch->>'display_name'), '');
      if length(coalesce(next_display_name, '')) > 80 then raise exception 'BAD_DISPLAY_NAME'; end if;
      changed_fields := array_append(changed_fields, 'display_name');
    end if;
    if p_patch ? 'phone' then
      next_phone := nullif(trim(p_patch->>'phone'), '');
      if length(coalesce(next_phone, '')) > 32 then raise exception 'BAD_PHONE'; end if;
      changed_fields := array_append(changed_fields, 'phone');
    end if;
    if p_patch ? 'company_name' then
      next_company_name := nullif(trim(p_patch->>'company_name'), '');
      if length(coalesce(next_company_name, '')) > 120 then raise exception 'BAD_COMPANY_NAME'; end if;
      changed_fields := array_append(changed_fields, 'company_name');
    end if;
    if p_patch ? 'approved' then
      if target.role::text = 'customer' then raise exception 'BAD_APPROVAL_ROLE'; end if;
      next_approved := (p_patch->>'approved')::boolean;
      changed_fields := array_append(changed_fields, 'approved');
    end if;
    if p_patch ? 'vip' then
      if target.role::text <> 'vendor' then raise exception 'BAD_VIP_ROLE'; end if;
      next_vip := (p_patch->>'vip')::boolean;
      changed_fields := array_append(changed_fields, 'vip');
    end if;
    if p_patch ? 'commission_rate' then
      if target.role::text <> 'partner' then raise exception 'BAD_COMMISSION_ROLE'; end if;
      next_commission := nullif(p_patch->>'commission_rate', '')::numeric;
      if next_commission is null or next_commission < 0 or next_commission > 1 then
        raise exception 'BAD_COMMISSION_RATE';
      end if;
      changed_fields := array_append(changed_fields, 'commission_rate');
    end if;
    if cardinality(changed_fields) = 0 then raise exception 'EMPTY_PATCH'; end if;
  end if;

  update public.profiles set
    display_name = next_display_name,
    phone = next_phone,
    phone_verified = case when next_phone is distinct from target.phone then false else target.phone_verified end,
    phone_verified_at = case when next_phone is distinct from target.phone then null else target.phone_verified_at end,
    phone_verification_provider = case when next_phone is distinct from target.phone then null else target.phone_verification_provider end,
    company_name = next_company_name,
    approved = next_approved,
    vip = next_vip,
    commission_rate = next_commission,
    suspended = next_suspended,
    admin_operation_version = target.admin_operation_version + 1,
    admin_modified_at = now()
  where id = p_target_id;

  insert into public.member_admin_events (
    target_user_id, actor_user_id, target_role, action, status, reason, metadata, completed_at
  ) values (
    p_target_id, p_actor_id, target.role::text, p_action, 'succeeded', trim(p_reason),
    jsonb_build_object(
      'changedFields', to_jsonb(changed_fields),
      'versionBefore', target.admin_operation_version,
      'versionAfter', target.admin_operation_version + 1
    ), now()
  ) returning id into event_id;

  return jsonb_build_object(
    'auditEventId', event_id,
    'version', target.admin_operation_version + 1,
    'suspended', next_suspended,
    'approved', next_approved,
    'vip', next_vip
  );
end $$;

create or replace function public.admin_begin_member_auth_transition(
  p_actor_id uuid,
  p_target_id uuid,
  p_action text,
  p_reason text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
  transition_id uuid := gen_random_uuid();
  event_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and approved = true
      and coalesce(suspended, false) = false
  ) then raise exception using errcode = '42501', message = 'ADMIN_FORBIDDEN'; end if;
  if p_target_id = p_actor_id then raise exception 'SELF_OPERATION_FORBIDDEN'; end if;
  if p_action not in ('suspend','resume') then raise exception 'BAD_ACTION'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED'; end if;
  if p_expected_version is null then raise exception 'VERSION_REQUIRED'; end if;

  select * into target from public.profiles where id = p_target_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if target.role::text not in ('customer','vendor','partner') then raise exception 'PROTECTED_ROLE'; end if;
  if target.admin_operation_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if target.admin_auth_transition_id is not null then raise exception 'OPERATION_IN_PROGRESS'; end if;

  insert into public.member_admin_events (
    target_user_id, actor_user_id, target_role, action, status, reason, metadata
  ) values (
    p_target_id, p_actor_id, target.role::text, p_action, 'pending', trim(p_reason),
    jsonb_build_object(
      'transitionId', transition_id,
      'suspendedBefore', coalesce(target.suspended, false),
      'versionBefore', target.admin_operation_version
    )
  ) returning id into event_id;

  update public.profiles set
    admin_auth_transition_id = transition_id,
    admin_auth_transition_action = p_action,
    admin_auth_transition_event_id = event_id,
    admin_auth_transition_started_at = now(),
    admin_operation_version = target.admin_operation_version + 1,
    admin_modified_at = now()
  where id = p_target_id;

  return jsonb_build_object(
    'transitionId', transition_id,
    'auditEventId', event_id,
    'version', target.admin_operation_version + 1
  );
end $$;

create or replace function public.admin_complete_member_auth_transition(
  p_actor_id uuid,
  p_target_id uuid,
  p_transition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
  next_suspended boolean;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and approved = true
      and coalesce(suspended, false) = false
  ) then raise exception using errcode = '42501', message = 'ADMIN_FORBIDDEN'; end if;
  select * into target from public.profiles where id = p_target_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if target.admin_auth_transition_id is distinct from p_transition_id then raise exception 'TRANSITION_MISMATCH'; end if;
  next_suspended := target.admin_auth_transition_action = 'suspend';

  update public.profiles set
    suspended = next_suspended,
    admin_auth_transition_id = null,
    admin_auth_transition_action = null,
    admin_auth_transition_event_id = null,
    admin_auth_transition_started_at = null,
    admin_operation_version = target.admin_operation_version + 1,
    admin_modified_at = now()
  where id = p_target_id;
  update public.member_admin_events set
    status = 'succeeded', completed_at = now(),
    metadata = metadata || jsonb_build_object(
      'suspendedAfter', next_suspended,
      'versionAfter', target.admin_operation_version + 1
    )
  where id = target.admin_auth_transition_event_id and status = 'pending';
  return jsonb_build_object(
    'auditEventId', target.admin_auth_transition_event_id,
    'version', target.admin_operation_version + 1,
    'suspended', next_suspended
  );
end $$;

create or replace function public.admin_cancel_member_auth_transition(
  p_actor_id uuid,
  p_target_id uuid,
  p_transition_id uuid,
  p_code text default 'AUTH_UPDATE_FAILED'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare target public.profiles%rowtype;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and approved = true
      and coalesce(suspended, false) = false
  ) then raise exception using errcode = '42501', message = 'ADMIN_FORBIDDEN'; end if;
  select * into target from public.profiles where id = p_target_id for update;
  if not found or target.admin_auth_transition_id is distinct from p_transition_id then return false; end if;
  update public.profiles set
    admin_auth_transition_id = null,
    admin_auth_transition_action = null,
    admin_auth_transition_event_id = null,
    admin_auth_transition_started_at = null,
    admin_operation_version = target.admin_operation_version + 1,
    admin_modified_at = now()
  where id = p_target_id;
  update public.member_admin_events set
    status = 'failed', completed_at = now(),
    metadata = metadata || jsonb_build_object('code', left(coalesce(p_code, 'AUTH_UPDATE_FAILED'), 80))
  where id = target.admin_auth_transition_event_id and status = 'pending';
  return true;
end $$;

create or replace function public.admin_prepare_member_delete(
  p_actor_id uuid,
  p_target_id uuid,
  p_reason text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
  event_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and approved = true
      and coalesce(suspended, false) = false
  ) then raise exception using errcode = '42501', message = 'ADMIN_FORBIDDEN'; end if;
  if p_target_id = p_actor_id then raise exception 'SELF_OPERATION_FORBIDDEN'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED'; end if;

  select * into target from public.profiles where id = p_target_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if target.role::text not in ('customer','vendor','partner') then raise exception 'PROTECTED_ROLE'; end if;
  if p_expected_version is null then raise exception 'VERSION_REQUIRED'; end if;
  if target.admin_operation_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;

  update public.profiles set
    admin_delete_pending_at = now(),
    suspended = true,
    admin_operation_version = target.admin_operation_version + 1,
    admin_modified_at = now()
  where id = p_target_id;

  insert into public.member_admin_events (
    target_user_id, actor_user_id, target_role, action, status, reason, metadata
  ) values (
    p_target_id, p_actor_id, target.role::text, 'delete', 'pending', trim(p_reason),
    jsonb_build_object(
      'versionBefore', target.admin_operation_version,
      'suspendedBefore', coalesce(target.suspended, false)
    )
  ) returning id into event_id;

  return jsonb_build_object('auditEventId', event_id, 'version', target.admin_operation_version + 1);
end $$;

create or replace function public.admin_cancel_member_delete(
  p_actor_id uuid,
  p_event_id uuid,
  p_code text default 'DELETE_OPERATION_FAILED'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  pending public.member_admin_events%rowtype;
  restore_suspended boolean;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and approved = true
      and coalesce(suspended, false) = false
  ) then raise exception using errcode = '42501', message = 'ADMIN_FORBIDDEN'; end if;

  select * into pending from public.member_admin_events
  where id = p_event_id and action = 'delete' and status = 'pending'
  for update;
  if not found then return false; end if;
  restore_suspended := coalesce((pending.metadata->>'suspendedBefore')::boolean, false);
  update public.profiles set
    suspended = restore_suspended,
    admin_delete_pending_at = null,
    admin_operation_version = admin_operation_version + 1,
    admin_modified_at = now()
  where id = pending.target_user_id;
  update public.member_admin_events set
    status = 'failed', completed_at = now(),
    metadata = metadata || jsonb_build_object('code', left(coalesce(p_code, 'DELETE_OPERATION_FAILED'), 80))
  where id = pending.id;
  return true;
end $$;

create or replace function public.reconcile_member_delete_events()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  pending record;
  reconciled integer := 0;
  actual_suspended boolean;
  intended_suspended boolean;
begin
  for pending in
    select profile.id as target_user_id,
           profile.admin_auth_transition_action as action,
           profile.admin_auth_transition_event_id as event_id,
           profile.admin_operation_version as operation_version
    from public.profiles profile
    where profile.admin_auth_transition_id is not null
      and profile.admin_auth_transition_started_at < now() - interval '5 minutes'
    for update skip locked
  loop
    select coalesce(user_row.banned_until > now(), false)
      into actual_suspended
      from auth.users user_row where user_row.id = pending.target_user_id;
    actual_suspended := coalesce(actual_suspended, false);
    intended_suspended := pending.action = 'suspend';
    update public.profiles set
      suspended = actual_suspended,
      admin_auth_transition_id = null,
      admin_auth_transition_action = null,
      admin_auth_transition_event_id = null,
      admin_auth_transition_started_at = null,
      admin_operation_version = admin_operation_version + 1,
      admin_modified_at = now()
    where id = pending.target_user_id;
    update public.member_admin_events set
      status = case when actual_suspended = intended_suspended then 'succeeded' else 'failed' end,
      completed_at = now(),
      metadata = metadata || jsonb_build_object(
        'reconciled', true,
        'suspendedAfter', actual_suspended,
        'code', case when actual_suspended = intended_suspended then 'AUTH_TRANSITION_RECOVERED' else 'AUTH_TRANSITION_MISMATCH' end
      )
    where id = pending.event_id and status = 'pending';
    reconciled := reconciled + 1;
  end loop;

  return reconciled;
end $$;

create or replace function public.admin_reconcile_member_deletes(p_actor_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and approved = true
      and coalesce(suspended, false) = false
  ) then raise exception using errcode = '42501', message = 'ADMIN_FORBIDDEN'; end if;
  return public.reconcile_member_delete_events();
end $$;

revoke all on function public.admin_manage_member_profile(uuid,uuid,text,jsonb,text,bigint) from public, anon, authenticated;
revoke all on function public.admin_begin_member_auth_transition(uuid,uuid,text,text,bigint) from public, anon, authenticated;
revoke all on function public.admin_complete_member_auth_transition(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_cancel_member_auth_transition(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.admin_prepare_member_delete(uuid,uuid,text,bigint) from public, anon, authenticated;
revoke all on function public.admin_cancel_member_delete(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.admin_reconcile_member_deletes(uuid) from public, anon, authenticated;
revoke all on function public.reconcile_member_delete_events() from public, anon, authenticated, service_role;
grant execute on function public.admin_manage_member_profile(uuid,uuid,text,jsonb,text,bigint) to service_role;
grant execute on function public.admin_begin_member_auth_transition(uuid,uuid,text,text,bigint) to service_role;
grant execute on function public.admin_complete_member_auth_transition(uuid,uuid,uuid) to service_role;
grant execute on function public.admin_cancel_member_auth_transition(uuid,uuid,uuid,text) to service_role;
grant execute on function public.admin_prepare_member_delete(uuid,uuid,text,bigint) to service_role;
grant execute on function public.admin_cancel_member_delete(uuid,uuid,text) to service_role;
grant execute on function public.admin_reconcile_member_deletes(uuid) to service_role;
