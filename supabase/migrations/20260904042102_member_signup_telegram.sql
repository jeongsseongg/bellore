-- New customers only. Existing profiles are a baseline, never a backfill.
create table public.member_signup_notice_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  eligible boolean not null default true,
  completed_at timestamptz,
  context jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(context) = 'object')
);
alter table public.member_signup_notice_state enable row level security;
revoke all on public.member_signup_notice_state from public, anon, authenticated;
grant select, insert, update, delete on public.member_signup_notice_state to service_role;
insert into public.member_signup_notice_state(user_id, eligible)
select id, false from public.profiles;

alter table public.telegram_ops_outbox drop constraint telegram_ops_outbox_target_check;
alter table public.telegram_ops_outbox add constraint telegram_ops_outbox_target_check
  check (target in ('order_room','quote_room','support_room','customer_kakao','signup_room'));

create schema if not exists bellore_private;
revoke all on schema bellore_private from public, anon, authenticated;

create function bellore_private.signup_notice_profile_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s public.member_signup_notice_state%rowtype;
  provider text;
  marketing jsonb;
begin
  if auth.uid() is not null and auth.uid() <> new.id
     and current_setting('role',true) <> 'service_role' then return new; end if;
  insert into public.member_signup_notice_state(user_id,eligible)
    values(new.id, tg_op = 'INSERT') on conflict(user_id) do nothing;
  select * into s from public.member_signup_notice_state where user_id=new.id for update;
  if not s.eligible or s.completed_at is not null or new.role::text <> 'customer'
    or coalesce(new.suspended,false) or not coalesce(new.phone_verified,false)
    or nullif(trim(new.verified_name),'') is null or new.birth_date is null
    or nullif(trim(new.phone),'') is null or nullif(trim(new.postcode),'') is null
    or nullif(trim(new.addr1),'') is null then return new; end if;
  select raw_app_meta_data->>'provider',raw_user_meta_data->'marketing_consent'
    into provider,marketing from auth.users where id=new.id;
  update public.member_signup_notice_state set completed_at=now() where user_id=new.id;
  insert into public.telegram_ops_outbox(dedupe_key,event_type,target,payload,available_at)
  values ('member-signup:'||new.id,'member_signup','signup_room',jsonb_build_object(
    'userId',new.id,'name',new.verified_name,'phone',new.phone,
    'postcode',new.postcode,'addr1',new.addr1,'addr2',new.addr2,
    'completedAt',now(),'provider',coalesce(provider,'unknown'),
    'phoneVerified',new.phone_verified,'marketingConsent',marketing,
    'context',s.context),now()+interval '60 seconds')
  on conflict(dedupe_key) do nothing;
  return new;
end $$;
revoke all on function bellore_private.signup_notice_profile_trigger() from public,anon,authenticated;
create trigger trg_member_signup_notice after insert or update on public.profiles
  for each row execute function bellore_private.signup_notice_profile_trigger();

-- Only a small whitelist is stored. Never store click IDs, full URLs, IP or browsing history.
create function bellore_private.signup_notice_clean_context(input jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare result jsonb; touch jsonb; k text; v text; label text;
begin
  result := jsonb_build_object(
    'analytics',case when input->>'analytics' in ('granted','denied','pending') then input->>'analytics' else 'unknown' end,
    'ads',case when input->>'ads' in ('granted','denied','pending') then input->>'ads' else 'unknown' end);
  if result->>'analytics' <> 'granted' then return result; end if;
  foreach label in array array['first','session'] loop
    touch := '{}'::jsonb;
    foreach k in array array['channel','utm_source','utm_medium','utm_campaign','referrer_host'] loop
      v := left(regexp_replace(coalesce(input->label->>k,''),'[[:cntrl:]]',' ','g'),100);
      if v <> '' and v !~ '[@?/#=]' then touch := touch || jsonb_build_object(k,v); end if;
    end loop;
    result := result || jsonb_build_object(label,touch);
  end loop;
  return result;
end $$;
revoke all on function bellore_private.signup_notice_clean_context(jsonb) from public,anon,authenticated;

create function public.record_signup_notice_context(p_context jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); clean jsonb; s public.member_signup_notice_state%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if octet_length(p_context::text)>4096 then raise exception 'CONTEXT_TOO_LARGE'; end if;
  if not exists(select 1 from public.profiles where id=uid and not coalesce(suspended,false))
    then raise exception 'ACCOUNT_UNAVAILABLE'; end if;
  select * into s from public.member_signup_notice_state where user_id=uid for update;
  if not found or not s.eligible then return jsonb_build_object('accepted',false,'reason','existing_member'); end if;
  if exists(select 1 from public.telegram_ops_outbox where dedupe_key='member-signup:'||uid and attempts>0)
    then return jsonb_build_object('accepted',false,'reason','already_dispatched'); end if;
  clean := bellore_private.signup_notice_clean_context(p_context);
  update public.member_signup_notice_state set context=clean where user_id=uid;
  update public.telegram_ops_outbox set payload=jsonb_set(payload,'{context}',clean),updated_at=now()
    where dedupe_key='member-signup:'||uid and status='pending' and attempts=0;
  return jsonb_build_object('accepted',true);
end $$;
revoke all on function public.record_signup_notice_context(jsonb) from public,anon;
grant execute on function public.record_signup_notice_context(jsonb) to authenticated;
