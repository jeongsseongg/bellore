create or replace function public.finalize_member_verification(
  p_user_id uuid, p_method text, p_provider text, p_provider_reference_hash text,
  p_subject jsonb default '{}'::jsonb, p_verified_at timestamptz default now()
)
returns uuid language plpgsql security definer set search_path = public as $$
declare event_id uuid;
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
    update public.profiles set phone = nullif(p_subject->>'phone', ''), phone_verified = true,
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

revoke all on function public.finalize_member_verification(uuid,text,text,text,jsonb,timestamptz)
  from public, anon, authenticated;
grant execute on function public.finalize_member_verification(uuid,text,text,text,jsonb,timestamptz)
  to service_role;
