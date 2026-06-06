-- ============================================================
-- 벨로르(BELLORE) · 전체 콘텐츠 DB 이관 (한 번에 실행)
-- Supabase > SQL Editor 에 통째로 붙여넣고 RUN. 여러 번 실행해도 안전.
-- 관리자(profiles.role='admin') 계정이 먼저 있어야 합니다.
--   판매시계(벨로르/고객) 26 + 인사이트 글 10 + 후기 6 + 컬럼/트리거 보강
-- ============================================================

-- ① 컬럼 보강 ------------------------------------------------
alter table public.community_posts add column if not exists image_url  text;
alter table public.community_posts add column if not exists image_urls text[] not null default '{}';
alter table public.profiles       add column if not exists email text;

update public.profiles p set email = u.email
  from auth.users u where u.id = p.id and p.email is distinct from u.email;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r user_role;
begin
  r := coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer');
  insert into public.profiles (id, role, display_name, company_name, approved, email)
  values (new.id, r,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'company_name', (r <> 'vendor'), new.email)
  on conflict (id) do nothing;
  return new;
end $$;


-- ② 판매시계 — 벨로르 판매 (18개) (해당 카테고리가 비어 있을 때만)
insert into public.listings (owner_id,title,description,price,category,status,image_url,image_urls)
select a.id, v.brand, v.model, v.price, '벨로르판매', 'on_sale', v.img, array[v.img]
from (select id from public.profiles where role='admin' order by created_at limit 1) a,
     (values
      ('ROLEX','데이트저스트 36 자개 다이아',22800000,'assets/m126284rbr0011.png'),
      ('ROLEX','데이트저스트 41 화이트',16500000,'assets/m1263340002.png'),
      ('ROLEX','데이데이트 36 다이아 베젤',78000000,'assets/m128395tbr0032.png'),
      ('ROLEX','데이트저스트 31 다이아',28500000,'assets/m278381rbr0004.png'),
      ('ROLEX','데이트저스트 36 그레이',14200000,'assets/m1262310020.png'),
      ('ROLEX','데이데이트 36 그린',52000000,'assets/m1282390005.png'),
      ('ROLEX','데이데이트 36 옐로우골드',58000000,'assets/m3369350001.png'),
      ('ROLEX','데이트저스트 36 클래식',13800000,'assets/m1262000002.png'),
      ('ROLEX','데이데이트 36 핑크',54000000,'assets/m1282350009.png'),
      ('ROLEX','데이데이트 36 베젤',62000000,'assets/m1282380045.png'),
      ('ROLEX','데이데이트 40 옐로우',60000000,'assets/m2282350055.png'),
      ('ROLEX','데이데이트 40 플래티넘',85000000,'assets/m2282360012.png'),
      ('ROLEX','데이데이트 40 옐로우골드',68000000,'assets/m2282380042.png'),
      ('ROLEX','데이데이트 36 옐로우골드',55000000,'assets/m3362380004.png'),
      ('ROLEX','데이데이트 36 로즈골드',63000000,'assets/m3369330001.png'),
      ('FRANCK MULLER','카사블랑카 6850',8900000,'assets/6850CASA.jpg'),
      ('FRANCK MULLER','뱅가드 V45 다이아',32000000,'assets/1(487).jpg'),
      ('VACHERON','오버시즈 퍼페추얼',42000000,'assets/KakaoTalk_20250428_224216035.jpg')
     ) as v(brand,model,price,img)
where not exists (select 1 from public.listings where category='벨로르판매');


-- ② 판매시계 — 고객 판매 마켓 (8개) (해당 카테고리가 비어 있을 때만)
insert into public.listings (owner_id,title,description,price,category,status,image_url,image_urls)
select a.id, v.brand, v.model, v.price, '고객판매', 'on_sale', v.img, array[v.img]
from (select id from public.profiles where role='admin' order by created_at limit 1) a,
     (values
      ('ROLEX','서브마리너 데이트',14800000,'assets/KakaoTalk_20250515_135819220.jpg'),
      ('PATEK PHILIPPE','아쿠아넛 5167A',38500000,'assets/KakaoTalk_20250620_163358845_02.jpg'),
      ('AUDEMARS PIGUET','로열오크 15500ST',48000000,'assets/KakaoTalk_20250513_003812408_03.jpg'),
      ('ROLEX','GMT 마스터 II 펩시',22000000,'assets/KakaoTalk_20250506_211755713_02.jpg'),
      ('FRANCK MULLER','뱅가드 V45 다이아',32000000,'assets/1(487).jpg'),
      ('VACHERON','오버시즈 4500V',35500000,'assets/KakaoTalk_20250508_114643182.jpg'),
      ('PATEK PHILIPPE','노틸러스 5711/1A',52000000,'assets/KakaoTalk_20250502_221302124_02.jpg'),
      ('ROLEX','서브마리너 데이트 풀세트',15500000,'assets/KakaoTalk_20250530_145602074.jpg')
     ) as v(brand,model,price,img)
