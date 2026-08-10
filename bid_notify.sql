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
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  customer_id uuid;
  label       text;
  amt         text;
begin
  -- 새 입찰이거나 금액이 바뀐 경우에만
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and new.amount is distinct from old.amount) then

    select qr.customer_id,
           coalesce(
             nullif(trim(coalesce(qr.item_brand, '') || ' ' || coalesce(qr.item_name, '')), ''),
             '시계'
           )
      into customer_id, label
      from public.quote_requests qr
     where qr.id = new.quote_request_id;

    -- 비회원·디스코드 접수 견적은 알림 수신자가 없지만 입찰 자체는 정상 허용한다.
    if not found or customer_id is null then
      return new;
    end if;

    amt := to_char(coalesce(new.amount, 0), 'FM999,999,999,999');

    -- 알림은 부가 기능이다. 알림 저장 실패가 핵심 입찰 트랜잭션을 롤백시키지 않는다.
    begin
      insert into public.notifications (user_id, type, title, body, ref_id)
      values (
        customer_id,
        'bid_new',
        '새 입찰이 도착했어요',
        label || '에 ' || amt || '원 견적이 들어왔습니다. 지금 비교해 보세요.',
        new.quote_request_id::text
      );
    exception
      when others then
        raise warning 'bid notification skipped (quote_request_id=%, sqlstate=%): %',
          new.quote_request_id, sqlstate, sqlerrm;
    end;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_customer_on_bid on public.bids;
create trigger trg_notify_customer_on_bid
  after insert or update of amount on public.bids
  for each row execute function public.notify_customer_on_bid();
