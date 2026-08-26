-- Server-authoritative member verification state and privacy-minimized audit trail.

alter table public.profiles
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists phone_verification_provider text,
  add column if not exists email_verified boolean not null default false,
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verification_provider text,
  add column if not exists biz_verified boolean not null default false,
  add column if not exists biz_verified_at timestamptz,
  add column if not exists biz_verification_provider text,
  add column if not exists account_verified boolean not null default false,
  add column if not exists account_verified_at timestamptz,
  add column if not exists account_verification_provider text;

-- Older Bellore schemas already have nullable boolean flags. Normalize those
-- rows before enforcing a two-state server-authoritative contract.
update public.profiles set
  phone_verified = coalesce(phone_verified, false),
  email_verified = coalesce(email_verified, false),
  biz_verified = coalesce(biz_verified, false),
  account_verified = coalesce(account_verified, false)
where phone_verified is null
   or email_verified is null
   or biz_verified is null
   or account_verified is null;

alter table public.profiles
  alter column phone_verified set default false,
  alter column phone_verified set not null,
  alter column email_verified set default false,
  alter column email_verified set not null,
  alter column biz_verified set default false,
  alter column biz_verified set not null,
  alter column account_verified set default false,
  alter column account_verified set not null;

create table if not exists public.member_verification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  method text not null check (method in ('phone', 'email', 'business', 'account')),
  status text not null check (status in (
    'verified', 'rejected', 'error', 'manual_verified', 'manual_revoked'
  )),
  provider text,
  provider_reference_hash text,
  reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint member_verification_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists member_verification_events_user_created_idx
  on public.member_verification_events (user_id, created_at desc);

create index if not exists member_verification_events_actor_created_idx
  on public.member_verification_events (actor_user_id, created_at desc);

create unique index if not exists member_verification_events_provider_success_uidx
  on public.member_verification_events (method, provider, provider_reference_hash)
  where provider_reference_hash is not null and status = 'verified' and method = 'phone';

alter table public.member_verification_events enable row level security;
revoke all on table public.member_verification_events from anon, authenticated;

-- Only server-side service-role calls may change verification state. User edits
-- to the underlying phone/business/account identity data invalidate old proof.
create or replace function public.lock_privileged_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_server boolean := auth.uid() is null;
  is_admin boolean := false;
begin
  if is_server then
    return new;
  end if;

  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) into is_admin;

  if new.phone is distinct from old.phone then
    new.phone_verified := false;
    new.phone_verified_at := null;
    new.phone_verification_provider := null;
  end if;
  if row(new.business_no, new.biz_open_date, new.ceo_name)
      is distinct from row(old.business_no, old.biz_open_date, old.ceo_name) then
    new.biz_verified := false;
    new.biz_verified_at := null;
    new.biz_verification_provider := null;
  end if;
  if row(new.bank_name, new.bank_account, new.bank_holder)
      is distinct from row(old.bank_name, old.bank_account, old.bank_holder) then
    new.account_verified := false;
    new.account_verified_at := null;
    new.account_verification_provider := null;
  end if;

  new.phone_verified := case when new.phone is distinct from old.phone then false else old.phone_verified end;
  new.phone_verified_at := case when new.phone is distinct from old.phone then null else old.phone_verified_at end;
  new.phone_verification_provider := case when new.phone is distinct from old.phone then null else old.phone_verification_provider end;
  new.email_verified := old.email_verified;
  new.email_verified_at := old.email_verified_at;
  new.email_verification_provider := old.email_verification_provider;
  new.biz_verified := case when row(new.business_no, new.biz_open_date, new.ceo_name)
      is distinct from row(old.business_no, old.biz_open_date, old.ceo_name) then false else old.biz_verified end;
  new.biz_verified_at := case when row(new.business_no, new.biz_open_date, new.ceo_name)
      is distinct from row(old.business_no, old.biz_open_date, old.ceo_name) then null else old.biz_verified_at end;
  new.biz_verification_provider := case when row(new.business_no, new.biz_open_date, new.ceo_name)
      is distinct from row(old.business_no, old.biz_open_date, old.ceo_name) then null else old.biz_verification_provider end;
  new.account_verified := case when row(new.bank_name, new.bank_account, new.bank_holder)
      is distinct from row(old.bank_name, old.bank_account, old.bank_holder) then false else old.account_verified end;
  new.account_verified_at := case when row(new.bank_name, new.bank_account, new.bank_holder)
      is distinct from row(old.bank_name, old.bank_account, old.bank_holder) then null else old.account_verified_at end;
  new.account_verification_provider := case when row(new.bank_name, new.bank_account, new.bank_holder)
      is distinct from row(old.bank_name, old.bank_account, old.bank_holder) then null else old.account_verification_provider end;

  if not is_admin then
    new.role := old.role;
    new.approved := old.approved;
    new.commission_rate := old.commission_rate;
  end if;
  return new;