where not exists (select 1 from public.listings where category='고객판매');


-- ③ 커뮤니티(인사이트) 글 (10개) (community_posts 가 비어 있을 때만)
insert into public.community_posts (author_id,title,body,category,image_url,image_urls)
select a.id, v.title, v.body, v.category, v.img, array[v.img]
from (select id from public.profiles where role='admin' order by created_at limit 1) a,
     (values

      ('2026년 5월 롤렉스 데이토나 시세 완벽 분석','최근 6개월간 데이토나 인기 모델의 시세 변동과 향후 전망','시세정보','assets/2026-03-18_이미지자료_193412.jpg'),
      ('파텍필립 노틸러스 5711, 단종 후 시세는?','2021년 단종 발표 이후 시세 변동 분석','시세정보','assets/2026-04-22_이미지자료_141834.jpeg'),
      ('2026년 명품시계 시장 전망','롤렉스, 파텍, AP 주요 브랜드 분기별 시세 예측','시세정보','assets/2026-03-18_이미지자료_201149.png'),
      ('명품시계 매입 전 반드시 확인할 5가지','보증서, 풀세트, 컨디션 등 매입가에 영향을 주는 요소','매입가이드','assets/2026-04-22_이미지자료_141830.jpeg'),
      ('명품시계 보관 노하우 - 매입가를 지키는 습관','워치 와인더, 습도 관리, 자기장 노출 회피 등','매입가이드','assets/2026-03-18_이미지자료_193416.jpg'),
      ('가짜 명품시계 구별법 - 진품 vs 가품','40년 경력 감정사가 알려주는 핵심 포인트','매입가이드','assets/2026-03-20_이미지자료_034130.png'),
      ('롤렉스가 명품시계의 왕인 이유 - 120년 역사','1905년 창업부터 현재까지의 브랜드 가치','브랜드스토리','assets/2026-03-20_이미지자료_033800.jpg'),
      ('오데마피게 로열오크 - 럭셔리 스포츠의 원조','1972년 제랄드 젠타의 디자인 혁명','브랜드스토리','assets/2026-03-18_이미지자료_193452.jpg'),
      ('바쉐론 콘스탄틴 - 270년 역사의 거장','1755년부터 이어진 시계 제조의 정점','브랜드스토리','assets/2026-03-18_이미지자료_193342.jpg'),
      ('크로노그래프 무브먼트의 모든 것','칼럼 휠 vs 캠 방식, 인하우스 vs 외주 무브먼트','명품시계정보','assets/2026-03-18_이미지자료_193432.jpg')
     ) as v(title,body,category,img)
where not exists (select 1 from public.community_posts);


-- ④ 매입 후기 (6개) (reviews 가 비어 있을 때만)
insert into public.reviews (author_name,rating,title,body,image_urls)
select v.author, 5, v.title, v.body, array[v.img]
from (values

      ('김OO','바쉐론 오버시즈 퍼페추얼 캘린더 매입','3군데 견적 받아봤는데 벨로르가 1,200만원 더 높았어요','assets/KakaoTalk_20250428_224216035.jpg'),
      ('박OO','롤렉스 서브마리너 데이트 매입','부산에서 택배로 보냈는데 다음날 바로 입금받았습니다','assets/KakaoTalk_20250530_145602074.jpg'),
      ('이OO','파텍필립 노틸러스 5711 매입','전 세계 시세를 비교해서 매입가를 설명해주셔서 합리적이라 느꼈습니다','assets/KakaoTalk_20250502_221302124_02.jpg'),
      ('최OO','오데마피게 로열오크 15400ST 매입','VIP 컨시어지 서비스 이용했는데 집까지 전문 감정사가 직접 와주셨어요','assets/KakaoTalk_20250513_003812408_03.jpg'),
      ('강OO','롤렉스 데이토나 116500LN 화이트 매입','가장 높은 시세 기준으로 매입가 책정해주셔서 만족합니다','assets/KakaoTalk_20250515_135819220.jpg'),
      ('한OO','파텍필립 아쿠아넛 5167A 매입','풀세트 보관 잘 해놨더니 추가로 시세 보너스까지 챙겨주셨습니다','assets/KakaoTalk_20250620_163358845_02.jpg')
     ) as v(author,title,body,img)
where not exists (select 1 from public.reviews);
