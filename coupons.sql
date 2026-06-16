-- ============================================================
-- 벨로르(BELLORE) · 쿠폰 시스템
-- Supabase SQL Editor 에서 1회 실행하세요. (orders.sql 이후)
-- ------------------------------------------------------------
-- 구성:
--   coupons        : 관리자가 만드는 쿠폰(템플릿). 코드/다운로드/지급의 원본.
--   user_coupons   : 회원이 보유한 쿠폰(지급·코드입력·다운로드로 생성).
--   claim_coupon_by_code / claim_coupon : 회원이 쿠폰을 받는 RPC(보안 정의자).
--   admin_grant_coupon                  : 관리자가 특정 회원에게 지급.
-- 사용처(apply_to): 'order'(구매결제) | 'commission'(위탁수수료) | 'both'
-- ============================================================

-- 1) 쿠폰 템플릿 -------------------------------------------------
create table if not exists public.coupons (
  id             uuid primary key default gen_random_uuid(),
  code           text unique,                       -- 코드입력용(null=코드 없음)
  title          text not null,                     -- 표시 이름 (예: 신규가입 10%)
  discount_type  text not null default 'amount',    -- 'amount'(정액 원) | 'percent'(정률 %)
  discount_value bigint not null default 0,         -- 원 또는 %
  max_discount   bigint,                            -- 정률일 때 최대 할인액(원), null=무제한
  min_order      bigint not null default 0,         -- 최소 대상금액(원)
  apply_to       text not null default 'both',      -- 'order' | 'commission' | 'both'
  downloadable   boolean not null default false,    -- 팝업/이벤트에서 클릭 다운로드 허용
  usage_limit    int,                               -- 전체 발급 수량 제한(null=무제한)
  per_user_limit int not null default 1,            -- 1인당 보유 가능 수
  starts_at      timestamptz,
  expires_at     timestamptz,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- 2) 회원 보유 쿠폰 --------------------------------------------
create table if not exists public.user_coupons (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'active',       -- 'active' | 'used'
  used_at     timestamptz,
  order_id    uuid references public.orders(id) on delete set null,
  used_context text,                                -- 'order' | 'commission'
  created_at  timestamptz not null default now()
);
create index if not exists user_coupons_user_idx on public.user_coupons (user_id, status);

-- 3) 주문에 쿠폰/할인 컬럼 추가 -------------------------------
alter table public.orders add column if not exists coupon_user_id uuid references public.user_coupons(id) on delete set null;
alter table public.orders add column if not exists discount bigint not null default 0;

-- 4) RLS ------------------------------------------------------
alter table public.coupons enable row level security;
alter table public.user_coupons enable row level security;

