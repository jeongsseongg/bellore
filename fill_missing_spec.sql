-- 카드 3번째 줄(사이즈/색상) 자동 채우기 — 등록된 모든 시계 대상
-- 모델명 텍스트 안에 이미 적혀있는 사이즈(mm)·색상 단어를 찾아서 비어있는 값만 채웁니다.
-- (기존에 값이 있는 상품은 건드리지 않음)
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요.

-- 1) 색상: 모델명에 포함된 색상 단어를 찾아서 dial_color가 비어있으면 채움
update listings
set dial_color = case
    when model ~ '골드'   then '골드'
    when model ~ '그린'   then '그린'
    when model ~ '그레이' then '그레이'
    when model ~ '레드'   then '레드'
    when model ~ '브라운' then '브라운'
    when model ~ '블루'   then '블루'
    when model ~ '블랙'   then '블랙'
    when model ~ '오렌지' then '오렌지'
    when model ~ '옐로우' then '옐로우'
    when model ~ '퍼플'   then '퍼플'
    when model ~ '핑크'   then '핑크'
    when model ~ '화이트' then '화이트'
    when model ~ '실버'   then '실버'
  end
where (dial_color is null or dial_color = '')
  and model ~ '(골드|그린|그레이|레드|브라운|블루|블랙|오렌지|옐로우|퍼플|핑크|화이트|실버)';

-- 2) 사이즈: 모델명에 단독으로 적힌 2자리 사이즈 숫자(20~58)를 찾아서 size_mm이 비어있으면 채움
--    (레퍼런스 번호처럼 뒤에 숫자가 더 붙는 경우는 제외)
update listings
set size_mm = (substring(model from '(?<!\d)(2[0-9]|3[0-9]|4[0-9]|5[0-8])(?!\d)'))::int
where size_mm is null
  and model ~ '(?<!\d)(2[0-9]|3[0-9]|4[0-9]|5[0-8])(?!\d)';

-- 3) 테스트 상품 2건은 모델명에 힌트가 없어 사진 보고 추정한 값으로 별도 채움
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

-- 4) 그래도 비어있는 상품 확인용 (모델명에 힌트가 전혀 없어 수동 확인 필요)
select id, brand, model, size_mm, dial_color
from listings
where size_mm is null or dial_color is null or dial_color = '';
