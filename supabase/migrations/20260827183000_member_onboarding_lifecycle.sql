-- Explicit member onboarding lifecycle without duplicating profiles.approved.

alter table public.profiles
  add column if not exists signup_submitted_at timestamptz,
  add column if not exists signup_reviewed_at timestamptz,
  add column if not exists signup_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists signup_review_note text,
  add column if not exists verification_deferred_at timestamptz;

create or replace function public.submit_member_onboarding(p_defer_verification boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare target public.profiles%rowtype;
begin
  select * into target from public.profiles where id = auth.uid() for update;
  if not found then raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND'; end if;
  if target.role::text not in ('vendor', 'partner') then
    raise exception using errcode = '22023', message = 'BUSINESS_ROLE_REQUIRED';
  end if;
  if coalesce(target.suspended, false) then
    raise exception using errcode = '42501', message = 'ACCOUNT_SUSPENDED';
  end if;
  if not p_defer_verification and not (
    coalesce(target.email_verified, false)
    and coalesce(target.phone_verified, false)
    and coalesce(target.biz_verified, false)
  ) then raise exception using errcode = '22023', message = 'VERIFICATION_REQUIRED'; end if;

  update public.profiles set
    approved = false,
    signup_submitted_at = now(),
    signup_reviewed_at = null,
    signup_reviewed_by = null,
    signup_review_note = null,
    verification_deferred_at = case when p_defer_verification then now() else null end
  where id = target.id;

  return jsonb_build_object('submitted', true, 'approved', false,
    'verificationDeferred', p_defer_verification);
end $$;

revoke all on function public.submit_member_onboarding(boolean) from public, anon;
grant execute on function public.submit_member_onboarding(boolean) to authenticated;

create or replace function public.admin_review_member_onboarding(
  p_actor_id uuid,
  p_target_id uuid,
  p_action text,
  p_patch jsonb,
  p_reason text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if p_action <> 'update_profile' then
    raise exception using errcode = '22023', message = 'BAD_ACTION';
  end if;
  if not (coalesce(p_patch, '{}'::jsonb) ? 'approved') then
    raise exception using errcode = '22023', message = 'APPROVAL_REQUIRED';
  end if;
  result := public.admin_manage_member_profile(
    p_actor_id, p_target_id, 'update_profile', p_patch, p_reason, p_expected_version
  );
  update public.profiles set
    signup_reviewed_at = now(),
    signup_reviewed_by = p_actor_id,
    signup_review_note = trim(p_reason)
  where id = p_target_id and role::text in ('vendor', 'partner');
  return result || jsonb_build_object('signupReviewed', true);
end $$;

revoke all on function public.admin_review_member_onboarding(uuid,uuid,text,jsonb,text,bigint)
  from public, anon, authenticated;
grant execute on function public.admin_review_member_onboarding(uuid,uuid,text,jsonb,text,bigint)
  to service_role;

create table if not exists public.member_signup_phone_tickets (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  phone text not null,
  verified_name text,
  provider text not null,
  provider_reference_hash text not null unique,
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_by uuid references auth.users(id) on delete set null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.member_signup_phone_tickets enable row level security;
revoke all on table public.member_signup_phone_tickets from public, anon, authenticated;

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
    jsonb_build_object('phone', ticket.phone), ticket.verified_at
  );
  update public.member_signup_phone_tickets
  set consumed_by = p_user_id, consumed_at = now()
  where id = ticket.id;
  return jsonb_build_object('phone', ticket.phone, 'name', ticket.verified_name, 'verifiedAt', ticket.verified_at);
end $$;

revoke all on function public.consume_member_signup_phone_ticket(uuid,text)
  from public, anon, authenticated;
grant execute on function public.consume_member_signup_phone_ticket(uuid,text)
  to service_role;