-- 쿠폰 템플릿: 누구나 '활성' 쿠폰 조회 가능(코드/다운로드 노출용). 관리자 전체.
drop policy if exists coupons_select_active on public.coupons;
create policy coupons_select_active on public.coupons
  for select using (active = true or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists coupons_admin_all on public.coupons;
create policy coupons_admin_all on public.coupons
  for all using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 보유 쿠폰: 본인 것만 조회. 관리자 전체. (생성/수정은 RPC 가 담당)
drop policy if exists user_coupons_select_own on public.user_coupons;
create policy user_coupons_select_own on public.user_coupons
  for select using (auth.uid() = user_id or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists user_coupons_admin_all on public.user_coupons;
create policy user_coupons_admin_all on public.user_coupons
  for all using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 5) 쿠폰 받기 RPC (보안 정의자: 한도/기간 검증 후 user_coupons 생성) -----
create or replace function public._claim_coupon(p_coupon public.coupons, p_uid uuid)
returns public.user_coupons
language plpgsql security definer set search_path = public as $$
declare
  v_issued int;
  v_mine   int;
  v_row    public.user_coupons;
begin
  if p_uid is null then raise exception 'NOT_LOGGED_IN'; end if;
  if p_coupon is null or p_coupon.active is not true then raise exception 'COUPON_INVALID'; end if;
  if p_coupon.starts_at is not null and now() < p_coupon.starts_at then raise exception 'COUPON_NOT_STARTED'; end if;
  if p_coupon.expires_at is not null and now() > p_coupon.expires_at then raise exception 'COUPON_EXPIRED'; end if;

  select count(*) into v_issued from public.user_coupons where coupon_id = p_coupon.id;
  if p_coupon.usage_limit is not null and v_issued >= p_coupon.usage_limit then raise exception 'COUPON_SOLD_OUT'; end if;

  select count(*) into v_mine from public.user_coupons where coupon_id = p_coupon.id and user_id = p_uid;
  if v_mine >= coalesce(p_coupon.per_user_limit, 1) then raise exception 'COUPON_ALREADY_OWNED'; end if;

  insert into public.user_coupons (coupon_id, user_id) values (p_coupon.id, p_uid)
  returning * into v_row;
  return v_row;
end; $$;

-- 코드 입력으로 받기
create or replace function public.claim_coupon_by_code(p_code text)
returns public.user_coupons
language plpgsql security definer set search_path = public as $$
declare v_c public.coupons;
begin
  select * into v_c from public.coupons where upper(code) = upper(trim(p_code)) limit 1;
  if v_c.id is null then raise exception 'COUPON_NOT_FOUND'; end if;
  return public._claim_coupon(v_c, auth.uid());
end; $$;

-- 다운로드(클릭)로 받기 — downloadable 쿠폰만
create or replace function public.claim_coupon(p_coupon_id uuid)
returns public.user_coupons
language plpgsql security definer set search_path = public as $$
declare v_c public.coupons;
begin
  select * into v_c from public.coupons where id = p_coupon_id limit 1;
  if v_c.id is null then raise exception 'COUPON_NOT_FOUND'; end if;
  if v_c.downloadable is not true then raise exception 'COUPON_NOT_DOWNLOADABLE'; end if;
  return public._claim_coupon(v_c, auth.uid());
end; $$;

-- 관리자: 특정 회원에게 지급
create or replace function public.admin_grant_coupon(p_coupon_id uuid, p_user_id uuid)
returns public.user_coupons
language plpgsql security definer set search_path = public as $$
declare v_c public.coupons;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    then raise exception 'NOT_ADMIN'; end if;
  select * into v_c from public.coupons where id = p_coupon_id limit 1;
  if v_c.id is null then raise exception 'COUPON_NOT_FOUND'; end if;
  return public._claim_coupon(v_c, p_user_id);
end; $$;

-- 위탁 수수료 등에서 쿠폰 사용 처리(보유자 본인 또는 관리자)
create or replace function public.redeem_user_coupon(p_user_coupon_id uuid, p_context text)
returns public.user_coupons
language plpgsql security definer set search_path = public as $$
declare v_row public.user_coupons;
begin
  select * into v_row from public.user_coupons where id = p_user_coupon_id;
  if v_row.id is null then raise exception 'NOT_FOUND'; end if;
  if v_row.user_id <> auth.uid() and not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    then raise exception 'NOT_ALLOWED'; end if;
  if v_row.status = 'used' then raise exception 'ALREADY_USED'; end if;
  update public.user_coupons
     set status = 'used', used_at = now(), used_context = coalesce(p_context, 'commission')
   where id = p_user_coupon_id
  returning * into v_row;
  return v_row;
end; $$;

grant execute on function public.claim_coupon_by_code(text) to authenticated;
grant execute on function public.claim_coupon(uuid) to authenticated;
grant execute on function public.admin_grant_coupon(uuid, uuid) to authenticated;
grant execute on function public.redeem_user_coupon(uuid, text) to authenticated;

-- NOTE: 구매결제 쿠폰의 '사용 확정'은 Edge Function(confirm-payment)이
--       결제 승인 성공 시 service_role 로 user_coupons.status='used' 처리합니다.
