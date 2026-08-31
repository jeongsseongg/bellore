create or replace function private.telegram_ops_enqueue_quote_sale_requested()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  selected_bid public.bids%rowtype;
  customer_profile public.profiles%rowtype;
  v_input_key text := '';
  v_customer_name text := '';
  v_customer_phone text := '';
  v_contact text := '';
  v_vendor_name text := '';
  v_trade_method text := '';
  v_request_location text := '';
  v_request_schedule text := '';
begin
  if new.status is distinct from 'awarded'
     or new.status is not distinct from old.status then
    return new;
  end if;

  select * into selected_bid
    from public.bids
   where id = new.awarded_bid
     and quote_request_id = new.id;

  select input_key into v_input_key
    from public.telegram_ops_items
   where quote_request_id = new.id
   order by created_at desc
   limit 1;

  select coalesce(nullif(s.customer_name, ''), ''),
         coalesce(nullif(s.customer_phone, ''), '')
    into v_customer_name, v_customer_phone
    from public.sell_service_requests s
   where s.quote_request_id = new.id
   order by s.created_at desc
   limit 1;

  if new.customer_id is not null then
    select * into customer_profile
      from public.profiles
     where id = new.customer_id;
    v_customer_name := coalesce(
      nullif(v_customer_name, ''),
      nullif(customer_profile.display_name, ''),
      '고객'
    );
    v_customer_phone := coalesce(
      nullif(v_customer_phone, ''),
      nullif(customer_profile.phone, ''),
      ''
    );
  end if;

  v_contact := coalesce(substring(
    coalesce(new.item_detail, '')
    from E'\\[연락처\\][[:space:]]*([^\\r\\n]+)'
  ), '');
  v_customer_name := coalesce(
    nullif(v_customer_name, ''),
    nullif(btrim(split_part(v_contact, '/', 1)), ''),
    '고객'
  );
  v_customer_phone := coalesce(
    nullif(v_customer_phone, ''),
    nullif(btrim(split_part(v_contact, '/', 2)), ''),
    ''
  );

  if selected_bid.id is not null then
    if coalesce(selected_bid.created_by_admin, false) then
      v_vendor_name := coalesce(nullif(selected_bid.vendor_name, ''), '벨로르');
    else
      select coalesce(
        nullif(p.company_name, ''),
        nullif(p.biz_name, ''),
        nullif(p.display_name, ''),
        nullif(selected_bid.vendor_name, ''),
        '업체'
      ) into v_vendor_name
        from public.profiles p
       where p.id = selected_bid.vendor_id;
      v_vendor_name := coalesce(nullif(v_vendor_name, ''), nullif(selected_bid.vendor_name, ''), '업체');
    end if;
  end if;

  v_trade_method := coalesce(substring(
    coalesce(new.item_detail, '')
    from E'\\[거래방법\\][[:space:]]*([^\\r\\n]+)'
  ), '');
  v_request_location := coalesce(substring(
    coalesce(new.item_detail, '')
    from E'\\[예약장소\\][[:space:]]*([^\\r\\n]+)'
  ), '');
  v_request_schedule := coalesce(substring(
    coalesce(new.item_detail, '')
    from E'\\[예약일시\\][[:space:]]*([^\\r\\n]+)'
  ), '');

  insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
  values (
    'quote_sale_requested:' || new.id::text,
    'quote_sale_requested',
    'quote_room',
    jsonb_build_object(
      'quoteId', new.id,
      'inputKey', coalesce(v_input_key, ''),
      'customerName', v_customer_name,
      'customerPhone', v_customer_phone,
      'brand', coalesce(new.item_brand, ''),
      'model', coalesce(new.item_name, ''),
      'ref', coalesce(new.item_ref, ''),
      'selectedBidId', new.awarded_bid,
      'selectedAmount', case when selected_bid.id is null then null else selected_bid.amount end,
      'vendorName', coalesce(nullif(v_vendor_name, ''), '확인 필요'),
      'tradeMethod', coalesce(nullif(v_trade_method, ''), '확인 필요'),
      'requestLocation', coalesce(nullif(v_request_location, ''), '담당자 협의'),
      'requestSchedule', coalesce(nullif(v_request_schedule, ''), '담당자 협의'),
      'requestedAt', now()
    )
  ) on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function private.telegram_ops_enqueue_quote_sale_requested()
  from public, anon, authenticated;

drop trigger if exists trg_telegram_ops_quote_sale_requested on public.quote_requests;
create trigger trg_telegram_ops_quote_sale_requested
  after update of status on public.quote_requests
  for each row
  execute function private.telegram_ops_enqueue_quote_sale_requested();

comment on function private.telegram_ops_enqueue_quote_sale_requested() is
  '고객이 비교견적 금액과 거래방법을 선택해 판매 요청한 순간 관리자 텔레그램 큐를 1회 적재한다.';
