-- ============================================================
-- 벨로르(BELLORE) · 알림(notifications) user_id NULL 방어
-- 사용법: GitHub > Actions > DB Maintenance > Run workflow > apply-notif-guard
--        (또는 Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 RUN)
-- 여러 번 실행해도 안전(CREATE OR REPLACE / DROP TRIGGER).
--
-- 왜 필요한가:
--   비회원 견적(quote_requests.customer_id 가 NULL — 디스코드 자동 등록 등)에
--   메인관리자가 '중복 견적 추가'(bids insert)를 하면
--     null value in column "user_id" of relation "notifications"
--     violates not-null constraint
--   오류로 입찰 자체가 실패했다.
--   → 입찰 트리거가 "알림 보낼 고객이 없는 경우"를 건너뛰지 않고
--     NULL 을 그대로 insert 했기 때문. (bid_notify.sql 최신본 미적용 환경)
--
-- 무엇을 하는가:
--   1) notify_customer_on_bid 를 최신본으로 재생성 — 고객이 없으면 알림 생략.
--   2) notifications 에 BEFORE INSERT 안전망 추가 — user_id 가 NULL 이면
--      그 알림 한 건만 조용히 버린다. 알림 때문에 결제·입찰 같은
--      본 거래가 통째로 실패하는 일을 앞으로도 막는다.
-- ============================================================

-- 1) 입찰 → 고객 알림: 비회원 견적이면 알림 없이 통과 ------------------
create or replace function public.notify_customer_on_bid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  q       public.quote_requests%rowtype;
  label   text;
  amt     text;
begin
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and new.amount is distinct from old.amount) then

    select * into q from public.quote_requests where id = new.quote_request_id;

    -- 견적을 못 찾았거나(경합) 비회원 견적이면 알림 대상이 없다 → 조용히 통과
    if not found or q.customer_id is null then
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

-- 2) 안전망: 받는 사람이 없는 알림은 버린다 ---------------------------
--    BEFORE INSERT 트리거에서 NULL 을 반환하면 그 행만 조용히 취소된다.
--    (본 거래 트랜잭션은 그대로 성공)
create or replace function public.skip_notification_without_user()
returns trigger language plpgsql as $$
begin
  if new.user_id is null then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists trg_skip_notification_without_user on public.notifications;
create trigger trg_skip_notification_without_user
  before insert on public.notifications
  for each row execute function public.skip_notification_without_user();
