-- 카드 3번째 줄(사이즈/색상) 확인용 — 누락된 두 테스트 상품에 값 채우기
-- 사진 보고 추정한 값입니다. Supabase SQL Editor에 그대로 붙여넣어 실행하세요.

update listings
set size_mm = 28, dial_color = '그레이'
where model ilike '%테스트%'
  and (brand ilike '%롤렉스%' or brand ilike '%ROLEX%')
  and size_mm is null;

update listings
set size_mm = 41, dial_color = '블랙'
where model ilike '%블랙베이%'
  and (brand ilike '%튜더%' or brand ilike '%TUDOR%')
  and size_mm is null;
