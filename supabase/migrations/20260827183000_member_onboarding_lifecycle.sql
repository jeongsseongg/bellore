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
