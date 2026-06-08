-- ============================================================
-- 벨로르(BELLORE) · 히어로 배너 테이블
-- Supabase SQL Editor 에서 1회 실행하세요.
-- 방문자는 활성 배너를 읽고, 관리자(profiles.role='admin')만 쓰기 가능.
-- ============================================================

create table if not exists public.banners (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  subtitle    text,
  image_url   text,
  link        text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

alter table public.banners enable row level security;

-- 모든 사용자(비로그인 포함): 활성 배너 읽기 허용
drop policy if exists "banners_public_read" on public.banners;
create policy "banners_public_read"
  on public.banners for select
  using (active = true);

-- 관리자: 활성/비활성 모두 읽기
drop policy if exists "banners_admin_read" on public.banners;
create policy "banners_admin_read"
  on public.banners for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 관리자: 추가/수정/삭제
drop policy if exists "banners_admin_write" on public.banners;
create policy "banners_admin_write"
  on public.banners for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
