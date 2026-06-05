-- ============================================================
-- 벨로르(BELLORE) · 관리자 회원 계정 조회용 마이그레이션
-- 사용법: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN (1회)
-- - profiles 에 email 컬럼 추가 + 기존 회원 이메일 백필
-- - 가입 트리거가 이후 가입자의 이메일도 자동 저장하도록 갱신
--
-- ⚠️ 보안: 비밀번호는 Supabase가 복호화 불가능한 해시로 저장하므로
--    누구도(관리자 포함) 원본을 볼 수 없습니다. 이는 정상이며,
--    분실 시 "비밀번호 재설정 메일"로만 변경합니다.
--    이메일은 관리자(profiles.role='admin')만 RLS로 조회 가능합니다.
-- ============================================================

-- 1) email 컬럼 추가 + 백필
alter table public.profiles add column if not exists email text;
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;

-- 2) 가입 트리거 갱신 (이메일 포함 저장)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r user_role;
begin
  r := coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer');
  insert into public.profiles (id, role, display_name, company_name, approved, email)
  values (
    new.id, r,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'company_name',
    (r <> 'vendor'),                 -- 업체만 승인 대기(false)
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;
