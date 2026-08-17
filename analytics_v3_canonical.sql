-- BELLORE 활동·유입 분석 V3 canonical migration
-- 기준: 활동유입분석_타사이트_적용_실행지시서.md (2026-08-10)
--
-- 운영 보관정책: 원시 이벤트·가명 IP 90일, 비식별 집계 730일, 광고 클릭 ID 90일.

begin;

create extension if not exists pgcrypto;

alter table public.orders add column if not exists analytics_session_id uuid;
alter table public.orders add column if not exists analytics_anonymous_id uuid;
alter table public.orders add column if not exists analytics_attribution jsonb;
alter table public.orders drop constraint if exists orders_analytics_attribution_object;
alter table public.orders add constraint orders_analytics_attribution_object
  check (analytics_attribution is null or jsonb_typeof(analytics_attribution)='object');

create table if not exists public.analytics_settings (
  site_id text primary key,
  enabled boolean not null default false,
  allowed_hosts text[] not null default '{}',
  preview_hosts text[] not null default '{}',
  timezone text not null default 'Asia/Seoul',
  raw_event_retention_days integer check (raw_event_retention_days between 1 and 730),
  aggregate_retention_days integer check (aggregate_retention_days between 1 and 3650),
  click_id_retention_days integer check (click_id_retention_days between 1 and 180),
  policy_version text not null,
  updated_at timestamptz not null default now(),
  check (not enabled or (
    cardinality(allowed_hosts) > 0 and raw_event_retention_days is not null and
    aggregate_retention_days is not null and click_id_retention_days is not null
  ))
);

insert into public.analytics_settings (
  site_id, enabled, allowed_hosts, preview_hosts, timezone, policy_version,
  raw_event_retention_days, aggregate_retention_days, click_id_retention_days
) values (
  'bellore', true, array['bellore.co.kr','www.bellore.co.kr'],
  array['localhost','127.0.0.1'], 'Asia/Seoul', '2026-08-10-ip-v1',
  90, 730, 90
) on conflict (site_id) do update set
  enabled = excluded.enabled,
  allowed_hosts = excluded.allowed_hosts,
  preview_hosts = excluded.preview_hosts,
  timezone = excluded.timezone,
  policy_version = excluded.policy_version,
  raw_event_retention_days = excluded.raw_event_retention_days,
  aggregate_retention_days = excluded.aggregate_retention_days,
  click_id_retention_days = excluded.click_id_retention_days,
  updated_at = now();

