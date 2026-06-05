-- ============================================================
-- 벨로르(BELLORE) · 인사이트/후기 초기 데이터 + 컬럼 보강
-- 사용법: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN (1회)
-- - community_posts 에 대표 이미지(image_url) 컬럼 추가
-- - 기존 사이트의 인사이트 글/후기를 DB로 이관(비어 있을 때만)
-- 이관 후에는 사이트의 정적 샘플 글이 자동으로 숨겨지고,
-- 관리자 계정으로 글 옆 "수정/삭제" 가 동작합니다.
-- 주의: 관리자(profiles.role='admin') 계정이 먼저 존재해야 글이 들어갑니다.
-- ============================================================

-- 1) 인사이트 글 대표 이미지 컬럼
alter table public.community_posts add column if not exists image_url text;

-- 2) 인사이트 글 이관 (community_posts 가 비어 있을 때만)
insert into public.community_posts (author_id, title, body, category, image_url)
select a.id, v.title, v.body, v.category, v.image_url
from (select id from public.profiles where role = 'admin' order by created_at limit 1) a,
     (values
       ('2026년 5월 롤렉스 데이토나 시세 완벽 분석', '최근 6개월간 데이토나 인기 모델의 시세 변동과 향후 전망', '시세정보', 'assets/2026-03-18_이미지자료_193412.jpg'),
       ('파텍필립 노틸러스 5711, 단종 후 시세는?', '2021년 단종 발표 이후 시세 변동 분석', '시세정보', 'assets/2026-04-22_이미지자료_141834.jpeg'),
       ('2026년 명품시계 시장 전망', '롤렉스, 파텍, AP 주요 브랜드 분기별 시세 예측', '시세정보', 'assets/2026-03-18_이미지자료_201149.png'),
       ('명품시계 매입 전 반드시 확인할 5가지', '보증서, 풀세트, 컨디션 등 매입가에 영향을 주는 요소', '매입가이드', 'assets/2026-04-22_이미지자료_141830.jpeg'),
       ('명품시계 보관 노하우 - 매입가를 지키는 습관', '워치 와인더, 습도 관리, 자기장 노출 회피 등', '매입가이드', 'assets/2026-03-18_이미지자료_193416.jpg'),
       ('가짜 명품시계 구별법 - 진품 vs 가품', '40년 경력 감정사가 알려주는 핵심 포인트', '매입가이드', 'assets/2026-03-20_이미지자료_034130.png'),
       ('롤렉스가 명품시계의 왕인 이유 - 120년 역사', '1905년 창업부터 현재까지의 브랜드 가치', '브랜드스토리', 'assets/2026-03-20_이미지자료_033800.jpg'),
       ('오데마피게 로열오크 - 럭셔리 스포츠의 원조', '1972년 제랄드 젠타의 디자인 혁명', '브랜드스토리', 'assets/2026-03-18_이미지자료_193452.jpg'),
       ('바쉐론 콘스탄틴 - 270년 역사의 거장', '1755년부터 이어진 시계 제조의 정점', '브랜드스토리', 'assets/2026-03-18_이미지자료_193342.jpg'),
       ('크로노그래프 무브먼트의 모든 것', '칼럼 휠 vs 캠 방식, 인하우스 vs 외주 무브먼트', '명품시계정보', 'assets/2026-03-18_이미지자료_193432.jpg')
     ) as v(title, body, category, image_url)
where not exists (select 1 from public.community_posts);

-- 3) 매입 후기 이관 (reviews 가 비어 있을 때만)
insert into public.reviews (author_name, rating, title, body, image_urls)
select v.author, 5, v.title, v.body, array[v.img]
from (values
       ('김OO', '바쉐론 오버시즈 퍼페추얼 캘린더 매입', '3군데 견적 받아봤는데 벨로르가 1,200만원 더 높았어요', 'assets/KakaoTalk_20250428_224216035.jpg'),
       ('박OO', '롤렉스 서브마리너 데이트 매입', '부산에서 택배로 보냈는데 다음날 바로 입금받았습니다', 'assets/KakaoTalk_20250530_145602074.jpg'),
       ('이OO', '파텍필립 노틸러스 5711 매입', '전 세계 시세를 비교해서 매입가를 설명해주셔서 합리적이라 느꼈습니다', 'assets/KakaoTalk_20250502_221302124_02.jpg'),
       ('최OO', '오데마피게 로열오크 15400ST 매입', 'VIP 컨시어지 서비스 이용했는데 집까지 전문 감정사가 직접 와주셨어요', 'assets/KakaoTalk_20250513_003812408_03.jpg'),
       ('강OO', '롤렉스 데이토나 116500LN 화이트 매입', '가장 높은 시세 기준으로 매입가 책정해주셔서 만족합니다', 'assets/KakaoTalk_20250515_135819220.jpg')
     ) as v(author, title, body, img)
where not exists (select 1 from public.reviews);
