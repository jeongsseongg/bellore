-- ============================================================
-- BELLORE · 판매시계 필터검색용 신규 속성 컬럼 (listings)
-- ------------------------------------------------------------
-- 다이얼 컬러 / 소재 / 다이아 유무 / 사이즈(mm).
-- 이 SQL을 실행하기 전에도 앱은 동작합니다(클라이언트가 미지의 컬럼을
-- 자동 제외하고 저장). 실행하면 해당 값이 DB에 저장되어 필터검색 결과가
-- 더 정확해집니다. Supabase → SQL Editor 에 아래 블록을 그대로 붙여넣고 실행하세요.
-- ============================================================

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS dial_color  text,
  ADD COLUMN IF NOT EXISTS material    text,
  ADD COLUMN IF NOT EXISTS has_diamond boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS size_mm     integer;

-- (선택) 필터 정렬·조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_listings_dial_color  ON public.listings (dial_color);
CREATE INDEX IF NOT EXISTS idx_listings_material    ON public.listings (material);
CREATE INDEX IF NOT EXISTS idx_listings_size_mm     ON public.listings (size_mm);
CREATE INDEX IF NOT EXISTS idx_listings_has_diamond ON public.listings (has_diamond);

-- PostgREST 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';
