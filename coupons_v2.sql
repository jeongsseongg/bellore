-- ============================================================
-- 벨로르(BELLORE) · 쿠폰 시스템 v2 (종류 분리 + 가입 자동지급)
-- 사용법: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN (1회).
--         coupons.sql 를 먼저 실행한 환경에서 추가로 실행하세요.
--         여러 번 실행해도 안전(IF NOT EXISTS / CREATE OR REPLACE).
-- ------------------------------------------------------------
-- 쿠폰 종류(kind):
--   auto  : 회원가입 시 자동지급 (auto_grant = true)
--   code  : 쿠폰번호(code) 입력으로 받기
--   image : 이미지/링크 클릭으로 다운로드 (downloadable = true, image_url)
-- ============================================================

-- 1) 컬럼 추가
alter table public.coupons add column if not exists kind       text not null default 'code'; -- 'auto' | 'code' | 'image'
alter table public.coupons add column if not exists image_url  text;        -- 이미지 다운로드 쿠폰의 배너 이미지
alter table public.coupons add column if not exists auto_grant boolean not null default false; -- 가입 자동지급 여부

-- 2) 회원가입 자동지급 트리거
--    신규 profiles 가 생기면 auto_grant=true 인 활성 쿠폰을 모두 지급한다.
--    (한도 초과 등 예외는 무시하고 계속 진행)
create or replace function public.grant_signup_coupons()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.coupons;
begin
  for c in
    select * from public.coupons
     where auto_grant = true
       and active = true
       and (starts_at  is null or now() >= starts_at)
       and (expires_at is null or now() <= expires_at)
  loop
    begin
      perform public._claim_coupon(c, new.id);
    exception when others then
      null;  -- 1인당 한도/전체 한도 초과 등은 건너뜀
    end;
  end loop;
  return new;
end $$;

drop trigger if exists trg_grant_signup_coupons on public.profiles;
create trigger trg_grant_signup_coupons
  after insert on public.profiles
  for each row execute function public.grant_signup_coupons();

-- 3) 기존 쿠폰 데이터 보정(선택): 코드/다운로드 여부로 kind 채우기
update public.coupons
   set kind = case
     when auto_grant then 'auto'
     when downloadable then 'image'
     when code is not null then 'code'
     else 'code'
   end
 where kind is null or kind = '';
