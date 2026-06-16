-- 홈 배너: 뷰포트별 전용 이미지(모바일/와이드/PC) 컬럼 추가
-- image_url = 모바일(기존), image_wide = 태블릿/와이드(가로), image_pc = PC(가로 와이드)
-- 안전하게 여러 번 실행해도 무방(IF NOT EXISTS)

alter table public.banners add column if not exists image_wide text;
alter table public.banners add column if not exists image_pc   text;
