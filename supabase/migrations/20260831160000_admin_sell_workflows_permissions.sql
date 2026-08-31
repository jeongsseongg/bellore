begin;

create table if not exists public.sell_service_operations (
  request_id uuid primary key references public.sell_service_requests(id) on delete cascade,
  workflow_status text not null default 'reviewing' check (workflow_status in (
    'reviewing','accepted','estimated','awaiting_intake','received','inspecting','priced','offered',
    'listed','sold','settling','settled','paid','declined','cancelled'
  )),
  inspection_status text not null default 'pending' check (inspection_status in ('pending','in_progress','passed','rejected')),
  trade_method text check (trade_method is null or trade_method in ('visit','parcel','valex')),
  branch_name text,
  appointment_at timestamptz,
  pickup_at timestamptz,
  received_at timestamptz,
  inspected_at timestamptz,
  payment_at timestamptz,
  advised_amount bigint check (advised_amount is null or advised_amount >= 0),
  estimated_amount bigint check (estimated_amount is null or estimated_amount >= 0),
  deduction_amount bigint check (deduction_amount is null or deduction_amount >= 0),
  final_amount bigint check (final_amount is null or final_amount >= 0),
  commission_rate numeric(5,4) check (commission_rate is null or commission_rate between 0 and 1),
  expected_settlement bigint check (expected_settlement is null or expected_settlement >= 0),
  listing_id uuid references public.listings(id) on delete set null,
  admin_memo text,
  operation_version bigint not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sell_service_operation_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.sell_service_requests(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  reason text not null,
  version_before bigint not null,
  version_after bigint not null,
  changes jsonb not null default '{}'::jsonb check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists sell_service_operations_workflow_idx
  on public.sell_service_operations(workflow_status, inspection_status, updated_at desc);
create index if not exists sell_service_operation_events_request_idx
  on public.sell_service_operation_events(request_id, created_at desc);

create table if not exists public.admin_operator_permissions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  preset text not null default 'super' check (preset in ('super','quote_inspection','order_fulfillment','content_support','custom')),
  scopes text[] not null default '{}',
  active boolean not null default true,
  operation_version bigint not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_permission_events (
  id bigint generated always as identity primary key,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  version_before bigint not null,
  version_after bigint not null,
  previous_value jsonb not null default '{}'::jsonb,
  next_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.admin_operator_permissions(profile_id, preset, scopes, active, created_by, updated_by)
select id, 'super', array['*']::text[], true, id, id
from public.profiles
where role = 'admin'
on conflict (profile_id) do nothing;

alter table public.sell_service_operations enable row level security;
alter table public.sell_service_operation_events enable row level security;
alter table public.admin_operator_permissions enable row level security;
alter table public.admin_permission_events enable row level security;

revoke all on table public.sell_service_operations from anon, authenticated;
revoke all on table public.sell_service_operation_events from anon, authenticated;
revoke all on table public.admin_operator_permissions from anon, authenticated;
revoke all on table public.admin_permission_events from anon, authenticated;
grant select on table public.sell_service_operations, public.sell_service_operation_events,
  public.admin_operator_permissions, public.admin_permission_events to authenticated;

drop policy if exists sell_service_requests_admin_select on public.sell_service_requests;
create policy sell_service_requests_admin_select on public.sell_service_requests for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin' and p.approved = true and coalesce(p.suspended, false) = false
));

drop policy if exists sell_service_operations_admin_select on public.sell_service_operations;
create policy sell_service_operations_admin_select on public.sell_service_operations for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin' and p.approved = true and coalesce(p.suspended, false) = false
));

drop policy if exists sell_service_operation_events_admin_select on public.sell_service_operation_events;
create policy sell_service_operation_events_admin_select on public.sell_service_operation_events for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin' and p.approved = true and coalesce(p.suspended, false) = false
));

drop policy if exists admin_operator_permissions_admin_select on public.admin_operator_permissions;
create policy admin_operator_permissions_admin_select on public.admin_operator_permissions for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin' and p.approved = true and coalesce(p.suspended, false) = false
));

drop policy if exists admin_permission_events_admin_select on public.admin_permission_events;
create policy admin_permission_events_admin_select on public.admin_permission_events for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin' and p.approved = true and coalesce(p.suspended, false) = false
));

