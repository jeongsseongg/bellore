-- ============================================================
-- 벨로르(BELLORE) · 활동 로그/분석 V2 — 상세 분석 + 그래프 데이터
-- Supabase 대시보드 > SQL Editor 에 "통째로" 붙여넣고 RUN (여러 번 실행해도 안전)
--
-- 무엇이 좋아지나 (기존 analytics.sql 대비):
--   1) 기간 선택(오늘/7일/30일/90일) + 직전 기간 대비 증감(%) 데이터
--   2) 시간대별(0~23시) 방문 분포 → 그래프용
--   3) 많이 본 화면(페이지) TOP
--   4) 방문/상품조회 상세 로그 페이지네이션(더 보기) — 누가/언제/무엇을/어디서
--   5) 전체 누적(평생) 집계 — 로그는 삭제하지 않고 평생 보관
--
-- ※ 로그 보관 정책: page_views / product_views 는 어떤 자동 삭제도 하지 않는다(평생 기록).
-- ※ 기존 analytics.sql 을 실행하지 않았어도 이 파일 하나로 전부 설치된다.
-- ============================================================

-- ① 로그 테이블(기존과 동일 — 없으면 생성) --------------------
create table if not exists public.page_views (
  id          bigserial primary key,
  path        text,
  visitor_id  text,
  user_id     uuid references auth.users(id) on delete set null,
  referrer    text,
  ua          text,
  created_at  timestamptz not null default now()
);
create index if not exists page_views_created_idx on public.page_views (created_at desc);
create index if not exists page_views_visitor_idx on public.page_views (visitor_id);

