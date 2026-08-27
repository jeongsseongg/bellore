create or replace function private.telegram_ops_enqueue_vendor_bid()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item_key text;
  company text;
  phone text;
  customer_name text;
  quote_brand text;
  quote_model text;
  quote_detail text;
  previous_highest bigint;
begin
  if tg_op = 'UPDATE' and new.amount <= old.amount then return new; end if;

  select coalesce(p.company_name, p.biz_name, p.display_name, p.email, '업체'), coalesce(p.phone, '')
    into company, phone
    from public.profiles p where p.id = new.vendor_id;

  insert into public.quote_offer_events (
    quote_request_id, bid_id, vendor_id, vendor_name, vendor_phone, amount,
    created_by_admin, offer_source, offer_round, recorded_at
  ) values (
    new.quote_request_id, new.id, new.vendor_id,
    case when coalesce(new.created_by_admin, false)
         then coalesce(nullif(new.vendor_name, ''), '벨로르')
         else coalesce(company, '업체') end,
    nullif(phone, ''), new.amount, coalesce(new.created_by_admin, false),
    coalesce(new.offer_source, 'vendor_app'), new.offer_round, now()
  );

  select coalesce(max(b.amount), 0)::bigint into previous_highest
    from public.bids b
   where b.quote_request_id = new.quote_request_id and b.id <> new.id;
  if tg_op = 'UPDATE' then
    previous_highest := greatest(previous_highest, old.amount);
  end if;
  if new.amount <= previous_highest then return new; end if;

  if coalesce(new.created_by_admin, false) then return new; end if;
  select i.input_key, coalesce(nullif(p.display_name, ''), '고객'),
         coalesce(q.item_brand, ''), coalesce(q.item_name, ''), coalesce(q.item_detail, '')
    into item_key, customer_name, quote_brand, quote_model, quote_detail
    from public.telegram_ops_items i
    join public.quote_requests q on q.id = i.quote_request_id
    left join public.profiles p on p.id = q.customer_id
   where i.quote_request_id = new.quote_request_id and i.status = 'active';
  if item_key is null then return new; end if;

  insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
  values (
    'vendor_bid:' || new.id::text || ':' || new.amount::text,
    'vendor_bid', 'quote_room',
    jsonb_build_object('quoteId', new.quote_request_id, 'inputKey', item_key,
      'bidId', new.id, 'company', coalesce(company, '업체'), 'phone', coalesce(phone, ''),
      'amount', new.amount, 'previousHighest', previous_highest,
      'customerName', customer_name, 'brand', quote_brand, 'model', quote_model,
      'quoteDetail', quote_detail)
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

revoke all on function private.telegram_ops_enqueue_vendor_bid() from public, anon, authenticated;

comment on function private.telegram_ops_enqueue_vendor_bid() is
  '업체 제안은 모두 이력 저장하고 기존 최고가를 초과한 경우에만 Telegram 알림을 생성한다.';