create or replace function public.admin_manage_sell_service(
  p_request_id uuid,
  p_expected_version bigint,
  p_patch jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.sell_service_requests%rowtype;
  v_actor_permission public.admin_operator_permissions%rowtype;
  v_before public.sell_service_operations%rowtype;
  v_after public.sell_service_operations%rowtype;
  v_version bigint;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_status text;
  v_inspection text;
  v_trade text;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin' and p.approved = true and coalesce(p.suspended, false) = false
  ) then raise exception 'ACTIVE_ADMIN_REQUIRED'; end if;
  select * into v_actor_permission from public.admin_operator_permissions where profile_id = v_actor;
  if not found or not coalesce(v_actor_permission.active, false)
    or (v_actor_permission.preset <> 'super' and not ('sell.manage' = any(v_actor_permission.scopes))) then
    raise exception 'SELL_MANAGE_REQUIRED';
  end if;
  if length(v_reason) < 5 then raise exception 'REASON_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' then raise exception 'BAD_PATCH'; end if;

  select * into v_request from public.sell_service_requests where id = p_request_id for update;
  if not found then raise exception 'SELL_REQUEST_NOT_FOUND'; end if;

  insert into public.sell_service_operations(request_id, updated_by)
  values (p_request_id, v_actor)
  on conflict (request_id) do nothing;
  select * into v_before from public.sell_service_operations where request_id = p_request_id for update;
  v_version := v_before.operation_version;
  if coalesce(p_expected_version, 0) <> v_version then raise exception 'VERSION_CONFLICT'; end if;

  v_status := case when p_patch ? 'workflow_status' then nullif(p_patch->>'workflow_status', '') else v_before.workflow_status end;
  v_inspection := case when p_patch ? 'inspection_status' then nullif(p_patch->>'inspection_status', '') else v_before.inspection_status end;
  v_trade := case when p_patch ? 'trade_method' then nullif(p_patch->>'trade_method', '') else v_before.trade_method end;
  if v_status not in ('reviewing','accepted','estimated','awaiting_intake','received','inspecting','priced','offered','listed','sold','settling','settled','paid','declined','cancelled') then raise exception 'BAD_WORKFLOW_STATUS'; end if;
  if v_inspection not in ('pending','in_progress','passed','rejected') then raise exception 'BAD_INSPECTION_STATUS'; end if;
  if v_trade is not null and v_trade not in ('visit','parcel','valex') then raise exception 'BAD_TRADE_METHOD'; end if;

  update public.sell_service_operations set
    workflow_status = v_status,
    inspection_status = v_inspection,
    trade_method = v_trade,
    branch_name = case when p_patch ? 'branch_name' then nullif(btrim(p_patch->>'branch_name'), '') else branch_name end,
    appointment_at = case when p_patch ? 'appointment_at' then nullif(p_patch->>'appointment_at', '')::timestamptz else appointment_at end,
    pickup_at = case when p_patch ? 'pickup_at' then nullif(p_patch->>'pickup_at', '')::timestamptz else pickup_at end,
    received_at = case when p_patch ? 'received_at' then nullif(p_patch->>'received_at', '')::timestamptz else received_at end,
    inspected_at = case when p_patch ? 'inspected_at' then nullif(p_patch->>'inspected_at', '')::timestamptz else inspected_at end,
    payment_at = case when p_patch ? 'payment_at' then nullif(p_patch->>'payment_at', '')::timestamptz else payment_at end,
    advised_amount = case when p_patch ? 'advised_amount' then nullif(p_patch->>'advised_amount', '')::bigint else advised_amount end,
    estimated_amount = case when p_patch ? 'estimated_amount' then nullif(p_patch->>'estimated_amount', '')::bigint else estimated_amount end,
    deduction_amount = case when p_patch ? 'deduction_amount' then nullif(p_patch->>'deduction_amount', '')::bigint else deduction_amount end,
    final_amount = case when p_patch ? 'final_amount' then nullif(p_patch->>'final_amount', '')::bigint else final_amount end,
    commission_rate = case when p_patch ? 'commission_rate' then nullif(p_patch->>'commission_rate', '')::numeric else commission_rate end,
    expected_settlement = case when p_patch ? 'expected_settlement' then nullif(p_patch->>'expected_settlement', '')::bigint else expected_settlement end,
    listing_id = case when p_patch ? 'listing_id' then nullif(btrim(p_patch->>'listing_id'), '')::uuid else listing_id end,
    admin_memo = case when p_patch ? 'admin_memo' then nullif(btrim(p_patch->>'admin_memo'), '') else admin_memo end,
    operation_version = operation_version + 1,
    updated_by = v_actor,
    updated_at = now()
  where request_id = p_request_id
  returning * into v_after;

  insert into public.sell_service_operation_events(
    request_id, actor_user_id, action, reason, version_before, version_after, changes
  ) values (p_request_id, v_actor, 'update', v_reason, v_version, v_after.operation_version, p_patch);

  return jsonb_build_object('ok', true, 'requestId', p_request_id, 'method', v_request.method,
    'version', v_after.operation_version, 'workflowStatus', v_after.workflow_status,
    'inspectionStatus', v_after.inspection_status);
