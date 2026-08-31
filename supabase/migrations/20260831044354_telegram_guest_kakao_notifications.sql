-- Keep the administrator report for every expired quote, but only create a
-- member notification when there is a member. Guest Kakao recipients come
-- from the persisted sell-service request contact.
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
          'highestAmount', highest, 'hasOffer', highest > 0,
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

comment on function public.telegram_ops_close_expired_quotes() is
  '회원·비회원 연락처를 구분해 72시간 견적 종료와 알림 outbox를 생성한다.';
