-- ============================================================
-- 벨로르(BELLORE) · 주문/결제 테이블
-- Supabase SQL Editor 에서 1회 실행하세요.
-- ============================================================

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  -- 포트원 paymentId로 사용하는 주문번호(영문/숫자)
  order_no      text unique not null,
  customer_id   uuid references auth.users(id) on delete set null,
  -- 주문 상품
  listing_id    uuid references public.listings(id) on delete set null,
  product_name  text not null,
  product_brand text,
  product_image text,
  product_price bigint,              -- 상품 정가
  -- 결제
  pay_type      text not null default 'full',     -- 'full'(전액)만 허용
  amount        bigint not null,                  -- 실제 결제 금액
  method        text,                             -- 카드/가상계좌/간편결제 등
  status        text not null default 'pending',  -- pending | paid | failed | canceled
  payment_key   text,                             -- 포트원 paymentId
  receipt_url   text,
  -- 구매자 정보
  buyer_name    text,
  buyer_phone   text,
  memo          text,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);

create index if not exists orders_customer_idx on public.orders (customer_id, created_at desc);
create index if not exists orders_status_idx   on public.orders (status);

-- 행 수준 보안
alter table public.orders enable row level security;

-- 본인 주문만 조회
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select using (auth.uid() = customer_id);

-- 본인 주문 생성 (체크아웃 시 pending 으로 insert)
drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own on public.orders
  for insert with check (auth.uid() = customer_id);

-- 관리자는 전체 조회/수정
drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin')
  );

-- NOTE: 결제 "승인"(pending → paid) 은 Edge Function(confirm-payment)이
--       service_role 키로 수행하므로 RLS 를 우회합니다. 클라이언트는
--       status 를 직접 'paid' 로 바꿀 수 없습니다.
