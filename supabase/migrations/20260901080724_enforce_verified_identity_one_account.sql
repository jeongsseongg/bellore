-- Bind each account to one server-verified PortOne identity. Raw CI/DI values
-- are never stored; only a deterministic SHA-256 DI digest is retained.

alter table public.profiles
  add column if not exists verified_name text,
  add column if not exists birth_date date;

alter table public.profiles
  drop constraint if exists profiles_verified_name_length,
  add constraint profiles_verified_name_length
    check (verified_name is null or length(verified_name) between 1 and 80),
  drop constraint if exists profiles_birth_date_range,
  add constraint profiles_birth_date_range
    check (birth_date is null or birth_date between date '1900-01-01' and date '2100-12-31');

comment on column public.profiles.verified_name is
  'Name returned by the server-verified identity provider; client edits are blocked.';
comment on column public.profiles.birth_date is
  'Birth date returned by the server-verified identity provider; client edits are blocked.';

create table if not exists public.member_verified_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  identity_di_hash text not null unique,
  phone text not null,
  verified_name text not null,
  birth_date date not null,
  provider text not null,
  verified_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint member_verified_identities_di_hash_format
    check (identity_di_hash ~ '^[0-9a-f]{64}$'),
  constraint member_verified_identities_phone_format
    check (phone ~ '^010[0-9]{8}$'),
  constraint member_verified_identities_name_length
    check (length(verified_name) between 1 and 80),
  constraint member_verified_identities_birth_date_range
    check (birth_date between date '1900-01-01' and date '2100-12-31')
);

alter table public.member_verified_identities enable row level security;
revoke all on table public.member_verified_identities from public, anon, authenticated;

comment on table public.member_verified_identities is
  'Private server-only ledger for enforcing one account per PortOne-verified person.';
comment on column public.member_verified_identities.identity_di_hash is
  'SHA-256(portone-identity-di-v1 + NUL + provider DI); raw DI is never persisted.';

alter table public.member_signup_phone_tickets
  add column if not exists identity_di_hash text,
  add column if not exists birth_date date;

alter table public.member_signup_phone_tickets
  drop constraint if exists member_signup_phone_tickets_di_hash_format,
  add constraint member_signup_phone_tickets_di_hash_format
    check (identity_di_hash is null or identity_di_hash ~ '^[0-9a-f]{64}$');

-- Preserve the one already verified production account and block reuse of its
-- current phone even before that member completes a fresh DI-backed check.
create unique index if not exists profiles_verified_phone_uidx
  on public.profiles ((regexp_replace(phone, '[^0-9]', '', 'g')))
  where phone_verified is true and phone is not null;

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

  new.verified_name := old.verified_name;
  new.birth_date := old.birth_date;
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
  event_user_id uuid;
  normalized_phone text := nullif(p_subject->>'phone', '');
  verified_identity_name text := nullif(p_subject->>'verified_name', '');
  verified_birth_text text := nullif(p_subject->>'birth_date', '');
  verified_birth_date date;
  identity_hash text := nullif(p_subject->>'identity_di_hash', '');
  current_identity_hash text;
