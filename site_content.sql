-- 벨로르(BELLORE) · 사이트 콘텐츠(관리자 인앱 편집용)
-- 매입 랜딩페이지(compare_landing) · 벨로르 소개(about_intro) 등을
-- 관리자가 사이트에서 직접 수정/업로드할 수 있게 저장하는 테이블.
-- Supabase SQL Editor에 붙여넣고 실행하세요. (이미 실행했다면 건너뛰어도 됩니다.)

create table if not exists public.site_content (
  key        text primary key,
  title      text,
  subtitle   text,
  body       text,
  images     text[] default '{}',
  updated_at timestamptz default now()
);

alter table public.site_content enable row level security;

-- 읽기: 누구나 (방문자에게 노출)
drop policy if exists "site_content read" on public.site_content;
create policy "site_content read"
  on public.site_content for select
  using (true);

-- 쓰기: 관리자(profiles.role = 'admin')만
drop policy if exists "site_content write" on public.site_content;
create policy "site_content write"
  on public.site_content for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
