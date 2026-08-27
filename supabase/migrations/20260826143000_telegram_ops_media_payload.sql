create or replace function private.telegram_ops_enqueue_source()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  ops_item public.telegram_ops_items%rowtype;
begin
  if tg_table_name = 'quote_requests' then
    if tg_op = 'INSERT' then
      insert into public.telegram_ops_items (
        kind, input_key, quote_request_id, started_at, expires_at
      ) values (
        'quote', private.telegram_ops_new_key(), new.id,
        coalesce(new.created_at, now()), coalesce(new.created_at, now()) + interval '72 hours'
      )
      on conflict (quote_request_id) where quote_request_id is not null do nothing
      returning * into ops_item;

      if ops_item.id is not null then
        update public.quote_requests
           set quote_started_at = ops_item.started_at,
               quote_expires_at = ops_item.expires_at
         where id = new.id;

        insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
        values (
          'quote_received:' || new.id::text,
          'quote_received', 'quote_room',
          jsonb_build_object(
            'quoteId', new.id, 'inputKey', ops_item.input_key,
            'brand', coalesce(new.item_brand, ''), 'model', coalesce(new.item_name, ''),
            'detail', coalesce(new.item_detail, ''), 'expiresAt', ops_item.expires_at,
            'photos', coalesce(to_jsonb(new.photo_urls), '[]'::jsonb)
          )
        ) on conflict (dedupe_key) do nothing;
      end if;
    elsif new.status in ('closed', 'awarded') and new.status is distinct from old.status then
      update public.telegram_ops_items
         set status = 'closed', closed_at = now(), close_reason = 'manual_' || new.status,
             updated_at = now()
       where quote_request_id = new.id and status = 'active';
    end if;
  elsif tg_table_name = 'orders' and new.status = 'paid'
        and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    insert into public.telegram_ops_items (kind, input_key, order_id)
    values ('order', private.telegram_ops_new_key(), new.id)
    on conflict (order_id) where order_id is not null do nothing
    returning * into ops_item;

    if ops_item.id is not null then
      insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
      values (
        'order_paid:' || new.id::text,
        'order_paid', 'order_room',
        jsonb_build_object(
          'orderId', new.id, 'inputKey', ops_item.input_key, 'orderNo', new.order_no,
          'productName', new.product_name, 'productImage', coalesce(new.product_image, ''),
          'amount', new.amount,
          'buyerName', coalesce(new.buyer_name, ''), 'buyerPhone', coalesce(new.buyer_phone, '')
        )
      ) on conflict (dedupe_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.telegram_ops_enqueue_source() from public, anon, authenticated;

comment on function private.telegram_ops_enqueue_source() is
  '견적 사진 배열과 주문 대표사진을 Telegram outbox payload에 포함한다.';
