create or replace function public.telegram_ops_approve_quote(
  p_input_key text, p_actor_telegram_id text, p_chat_id text, p_dedupe_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  item public.telegram_ops_items%rowtype;
  quote_row public.quote_requests%rowtype;
  result jsonb;
  v_approved_at timestamptz;
  v_expires_at timestamptz;
  v_customer_phone text := '';
  v_customer_name text := '고객';
  v_item_name text;
begin
  select details into result
    from public.telegram_ops_audit
   where dedupe_key = p_dedupe_key;
  if result is not null then
    return result || jsonb_build_object('duplicate', true);
  end if;

  select * into item
    from public.telegram_ops_items
   where input_key = p_input_key
     and kind = 'quote'
     and status = 'active'
   for update;
  if item.id is null then raise exception 'QUOTE_KEY_NOT_FOUND'; end if;

  select * into quote_row
    from public.quote_requests
   where id = item.quote_request_id
   for update;
  if quote_row.id is null then raise exception 'QUOTE_KEY_NOT_FOUND'; end if;

  if quote_row.status = 'open' then
    if item.expires_at <= now() then raise exception 'QUOTE_EXPIRED'; end if;
    result := jsonb_build_object(
      'ok', true,
      'alreadyApproved', true,
      'quoteId', quote_row.id,
      'inputKey', p_input_key,
      'startedAt', item.started_at,
      'expiresAt', item.expires_at
    );
  elsif quote_row.status = 'pending' then
    v_approved_at := now();
    v_expires_at := v_approved_at + interval '72 hours';
    v_item_name := coalesce(
      nullif(btrim(coalesce(quote_row.item_brand, '') || ' ' || coalesce(quote_row.item_name, '')), ''),
      '시계'
    );

    update public.quote_requests
       set status = 'open',
           quote_started_at = v_approved_at,
           quote_expires_at = v_expires_at,
           quote_closed_at = null,
           quote_close_reason = null
     where id = quote_row.id;

    update public.telegram_ops_items
       set started_at = v_approved_at,
           expires_at = v_expires_at,
           approved_at = v_approved_at,
           updated_at = v_approved_at
     where id = item.id;

    if quote_row.customer_id is not null then
      select coalesce(phone, ''), coalesce(nullif(display_name, ''), '고객')
        into v_customer_phone, v_customer_name
        from public.profiles
       where id = quote_row.customer_id;

      insert into public.notifications (user_id, type, title, body, is_read, ref_id)
      values (
        quote_row.customer_id,
        'quote_approved',
        '비교견적이 시작되었습니다',
        v_item_name || ' 비교견적이 승인되었습니다. 지금부터 72시간 동안 견적을 확인할 수 있습니다.',
        false,
        quote_row.id::text
      );
    end if;

    if nullif(btrim(v_customer_phone), '') is null then
      select coalesce(nullif(s.customer_phone, ''), ''),
             coalesce(nullif(s.customer_name, ''), '고객')
        into v_customer_phone, v_customer_name
        from public.sell_service_requests s
       where s.quote_request_id = quote_row.id
       order by s.created_at desc
       limit 1;
    end if;

    if char_length(regexp_replace(coalesce(v_customer_phone, ''), '\D', '', 'g')) >= 10 then
      insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
      values (
        'customer_quote_approved:' || quote_row.id::text,
        'customer_quote_approved',
        'customer_kakao',
        jsonb_build_object(
          'quoteId', quote_row.id,
          'inputKey', p_input_key,
          'phone', v_customer_phone,
          'customerName', v_customer_name,
          'approvedAt', v_approved_at,
          'itemName', v_item_name
        )
      ) on conflict (dedupe_key) do nothing;
    end if;

    result := jsonb_build_object(
      'ok', true,
      'alreadyApproved', false,
      'quoteId', quote_row.id,
      'inputKey', p_input_key,
      'startedAt', v_approved_at,
      'expiresAt', v_expires_at
    );
  else
    raise exception 'QUOTE_NOT_ACTIVE';
  end if;

  insert into public.telegram_ops_audit (
    dedupe_key, actor_telegram_id, chat_id, action, input_key, result, details
  ) values (
    p_dedupe_key, p_actor_telegram_id, p_chat_id,
    'quote_approve', p_input_key, 'success', result
  );
  return result;
end;
$$;

revoke all on function public.telegram_ops_approve_quote(text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.telegram_ops_approve_quote(text,text,text,text)
  to service_role;
