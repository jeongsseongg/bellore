-- ============================================================
-- 벨로르(BELLORE) · 회원가입 시 제휴사 사업자정보 자동 저장
-- Supabase 대시보드 > SQL Editor 에 "통째로" 붙여넣고 RUN
--
-- 무엇을 하나:
--   - 제휴사(partner) 가입 시 입력한 상호·사업자등록번호·대표자명·개업일을
--     가입 즉시 profiles 에 저장합니다(이메일 인증 ON 이라 세션이 없어도 보존).
--   - biz_verified(사업자 진위확인 통과) 플래그는 여기서 켜지 "않습니다".
--     → 보안상 클라이언트가 임의로 못 켜게, 첫 로그인 시 서버(Edge Function,
--        verify-business)가 국세청과 다시 대조해 자동 확정합니다.
--
-- ※ partner.sql 을 먼저 실행해 컬럼/역할이 있어야 합니다.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r user_role;
begin
  begin
    r := coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer');
  exception when others then
    r := 'customer';
  end;
  if r::text = 'admin' then r := 'customer'; end if;   -- ★ 권한상승 차단

  insert into public.profiles (
    id, role, display_name, company_name, approved, email,
    business_no, ceo_name, biz_open_date, biz_name
  )
  values (
    new.id, r,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'company_name',
    (r::text not in ('vendor','partner')),  -- 업체/제휴사는 승인 대기(false)
    new.email,
    -- 제휴사일 때만 사업자정보 저장(나머지는 NULL)
    case when r::text = 'partner' then nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'business_no',''), '[^0-9]', '', 'g'), '') end,
    case when r::text = 'partner' then nullif(new.raw_user_meta_data->>'ceo_name', '') end,
    case when r::text = 'partner' then nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'biz_open_date',''), '[^0-9]', '', 'g'), '') end,
    case when r::text = 'partner' then nullif(new.raw_user_meta_data->>'biz_name', '') end
  )
  on conflict (id) do nothing;
  return new;
end $$;
