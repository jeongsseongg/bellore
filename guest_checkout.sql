-- ============================================================
-- 벨로르(BELLORE) · 비회원(게스트) 결제 허용
-- 네이버페이 주문형 입점 "보류 2(회원 전용 쇼핑몰)" 대응:
--   비회원도 로그인 없이 상품을 구매할 수 있어야 한다.
-- Supabase SQL Editor 에서 1회 실행하세요.
-- ============================================================
--
-- 동작 원리 / 보안 메모
--   - orders.customer_id 는 이미 NULL 허용(회원 미연결 = 비회원 주문).
--   - 이 정책은 "비로그인(anon)" 사용자가 pending 주문만 생성하도록 허용한다.
--   - 비회원은 본인 주문을 조회(select)할 수 없다(개인정보 보호). 결제 승인/조회는
--     Edge Function(confirm-payment)이 service_role 로 RLS 를 우회해 처리한다.
--   - 금액 위변조 방지: confirm-payment 가 listings.price 로 금액을 서버 재계산해
--     대조하므로, 클라이언트가 보낸 amount 는 신뢰하지 않는다(기존 보안 유지).
--   - 그래서 anon 이 임의 amount 로 pending 행을 만들어도 결제 승인 단계에서 차단된다.

-- 이전 직접 INSERT 정책은 amount/status 위조를 허용했다.
-- 비회원도 create_checkout_order RPC를 사용하며 원문 토큰으로 본인성을 증명한다.
drop policy if exists orders_insert_guest on public.orders;
revoke insert on public.orders from anon, authenticated;

-- 실행 순서와 함수는 phase 7-8 migration이 유일한 정본이다.
