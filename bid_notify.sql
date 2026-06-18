-- ============================================================
-- 벨로르(BELLORE) · 입찰 발생 시 "고객(견적 주인)"에게 알림
-- 사용법: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN (1회)
-- 여러 번 실행해도 안전(CREATE OR REPLACE / DROP TRIGGER).
--
-- 동작:
--   - 업체가 비교견적에 입찰(bids insert) 하거나 금액을 수정(update)하면
--     해당 견적의 고객(quote_requests.customer_id)에게 알림을 생성합니다.
--   - 알림 본문에 "어떤 시계 / 얼마"가 들어왔는지 함께 담아,
--     알림만 봐도 입찰 내용을 알 수 있게 합니다.
--   - 알림을 누르면 ref_id(견적 id)로 비교견적 결과 화면으로 이동합니다.
--
-- ⚠️ notifications.ref_id 는 text 여야 합니다(quote_notify.sql 먼저 실행).
-- ============================================================

create or replace function public.notify_customer_on_bid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  q       public.quote_requests%rowtype;
  label   text;
  amt     text;
begin
  -- 새 입찰이거나 금액이 바뀐 경우에만
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and new.amount is distinct from old.amount) then

    select * into q from public.quote_requests where id = new.quote_request_id;
    if q.customer_id is null then
      return new;
    end if;

    label := coalesce(nullif(trim(coalesce(q.item_brand,'') || ' ' || coalesce(q.item_name,'')), ''), '시계');
    amt   := to_char(coalesce(new.amount, 0), 'FM999,999,999,999');

    insert into public.notifications (user_id, type, title, body, ref_id)
    values (
      q.customer_id,
      'bid_new',
      '새 입찰이 도착했어요',
      label || '에 ' || amt || '원 견적이 들어왔습니다. 지금 비교해 보세요.',
      new.quote_request_id::text
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_customer_on_bid on public.bids;
create trigger trg_notify_customer_on_bid
  after insert or update of amount on public.bids
  for each row execute function public.notify_customer_on_bid();
