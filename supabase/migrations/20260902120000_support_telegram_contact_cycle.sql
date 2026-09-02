alter table public.telegram_ops_outbox
  drop constraint if exists telegram_ops_outbox_target_check;
alter table public.telegram_ops_outbox
  add constraint telegram_ops_outbox_target_check
  check (target in ('order_room', 'quote_room', 'support_room', 'customer_kakao'));

create or replace function private.telegram_ops_enqueue_support_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.sender_role = 'admin' then return new; end if;

  insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
  values (
    'support_new:' || new.id::text,
    'support_new',
    'support_room',
    jsonb_build_object(
      'messageId', new.id,
      'createdAt', coalesce(new.created_at, now())
    )
  ) on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function private.telegram_ops_enqueue_support_message()
  from public, anon, authenticated;

drop trigger if exists trg_telegram_ops_support_message on public.support_messages;
create trigger trg_telegram_ops_support_message
  after insert on public.support_messages
  for each row execute function private.telegram_ops_enqueue_support_message();

alter table public.quote_requests
  add column if not exists customer_contacted boolean not null default false,
  add column if not exists followup_updated_at timestamptz;

create or replace function public.telegram_ops_complete_quote_customer_contact(
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
  customer_name text := '';
  contact_line text := '';
begin
  select details into result
    from public.telegram_ops_audit
   where dedupe_key = p_dedupe_key;
  if result is not null then return result || jsonb_build_object('duplicate', true); end if;

  select * into item
    from public.telegram_ops_items
   where input_key = p_input_key and kind = 'quote'
   order by created_at desc
   limit 1
   for update;
  if item.id is null then raise exception 'SALE_REQUEST_NOT_FOUND'; end if;

  select * into quote_row
    from public.quote_requests
   where id = item.quote_request_id
   for update;
  if quote_row.status <> 'awarded' or quote_row.awarded_bid is null then
    raise exception 'SALE_REQUEST_NOT_AWARDED';
  end if;

  update public.quote_requests
     set customer_contacted = true, followup_updated_at = now()
   where id = quote_row.id;

  select coalesce(nullif(s.customer_name, ''), '')
    into customer_name
    from public.sell_service_requests s
   where s.quote_request_id = quote_row.id
   order by s.created_at desc
   limit 1;
  if quote_row.customer_id is not null then
    select coalesce(nullif(customer_name, ''), nullif(p.display_name, ''), '')
      into customer_name from public.profiles p where p.id = quote_row.customer_id;
  end if;
  contact_line := coalesce(substring(coalesce(quote_row.item_detail, '') from E'\\[연락처\\][[:space:]]*([^\\r\\n]+)'), '');
  customer_name := coalesce(nullif(customer_name, ''), nullif(btrim(split_part(contact_line, '/', 1)), ''), '고객');

  result := jsonb_build_object(
    'ok', true, 'quoteId', quote_row.id, 'inputKey', p_input_key,
    'customerName', customer_name, 'customerContacted', true
  );
  insert into public.telegram_ops_audit (
    dedupe_key, actor_telegram_id, chat_id, action, input_key, result, details
  ) values (
    p_dedupe_key, p_actor_telegram_id, p_chat_id,
    'quote_customer_contact_complete', p_input_key, 'success', result
  );
  return result;
end;
$$;

revoke all on function public.telegram_ops_complete_quote_customer_contact(text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.telegram_ops_complete_quote_customer_contact(text,text,text,text)
  to service_role;

comment on function private.telegram_ops_enqueue_support_message() is
  '고객센터 고객 문의를 전용 Telegram 상담방 outbox에 중복 없이 적재한다.';
comment on function public.telegram_ops_complete_quote_customer_contact(text,text,text,text) is
  '견적관리 Telegram 입력키로 고객 연락완료 상태를 중복 없이 기록한다.';
