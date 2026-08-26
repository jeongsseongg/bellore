-- Server-authoritative, auditable member profile lifecycle operations.

alter table public.profiles
  add column if not exists admin_operation_version bigint not null default 1,
  add column if not exists admin_modified_at timestamptz,
  add column if not exists admin_delete_pending_at timestamptz;

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
  if p_action not in ('update_profile', 'suspend', 'resume') then
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
  else
    next_suspended := p_action = 'suspend';
    changed_fields := array_append(changed_fields, 'suspended');
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
  restore_suspended boolean;
begin
  for pending in
    select event.id, event.target_user_id, event.metadata
    from public.member_admin_events event
    where event.action = 'delete' and event.status = 'pending'
      and event.created_at < now() - interval '5 minutes'
    for update skip locked
  loop
    if exists (select 1 from auth.users where id = pending.target_user_id) then
      restore_suspended := coalesce((pending.metadata->>'suspendedBefore')::boolean, false);
      update public.profiles set
        suspended = restore_suspended,
        admin_delete_pending_at = null,
        admin_operation_version = admin_operation_version + 1,
        admin_modified_at = now()
      where id = pending.target_user_id;
      update public.member_admin_events set
        status = 'failed', completed_at = now(),
        metadata = metadata || jsonb_build_object('code', 'DELETE_OPERATION_TIMEOUT_RECOVERED')
      where id = pending.id;
    else
      delete from public.profiles where id = pending.target_user_id;
      update public.member_admin_events set
        status = 'succeeded', completed_at = now(),
        metadata = metadata || jsonb_build_object('reconciled', true, 'hardDeleted', true)
      where id = pending.id;
    end if;
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

do $$
begin
  if to_regclass('cron.job') is not null then
    if not exists (select 1 from cron.job where jobname = 'bellore-member-delete-recovery') then
      execute $cron$
        select cron.schedule(
          'bellore-member-delete-recovery',
          '*/5 * * * *',
          'select public.reconcile_member_delete_events();'
        )
      $cron$;
    end if;
  end if;
exception when insufficient_privilege or undefined_function or undefined_table then
  raise notice 'member delete recovery cron unavailable; Edge reconciliation remains active';
end $$;

revoke all on function public.admin_manage_member_profile(uuid,uuid,text,jsonb,text,bigint) from public, anon, authenticated;
revoke all on function public.admin_prepare_member_delete(uuid,uuid,text,bigint) from public, anon, authenticated;
revoke all on function public.admin_cancel_member_delete(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.admin_reconcile_member_deletes(uuid) from public, anon, authenticated;
revoke all on function public.reconcile_member_delete_events() from public, anon, authenticated, service_role;
grant execute on function public.admin_manage_member_profile(uuid,uuid,text,jsonb,text,bigint) to service_role;
grant execute on function public.admin_prepare_member_delete(uuid,uuid,text,bigint) to service_role;
grant execute on function public.admin_cancel_member_delete(uuid,uuid,text) to service_role;
grant execute on function public.admin_reconcile_member_deletes(uuid) to service_role;