create table if not exists public.analytics_events (
  event_id uuid not null,
  site_id text not null references public.analytics_settings(site_id),
  event_name text not null,
  event_version smallint not null default 1,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  environment text not null check (environment in ('production','preview','development')),
  anonymous_id uuid,
  session_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  ip_hash text,
  ip_network cidr,
  view_id text,
  target_id text,
  acquisition jsonb not null default '{}'::jsonb,
  consent jsonb not null default '{}'::jsonb,
  properties jsonb not null default '{}'::jsonb,
  primary key (site_id, event_id),
  check (event_name ~ '^[a-z][a-z0-9_]{1,63}$'),
  check (view_id is null or view_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  check (target_id is null or target_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
  check (jsonb_typeof(acquisition) = 'object'),
  check (jsonb_typeof(consent) = 'object'),
  check (jsonb_typeof(properties) = 'object')
);
alter table public.analytics_events add column if not exists ip_hash text;
alter table public.analytics_events add column if not exists ip_network cidr;
alter table public.analytics_events drop constraint if exists analytics_events_ip_hash_format;
alter table public.analytics_events add constraint analytics_events_ip_hash_format
  check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$');
create index if not exists analytics_events_received_idx on public.analytics_events (site_id, received_at desc);
create index if not exists analytics_events_session_idx on public.analytics_events (site_id, session_id, received_at);
create index if not exists analytics_events_name_idx on public.analytics_events (site_id, event_name, received_at desc);
create unique index if not exists analytics_events_session_start_uidx
  on public.analytics_events (site_id, session_id) where event_name='session_start';
create unique index if not exists analytics_events_conversion_uidx
  on public.analytics_events (site_id, (properties->>'conversion_id'))
  where event_name='purchase_complete' and properties ? 'conversion_id';
create index if not exists analytics_events_ip_subject_idx
  on public.analytics_events (site_id, ip_hash, user_id, received_at desc)
  where ip_hash is not null;

create table if not exists public.analytics_conversion_attributions (
  site_id text not null references public.analytics_settings(site_id),
  conversion_id uuid not null references public.orders(id) on delete cascade,
  session_id uuid,
  anonymous_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  first_touch jsonb,
  session_touch jsonb,
  conversion_touch jsonb,
  value bigint,
  currency text not null default 'KRW',
  converted_at timestamptz not null default now(),
  primary key (site_id, conversion_id),
  check (currency ~ '^[A-Z]{3}$')
);
create index if not exists analytics_conversion_time_idx on public.analytics_conversion_attributions (site_id, converted_at desc);

create table if not exists public.analytics_quality_daily (
  site_id text not null references public.analytics_settings(site_id),
  day date not null default current_date,
  duplicate_events bigint not null default 0,
  rejected_events bigint not null default 0,
  rate_limited_events bigint not null default 0,
  primary key (site_id, day)
);

-- 비동의 방문은 사용자·IP·세션·행동 원문 없이 일별 숫자로만 저장한다.
create table if not exists public.analytics_consent_daily (
  site_id text not null references public.analytics_settings(site_id),
  day date not null,
  consent_state text not null check (consent_state in ('granted','denied')),
  visitor_type text not null check (visitor_type in ('member','guest')),
  visits bigint not null default 0 check (visits >= 0),
  primary key (site_id, day, consent_state, visitor_type)
);

alter table public.analytics_settings enable row level security;
alter table public.analytics_events enable row level security;
alter table public.analytics_conversion_attributions enable row level security;
alter table public.analytics_quality_daily enable row level security;
alter table public.analytics_consent_daily enable row level security;

revoke all on public.analytics_settings from public, anon, authenticated;
revoke all on public.analytics_events from public, anon, authenticated;
revoke all on public.analytics_conversion_attributions from public, anon, authenticated;
revoke all on public.analytics_quality_daily from public, anon, authenticated;
revoke all on public.analytics_consent_daily from public, anon, authenticated;
grant select, insert, update, delete on public.analytics_settings to service_role;
grant select, insert, update, delete on public.analytics_events to service_role;
grant select, insert, update, delete on public.analytics_conversion_attributions to service_role;
grant select, insert, update, delete on public.analytics_quality_daily to service_role;
grant select, insert, update, delete on public.analytics_consent_daily to service_role;

-- V1/V2의 공개 직접 INSERT를 닫는다. V3 Edge Function이 유일한 수집 경로다.
do $$ begin
  if to_regclass('public.page_views') is not null then
    execute 'drop policy if exists "page_views insert" on public.page_views';
    execute 'revoke insert on public.page_views from anon, authenticated';
  end if;
  if to_regclass('public.product_views') is not null then
    execute 'drop policy if exists "product_views insert" on public.product_views';
    execute 'revoke insert on public.product_views from anon, authenticated';
  end if;
end $$;

create or replace function public.analytics_record_consent_aggregate(
  p_site text,
  p_consent_state text,
  p_visitor_type text,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.analytics_settings%rowtype;
  v_day date;
begin
  select * into v_settings from public.analytics_settings where site_id=p_site and enabled=true;
  if not found then raise exception 'analytics_not_configured'; end if;
  if p_consent_state not in ('granted','denied') then raise exception 'invalid_consent_state'; end if;
  if p_visitor_type not in ('member','guest') then raise exception 'invalid_visitor_type'; end if;
  v_day := (greatest(now()-interval '24 hours', least(coalesce(p_occurred_at,now()), now()+interval '5 minutes')) at time zone v_settings.timezone)::date;
  insert into public.analytics_consent_daily(site_id,day,consent_state,visitor_type,visits)
  values(p_site,v_day,p_consent_state,p_visitor_type,1)
  on conflict(site_id,day,consent_state,visitor_type)
  do update set visits=public.analytics_consent_daily.visits+1;
  return jsonb_build_object('accepted',true,'aggregate_only',true);
end $$;
revoke all on function public.analytics_record_consent_aggregate(text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_record_consent_aggregate(text,text,text,timestamptz) to service_role;

create or replace function public.analytics_consent_dashboard_v1(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_day date;
begin
  if not exists (
    select 1 from public.profiles
    where id=auth.uid() and role='admin'
  ) then
    raise exception 'admin_required';
  end if;
  v_from_day := case
    when coalesce(p_days,7)=0 then (now() at time zone 'Asia/Seoul')::date
    when p_days>=365 then date '2000-01-01'
    else ((now() at time zone 'Asia/Seoul')::date - greatest(p_days,1) + 1)
  end;
  return jsonb_build_object(
    'consent_total', coalesce((
      select sum(c.visits) from public.analytics_consent_daily c
      where c.site_id='bellore' and c.day>=v_from_day
    ),0),
    'consent_groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'consent_state',g.consent_state,
        'visitor_type',g.visitor_type,
        'visits',g.visits
      ) order by g.consent_state,g.visitor_type)
      from (
        select c.consent_state,c.visitor_type,sum(c.visits) visits
        from public.analytics_consent_daily c
        where c.site_id='bellore' and c.day>=v_from_day
        group by c.consent_state,c.visitor_type
      ) g
    ),'[]'::jsonb)
  );
end $$;
revoke all on function public.analytics_consent_dashboard_v1(integer) from public, anon;
grant execute on function public.analytics_consent_dashboard_v1(integer) to authenticated;

create or replace function public.analytics_ingest_event(
  p_event jsonb,
  p_origin text,
  p_authenticated_user uuid,
  p_ip_hash text,
  p_ip text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.analytics_settings%rowtype;
  v_name text := p_event->>'event_name';
  v_site text := p_event->>'site_id';
  v_host text;
  v_inserted integer := 0;
  v_allowed text[];
  v_key text;
  v_ip_network cidr;
begin
  if p_event is null or length(p_event::text) > 16384 then raise exception 'payload_too_large'; end if;
  select * into v_settings from public.analytics_settings where site_id = v_site;
  if not found or not v_settings.enabled then raise exception 'analytics_not_configured'; end if;
  v_host := lower(regexp_replace(split_part(regexp_replace(coalesce(p_origin,''), '^https?://', ''), '/', 1), ':\d+$', ''));
  if v_host = '' or not (v_host = any(v_settings.allowed_hosts)) then raise exception 'origin_not_allowed'; end if;
  if p_event->>'environment' <> 'production' then raise exception 'environment_not_collectable'; end if;
  if p_event#>>'{consent,analytics}' <> 'granted' then raise exception 'analytics_consent_required'; end if;
  if p_authenticated_user is not null and exists (
    select 1 from public.profiles p where p.id=p_authenticated_user and p.role='admin'
  ) then raise exception 'internal_traffic_excluded'; end if;
  if v_name not in (
    'session_start','view_open','view_dwell','page_exit','page_return','element_click',
    'purchase_click','quote_requested','phone_call','product_view','purchase_complete',
    'purchase_failed','consent_updated'
  ) then raise exception 'event_not_allowed'; end if;

  v_allowed := case v_name
    when 'session_start' then array['device_class']
    when 'view_open' then array['route','navigation_id']
    when 'view_dwell' then array['engaged_ms','segment_id']
    when 'page_exit' then array['navigation_id']
    when 'page_return' then array['navigation_id']
    when 'phone_call' then array['measurement','location_id']
    when 'product_view' then array['listing_id','brand','model']
    when 'purchase_complete' then array['conversion_id','listing_id','value','currency']
    when 'purchase_failed' then array['reason_code']
    when 'consent_updated' then array['analytics','ads']
    else array[]::text[] end;
  for v_key in select jsonb_object_keys(coalesce(p_event->'properties','{}'::jsonb)) loop
    if not (v_key = any(v_allowed)) then raise exception 'property_not_allowed:%', v_key; end if;
  end loop;

  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_ip_hash'; end if;
  begin
    if p_ip is not null and length(p_ip) <= 64 then
      v_ip_network := set_masklen(p_ip::inet, case when family(p_ip::inet)=4 then 24 else 56 end)::cidr;
    end if;
  exception when invalid_text_representation then
    v_ip_network := null;
  end;

  insert into public.analytics_events (
    event_id, site_id, event_name, event_version, occurred_at, environment,
    anonymous_id, session_id, user_id, ip_hash, ip_network,
    view_id, target_id, acquisition, consent, properties
  ) values (
    (p_event->>'event_id')::uuid, v_site, v_name, coalesce((p_event->>'event_version')::smallint,1),
    greatest(now() - interval '24 hours', least((p_event->>'occurred_at')::timestamptz, now() + interval '5 minutes')),
    p_event->>'environment', nullif(p_event->>'anonymous_id','')::uuid,
    (p_event->>'session_id')::uuid, p_authenticated_user, p_ip_hash, v_ip_network,
    nullif(p_event->>'view_id',''), nullif(p_event->>'target_id',''),
    coalesce(p_event->'acquisition','{}'::jsonb), coalesce(p_event->'consent','{}'::jsonb),
    coalesce(p_event->'properties','{}'::jsonb)
  ) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    insert into public.analytics_quality_daily(site_id, day, duplicate_events)
    values (v_site, current_date, 1)
    on conflict (site_id, day) do update set duplicate_events = public.analytics_quality_daily.duplicate_events + 1;
  end if;
  return jsonb_build_object('accepted', true, 'duplicate', v_inserted = 0);
exception when invalid_text_representation or datetime_field_overflow then
  raise exception 'invalid_payload';
end $$;
revoke all on function public.analytics_ingest_event(jsonb,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.analytics_ingest_event(jsonb,text,uuid,text,text) to service_role;
drop function if exists public.analytics_ingest_event(jsonb,text,uuid);

-- 결제 원장 확정과 귀속 스냅샷을 같은 DB transaction으로 처리한다.
create or replace function public.analytics_finalize_paid_order(
  p_order_id uuid,
  p_amount bigint,
  p_discount bigint,
  p_method text,
  p_payment_key text,
  p_receipt_url text,
  p_attribution jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_session uuid;
  v_anon uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status <> 'paid' then
    update public.orders set status='paid', amount=p_amount, discount=p_discount,
      method=left(p_method,80), payment_key=left(p_payment_key,160), receipt_url=left(p_receipt_url,500), paid_at=now()
    where id=p_order_id returning * into v_order;
  end if;
  -- 신규 주문은 생성 시 저장된 귀속값이 진실의 원천이다. p_attribution은 migration 전 생성된 주문 폴백 전용.
  p_attribution := coalesce(v_order.analytics_attribution, p_attribution);
  begin
    v_session := coalesce(v_order.analytics_session_id, nullif(p_attribution->>'session_id','')::uuid);
    v_anon := coalesce(v_order.analytics_anonymous_id, nullif(p_attribution->>'anonymous_id','')::uuid);
  exception when invalid_text_representation then
    v_session := null; v_anon := null;
  end;
  if p_attribution is not null and v_session is not null then
    insert into public.analytics_conversion_attributions (
      site_id, conversion_id, session_id, anonymous_id, user_id,
      first_touch, session_touch, conversion_touch, value, currency, converted_at
    ) values (
      'bellore', v_order.id, v_session, v_anon, v_order.customer_id,
      p_attribution->'first_touch', p_attribution->'session_touch', p_attribution->'conversion_touch',
      v_order.amount, 'KRW', coalesce(v_order.paid_at, now())
    ) on conflict (site_id, conversion_id) do nothing;
  end if;
  return jsonb_build_object('ok',true,'order',to_jsonb(v_order));
end $$;
revoke all on function public.analytics_finalize_paid_order(uuid,bigint,bigint,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.analytics_finalize_paid_order(uuid,bigint,bigint,text,text,text,jsonb) to service_role;

create or replace function public.analytics_dashboard_v3(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_result jsonb;
  v_total bigint;
  v_attributed bigint;
  v_sessions bigint;
  v_visitors bigint;
  v_page_views bigint;
  v_product_views bigint;
  v_member_sessions bigint;
  v_guest_sessions bigint;
  v_prev_sessions bigint;
  v_prev_visitors bigint;
  v_prev_page_views bigint;
  v_prev_product_views bigint;
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin') then
    raise exception 'forbidden';
  end if;
  v_from := case when p_days <= 0 then date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
                 else now() - make_interval(days => least(p_days, 366)) end;
  v_prev_from := case when p_days <= 0 then v_from - interval '1 day'
                      else v_from - make_interval(days => least(p_days, 366)) end;
  v_prev_to := case when p_days <= 0 then now() - interval '1 day' else v_from end;

  select
    (select count(distinct coalesce(v.session_id::text, coalesce(v.visitor_id,v.id::text) || ':' || (v.created_at at time zone 'Asia/Seoul')::date::text)) from public.page_views v where v.created_at >= v_from)
      + (select count(distinct e.session_id) from public.analytics_events e where e.site_id='bellore' and e.event_name='session_start' and e.received_at >= v_from),
    (select count(distinct coalesce(v.visitor_id,v.id::text)) from public.page_views v where v.created_at >= v_from)
      + (select count(distinct e.anonymous_id) from public.analytics_events e where e.site_id='bellore' and e.received_at >= v_from and e.anonymous_id is not null),
    (select count(*) from public.page_views v where v.created_at >= v_from)
      + (select count(*) from public.analytics_events e where e.site_id='bellore' and e.event_name='view_open' and e.received_at >= v_from),
    (select count(*) from public.product_views v where v.created_at >= v_from)
      + (select count(*) from public.analytics_events e where e.site_id='bellore' and e.event_name='product_view' and e.received_at >= v_from),
    (select count(distinct coalesce(v.session_id::text, coalesce(v.visitor_id,v.id::text) || ':' || (v.created_at at time zone 'Asia/Seoul')::date::text)) from public.page_views v where v.created_at >= v_from and v.user_id is not null)
      + (select count(distinct e.session_id) from public.analytics_events e where e.site_id='bellore' and e.event_name='session_start' and e.received_at >= v_from and e.user_id is not null),
    (select count(distinct coalesce(v.session_id::text, coalesce(v.visitor_id,v.id::text) || ':' || (v.created_at at time zone 'Asia/Seoul')::date::text)) from public.page_views v where v.created_at >= v_from and v.user_id is null)
      + (select count(distinct e.session_id) from public.analytics_events e where e.site_id='bellore' and e.event_name='session_start' and e.received_at >= v_from and e.user_id is null)
  into v_sessions, v_visitors, v_page_views, v_product_views, v_member_sessions, v_guest_sessions;

  select
    (select count(distinct coalesce(v.session_id::text, coalesce(v.visitor_id,v.id::text) || ':' || (v.created_at at time zone 'Asia/Seoul')::date::text)) from public.page_views v where v.created_at >= v_prev_from and v.created_at < v_prev_to)
      + (select count(distinct e.session_id) from public.analytics_events e where e.site_id='bellore' and e.event_name='session_start' and e.received_at >= v_prev_from and e.received_at < v_prev_to),
    (select count(distinct coalesce(v.visitor_id,v.id::text)) from public.page_views v where v.created_at >= v_prev_from and v.created_at < v_prev_to)
      + (select count(distinct e.anonymous_id) from public.analytics_events e where e.site_id='bellore' and e.received_at >= v_prev_from and e.received_at < v_prev_to and e.anonymous_id is not null),
    (select count(*) from public.page_views v where v.created_at >= v_prev_from and v.created_at < v_prev_to)
      + (select count(*) from public.analytics_events e where e.site_id='bellore' and e.event_name='view_open' and e.received_at >= v_prev_from and e.received_at < v_prev_to),
    (select count(*) from public.product_views v where v.created_at >= v_prev_from and v.created_at < v_prev_to)
      + (select count(*) from public.analytics_events e where e.site_id='bellore' and e.event_name='product_view' and e.received_at >= v_prev_from and e.received_at < v_prev_to)
  into v_prev_sessions, v_prev_visitors, v_prev_page_views, v_prev_product_views;

  select count(*) into v_total from public.orders o where o.status='paid' and o.paid_at >= v_from;
  select count(*) into v_attributed from public.analytics_conversion_attributions a where a.site_id='bellore' and a.converted_at >= v_from and a.session_id is not null;
  select jsonb_build_object(
    'generated_at', now(),
    'raw_retention_days', (select raw_event_retention_days from public.analytics_settings where site_id='bellore'),
    'history', jsonb_build_object(
      'legacy_page_views', (select count(*) from public.page_views),
      'legacy_product_views', (select count(*) from public.product_views),
      'v3_events', (select count(*) from public.analytics_events where site_id='bellore'),
      'first_at', (select min(created_at) from public.page_views),
      'cutover_at', (select min(received_at) from public.analytics_events where site_id='bellore')
    ),
    'kpis', jsonb_build_object(
      'sessions', v_sessions,
      'visitors', v_visitors,
      'page_views', v_page_views,
      'product_views', v_product_views,
      'member_sessions', v_member_sessions,
      'guest_sessions', v_guest_sessions,
      'ip_subjects', (select count(distinct e.ip_hash || ':' || coalesce(e.user_id::text,'guest')) from public.analytics_events e where e.site_id='bellore' and e.received_at >= v_from and e.ip_hash is not null),
      'purchases', v_total, 'attributed_purchases', v_attributed, 'unattributed_purchases', greatest(v_total-v_attributed,0)
    ),
    'previous', jsonb_build_object('sessions',v_prev_sessions,'visitors',v_prev_visitors,'page_views',v_prev_page_views,'product_views',v_prev_product_views),
    'consent_total', coalesce((
      select sum(c.visits) from public.analytics_consent_daily c
      where c.site_id='bellore' and c.day >= (v_from at time zone 'Asia/Seoul')::date
    ),0),
    'consent_groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'consent_state',g.consent_state,'visitor_type',g.visitor_type,'visits',g.visits
      ) order by g.consent_state, g.visitor_type)
      from (
        select c.consent_state,c.visitor_type,sum(c.visits) visits
        from public.analytics_consent_daily c
        where c.site_id='bellore' and c.day >= (v_from at time zone 'Asia/Seoul')::date
        group by c.consent_state,c.visitor_type
      ) g
    ),'[]'::jsonb),
    'trend', coalesce((with activity as (
      select v.created_at ts, 'legacy:' || coalesce(v.visitor_id,v.id::text) visitor_key from public.page_views v where v.created_at >= v_from
      union all
      select e.received_at, 'v3:' || coalesce(e.anonymous_id::text,e.event_id::text) from public.analytics_events e where e.site_id='bellore' and e.event_name='view_open' and e.received_at >= v_from
    ), days as (
      select generate_series((v_from at time zone 'Asia/Seoul')::date, (now() at time zone 'Asia/Seoul')::date, interval '1 day')::date d
    ), daily as (
      select (a.ts at time zone 'Asia/Seoul')::date d, count(*) visits, count(distinct a.visitor_key) viewers from activity a group by 1
    ) select jsonb_agg(jsonb_build_object('d',days.d,'visits',coalesce(daily.visits,0),'viewers',coalesce(daily.viewers,0)) order by days.d) from days left join daily using(d)),'[]'::jsonb),
    'hours', coalesce((with hours as (select generate_series(0,23) h), visits as (
      select extract(hour from x.ts at time zone 'Asia/Seoul')::int h, count(*) visits from (
        select v.created_at ts from public.page_views v where v.created_at >= v_from
        union all select e.received_at from public.analytics_events e where e.site_id='bellore' and e.event_name='view_open' and e.received_at >= v_from
      ) x group by 1
    ), products as (
      select extract(hour from x.ts at time zone 'Asia/Seoul')::int h, count(*) product_views from (
        select v.created_at ts from public.product_views v where v.created_at >= v_from
        union all select e.received_at from public.analytics_events e where e.site_id='bellore' and e.event_name='product_view' and e.received_at >= v_from
      ) x group by 1
    ) select jsonb_agg(jsonb_build_object('h',hours.h,'visits',coalesce(visits.visits,0),'product_views',coalesce(products.product_views,0)) order by hours.h) from hours left join visits using(h) left join products using(h)),'[]'::jsonb),
    'channels', coalesce((with legacy_sessions as (
      select distinct on (session_key) session_key, raw_channel, ref_host from (
        select coalesce(v.session_id::text, coalesce(v.visitor_id,v.id::text) || ':' || (v.created_at at time zone 'Asia/Seoul')::date::text) session_key,
               coalesce(nullif(v.channel,''),v.acquisition->>'channel','') raw_channel,
               lower(split_part(regexp_replace(coalesce(v.referrer,''),'^https?://','','i'),'/',1)) ref_host,
               v.created_at
        from public.page_views v where v.created_at >= v_from
      ) s order by session_key, created_at
    ), new_sessions as (
      select e.session_id::text session_key, coalesce(e.acquisition#>>'{session_touch,channel}','unclassified') raw_channel,
             coalesce(e.acquisition#>>'{session_touch,referrer_host}','') ref_host
      from public.analytics_events e where e.site_id='bellore' and e.event_name='session_start' and e.received_at >= v_from
    ), classified as (
      select case
        when raw_channel like 'naver_paid%' then 'naver_paid'
        when raw_channel='naver_place' or ref_host ~ '(^|\.)((pcmap|m)\.)?place\.naver\.com$' then 'naver_place'
        when raw_channel like 'naver_%' or ref_host ~ '(^|\.)(search\.)?naver\.com$' then 'naver_organic'
        when raw_channel like 'google_paid%' then 'google_paid'
        when raw_channel='google_organic' or ref_host ~ '(^|\.)google\.' then 'google_organic'
        when ref_host ~ '(^|\.)chatgpt\.com$|(^|\.)perplexity\.ai$|(^|\.)claude\.ai$' then 'ai'
        when raw_channel in ('paid_social','organic_social') or ref_host ~ 'instagram|facebook|threads|twitter|tiktok' then 'social'
        when ref_host ~ '(^|\.)mail\.' then 'email'
        when raw_channel='direct' or ref_host='' or ref_host in ('bellore.co.kr','www.bellore.co.kr') then 'direct'
        when raw_channel='unclassified' and ref_host='' then 'unclassified'
        else 'referral' end channel_key
      from (select * from legacy_sessions union all select * from new_sessions) u
    ), grouped as (select channel_key, count(*) sessions from classified group by channel_key)
    select jsonb_agg(jsonb_build_object('key',channel_key,'channel',case channel_key
      when 'direct' then '직접 유입' when 'naver_paid' then '네이버 광고' when 'naver_place' then '네이버 플레이스'
      when 'naver_organic' then '네이버 검색' when 'google_paid' then '구글 광고' when 'google_organic' then '구글 검색'
      when 'ai' then 'AI·ChatGPT' when 'social' then 'SNS' when 'email' then '이메일'
      when 'referral' then '외부 사이트' else '미분류' end,'sessions',sessions) order by sessions desc) from grouped),'[]'::jsonb),
    'visitor_types', jsonb_build_array(
      jsonb_build_object('key','member','label','회원','sessions',v_member_sessions),
      jsonb_build_object('key','guest','label','비회원','sessions',v_guest_sessions)
    ),
    'devices', coalesce((with legacy_sessions as (
      select distinct on (session_key) session_key, ua from (
        select coalesce(v.session_id::text, coalesce(v.visitor_id,v.id::text) || ':' || (v.created_at at time zone 'Asia/Seoul')::date::text) session_key, coalesce(v.ua,'') ua, v.created_at
        from public.page_views v where v.created_at >= v_from
      ) s order by session_key, created_at
    ), unified as (
      select case when ua ~* 'ipad|tablet' then 'tablet' when ua ~* 'mobile|android|iphone' then 'mobile' else 'desktop' end device from legacy_sessions
      union all
      select coalesce(nullif(e.properties->>'device_class',''),'unknown') from public.analytics_events e where e.site_id='bellore' and e.event_name='session_start' and e.received_at >= v_from
    ), grouped as (select device, count(*) sessions from unified group by device)
    select jsonb_agg(jsonb_build_object('key',device,'label',case device when 'mobile' then '모바일' when 'tablet' then '태블릿' when 'desktop' then 'PC' else '기타' end,'sessions',sessions) order by sessions desc) from grouped),'[]'::jsonb),
    'top_pages', coalesce((with unified as (
      select coalesce(nullif(v.path,''),'#home') path, 'legacy:' || coalesce(v.visitor_id,v.id::text) visitor_key from public.page_views v where v.created_at >= v_from
      union all
      select coalesce(nullif(e.properties->>'route',''),'#' || coalesce(nullif(e.view_id,''),'home')), 'v3:' || coalesce(e.anonymous_id::text,e.event_id::text)
      from public.analytics_events e where e.site_id='bellore' and e.event_name='view_open' and e.received_at >= v_from
    ), grouped as (select path, count(*) views, count(distinct visitor_key) viewers from unified group by path order by views desc limit 10)
    select jsonb_agg(to_jsonb(grouped) order by views desc) from grouped),'[]'::jsonb),
    'top_products', coalesce((with unified as (
      select coalesce(nullif(v.listing_id,''),'legacy:' || v.id::text) listing_id, v.brand, v.model, 'legacy:' || coalesce(v.visitor_id,v.id::text) visitor_key from public.product_views v where v.created_at >= v_from
      union all
      select coalesce(nullif(e.properties->>'listing_id',''),'v3:' || e.event_id::text), e.properties->>'brand', e.properties->>'model', 'v3:' || coalesce(e.anonymous_id::text,e.event_id::text)
      from public.analytics_events e where e.site_id='bellore' and e.event_name='product_view' and e.received_at >= v_from
    ), grouped as (select listing_id, max(brand) brand, max(model) model, count(*) views, count(distinct visitor_key) viewers from unified group by listing_id order by views desc limit 10)
    select jsonb_agg(to_jsonb(grouped) order by views desc) from grouped),'[]'::jsonb),
    'keywords', coalesce((with session_touch as (
      select distinct on (e.session_id)
        e.session_id, e.anonymous_id,
        coalesce(e.acquisition#>>'{session_touch,channel}','unclassified') raw_channel,
        coalesce(e.acquisition#>>'{session_touch,referrer_host}','') ref_host,
        nullif(trim(e.acquisition#>>'{session_touch,n_query}'),'') n_query,
        nullif(trim(e.acquisition#>>'{session_touch,n_keyword}'),'') n_keyword,
        nullif(trim(e.acquisition#>>'{session_touch,utm_term}'),'') utm_term
      from public.analytics_events e
      where e.site_id='bellore' and e.received_at >= v_from
      order by e.session_id, e.received_at
    ), terms as (
      select distinct s.session_id, s.anonymous_id, s.raw_channel, s.ref_host, x.keyword, x.keyword_type
      from session_touch s
      cross join lateral (values
        (s.n_query, 'actual_query'::text),
        (s.n_keyword, 'registered_keyword'::text),
        (s.utm_term, 'registered_keyword'::text)
      ) x(keyword, keyword_type)
      where x.keyword is not null
    ), actions as (
      select e.session_id,
        count(*) filter (where e.event_name='product_view') product_views,
        count(*) filter (where e.event_name='purchase_click') purchase_clicks
      from public.analytics_events e
      where e.site_id='bellore' and e.received_at >= v_from
      group by e.session_id
    ), conversions as (
      select a.session_id, count(*) purchases
      from public.analytics_conversion_attributions a
      where a.site_id='bellore' and a.converted_at >= v_from and a.session_id is not null
      group by a.session_id
    ), normalized as (
      select t.*,
        case
          when t.raw_channel like 'naver_paid%' then '네이버 광고'
          when t.raw_channel='naver_place' or t.ref_host ~ '(^|\.)((pcmap|m)\.)?place\.naver\.com$' then '네이버 플레이스'
          when t.raw_channel like 'naver_%' or t.ref_host ~ '(^|\.)(search\.)?naver\.com$' then '네이버 검색'
          when t.raw_channel like 'google_paid%' then '구글 광고'
          when t.raw_channel='google_organic' or t.ref_host ~ '(^|\.)google\.' then '구글 검색'
          when t.raw_channel in ('paid_social','organic_social') or t.ref_host ~ 'instagram|facebook|threads|twitter|tiktok' then 'SNS'
          when t.raw_channel='direct' or t.ref_host='' or t.ref_host in ('bellore.co.kr','www.bellore.co.kr') then '직접 유입'
          when t.raw_channel='unclassified' then '미분류'
          else '외부 사이트' end source
      from terms t
    ), grouped as (
      select n.keyword, n.keyword_type, n.source,
        count(distinct n.session_id) sessions,
        count(distinct n.anonymous_id) visitors,
        coalesce(sum(a.product_views),0) product_views,
        coalesce(sum(a.purchase_clicks),0) purchase_clicks,
        coalesce(sum(c.purchases),0) purchases
      from normalized n
      left join actions a using(session_id)
      left join conversions c using(session_id)
      group by n.keyword, n.keyword_type, n.source
      order by sessions desc, purchases desc, n.keyword
      limit 100
    ) select jsonb_agg(to_jsonb(grouped) order by sessions desc, purchases desc, keyword) from grouped),'[]'::jsonb),
    'source_performance', coalesce((with sessions as (
      select distinct on (e.session_id)
        e.session_id, e.anonymous_id,
        coalesce(e.acquisition#>>'{session_touch,channel}','unclassified') raw_channel,
        coalesce(e.acquisition#>>'{session_touch,referrer_host}','') ref_host
      from public.analytics_events e
      where e.site_id='bellore' and e.received_at >= v_from
      order by e.session_id, e.received_at
    ), normalized as (
      select s.*,
        case
          when s.raw_channel like 'naver_paid%' then '네이버 광고'
          when s.raw_channel='naver_place' or s.ref_host ~ '(^|\.)((pcmap|m)\.)?place\.naver\.com$' then '네이버 플레이스'
          when s.raw_channel like 'naver_%' or s.ref_host ~ '(^|\.)(search\.)?naver\.com$' then '네이버 검색'
          when s.raw_channel like 'google_paid%' then '구글 광고'
          when s.raw_channel='google_organic' or s.ref_host ~ '(^|\.)google\.' then '구글 검색'
          when s.ref_host ~ '(^|\.)chatgpt\.com$|(^|\.)perplexity\.ai$|(^|\.)claude\.ai$' then 'AI·ChatGPT'
          when s.raw_channel in ('paid_social','organic_social') or s.ref_host ~ 'instagram|facebook|threads|twitter|tiktok' then 'SNS'
          when s.ref_host ~ '(^|\.)mail\.' then '이메일'
          when s.raw_channel='direct' or s.ref_host='' or s.ref_host in ('bellore.co.kr','www.bellore.co.kr') then '직접 유입'
          when s.raw_channel='unclassified' then '미분류'
          else '외부 사이트' end source
      from sessions s
    ), actions as (
      select e.session_id,
        count(*) filter (where e.event_name='product_view') product_views,
        count(*) filter (where e.event_name='purchase_click') purchase_clicks
      from public.analytics_events e
      where e.site_id='bellore' and e.received_at >= v_from
      group by e.session_id
    ), conversions as (
      select a.session_id, count(*) purchases, coalesce(sum(a.value),0) revenue
      from public.analytics_conversion_attributions a
      where a.site_id='bellore' and a.converted_at >= v_from and a.session_id is not null
      group by a.session_id
    ), grouped as (
      select n.source, count(distinct n.session_id) sessions, count(distinct n.anonymous_id) visitors,
        coalesce(sum(a.product_views),0) product_views,
        coalesce(sum(a.purchase_clicks),0) purchase_clicks,
        coalesce(sum(c.purchases),0) purchases,
        coalesce(sum(c.revenue),0) revenue
      from normalized n
      left join actions a using(session_id)
      left join conversions c using(session_id)
      group by n.source
      order by sessions desc, purchases desc
    ) select jsonb_agg(to_jsonb(grouped) order by sessions desc, purchases desc) from grouped),'[]'::jsonb),
    'ip_clients', coalesce((select jsonb_agg(to_jsonb(i) order by i.last_seen desc) from (
      select e.ip_network::text ip_network, left(e.ip_hash,12) ip_key,
             (e.user_id is not null) is_member,
             case when e.user_id is not null then left(e.user_id::text,8) else null end member_ref,
             count(distinct e.session_id) sessions, count(*) events,
             min(e.received_at) first_seen, max(e.received_at) last_seen
      from public.analytics_events e
      where e.site_id='bellore' and e.received_at >= v_from and e.ip_hash is not null
      group by e.ip_hash, e.ip_network, e.user_id
      order by last_seen desc limit 100
    ) i),'[]'::jsonb),
    'recent_activity', coalesce((with activity as (
      select v.created_at occurred_at, 'navigation' category, '화면 방문' action, coalesce(nullif(v.path,''),'#home') subject,
             (v.user_id is not null) is_member, case when v.user_id is not null then left(v.user_id::text,8) end member_ref, '기존 로그' source,
             '기존 #' || left(coalesce(v.visitor_id,v.id::text),8) visitor, coalesce(nullif(v.path,''),'#home') page,
             '화면 방문 · 기존 수집 기록' detail
      from public.page_views v where v.created_at >= v_from
      union all
      select v.created_at, 'product', '상품 조회', trim(coalesce(v.brand,'') || ' ' || coalesce(v.model,'')),
             (v.user_id is not null), case when v.user_id is not null then left(v.user_id::text,8) end, '기존 로그',
             '기존 #' || left(coalesce(v.visitor_id,v.id::text),8), '상품 상세',
             trim(coalesce(v.brand,'') || ' ' || coalesce(v.model,'')) || ' 상품 조회'
      from public.product_views v where v.created_at >= v_from
      union all
      select e.received_at,
             case when e.event_name in ('product_view','purchase_click','purchase_complete','purchase_failed') then 'commerce'
                  when e.event_name in ('quote_requested','phone_call') then 'lead' else 'navigation' end,
             case e.event_name when 'session_start' then '방문 시작' when 'view_open' then '화면 방문' when 'product_view' then '상품 조회'
                  when 'purchase_click' then '구매 클릭' when 'purchase_complete' then '구매 확정' when 'purchase_failed' then '구매 실패'
                  when 'quote_requested' then '견적 신청' when 'phone_call' then '전화 연결' when 'element_click' then '버튼 클릭' else '기타 활동' end,
             coalesce(nullif(e.properties->>'route',''),nullif(trim(coalesce(e.properties->>'brand','') || ' ' || coalesce(e.properties->>'model','')),''),nullif(e.target_id,''),nullif(e.view_id,''),'-'),
             (e.user_id is not null), case when e.user_id is not null then left(e.user_id::text,8) end,
             case coalesce(e.acquisition#>>'{session_touch,channel}','unclassified')
               when 'direct' then '직접 유입' when 'naver_paid' then '네이버 광고' when 'naver_place' then '네이버 플레이스'
               when 'naver_organic' then '네이버 검색' when 'google_paid' then '구글 광고' when 'google_organic' then '구글 검색'
               when 'unclassified' then '미분류' else coalesce(e.acquisition#>>'{session_touch,referrer_host}','신규 분석') end,
             coalesce(e.ip_network::text, '가명 #' || left(coalesce(e.ip_hash,e.anonymous_id::text),8)),
             coalesce(nullif(e.properties->>'route',''),'#' || coalesce(nullif(e.view_id,''),'home')),
             case e.event_name
               when 'session_start' then coalesce(e.properties->>'device_class','기기 미분류') || ' · 방문 시작'
               when 'view_open' then coalesce(nullif(e.properties->>'route',''),'화면') || ' 이동'
               when 'product_view' then trim(coalesce(e.properties->>'brand','') || ' ' || coalesce(e.properties->>'model','')) || ' 상품 조회'
               when 'purchase_click' then '구매 버튼 클릭'
               when 'purchase_complete' then '결제 완료·구매 확정'
               when 'element_click' then coalesce(nullif(e.target_id,''),'요소') || ' 클릭'
               else '분석 이벤트' end
      from public.analytics_events e where e.site_id='bellore' and e.received_at >= v_from
        and e.event_name not in ('view_dwell','page_exit','page_return','consent_updated')
    ) select jsonb_agg(to_jsonb(a) order by occurred_at desc) from (select * from activity order by occurred_at desc limit 80) a),'[]'::jsonb),
    'funnel', jsonb_build_array(
      jsonb_build_object('step','방문 세션','count',v_sessions),
      jsonb_build_object('step','상품 조회','count',(select count(distinct coalesce(v.visitor_id,v.id::text)) from public.product_views v where v.created_at >= v_from) + (select count(distinct e.session_id) from public.analytics_events e where e.site_id='bellore' and e.event_name='product_view' and e.received_at >= v_from)),
      jsonb_build_object('step','구매 클릭','count',(select count(distinct e.session_id) from public.analytics_events e where e.site_id='bellore' and e.event_name='purchase_click' and e.received_at >= v_from)),
      jsonb_build_object('step','구매 확정','count',v_total)
    ),
    'quality', jsonb_build_object(
      'unclassified_sessions',(select count(distinct e.session_id) from public.analytics_events e where e.site_id='bellore' and e.event_name='session_start' and e.received_at >= v_from and coalesce(e.acquisition#>>'{session_touch,channel}','unclassified')='unclassified'),
      'delayed_events',(select count(*) from public.analytics_events e where e.site_id='bellore' and e.received_at >= v_from and e.received_at-e.occurred_at > interval '10 minutes'),
      'duplicate_events',coalesce((select sum(q.duplicate_events) from public.analytics_quality_daily q where q.site_id='bellore' and q.day >= v_from::date),0),
      'attribution_balanced',(v_attributed + greatest(v_total-v_attributed,0) = v_total)
    )
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.analytics_dashboard_v3(integer) from public, anon;
grant execute on function public.analytics_dashboard_v3(integer) to authenticated;

-- 이전 분석 관리자 RPC의 PostgreSQL 기본 PUBLIC EXECUTE 권한을 제거한다.
-- 함수 내부 관리자 확인은 유지하고, 로그인한 사용자에게만 호출 경로를 연다.
do $$
declare
  v_signature text;
  v_proc regprocedure;
begin
  foreach v_signature in array array[
    'public.analytics_overview()',
    'public.analytics_overview_v2(integer)',
    'public.popular_products(integer,integer)',
    'public.recent_product_views(integer)',
    'public.visits_by_day(integer)',
    'public.views_by_hour(integer)',
    'public.top_paths(integer,integer)',
    'public.recent_product_views_v2(integer,integer)',
    'public.recent_page_views_v2(integer,integer)'
  ] loop
    v_proc := to_regprocedure(v_signature);
    if v_proc is not null then
      execute format('revoke all on function %s from public, anon', v_proc);
      execute format('grant execute on function %s to authenticated', v_proc);
    end if;
  end loop;
end $$;

create or replace function public.analytics_purge_expired()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.analytics_settings%rowtype;
  v_deleted bigint := 0;
  v_redacted bigint := 0;
  v_attr_redacted bigint := 0;
begin
  select * into v_settings from public.analytics_settings where site_id='bellore';
  if not found or v_settings.raw_event_retention_days is null then
    return jsonb_build_object('skipped',true,'reason','retention_not_configured');
  end if;
  update public.analytics_events e set acquisition = jsonb_build_object(
    'first_touch', coalesce(e.acquisition->'first_touch','{}'::jsonb) - array['gclid','dclid','wbraid','gbraid','msclkid','fbclid','ttclid','n_click_id'],
    'session_touch', coalesce(e.acquisition->'session_touch','{}'::jsonb) - array['gclid','dclid','wbraid','gbraid','msclkid','fbclid','ttclid','n_click_id']
  ) where e.site_id='bellore' and e.received_at < now()-make_interval(days=>v_settings.click_id_retention_days)
    and e.acquisition::text ~ '(gclid|fbclid|n_click_id|wbraid|gbraid|msclkid|ttclid|dclid)';
  get diagnostics v_redacted = row_count;
  update public.analytics_conversion_attributions a set
    first_touch = coalesce(a.first_touch,'{}'::jsonb) - array['gclid','dclid','wbraid','gbraid','msclkid','fbclid','ttclid','n_click_id'],
    session_touch = coalesce(a.session_touch,'{}'::jsonb) - array['gclid','dclid','wbraid','gbraid','msclkid','fbclid','ttclid','n_click_id'],
    conversion_touch = coalesce(a.conversion_touch,'{}'::jsonb) - array['gclid','dclid','wbraid','gbraid','msclkid','fbclid','ttclid','n_click_id']
  where a.site_id='bellore' and a.converted_at < now()-make_interval(days=>v_settings.click_id_retention_days)
    and (coalesce(a.first_touch,'{}'::jsonb)::text || coalesce(a.session_touch,'{}'::jsonb)::text || coalesce(a.conversion_touch,'{}'::jsonb)::text)
      ~ '(gclid|fbclid|n_click_id|wbraid|gbraid|msclkid|ttclid|dclid)';
  get diagnostics v_attr_redacted = row_count;
  v_redacted := v_redacted + v_attr_redacted;
  update public.orders o set analytics_attribution = jsonb_build_object(
    'event_id', o.analytics_attribution->'event_id',
    'anonymous_id', o.analytics_attribution->'anonymous_id',
    'session_id', o.analytics_attribution->'session_id',
    'first_touch', coalesce(o.analytics_attribution->'first_touch','{}'::jsonb) - array['gclid','dclid','wbraid','gbraid','msclkid','fbclid','ttclid','n_click_id'],
    'session_touch', coalesce(o.analytics_attribution->'session_touch','{}'::jsonb) - array['gclid','dclid','wbraid','gbraid','msclkid','fbclid','ttclid','n_click_id'],
    'conversion_touch', coalesce(o.analytics_attribution->'conversion_touch','{}'::jsonb) - array['gclid','dclid','wbraid','gbraid','msclkid','fbclid','ttclid','n_click_id']
  ) where o.analytics_attribution is not null and o.paid_at < now()-make_interval(days=>v_settings.click_id_retention_days)
    and o.analytics_attribution::text ~ '(gclid|fbclid|n_click_id|wbraid|gbraid|msclkid|ttclid|dclid)';
  delete from public.analytics_events e where e.site_id='bellore' and e.received_at < now()-make_interval(days=>v_settings.raw_event_retention_days);
  get diagnostics v_deleted = row_count;
  delete from public.analytics_conversion_attributions a
    where a.site_id='bellore' and a.converted_at < now()-make_interval(days=>v_settings.aggregate_retention_days);
  update public.orders o set analytics_session_id=null, analytics_anonymous_id=null, analytics_attribution=null
    where o.paid_at < now()-make_interval(days=>v_settings.aggregate_retention_days)
      and (o.analytics_session_id is not null or o.analytics_anonymous_id is not null or o.analytics_attribution is not null);
  return jsonb_build_object('deleted',v_deleted,'click_ids_redacted',v_redacted,'ip_data_retention_days',v_settings.raw_event_retention_days,'ran_at',now());
end $$;
revoke all on function public.analytics_purge_expired() from public, anon, authenticated;
grant execute on function public.analytics_purge_expired() to service_role;

-- pg_cron이 이미 활성화된 프로젝트에서만 매일 03:20 KST(18:20 UTC) 파기를 예약한다.
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='bellore-analytics-retention';
    perform cron.schedule('bellore-analytics-retention','20 18 * * *','select public.analytics_purge_expired()');
  end if;
end $$;

commit;

-- 적용 후 확인:
-- select enabled, raw_event_retention_days, aggregate_retention_days, click_id_retention_days
-- from public.analytics_settings where site_id='bellore';
-- select routine_name, grantee from information_schema.routine_privileges
-- where routine_name like 'analytics_%' order by routine_name, grantee;