end $$;

drop trigger if exists trg_lock_privileged_profile_fields on public.profiles;
create trigger trg_lock_privileged_profile_fields
  before update on public.profiles
  for each row execute function public.lock_privileged_profile_fields();

revoke all on function public.lock_privileged_profile_fields() from public, anon, authenticated;

create or replace function public.finalize_member_verification(
  p_user_id uuid,
  p_method text,
  p_provider text,
  p_provider_reference_hash text,
  p_subject jsonb default '{}'::jsonb,
  p_verified_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id uuid;
begin
  if p_method not in ('phone', 'email', 'business', 'account') then
    raise exception 'unsupported verification method';
  end if;

  insert into public.member_verification_events (
    user_id, actor_user_id, method, status, provider, provider_reference_hash
  ) values (
    p_user_id, p_user_id, p_method, 'verified', p_provider, p_provider_reference_hash
  ) returning id into event_id;

  if p_method = 'phone' then
    update public.profiles set
      phone = nullif(p_subject->>'phone', ''),
      phone_verified = true,
      phone_verified_at = p_verified_at,
      phone_verification_provider = p_provider
    where id = p_user_id;
  elsif p_method = 'email' then
    update public.profiles set
      email = nullif(p_subject->>'email', ''),
      email_verified = true,
      email_verified_at = p_verified_at,
      email_verification_provider = p_provider
    where id = p_user_id;
  elsif p_method = 'business' then
    update public.profiles set
      business_no = nullif(p_subject->>'business_no', ''),
      biz_open_date = nullif(p_subject->>'biz_open_date', ''),
      ceo_name = nullif(p_subject->>'ceo_name', ''),
      biz_verified = true,
      biz_verified_at = p_verified_at,
      biz_verification_provider = p_provider
    where id = p_user_id;
  else
    update public.profiles set
      account_verified = true,
      account_verified_at = p_verified_at,
      account_verification_provider = p_provider
    where id = p_user_id;
  end if;

  if not found then raise exception 'profile not found'; end if;
  return event_id;
end $$;

create or replace function public.admin_set_member_verification(
  p_actor_id uuid,
  p_user_id uuid,
  p_method text,
  p_verified boolean,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id uuid;
  event_status text := case when p_verified then 'manual_verified' else 'manual_revoked' end;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and approved = true and coalesce(suspended, false) = false
  ) then raise exception 'admin forbidden'; end if;
  if p_method not in ('phone', 'email', 'business', 'account') then raise exception 'unsupported verification method'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason required'; end if;

  if p_method = 'phone' then
    update public.profiles set phone_verified = p_verified,
      phone_verified_at = case when p_verified then now() else null end,
      phone_verification_provider = case when p_verified then 'admin_manual' else null end
    where id = p_user_id;
  elsif p_method = 'email' then
    update public.profiles set email_verified = p_verified,
      email_verified_at = case when p_verified then now() else null end,
      email_verification_provider = case when p_verified then 'admin_manual' else null end
    where id = p_user_id;
  elsif p_method = 'business' then
    update public.profiles set biz_verified = p_verified,
      biz_verified_at = case when p_verified then now() else null end,
      biz_verification_provider = case when p_verified then 'admin_manual' else null end
    where id = p_user_id;
  else
    update public.profiles set account_verified = p_verified,
      account_verified_at = case when p_verified then now() else null end,
      account_verification_provider = case when p_verified then 'admin_manual' else null end
    where id = p_user_id;
  end if;
  if not found then raise exception 'profile not found'; end if;

  insert into public.member_verification_events (
    user_id, actor_user_id, method, status, provider, reason_code, metadata
  ) values (
    p_user_id, p_actor_id, p_method, event_status, 'admin_manual', 'ADMIN_DECISION',
    jsonb_build_object('reason', trim(p_reason))
  ) returning id into event_id;
  return event_id;
end $$;

revoke all on function public.finalize_member_verification(uuid,text,text,text,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_set_member_verification(uuid,uuid,text,boolean,text) from public, anon, authenticated;
grant execute on function public.finalize_member_verification(uuid,text,text,text,jsonb,timestamptz) to service_role;
grant execute on function public.admin_set_member_verification(uuid,uuid,text,boolean,text) to service_role;
