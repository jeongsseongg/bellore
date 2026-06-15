-- 벨로르(BELLORE) · 회원/업체 인증 컬럼
-- 휴대폰 인증(phone_verified) + 업체 계좌 인증(bank_*, account_verified)
-- Supabase SQL Editor에 붙여넣고 실행하세요. (이미 있으면 건너뜀)
--
-- ※ 실제 SMS 인증번호 발송은 코드만으로는 동작하지 않습니다.
--   Supabase 대시보드 > Authentication > Providers > Phone 을 켜고
--   SMS 제공자(Twilio / MessageBird / Vonage 등) 키를 등록해야 문자가 나갑니다.
--   카카오/구글 로그인은 Authentication > Providers 에서 각 OAuth 키 등록이 필요합니다.

alter table public.profiles
  add column if not exists phone_verified        boolean default false,
  add column if not exists bank_holder           text,
  add column if not exists bank_name             text,
  add column if not exists bank_account          text,
  add column if not exists bankbook_url          text,
  add column if not exists account_submitted_at  timestamptz,
  add column if not exists account_verified      boolean default false,
  add column if not exists account_verified_at   timestamptz;
