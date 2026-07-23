-- 벨로르 결제정책 마이그레이션: 예약금 폐지, 전액결제만 허용
-- Supabase SQL Editor에서 1회 실행합니다.

alter table public.orders
  alter column pay_type set default 'full';

-- 결제가 시작되지 않은 과거 pending 주문만 전액결제로 정규화합니다.
update public.orders
   set pay_type = 'full'
 where status = 'pending'
   and pay_type is distinct from 'full';

-- 프런트와 Edge Function이 모두 full만 생성·승인하므로,
-- 과거 결제 데이터 보존을 위해 DB CHECK 제약은 추가하지 않습니다.
