-- 판매시계(listings) 추가 속성: 스탬핑 / 미리수 / 구매년도 / 특이사항 / 상세설명 / 구성품 / 판매방식
-- Supabase SQL Editor에서 1회 실행하세요. (미실행 시에도 등록/수정은 동작하며, 해당 값만 저장되지 않습니다.)
alter table public.listings add column if not exists stamping text;
alter table public.listings add column if not exists misu text;
alter table public.listings add column if not exists purchase_year text;
alter table public.listings add column if not exists special_note text;
alter table public.listings add column if not exists detail_desc text;
alter table public.listings add column if not exists components text;
alter table public.listings add column if not exists sale_method text;
alter table public.listings add column if not exists product_no text;   -- 상품번호(직접 지정, 비우면 자동 생성)
alter table public.listings add column if not exists ship_info text;     -- 배송 예정일/배송 안내(비우면 기본 문구)
