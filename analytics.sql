-- ============================================================
-- 벨로르(BELLORE) · 접속/조회 추적 + 데이터 분석
-- Supabase 대시보드 > SQL Editor 에 "통째로" 붙여넣고 RUN (여러 번 실행해도 안전)
--
-- 무엇을 만드나:
--   1) page_views    : 페이지 방문 로그(누가/언제/어디서/무슨 화면)
--   2) product_views : 시계(상품) 조회 로그(누가 어떤 시계를 봤는지)
--   3) RLS: 누구나(익명 포함) 적재만 가능, 조회는 관리자만
--   4) 관리자 분석용 RPC: 오늘 방문/방문자/조회수 요약, 인기 상품, 최근 조회(누가 무엇을)
--
-- ※ "방문자수"는 기기별 visitor_id(localStorage)로 집계합니다(익명 포함 고유 추정).
-- ※ 시간 기준은 한국시간(Asia/Seoul) 자정 기준 "오늘"입니다.
-- ============================================================

-- ① 페이지 방문 로그 --------------------------------------------
create table if not exists public.page_views (
  id          bigserial primary key,
  path        text,                                   -- 화면/해시(예: #collection, #cq)
  visitor_id  text,                                   -- 기기 식별(localStorage, 익명 포함)
  user_id     uuid references auth.users(id) on delete set null,
  referrer    text,
  ua          text,
  created_at  timestamptz not null default now()
);
create index if not exists page_views_created_idx on public.page_views (created_at desc);
create index if not exists page_views_visitor_idx on public.page_views (visitor_id);

-- ② 상품(시계) 조회 로그 ----------------------------------------
create table if not exists public.product_views (
  id          bigserial primary key,
  listing_id  text,                                   -- listings.id(또는 정적카드 키)
  brand       text,
  model       text,
  visitor_id  text,
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists product_views_created_idx on public.product_views (created_at desc);
create index if not exists product_views_listing_idx on public.product_views (listing_id);

-- ③ RLS: 누구나 insert, 조회는 관리자만 ---------------------------
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

-- ④ 한국시간 '오늘 0시'(timestamptz) 헬퍼 ------------------------
create or replace function public.kst_today_start()
returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul'
$$;

-- ⑤ 관리자 전용 가드 --------------------------------------------
create or replace function public.is_admin_caller()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;

-- ⑥ 분석 요약(오늘 방문/방문자/상품조회 + 7일) -------------------
create or replace function public.analytics_overview()
returns json language plpgsql stable security definer set search_path = public as $$
declare t0 timestamptz := public.kst_today_start();
begin
  if not public.is_admin_caller() then raise exception 'forbidden'; end if;
  return json_build_object(
    'visitsToday',   (select count(*)                 from public.page_views    where created_at >= t0),
    'visitorsToday', (select count(distinct coalesce(visitor_id, id::text)) from public.page_views where created_at >= t0),
    'viewsToday',    (select count(*)                 from public.product_views where created_at >= t0),
    'membersViews',  (select count(*)                 from public.product_views where created_at >= t0 and user_id is not null),
    'visits7d',      (select count(*)                 from public.page_views    where created_at >= now() - interval '7 days'),
    'views7d',       (select count(*)                 from public.product_views where created_at >= now() - interval '7 days')
  );
end $$;
grant execute on function public.analytics_overview() to authenticated;

-- ⑦ 인기 상품 TOP(최근 N일) -------------------------------------
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
     where v.created_at >= now() - (days || ' days')::interval
       and v.listing_id is not null
     group by v.listing_id
     order by views desc
     limit lim;
end $$;
grant execute on function public.popular_products(int, int) to authenticated;

-- ⑧ 최근 조회(누가 어떤 시계를 봤는지) ---------------------------
create or replace function public.recent_product_views(lim int default 40)
returns table(created_at timestamptz, brand text, model text,
              viewer_name text, viewer_email text, is_member boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin_caller() then raise exception 'forbidden'; end if;
  return query
    select v.created_at, v.brand, v.model,
           p.display_name, p.email,
           (v.user_id is not null) as is_member
      from public.product_views v
      left join public.profiles p on p.id = v.user_id
     order by v.created_at desc
     limit lim;
end $$;
grant execute on function public.recent_product_views(int) to authenticated;

-- ⑨ 일자별 방문 추이(최근 14일, KST) ----------------------------
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
     group by d
     order by d desc;
end $$;
grant execute on function public.visits_by_day(int) to authenticated;
