-- ============================================================
-- 벨로르(BELLORE) · 상품번호 자동 생성
-- 사용법: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN (1회).
--         여러 번 실행해도 안전(CREATE OR REPLACE / DROP).
-- ------------------------------------------------------------
-- 형식: 00 + 등급(A/B/C/D) + YYMMDD(등록일) + 순번(그날 3자리)
--   예) 00A26061801  → 1억 이상, 2026-06-18, 그날 1번째로 등록
-- 등급(판매가 기준): A 1억↑ / B 1,000만↑ / C 100만↑ / D 그 미만
-- 날짜는 한국시간(Asia/Seoul) 기준.
-- ⚠️ listings.price 가 numeric 이라 함수 인자도 numeric 으로 받는다.
-- ============================================================

-- 0) 과거에 잘못된 시그니처로 만들어졌을 수 있는 함수 정리
drop function if exists public.bl_make_product_no(bigint, timestamptz, int);
drop function if exists public.bl_price_grade(bigint);

-- 1) 판매가 → 등급 문자
create or replace function public.bl_price_grade(p_price numeric)
returns text language sql immutable as $$
  select case
    when coalesce(p_price, 0) >= 100000000 then 'A'   -- 1억 이상
    when coalesce(p_price, 0) >=  10000000 then 'B'   -- 1,000만 이상 ~ 1억 미만
    when coalesce(p_price, 0) >=   1000000 then 'C'   -- 100만 이상 ~ 1,000만 미만
    else 'D'                                           -- 100만 미만
  end;
$$;

-- 2) 상품번호 조립 (등급 + 날짜 + 순번)
create or replace function public.bl_make_product_no(p_price numeric, p_created timestamptz, p_seq bigint)
returns text language sql immutable as $$
  select '00' || public.bl_price_grade(p_price)
      || to_char((p_created at time zone 'Asia/Seoul'), 'YYMMDD')
      || lpad(greatest(p_seq, 1)::text, 3, '0');
$$;

-- 3) 신규 등록 시 product_no 가 비어 있으면 자동 부여 (BEFORE INSERT)
create or replace function public.bl_set_product_no()
returns trigger language plpgsql security definer set search_path = public as $$
declare d date; seq bigint;
begin
  if new.product_no is null or btrim(new.product_no) = '' then
    d := (coalesce(new.created_at, now()) at time zone 'Asia/Seoul')::date;
    select count(*) + 1 into seq from public.listings
     where (created_at at time zone 'Asia/Seoul')::date = d;
    new.product_no := public.bl_make_product_no(coalesce(new.price, 0), coalesce(new.created_at, now()), seq);
  end if;
  return new;
end $$;

drop trigger if exists trg_bl_set_product_no on public.listings;
create trigger trg_bl_set_product_no
  before insert on public.listings
  for each row execute function public.bl_set_product_no();

-- 4) 기존 등록 상품 전부 새 규칙으로 재부여(소급) — 등록일 순서대로 그날 순번 매김
--    ⚠️ 이미 수동으로 넣은 번호도 모두 새 규칙으로 덮어씁니다(요청에 따름).
with ordered as (
  select id, price, created_at,
    row_number() over (
      partition by (created_at at time zone 'Asia/Seoul')::date
      order by created_at asc, id asc
    ) as seq
  from public.listings
)
update public.listings l
   set product_no = public.bl_make_product_no(o.price, o.created_at, o.seq)
  from ordered o
 where l.id = o.id;
