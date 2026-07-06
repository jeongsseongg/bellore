-- ============================================================
-- 벨로르(BELLORE) · 신규(결제완료) 주문 시 관리자에게 알림
-- Supabase SQL Editor 에 붙여넣고 RUN (재실행 안전)
-- ⚠️ notifications.ref_id 는 text 여야 합니다(quote_notify.sql 선행).
--
-- 동작: 주문이 'paid'(결제완료)가 되는 순간, 역할이 admin 인 모든 계정의
--       알림함(notifications)에 "신규 주문 · 상품 · 금액 · 회원/비회원" 알림을 넣습니다.
--       → 관리자가 앱을 열면 벨(알림)에서 바로 확인.
--       (앱이 열려 있을 때의 즉시 팝업/시스템 알림은 클라이언트가 별도 처리)
-- ============================================================
create or replace function public.notify_admins_on_paid_order()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text; amt text;
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or coalesce(old.status,'') <> 'paid') then
    who := case when new.customer_id is null then '비회원' else '회원' end;
    amt := to_char(coalesce(new.amount, 0), 'FM999,999,999,999');
    insert into public.notifications (user_id, type, title, body, ref_id)
    select p.id, 'new_order', '신규 주문',
           coalesce(new.product_name, '상품') || ' · ' || amt || '원 · ' || who,
           new.order_no
      from public.profiles p
     where p.role = 'admin';
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_admins_on_paid_order on public.orders;
create trigger trg_notify_admins_on_paid_order
  after insert or update of status on public.orders
  for each row execute function public.notify_admins_on_paid_order();
