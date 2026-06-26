-- ============================================================
-- 벨로르(BELLORE) · 마이페이지 전면 개편 (바이버풍)
-- Supabase SQL Editor 에서 1회 실행하세요. (여러 번 실행해도 안전)
-- ------------------------------------------------------------
-- 추가되는 것:
--   1) profiles.avatar_url   : 프로필 사진 URL
--   2) profiles.points       : 적립 포인트 잔액 (1포인트 = 1원)
--   3) point_ledger          : 포인트 적립/사용 내역(감사 로그)
--   4) banners.placement     : 배너 노출 위치(home / mypage)
-- 결제 시 포인트 적립은 Edge Function(confirm-payment)이 service_role 로
--   profiles.points 를 올리고 point_ledger 에 기록합니다.
-- ============================================================

-- 1) 프로필: 아바타 · 포인트 컬럼 -----------------------------
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists points integer not null default 0;

-- 2) 포인트 내역 테이블 --------------------------------------
create table if not exists public.point_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  delta         integer not null,                 -- +적립 / -사용
  balance_after integer,                           -- 반영 후 잔액(참고용)
  reason        text,                              -- 'order_earn' / 'admin_adjust' / 'use' 등
  order_id      uuid,                              -- 관련 주문(있으면)
  created_at    timestamptz not null default now()
);
create index if not exists point_ledger_user_idx on public.point_ledger (user_id, created_at desc);

alter table public.point_ledger enable row level security;

-- 본인 내역 읽기
drop policy if exists "point_ledger_own_read" on public.point_ledger;
create policy "point_ledger_own_read"
  on public.point_ledger for select
  using (auth.uid() = user_id);

-- 관리자 전체 읽기
drop policy if exists "point_ledger_admin_read" on public.point_ledger;
create policy "point_ledger_admin_read"
  on public.point_ledger for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- (쓰기는 service_role 전용 = RLS 우회. 일반/관리자 클라이언트 직접 쓰기 정책은 두지 않음)

-- 3) 배너 노출 위치 -----------------------------------------
alter table public.banners add column if not exists placement text not null default 'home';
-- 기존 배너는 모두 home 으로 유지됩니다. 마이페이지 배너는 placement='mypage' 로 추가.
create index if not exists banners_placement_idx on public.banners (placement, active, sort_order);
