-- ============================================================
-- 벨로르(BELLORE) · 소식받기 / 기다리는 시계 (계정별 저장)
-- Supabase SQL Editor 에 통째로 붙여넣고 RUN (1회). 여러 번 실행해도 안전.
-- ------------------------------------------------------------
-- - 로그인 사용자가 '소식받기'로 신청한 미입고 모델을 계정에 저장 → 기기 간 동기화.
-- - 본인 것만 읽기/쓰기 (RLS).
-- - 이 SQL 을 실행하기 전에도 alerts.js 는 localStorage 로 동작하며(폴백),
--   실행 후 로그인하면 기기에 쌓였던 목록이 자동으로 계정에 합쳐집니다.
-- ============================================================

create table if not exists public.watch_alerts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_key   text not null,                 -- brand|model|q (중복 방지 키)
  brand      text,
  model      text,
  q          text,
  created_at timestamptz not null default now(),
  unique (user_id, item_key)
);

create index if not exists watch_alerts_user_idx
  on public.watch_alerts (user_id, created_at desc);

alter table public.watch_alerts enable row level security;

-- 본인 것만 조회/생성/수정/삭제
drop policy if exists watch_alerts_own on public.watch_alerts;
create policy watch_alerts_own on public.watch_alerts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
