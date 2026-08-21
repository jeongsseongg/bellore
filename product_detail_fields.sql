-- 벨로르 상품 상세화면 구조화 필드
-- 기존 listings 행과 RLS 정책은 변경하지 않는다.
alter table public.listings
  add column if not exists reference_no text,
  add column if not exists set_grade text,
  add column if not exists movement text,
  add column if not exists case_spec text,
  add column if not exists band_spec text,
  add column if not exists condition_notes text;

comment on column public.listings.reference_no is '시계 레퍼런스 번호';
comment on column public.listings.set_grade is '구성품과 상품 등급 표시 문구';
comment on column public.listings.movement is '무브먼트 정보';
comment on column public.listings.case_spec is '케이스 소재와 사양';
comment on column public.listings.band_spec is '밴드 소재와 사양';
comment on column public.listings.condition_notes is '줄바꿈으로 구분한 검증 상태 항목';
