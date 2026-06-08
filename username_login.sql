-- ============================================================
-- 벨로르(BELLORE) · 아이디(username) 로그인 지원
-- Supabase SQL Editor 에 붙여넣고 RUN (1회)
-- ============================================================

-- 1) username 컬럼 추가 (대소문자 구분 없이 유니크)
alter table public.profiles add column if not exists username text;

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- 2) 가입 트리거 갱신 — 메타데이터의 username 을 프로필에 저장
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r user_role;
begin
  r := coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer');
  insert into public.profiles (id, role, display_name, company_name, approved, email, username)
  values (
    new.id, r,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'company_name',
    (r <> 'vendor'),
    new.email,
    nullif(new.raw_user_meta_data->>'username', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- 3) 아이디 → 가입 이메일 조회 함수 (로그인 시 사용)
--    SECURITY DEFINER 로 RLS 를 우회해 username→email 만 안전하게 반환
create or replace function public.email_for_username(uname text)
returns text language sql security definer set search_path = public as $$
  select u.email
    from public.profiles p
    join auth.users u on u.id = p.id
   where lower(p.username) = lower(uname)
   limit 1;
$$;

grant execute on function public.email_for_username(text) to anon, authenticated;