create table if not exists public.product_views (
  id          bigserial primary key,
  listing_id  text,
  brand       text,
  model       text,
  visitor_id  text,
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists product_views_created_idx on public.product_views (created_at desc);
create index if not exists product_views_listing_idx on public.product_views (listing_id);

-- ② RLS: 누구나 적재, 조회는 관리자만 ---------------------------
alter table public.page_views    enable row level security;
alter table public.product_views enable row level security;

drop policy if exists "page_views insert" on public.page_views;
create policy "page_views insert" on public.page_views
  for insert to anon, authenticated with check (true);

drop policy if exists "page_views admin read" on public.page_views;
create policy "page_views admin read" on public.page_views
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "product_views insert" on public.product_views;
create policy "product_views insert" on public.product_views
  for insert to anon, authenticated with check (true);

drop policy if exists "product_views admin read" on public.product_views;
create policy "product_views admin read" on public.product_views
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ③ 공용 헬퍼 ---------------------------------------------------
create or replace function public.kst_today_start()
returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul'
$$;

create or replace function public.is_admin_caller()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;

-- ④ 요약 V2 — 기간(오늘/최근N일) + 직전 기간 대비 + 전체 누적 ----
--    days = 0 → 오늘(KST 0시~지금), 직전 기간 = 어제 같은 시간대까지
--    days > 0 → 최근 N일, 직전 기간 = 그 전 N일
create or replace function public.analytics_overview_v2(days int default 7)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  cur_from timestamptz; cur_to timestamptz := now();
  prev_from timestamptz; prev_to timestamptz;
begin
  if not public.is_admin_caller() then raise exception 'forbidden'; end if;
  if days <= 0 then
    cur_from  := public.kst_today_start();
    prev_from := cur_from - interval '1 day';
    prev_to   := now() - interval '1 day';
  else
    cur_from  := now() - (days || ' days')::interval;
    prev_from := now() - ((days * 2) || ' days')::interval;
    prev_to   := cur_from;
  end if;
  return json_build_object(
    'visits',        (select count(*) from public.page_views    where created_at >= cur_from and created_at <= cur_to),
    'visitors',      (select count(distinct coalesce(visitor_id, id::text)) from public.page_views where created_at >= cur_from and created_at <= cur_to),
    'productViews',  (select count(*) from public.product_views where created_at >= cur_from and created_at <= cur_to),
    'memberViews',   (select count(*) from public.product_views where created_at >= cur_from and created_at <= cur_to and user_id is not null),
    'prev', json_build_object(
      'visits',       (select count(*) from public.page_views    where created_at >= prev_from and created_at < prev_to),
      'visitors',     (select count(distinct coalesce(visitor_id, id::text)) from public.page_views where created_at >= prev_from and created_at < prev_to),
      'productViews', (select count(*) from public.product_views where created_at >= prev_from and created_at < prev_to),
      'memberViews',  (select count(*) from public.product_views where created_at >= prev_from and created_at < prev_to and user_id is not null)
    ),
    'totals', json_build_object(
      'visits',       (select count(*) from public.page_views),
      'visitors',     (select count(distinct coalesce(visitor_id, id::text)) from public.page_views),
      'productViews', (select count(*) from public.product_views),
      'firstAt',      (select min(created_at) from public.page_views)
    )
  );
end $$;
grant execute on function public.analytics_overview_v2(int) to authenticated;

-- ⑤ 일자별 방문 추이(그래프용, KST) ------------------------------
create or replace function public.visits_by_day(days int default 14)
returns table(d date, visits bigint, viewers bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_caller() then raise exception 'forbidden'; end if;
  return query
    select (created_at at time zone 'Asia/Seoul')::date as d,
           count(*)::bigint as visits,
           count(distinct coalesce(visitor_id, id::text))::bigint as viewers
      from public.page_views
     where created_at >= now() - (days || ' days')::interval
     group by 1
     order by 1 desc;
end $$;
grant execute on function public.visits_by_day(int) to authenticated;

-- ⑥ 시간대별 방문 분포(그래프용, KST 0~23시). days=0 → 오늘만 ----
create or replace function public.views_by_hour(days int default 7)
returns table(h int, visits bigint, product_views bigint)
language plpgsql stable security definer set search_path = public as $$
declare t0 timestamptz;
begin
  if not public.is_admin_caller() then raise exception 'forbidden'; end if;
  t0 := case when days <= 0 then public.kst_today_start()
             else now() - (days || ' days')::interval end;
  return query
    with hours as (select generate_series(0, 23) as hh)
    select hours.hh::int as h,
           coalesce((select count(*) from public.page_views v
                      where v.created_at >= t0
                        and extract(hour from v.created_at at time zone 'Asia/Seoul')::int = hours.hh), 0)::bigint as visits,
           coalesce((select count(*) from public.product_views pv
                      where pv.created_at >= t0
                        and extract(hour from pv.created_at at time zone 'Asia/Seoul')::int = hours.hh), 0)::bigint as product_views
      from hours
     order by hours.hh;
end $$;
grant execute on function public.views_by_hour(int) to authenticated;

-- ⑦ 많이 본 화면(페이지) TOP ------------------------------------
create or replace function public.top_paths(days int default 7, lim int default 10)
returns table(path text, views bigint, viewers bigint)
language plpgsql stable security definer set search_path = public as $$
declare t0 timestamptz;
begin
  if not public.is_admin_caller() then raise exception 'forbidden'; end if;
  t0 := case when days <= 0 then public.kst_today_start()
             else now() - (days || ' days')::interval end;
  return query
    select v.path,
           count(*)::bigint as views,
           count(distinct coalesce(v.visitor_id, v.id::text))::bigint as viewers
      from public.page_views v
     where v.created_at >= t0 and v.path is not null
     group by v.path
     order by views desc
     limit lim;
end $$;
grant execute on function public.top_paths(int, int) to authenticated;

-- ⑧ 인기 상품 TOP(기존과 동일 시그니처 — 재설치 겸 포함) ---------
create or replace function public.popular_products(days int default 7, lim int default 12)
returns table(listing_id text, brand text, model text, views bigint, viewers bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_caller() then raise exception 'forbidden'; end if;
  return query
    select v.listing_id,
           max(v.brand) as brand,
           max(v.model) as model,
           count(*)::bigint as views,
           count(distinct coalesce(v.visitor_id, v.id::text))::bigint as viewers
      from public.product_views v
     where (days <= 0 and v.created_at >= public.kst_today_start()
            or days > 0 and v.created_at >= now() - (days || ' days')::interval)
       and v.listing_id is not null
     group by v.listing_id
     order by views desc
     limit lim;
end $$;
grant execute on function public.popular_products(int, int) to authenticated;

-- ⑨ 상세 로그: 상품 조회(누가 어떤 시계를 언제) + 더 보기 --------
create or replace function public.recent_product_views_v2(lim int default 30, off int default 0)
returns table(created_at timestamptz, brand text, model text, listing_id text,
              visitor_id text, viewer_name text, viewer_email text, is_member boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_caller() then raise exception 'forbidden'; end if;
  return query
    select v.created_at, v.brand, v.model, v.listing_id,
           v.visitor_id, p.display_name, p.email,
           (v.user_id is not null) as is_member
      from public.product_views v
      left join public.profiles p on p.id = v.user_id
     order by v.created_at desc
     limit lim offset off;
end $$;
grant execute on function public.recent_product_views_v2(int, int) to authenticated;

-- ⑩ 상세 로그: 페이지 방문(누가 어떤 화면을 언제/어디서) ---------
create or replace function public.recent_page_views_v2(lim int default 30, off int default 0)
returns table(created_at timestamptz, path text, referrer text, ua text,
              visitor_id text, viewer_name text, viewer_email text, is_member boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_caller() then raise exception 'forbidden'; end if;
  return query
    select v.created_at, v.path, v.referrer, v.ua,
           v.visitor_id, p.display_name, p.email,
           (v.user_id is not null) as is_member
      from public.page_views v
      left join public.profiles p on p.id = v.user_id
     order by v.created_at desc
     limit lim offset off;
end $$;
grant execute on function public.recent_page_views_v2(int, int) to authenticated;

-- (참고) 기존 analytics.sql 의 analytics_overview / recent_product_views 도
-- 그대로 두면 됩니다. 새 화면은 위 V2 함수를 사용하고, V2 가 없으면
-- 자동으로 기존 방식으로 표시됩니다(클라이언트 폴백).