end;
$$;

create or replace function public.admin_manage_operator_permissions(
  p_target_user_id uuid,
  p_expected_version bigint,
  p_preset text,
  p_scopes text[],
  p_active boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_permission public.admin_operator_permissions%rowtype;
  v_before public.admin_operator_permissions%rowtype;
  v_after public.admin_operator_permissions%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_version bigint := 0;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin' and p.approved = true and coalesce(p.suspended, false) = false
  ) then raise exception 'ACTIVE_ADMIN_REQUIRED'; end if;
  select * into v_actor_permission from public.admin_operator_permissions where profile_id = v_actor;
  if not found or not coalesce(v_actor_permission.active, false)
    or (v_actor_permission.preset <> 'super' and not ('permissions.manage' = any(v_actor_permission.scopes))) then
    raise exception 'PERMISSION_MANAGE_REQUIRED';
  end if;
  if p_target_user_id = v_actor then raise exception 'SELF_PERMISSION_CHANGE_FORBIDDEN'; end if;
  if not exists (select 1 from public.profiles where id = p_target_user_id and role = 'admin') then raise exception 'ADMIN_PROFILE_REQUIRED'; end if;
  if length(v_reason) < 5 then raise exception 'REASON_REQUIRED'; end if;
  if p_preset not in ('super','quote_inspection','order_fulfillment','content_support','custom') then raise exception 'BAD_PERMISSION_PRESET'; end if;

  select * into v_before from public.admin_operator_permissions where profile_id = p_target_user_id for update;
  if found then
    v_version := v_before.operation_version;
    if coalesce(p_expected_version, 0) <> v_version then raise exception 'VERSION_CONFLICT'; end if;
    update public.admin_operator_permissions set
      preset = p_preset,
      scopes = case when p_preset = 'super' then array['*']::text[] else coalesce(p_scopes, '{}') end,
      active = coalesce(p_active, false), operation_version = operation_version + 1,
      updated_by = v_actor, updated_at = now()
    where profile_id = p_target_user_id returning * into v_after;
  else
    if coalesce(p_expected_version, 0) <> 0 then raise exception 'VERSION_CONFLICT'; end if;
    insert into public.admin_operator_permissions(profile_id, preset, scopes, active, created_by, updated_by)
    values (p_target_user_id, p_preset, case when p_preset = 'super' then array['*']::text[] else coalesce(p_scopes, '{}') end,
      coalesce(p_active, false), v_actor, v_actor)
    returning * into v_after;
  end if;

  insert into public.admin_permission_events(target_user_id, actor_user_id, reason, version_before, version_after, previous_value, next_value)
  values (p_target_user_id, v_actor, v_reason, v_version, v_after.operation_version,
    case when v_version = 0 then '{}'::jsonb else to_jsonb(v_before) - 'created_at' - 'updated_at' end,
    to_jsonb(v_after) - 'created_at' - 'updated_at');

  return jsonb_build_object('ok', true, 'targetUserId', p_target_user_id, 'version', v_after.operation_version,
    'preset', v_after.preset, 'active', v_after.active);
end;
$$;

revoke all on function public.admin_manage_sell_service(uuid,bigint,jsonb,text) from public, anon;
revoke all on function public.admin_manage_operator_permissions(uuid,bigint,text,text[],boolean,text) from public, anon;
grant execute on function public.admin_manage_sell_service(uuid,bigint,jsonb,text) to authenticated;
grant execute on function public.admin_manage_operator_permissions(uuid,bigint,text,text[],boolean,text) to authenticated;

commit;
