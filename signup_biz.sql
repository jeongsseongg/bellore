-- ============================================================
-- 벨로르(BELLORE) · 회원가입 시 주소/사업자/계좌 정보 자동 저장
-- Supabase 대시보드 > SQL Editor 에 "통째로" 붙여넣고 RUN
--
-- 무엇을 하나:
--   - 모든 회원: 연락처·주소를 가입 즉시 profiles 에 저장.
--   - 업체/제휴사: 상호·사업자등록번호·대표자·개업일·정산계좌를 저장.
--   - biz_verified / account_verified / phone_verified 같은 "인증 통과" 플래그는
--     여기서 켜지 "않습니다". 보안상 클라이언트가 임의로 못 켜게,
--     실제 인증(국세청 진위확인 / 계좌 실명조회 / 본인인증)을 통과해야만
--     서버(Edge Function) 또는 관리자가 켭니다.
--
-- ※ partner.sql, verify.sql 을 먼저 실행해 역할/컬럼이 있어야 합니다.
-- ============================================================

-- 0) 주소·계좌 컬럼 보강(이미 있으면 무시)
alter table public.profiles
  add column if not exists postcode             text,
  add column if not exists addr1                text,
  add column if not exists addr2                text,
  add column if not exists bank_name            text,
  add column if not exists bank_account         text,
  add column if not exists bank_holder          text,
  add column if not exists account_submitted_at timestamptz;

-- 1) 가입 트리거: 역할 제한(admin 차단) + 주소/사업자/계좌 저장
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r       user_role;
  is_biz  boolean;
begin
  begin
    r := coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer');
  exception when others then
    r := 'customer';
  end;
  if r::text = 'admin' then r := 'customer'; end if;   -- ★ 권한상승 차단
  is_biz := r::text in ('vendor','partner');

  insert into public.profiles (
    id, role, display_name, company_name, approved, email,
    phone, postcode, addr1, addr2,
    business_no, ceo_name, biz_open_date, biz_name,
    bank_name, bank_account, bank_holder, account_submitted_at
  )
  values (
    new.id, r,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'company_name',
    (not is_biz),                       -- 업체/제휴사는 승인 대기(false), 고객은 자동승인
    new.email,
    -- 연락처·주소(모든 회원)
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'postcode', ''),
    nullif(new.raw_user_meta_data->>'addr1', ''),
    nullif(new.raw_user_meta_data->>'addr2', ''),
    -- 사업자정보(업체/제휴사)
    case when is_biz then nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'business_no',''), '[^0-9]', '', 'g'), '') end,
    case when is_biz then nullif(new.raw_user_meta_data->>'ceo_name', '') end,
    case when is_biz then nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'biz_open_date',''), '[^0-9]', '', 'g'), '') end,
    case when is_biz then nullif(new.raw_user_meta_data->>'biz_name', '') end,
    -- 정산계좌(업체/제휴사)
    case when is_biz then nullif(new.raw_user_meta_data->>'bank_name', '') end,
    case when is_biz then nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'bank_account',''), '[^0-9-]', '', 'g'), '') end,
    case when is_biz then nullif(new.raw_user_meta_data->>'bank_holder', '') end,
    case when is_biz and nullif(new.raw_user_meta_data->>'bank_account','') is not null then now() end
  )
  on conflict (id) do nothing;
  return new;
end $$;
