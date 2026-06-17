-- 벨로르 내시계팔기(비교견적) 실연동 보강 마이그레이션
-- 안전하게 여러 번 실행 가능 (IF NOT EXISTS).
-- Supabase SQL Editor에서 1회 실행하세요.

-- 1) 업체 사용정지 플래그 + 업체 로고/대표 이미지
alter table public.profiles add column if not exists suspended boolean not null default false;
alter table public.profiles add column if not exists logo_url  text;

-- 2) 견적 상태값에 'suspended' 허용 (체크 제약이 있다면 갱신)
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'quote_requests' and constraint_name = 'quote_requests_status_check'
  ) then
    alter table public.quote_requests drop constraint quote_requests_status_check;
  end if;
exception when others then null;
end $$;

alter table public.quote_requests
  add constraint quote_requests_status_check
  check (status in ('pending','open','awarded','closed','suspended'));

-- 3) 새 견적 알림 트리거가 정지 업체를 제외하도록(이미 있으면 갱신).
--    notify_vendors_on_open 함수가 없으면 이 블록은 건너뜁니다.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'notify_vendors_on_open') then
    -- 정지 업체 제외 조건은 quote_notify.sql 재실행으로 반영하세요.
    null;
  end if;
end $$;

-- 4) (선택) 확정 업체 상호 공개를 위해, 고객이 자신의 awarded 견적에 입찰한
--    업체의 상호/로고만 조회할 수 있도록 하려면 RLS 정책을 별도로 추가하세요.
--    기본 정책에서는 본인/관리자만 profiles를 읽으므로, 미설정 시 고객 화면엔
--    '확정 업체(벨로르 인증)'로만 표기되고 상호는 표시되지 않을 수 있습니다.
