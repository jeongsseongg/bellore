-- 판매시계(listings) 추가 속성: 스탬핑 / 미리수
-- Supabase SQL Editor에서 1회 실행하세요. (미실행 시에도 등록/수정은 동작하며, 두 값만 저장되지 않습니다.)
alter table public.listings add column if not exists stamping text;
alter table public.listings add column if not exists misu text;
