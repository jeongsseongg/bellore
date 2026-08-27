create or replace function public.telegram_ops_register_quote_offer(
  p_input_key text, p_amount bigint, p_admin_profile_id uuid,
  p_actor_telegram_id text, p_chat_id text, p_dedupe_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  item public.telegram_ops_items%rowtype;
  quote_row public.quote_requests%rowtype;
  new_bid_id uuid;
  next_round integer;
  customer_phone text;
  customer_name text;
  current_highest bigint;
  was_pending boolean;
  prior jsonb;
begin
  select details into prior from public.telegram_ops_audit where dedupe_key = p_dedupe_key;
  if prior is not null then return prior || jsonb_build_object('duplicate', true); end if;
  if p_amount < 10000 or p_amount > 100000000000 then raise exception 'INVALID_AMOUNT'; end if;
  if not exists (select 1 from public.profiles where id = p_admin_profile_id and role = 'admin') then
    raise exception 'INVALID_ADMIN_PROFILE';
  end if;

  select * into item from public.telegram_ops_items
   where input_key = p_input_key and kind = 'quote' and status = 'active' for update;
  if item.id is null then raise exception 'QUOTE_KEY_NOT_FOUND'; end if;
  if item.expires_at <= now() then raise exception 'QUOTE_EXPIRED'; end if;

  select * into quote_row from public.quote_requests where id = item.quote_request_id for update;
  if quote_row.status not in ('pending', 'open') then raise exception 'QUOTE_NOT_ACTIVE'; end if;
  was_pending := quote_row.status = 'pending';
  if quote_row.status = 'pending' then
    update public.quote_requests set status = 'open' where id = quote_row.id;
  end if;

  select coalesce(max(offer_round), 0) + 1 into next_round
    from public.bids
   where quote_request_id = quote_row.id and offer_source = 'telegram_admin';

  insert into public.bids (
    quote_request_id, vendor_id, vendor_name, amount, message,
    created_by_admin, offer_source, offer_round, telegram_actor_id
  ) values (
    quote_row.id, p_admin_profile_id, '벨로르', p_amount, '텔레그램 관리자 제안',
    true, 'telegram_admin', next_round, p_actor_telegram_id
  ) returning id into new_bid_id;

  select coalesce(max(amount), 0)::bigint into current_highest
    from public.bids where quote_request_id = quote_row.id;

  update public.quote_requests
     set highest_offer_amount = current_highest
   where id = quote_row.id;

  select coalesce(phone, ''), coalesce(nullif(display_name, ''), '고객')
    into customer_phone, customer_name
    from public.profiles where id = quote_row.customer_id;

  if customer_phone is null then
    select coalesce(customer_phone, ''), coalesce(nullif(customer_name, ''), '고객')
      into customer_phone, customer_name
      from public.sell_service_requests
     where quote_request_id = quote_row.id
     order by created_at desc
     limit 1;
  end if;

  if was_pending then
    if quote_row.customer_id is not null then
      insert into public.notifications (user_id, type, title, body, is_read)
      values (quote_row.customer_id, 'quote_approved', '비교견적이 시작되었습니다',
        trim(coalesce(quote_row.item_brand, '') || ' ' || coalesce(quote_row.item_name, '')) ||
        ' 비교견적이 승인되었습니다.', false);
    end if;

    insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
    values (
      'customer_quote_approved:' || quote_row.id::text,
      'customer_quote_approved', 'customer_kakao',
      jsonb_build_object('quoteId', quote_row.id, 'inputKey', p_input_key,
        'phone', coalesce(customer_phone, ''), 'customerName', coalesce(customer_name, '고객'),
        'approvedAt', now(),
        'itemName', trim(coalesce(quote_row.item_brand, '') || ' ' || coalesce(quote_row.item_name, '')))
    ) on conflict (dedupe_key) do nothing;
  end if;

  insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
  values (
    'customer_quote_price:' || new_bid_id::text,
    'customer_quote_price', 'customer_kakao',
    jsonb_build_object('quoteId', quote_row.id, 'bidId', new_bid_id, 'inputKey', p_input_key,
      'phone', coalesce(customer_phone, ''), 'amount', p_amount, 'round', next_round,
      'customerName', coalesce(customer_name, '고객'), 'offeredAt', now(),
      'currentHighestAmount', current_highest,
      'itemName', trim(coalesce(quote_row.item_brand, '') || ' ' || coalesce(quote_row.item_name, '')))
  ) on conflict (dedupe_key) do nothing;

  prior := jsonb_build_object('ok', true, 'quoteId', quote_row.id, 'bidId', new_bid_id,
    'inputKey', p_input_key, 'amount', p_amount, 'round', next_round);
  insert into public.telegram_ops_audit (
    dedupe_key, actor_telegram_id, chat_id, action, input_key, result, details
  ) values (p_dedupe_key, p_actor_telegram_id, p_chat_id, 'quote_offer', p_input_key, 'success', prior);
  return prior;
end;
$$;

revoke all on function public.telegram_ops_register_quote_offer(text,bigint,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.telegram_ops_register_quote_offer(text,bigint,uuid,text,text,text)
  to service_role;
