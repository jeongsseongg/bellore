-- BELLORE 활동·유입 분석 V3 canonical migration
-- 기준: 활동유입분석_타사이트_적용_실행지시서.md (2026-08-10)
--
-- 운영 보관정책: 원시 이벤트 90일, 비식별 집계 730일, 광고 클릭 ID 90일.

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
  array['localhost','127.0.0.1'], 'Asia/Seoul', '2026-08-10',
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
create index if not exists analytics_events_received_idx on public.analytics_events (site_id, received_at desc);
create index if not exists analytics_events_session_idx on public.analytics_events (site_id, session_id, received_at);
create index if not exists analytics_events_name_idx on public.analytics_events (site_id, event_name, received_at desc);
create unique index if not exists analytics_events_session_start_uidx
  on public.analytics_events (site_id, session_id) where event_name='session_start';
create unique index if not exists analytics_events_conversion_uidx
  on public.analytics_events (site_id, (properties->>'conversion_id'))
  where event_name='purchase_complete' and properties ? 'conversion_id';

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

alter table public.analytics_settings enable row level security;
alter table public.analytics_events enable row level security;
alter table public.analytics_conversion_attributions enable row level security;
alter table public.analytics_quality_daily enable row level security;

revoke all on public.analytics_settings from public, anon, authenticated;
revoke all on public.analytics_events from public, anon, authenticated;
revoke all on public.analytics_conversion_attributions from public, anon, authenticated;
revoke all on public.analytics_quality_daily from public, anon, authenticated;
grant select, insert, update, delete on public.analytics_settings to service_role;
grant select, insert, update, delete on public.analytics_events to service_role;
grant select, insert, update, delete on public.analytics_conversion_attributions to service_role;
grant select, insert, update, delete on public.analytics_quality_daily to service_role;

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

create or replace function public.analytics_ingest_event(
  p_event jsonb,
  p_origin text,
  p_authenticated_user uuid default null
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

  insert into public.analytics_events (
    event_id, site_id, event_name, event_version, occurred_at, environment,
    anonymous_id, session_id, user_id, view_id, target_id, acquisition, consent, properties
  ) values (
    (p_event->>'event_id')::uuid, v_site, v_name, coalesce((p_event->>'event_version')::smallint,1),
    greatest(now() - interval '24 hours', least((p_event->>'occurred_at')::timestamptz, now() + interval '5 minutes')),
    p_event->>'environment', nullif(p_event->>'anonymous_id','')::uuid,
    (p_event->>'session_id')::uuid, p_authenticated_user,
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
revoke all on function public.analytics_ingest_event(jsonb,text,uuid) from public, anon, authenticated;
grant execute on function public.analytics_ingest_event(jsonb,text,uuid) to service_role;

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
  v_result jsonb;
  v_total bigint;
  v_attributed bigint;
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin') then
    raise exception 'forbidden';
  end if;
  v_from := case when p_days <= 0 then date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
                 else now() - make_interval(days => least(p_days, 366)) end;
  select count(*) into v_total from public.orders o where o.status='paid' and o.paid_at >= v_from;
  select count(*) into v_attributed from public.analytics_conversion_attributions a where a.site_id='bellore' and a.converted_at >= v_from and a.session_id is not null;
  select jsonb_build_object(
    'generated_at', now(),
    'raw_retention_days', (select raw_event_retention_days from public.analytics_settings where site_id='bellore'),
    'kpis', jsonb_build_object(
      'sessions', (select count(distinct e.session_id) from public.analytics_events e where e.site_id='bellore' and e.received_at >= v_from),
      'visitors', (select count(distinct e.anonymous_id) from public.analytics_events e where e.site_id='bellore' and e.received_at >= v_from and e.anonymous_id is not null),
      'product_views', (select count(*) from public.analytics_events e where e.site_id='bellore' and e.event_name='product_view' and e.received_at >= v_from),
      'purchases', v_total, 'attributed_purchases', v_attributed, 'unattributed_purchases', greatest(v_total-v_attributed,0)
    ),
    'channels', coalesce((select jsonb_agg(to_jsonb(c) order by c.sessions desc) from (
      select coalesce(e.acquisition#>>'{session_touch,channel}','unclassified') channel, count(distinct e.session_id) sessions
      from public.analytics_events e where e.site_id='bellore' and e.event_name='session_start' and e.received_at >= v_from
      group by 1 order by 2 desc limit 20
    ) c),'[]'::jsonb),
    'funnel', jsonb_build_array(
      jsonb_build_object('step','세션','count',(select count(distinct e.session_id) from public.analytics_events e where e.site_id='bellore' and e.received_at >= v_from)),
      jsonb_build_object('step','상품 조회','count',(select count(distinct e.session_id) from public.analytics_events e where e.site_id='bellore' and e.event_name='product_view' and e.received_at >= v_from)),
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
  return jsonb_build_object('deleted',v_deleted,'click_ids_redacted',v_redacted,'ran_at',now());
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