begin
  if p_method not in ('phone', 'email', 'business', 'account') then
    raise exception 'unsupported verification method';
  end if;

  select id, user_id into event_id, event_user_id
  from public.member_verification_events
  where method = p_method
    and provider = p_provider
    and provider_reference_hash = p_provider_reference_hash
    and status = 'verified'
  limit 1;
  if found then
    if event_user_id is distinct from p_user_id then
      raise exception using errcode = '23505', message = 'IDENTITY_ALREADY_USED';
    end if;
  else
    insert into public.member_verification_events (
      user_id, actor_user_id, method, status, provider, provider_reference_hash
    ) values (
      p_user_id, p_user_id, p_method, 'verified', p_provider, p_provider_reference_hash
    ) returning id into event_id;
  end if;

  if p_method = 'phone' and p_provider = 'portone_inicis_unified' then
    if normalized_phone is null
       or normalized_phone !~ '^010[0-9]{8}$'
       or verified_identity_name is null
       or verified_birth_text is null
       or verified_birth_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or identity_hash is null
       or identity_hash !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023', message = 'VERIFIED_IDENTITY_INCOMPLETE';
    end if;
    begin
      verified_birth_date := verified_birth_text::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'VERIFIED_BIRTH_DATE_INVALID';
    end;

    begin
      select identity_di_hash into current_identity_hash
      from public.member_verified_identities
      where user_id = p_user_id
      for update;
      if found and current_identity_hash <> identity_hash then
        raise exception using errcode = '22023', message = 'ACCOUNT_IDENTITY_MISMATCH';
      elsif found then
        update public.member_verified_identities set
          phone = normalized_phone,
          verified_name = verified_identity_name,
          birth_date = verified_birth_date,
          provider = p_provider,
          verified_at = p_verified_at,
          updated_at = now()
        where user_id = p_user_id;
      else
        insert into public.member_verified_identities (
          user_id, identity_di_hash, phone, verified_name, birth_date, provider, verified_at
        ) values (
          p_user_id, identity_hash, normalized_phone, verified_identity_name,
          verified_birth_date, p_provider, p_verified_at
        );
      end if;

      update public.profiles set
        phone = normalized_phone,
        display_name = verified_identity_name,
        verified_name = verified_identity_name,
        birth_date = verified_birth_date,
        phone_verified = true,
        phone_verified_at = p_verified_at,
        phone_verification_provider = p_provider
      where id = p_user_id;
    exception when unique_violation then
      raise exception using errcode = '23505', message = 'IDENTITY_ALREADY_REGISTERED';
    end;
  elsif p_method = 'phone' then
    update public.profiles set phone = normalized_phone, phone_verified = true,
      phone_verified_at = p_verified_at, phone_verification_provider = p_provider where id = p_user_id;
  elsif p_method = 'email' then
    update public.profiles set email = nullif(p_subject->>'email', ''), email_verified = true,
      email_verified_at = p_verified_at, email_verification_provider = p_provider where id = p_user_id;
  elsif p_method = 'business' then
    update public.profiles set business_no = nullif(p_subject->>'business_no', ''),
      biz_open_date = nullif(p_subject->>'biz_open_date', ''), ceo_name = nullif(p_subject->>'ceo_name', ''),
      biz_verified = true, biz_verified_at = p_verified_at,
      biz_verification_provider = p_provider where id = p_user_id;
  else
    update public.profiles set bank_name = nullif(p_subject->>'bank_name', ''),
      bank_account = nullif(p_subject->>'bank_account', ''), bank_holder = nullif(p_subject->>'bank_holder', ''),
      account_verified = true, account_verified_at = p_verified_at,
      account_verification_provider = p_provider where id = p_user_id;
  end if;
  if not found then raise exception 'profile not found'; end if;
  return event_id;
end $$;

create or replace function public.consume_member_signup_phone_ticket(
  p_user_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare ticket public.member_signup_phone_tickets%rowtype;
begin
  select * into ticket from public.member_signup_phone_tickets
  where token_hash = p_token_hash for update;
  if not found then raise exception using errcode = 'P0002', message = 'PHONE_TICKET_NOT_FOUND'; end if;
  if ticket.consumed_at is not null then raise exception using errcode = '23505', message = 'PHONE_TICKET_USED'; end if;
  if ticket.expires_at <= now() then raise exception using errcode = '22023', message = 'PHONE_TICKET_EXPIRED'; end if;

  perform public.finalize_member_verification(
    p_user_id, 'phone', ticket.provider, ticket.provider_reference_hash,
    jsonb_build_object(
      'phone', ticket.phone,
      'verified_name', ticket.verified_name,
      'birth_date', ticket.birth_date,
      'identity_di_hash', ticket.identity_di_hash
    ), ticket.verified_at
  );
  update public.member_signup_phone_tickets
  set consumed_by = p_user_id, consumed_at = now()
  where id = ticket.id;
  return jsonb_build_object(
    'phone', ticket.phone,
    'name', ticket.verified_name,
    'birthDate', ticket.birth_date,
    'verifiedAt', ticket.verified_at
  );
end $$;

revoke all on function public.lock_privileged_profile_fields() from public, anon, authenticated;
revoke all on function public.finalize_member_verification(uuid,text,text,text,jsonb,timestamptz)
  from public, anon, authenticated;
revoke all on function public.consume_member_signup_phone_ticket(uuid,text)
  from public, anon, authenticated;
grant execute on function public.finalize_member_verification(uuid,text,text,text,jsonb,timestamptz)
  to service_role;
grant execute on function public.consume_member_signup_phone_ticket(uuid,text)
  to service_role;
