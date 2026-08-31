-- Restore guest quote expiry processing and enqueue all administrator Telegram events.
create or replace function public.telegram_ops_close_expired_quotes()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  item public.telegram_ops_items%rowtype;
  quote_row public.quote_requests%rowtype;
  total_count integer;
  external_count integer;
  vendor_count integer;
  highest bigint;
  vendors jsonb;
  bellore jsonb;
  customer_phone text;
  closed_count integer := 0;
begin
  for item in
    select * from public.telegram_ops_items
     where kind = 'quote' and status = 'active' and expires_at <= now()
     order by expires_at for update skip locked
  loop
    select * into quote_row from public.quote_requests where id = item.quote_request_id for update;
    if quote_row.status not in ('pending', 'open') then
      update public.telegram_ops_items set status = 'closed', closed_at = now(),
        close_reason = 'status_' || quote_row.status, updated_at = now() where id = item.id;
      continue;
    end if;

    select count(*), count(*) filter (where not created_by_admin),
           count(distinct vendor_id) filter (where not created_by_admin),
           coalesce(max(amount), 0)
      into total_count, external_count, vendor_count, highest
      from public.quote_offer_events where quote_request_id = item.quote_request_id;

    select coalesce(jsonb_agg(vendor_snapshot order by company), '[]'::jsonb)
      into vendors
      from (
        select vendor_name as company, coalesce(vendor_phone, '') as phone,
               jsonb_agg(jsonb_build_object('amount', amount, 'createdAt', recorded_at)
                         order by recorded_at) as offers
          from public.quote_offer_events
         where quote_request_id = item.quote_request_id and not created_by_admin
         group by vendor_id, vendor_name, vendor_phone
      ) vendor_snapshot;

    select coalesce(jsonb_agg(jsonb_build_object('amount', amount, 'round', offer_round,
      'createdAt', recorded_at) order by recorded_at), '[]'::jsonb)
      into bellore
      from public.quote_offer_events
     where quote_request_id = item.quote_request_id and created_by_admin;

    update public.quote_requests set status = 'closed', quote_closed_at = now(),
      quote_close_reason = 'expired_72h', highest_offer_amount = highest
     where id = item.quote_request_id;
    update public.telegram_ops_items set status = 'closed', closed_at = now(),
      close_reason = 'expired_72h', updated_at = now() where id = item.id;

    insert into public.quote_closure_reports (
      quote_request_id, input_key, started_at, expires_at, closed_at, close_reason,
      total_offer_count, external_offer_count, external_vendor_count,
      highest_offer_amount, external_vendors, bellore_offers
    ) values (
      item.quote_request_id, item.input_key, item.started_at, item.expires_at, now(), 'expired_72h',
      total_count, external_count, vendor_count, highest, vendors, bellore
    ) on conflict (quote_request_id) do nothing;

    customer_phone := '';
    if quote_row.customer_id is not null then
      insert into public.notifications (user_id, type, title, body, is_read)
      values (quote_row.customer_id, 'quote_closed', '비교견적이 종료되었습니다',
        case when highest > 0 then '최고 제안금액 ' || to_char(highest, 'FM999,999,999,999') || '원을 확인해주세요.'
             else '접수된 견적이 없어 비교견적이 종료되었습니다.' end, false);

      select coalesce(phone, '') into customer_phone
        from public.profiles where id = quote_row.customer_id;
    end if;
    if nullif(btrim(coalesce(customer_phone, '')), '') is null then
      select coalesce(s.customer_phone, '') into customer_phone
        from public.sell_service_requests s
       where s.quote_request_id = quote_row.id
       order by s.created_at desc
       limit 1;
    end if;

    insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
    values ('quote_final_report:' || item.quote_request_id::text, 'quote_final_report', 'quote_room',
      jsonb_build_object('quoteId', item.quote_request_id, 'inputKey', item.input_key,
        'totalOfferCount', total_count, 'externalOfferCount', external_count,
        'externalVendorCount', vendor_count, 'highestAmount', highest,
        'externalVendors', vendors, 'belloreOffers', bellore))
    on conflict (dedupe_key) do nothing;

    if char_length(regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g')) >= 10 then
      insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
      values ('customer_quote_closed:' || item.quote_request_id::text,
        'customer_quote_closed', 'customer_kakao',
        jsonb_build_object('quoteId', item.quote_request_id, 'phone', customer_phone,
          'highestAmount', highest, 'offerCount', total_count, 'hasOffer', highest > 0,
          'closedAt', now(),
          'itemName', trim(coalesce(quote_row.item_brand, '') || ' ' || coalesce(quote_row.item_name, ''))))
      on conflict (dedupe_key) do nothing;
    end if;
    closed_count := closed_count + 1;
  end loop;
  return closed_count;
end;
$$;

revoke all on function public.telegram_ops_close_expired_quotes() from public, anon, authenticated;
grant execute on function public.telegram_ops_close_expired_quotes() to service_role;

create or replace function private.telegram_ops_enqueue_sell_service()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.method in ('instant', 'consignment') then
    insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
    values (
      'sell_service_received:' || new.id::text,
      'sell_service_received',
      'quote_room',
      jsonb_build_object(
        'requestId', new.id,
        'receiptNo', coalesce(new.receipt_no, ''),
        'method', new.method,
        'customerName', coalesce(new.customer_name, ''),
        'customerPhone', coalesce(new.customer_phone, ''),
        'brand', coalesce(new.brand, ''),
        'model', coalesce(new.model, ''),
        'ref', coalesce(new.item_ref, ''),
        'year', coalesce(new.item_year, ''),
        'parts', coalesce(new.item_parts, ''),
        'memo', coalesce(new.item_memo, ''),
        'photos', coalesce(to_jsonb(new.photo_urls), '[]'::jsonb),
        'createdAt', coalesce(new.created_at, now())
      )
    ) on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.telegram_ops_enqueue_sell_service() from public, anon, authenticated;

drop trigger if exists trg_telegram_ops_sell_service on public.sell_service_requests;
create trigger trg_telegram_ops_sell_service
after insert on public.sell_service_requests
for each row execute function private.telegram_ops_enqueue_sell_service();

create or replace function private.telegram_ops_enqueue_payment_issue()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status in ('failed', 'payment_review')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
    values (
      'order_payment_issue:' || new.id::text || ':' || new.status,
      'payment_issue',
      'order_room',
      jsonb_build_object(
        'orderId', new.id,
        'orderNo', coalesce(new.order_no, ''),
        'status', new.status,
        'productName', coalesce(new.product_name, ''),
        'productImage', coalesce(new.product_image, ''),
        'amount', coalesce(new.amount, 0),
        'payType', coalesce(new.pay_type, ''),
        'method', coalesce(new.method, ''),
        'buyerName', coalesce(new.buyer_name, ''),
        'buyerPhone', coalesce(new.buyer_phone, ''),
        'reason', case when new.status = 'failed'
          then coalesce(nullif(new.cancel_reason, ''), nullif(new.admin_memo, ''), '결제사 승인 실패')
          else coalesce(nullif(new.admin_memo, ''), nullif(new.cancel_reason, ''), '관리자 결제 확인 필요')
        end,
        'createdAt', coalesce(new.payment_terminal_at, new.created_at, now())
      )
    ) on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.telegram_ops_enqueue_payment_issue() from public, anon, authenticated;

drop trigger if exists trg_telegram_ops_payment_issue on public.orders;
create trigger trg_telegram_ops_payment_issue
after insert or update of status on public.orders
for each row execute function private.telegram_ops_enqueue_payment_issue();

-- Backfill only unresolved, previously unannounced operational items.
insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
select
  'sell_service_received:' || s.id::text,
  'sell_service_received',
  'quote_room',
  jsonb_build_object(
    'requestId', s.id,
    'receiptNo', coalesce(s.receipt_no, ''),
    'method', s.method,
    'customerName', coalesce(s.customer_name, ''),
    'customerPhone', coalesce(s.customer_phone, ''),
    'brand', coalesce(s.brand, ''),
    'model', coalesce(s.model, ''),
    'ref', coalesce(s.item_ref, ''),
    'year', coalesce(s.item_year, ''),
    'parts', coalesce(s.item_parts, ''),
    'memo', coalesce(s.item_memo, ''),
    'photos', coalesce(to_jsonb(s.photo_urls), '[]'::jsonb),
    'createdAt', coalesce(s.created_at, now())
  )
from public.sell_service_requests s
where s.method in ('instant', 'consignment')
  and s.created_at >= timestamptz '2026-08-31 00:00:00+00'
on conflict (dedupe_key) do nothing;

insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
select
  'order_payment_issue:' || o.id::text || ':' || o.status,
  'payment_issue',
  'order_room',
  jsonb_build_object(
    'orderId', o.id,
    'orderNo', coalesce(o.order_no, ''),
    'status', o.status,
    'productName', coalesce(o.product_name, ''),
    'productImage', coalesce(o.product_image, ''),
    'amount', coalesce(o.amount, 0),
    'payType', coalesce(o.pay_type, ''),
    'method', coalesce(o.method, ''),
    'buyerName', coalesce(o.buyer_name, ''),
    'buyerPhone', coalesce(o.buyer_phone, ''),
    'reason', case when o.status = 'failed'
      then coalesce(nullif(o.cancel_reason, ''), nullif(o.admin_memo, ''), '결제사 승인 실패')
      else coalesce(nullif(o.admin_memo, ''), nullif(o.cancel_reason, ''), '관리자 결제 확인 필요')
    end,
    'createdAt', coalesce(o.payment_terminal_at, o.created_at, now())
  )
from public.orders o
where o.status in ('failed', 'payment_review')
on conflict (dedupe_key) do nothing;

comment on function public.telegram_ops_close_expired_quotes() is
  '회원·비회원 연락처를 구분해 72시간 견적 종료와 알림 outbox를 생성한다.';
comment on function private.telegram_ops_enqueue_sell_service() is
  '즉시매입·위탁판매 신청을 사진과 전체 양식이 포함된 관리자 Telegram outbox로 적재한다.';
comment on function private.telegram_ops_enqueue_payment_issue() is
  '결제실패·결제확인필요 주문을 연락처와 함께 관리자 Telegram outbox로 적재한다.';
