-- 벨로르 텔레그램 운영 자동화
-- 적용 전 필수: 백업, staging 검증, Edge Function secret 설정.
-- 텔레그램은 결제를 승인하지 않는다. paid 주문의 운영 상태만 inspecting으로 전환한다.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.quote_requests
  add column if not exists quote_started_at timestamptz,
  add column if not exists quote_expires_at timestamptz,
  add column if not exists quote_closed_at timestamptz,
  add column if not exists quote_close_reason text,
  add column if not exists highest_offer_amount bigint;

alter table public.bids
  add column if not exists offer_source text not null default 'vendor_app',
  add column if not exists offer_round integer,
  add column if not exists telegram_actor_id text;

create table if not exists public.telegram_ops_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('order', 'quote')),
  input_key text not null check (input_key ~ '^\d{4}$'),
  order_id uuid references public.orders(id) on delete cascade,
  quote_request_id uuid references public.quote_requests(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'approved', 'closed')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  approved_at timestamptz,
  closed_at timestamptz,
  close_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'order' and order_id is not null and quote_request_id is null)
      or (kind = 'quote' and quote_request_id is not null and order_id is null))
);

create unique index if not exists telegram_ops_active_key_uidx
  on public.telegram_ops_items (input_key) where status = 'active';
create unique index if not exists telegram_ops_order_uidx
  on public.telegram_ops_items (order_id) where order_id is not null;
create unique index if not exists telegram_ops_quote_uidx
  on public.telegram_ops_items (quote_request_id) where quote_request_id is not null;
create index if not exists telegram_ops_expiry_idx
  on public.telegram_ops_items (expires_at) where kind = 'quote' and status = 'active';

create table if not exists public.telegram_ops_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  event_type text not null,
  target text not null check (target in ('order_room', 'quote_room', 'customer_kakao')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processing_at timestamptz,
  sent_at timestamptz,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_ops_outbox_claim_idx
  on public.telegram_ops_outbox (status, available_at, created_at);

create table if not exists public.telegram_ops_audit (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  actor_telegram_id text,
  chat_id text,
  action text not null,
  input_key text,
  result text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.quote_offer_events (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  bid_id uuid not null references public.bids(id) on delete cascade,
  vendor_id uuid,
  vendor_name text not null,
  vendor_phone text,
  amount bigint not null,
  created_by_admin boolean not null,
  offer_source text not null,
  offer_round integer,
  recorded_at timestamptz not null default now()
);

create index if not exists quote_offer_events_quote_idx
  on public.quote_offer_events (quote_request_id, recorded_at);

create table if not exists public.quote_closure_reports (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null unique references public.quote_requests(id) on delete cascade,
  input_key text not null,
  started_at timestamptz not null,
  expires_at timestamptz not null,
  closed_at timestamptz not null,
  close_reason text not null,
  total_offer_count integer not null,
  external_offer_count integer not null,
  external_vendor_count integer not null,
  highest_offer_amount bigint not null default 0,
  external_vendors jsonb not null default '[]'::jsonb,
  bellore_offers jsonb not null default '[]'::jsonb,
  delivery_results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.telegram_ops_items enable row level security;
alter table public.telegram_ops_outbox enable row level security;
alter table public.telegram_ops_audit enable row level security;
alter table public.quote_offer_events enable row level security;
alter table public.quote_closure_reports enable row level security;

revoke all on public.telegram_ops_items from anon, authenticated;
revoke all on public.telegram_ops_outbox from anon, authenticated;
revoke all on public.telegram_ops_audit from anon, authenticated;
revoke all on public.quote_offer_events from anon, authenticated;
revoke all on public.quote_closure_reports from anon, authenticated;
grant all on public.telegram_ops_items to service_role;
grant all on public.telegram_ops_outbox to service_role;
grant all on public.telegram_ops_audit to service_role;
grant all on public.quote_offer_events to service_role;
grant all on public.quote_closure_reports to service_role;

create or replace function private.telegram_ops_new_key()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate text;
begin
  for attempt in 1..100 loop
    candidate := lpad((floor(random() * 9000) + 1000)::integer::text, 4, '0');
    if not exists (
      select 1 from public.telegram_ops_items
       where input_key = candidate and status = 'active'
    ) then
      return candidate;
    end if;
  end loop;
  raise exception 'ACTIVE_INPUT_KEY_EXHAUSTED';
end;
$$;

revoke all on function private.telegram_ops_new_key() from public, anon, authenticated;

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
          'productName', new.product_name, 'amount', new.amount,
          'buyerName', coalesce(new.buyer_name, ''), 'buyerPhone', coalesce(new.buyer_phone, '')
        )
      ) on conflict (dedupe_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_telegram_ops_quote on public.quote_requests;
create trigger trg_telegram_ops_quote
  after insert or update of status on public.quote_requests
  for each row execute function private.telegram_ops_enqueue_source();

drop trigger if exists trg_telegram_ops_order on public.orders;
create trigger trg_telegram_ops_order
  after insert or update of status on public.orders
  for each row execute function private.telegram_ops_enqueue_source();

revoke all on function private.telegram_ops_enqueue_source() from public, anon, authenticated;

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
begin
  if tg_op = 'UPDATE' and new.amount is not distinct from old.amount then return new; end if;

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

  if coalesce(new.created_by_admin, false) then return new; end if;
  select input_key into item_key from public.telegram_ops_items
   where quote_request_id = new.quote_request_id and status = 'active';
  if item_key is null then return new; end if;

  insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
  values (
    'vendor_bid:' || new.id::text || ':' || new.amount::text,
    'vendor_bid', 'quote_room',
    jsonb_build_object('quoteId', new.quote_request_id, 'inputKey', item_key,
      'bidId', new.id, 'company', coalesce(company, '업체'), 'phone', coalesce(phone, ''),
      'amount', new.amount)
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_telegram_ops_vendor_bid on public.bids;
create trigger trg_telegram_ops_vendor_bid
  after insert or update of amount on public.bids
  for each row execute function private.telegram_ops_enqueue_vendor_bid();

revoke all on function private.telegram_ops_enqueue_vendor_bid() from public, anon, authenticated;

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

  if was_pending then
    insert into public.notifications (user_id, type, title, body, is_read)
    values (quote_row.customer_id, 'quote_approved', '비교견적이 시작되었습니다',
      trim(coalesce(quote_row.item_brand, '') || ' ' || coalesce(quote_row.item_name, '')) ||
      ' 비교견적이 승인되었습니다.', false);

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

create or replace function public.telegram_ops_approve_order(
  p_input_key text, p_actor_telegram_id text, p_chat_id text, p_dedupe_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  item public.telegram_ops_items%rowtype;
  order_row public.orders%rowtype;
  result jsonb;
begin
  select details into result from public.telegram_ops_audit where dedupe_key = p_dedupe_key;
  if result is not null then return result || jsonb_build_object('duplicate', true); end if;

  select * into item from public.telegram_ops_items
   where input_key = p_input_key and kind = 'order' and status = 'active' for update;
  if item.id is null then raise exception 'ORDER_KEY_NOT_FOUND'; end if;
  select * into order_row from public.orders where id = item.order_id for update;
  if order_row.status <> 'paid' then raise exception 'ORDER_NOT_PAID'; end if;

  update public.orders set status = 'inspecting' where id = order_row.id and status = 'paid';
  update public.telegram_ops_items
     set status = 'approved', approved_at = now(), updated_at = now()
   where id = item.id;

  result := jsonb_build_object('ok', true, 'orderId', order_row.id,
    'orderNo', order_row.order_no, 'inputKey', p_input_key, 'status', 'inspecting');
  insert into public.telegram_ops_audit (
    dedupe_key, actor_telegram_id, chat_id, action, input_key, result, details
  ) values (p_dedupe_key, p_actor_telegram_id, p_chat_id, 'order_approve', p_input_key, 'success', result);
  return result;
end;
$$;

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

    insert into public.notifications (user_id, type, title, body, is_read)
    values (quote_row.customer_id, 'quote_closed', '비교견적이 종료되었습니다',
      case when highest > 0 then '최고 제안금액 ' || to_char(highest, 'FM999,999,999,999') || '원을 확인해주세요.'
           else '접수된 견적이 없어 비교견적이 종료되었습니다.' end, false);

    select coalesce(phone, '') into customer_phone from public.profiles where id = quote_row.customer_id;
    insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
    values
      ('quote_final_report:' || item.quote_request_id::text, 'quote_final_report', 'quote_room',
       jsonb_build_object('quoteId', item.quote_request_id, 'inputKey', item.input_key,
        'totalOfferCount', total_count, 'externalOfferCount', external_count,
        'externalVendorCount', vendor_count, 'highestAmount', highest,
        'externalVendors', vendors, 'belloreOffers', bellore)),
      ('customer_quote_closed:' || item.quote_request_id::text, 'customer_quote_closed', 'customer_kakao',
       jsonb_build_object('quoteId', item.quote_request_id, 'phone', coalesce(customer_phone, ''),
        'highestAmount', highest, 'hasOffer', highest > 0,
        'itemName', trim(coalesce(quote_row.item_brand, '') || ' ' || coalesce(quote_row.item_name, ''))))
    on conflict (dedupe_key) do nothing;
    closed_count := closed_count + 1;
  end loop;
  return closed_count;
end;
$$;

create or replace function public.telegram_ops_claim_outbox(p_limit integer default 20)
returns setof public.telegram_ops_outbox
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  return query
  with claimed as (
    select id from public.telegram_ops_outbox
     where attempts < 8 and available_at <= now()
       and (status in ('pending', 'failed') or (status = 'processing' and processing_at < now() - interval '5 minutes'))
     order by created_at
     limit least(greatest(p_limit, 1), 100)
     for update skip locked
  )
  update public.telegram_ops_outbox o
     set status = 'processing', processing_at = now(), attempts = attempts + 1, updated_at = now()
    from claimed where o.id = claimed.id
  returning o.*;
end;
$$;

create or replace function public.telegram_ops_finish_outbox(
  p_id uuid, p_success boolean, p_provider_message_id text default null, p_error text default null
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  outbox_row public.telegram_ops_outbox%rowtype;
begin
  update public.telegram_ops_outbox
     set status = case when p_success then 'sent' else 'failed' end,
         sent_at = case when p_success then now() else sent_at end,
         provider_message_id = left(p_provider_message_id, 200),
         last_error = case when p_success then null else left(coalesce(p_error, 'UNKNOWN_ERROR'), 500) end,
         available_at = case when p_success then available_at else now() + make_interval(mins => least(attempts * 2, 30)) end,
         updated_at = now()
   where id = p_id
   returning * into outbox_row;

  if outbox_row.event_type in ('quote_final_report', 'customer_quote_closed') then
    update public.quote_closure_reports
       set delivery_results = delivery_results || jsonb_build_object(
         outbox_row.event_type,
         jsonb_build_object(
           'success', p_success,
           'providerMessageId', left(coalesce(p_provider_message_id, ''), 200),
           'error', case when p_success then null else left(coalesce(p_error, 'UNKNOWN_ERROR'), 500) end,
           'updatedAt', now()
         )
       )
     where quote_request_id = (outbox_row.payload ->> 'quoteId')::uuid;
  end if;
end;
$$;

revoke all on function public.telegram_ops_register_quote_offer(text,bigint,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.telegram_ops_approve_order(text,text,text,text) from public, anon, authenticated;
revoke all on function public.telegram_ops_close_expired_quotes() from public, anon, authenticated;
revoke all on function public.telegram_ops_claim_outbox(integer) from public, anon, authenticated;
revoke all on function public.telegram_ops_finish_outbox(uuid,boolean,text,text) from public, anon, authenticated;
grant execute on function public.telegram_ops_register_quote_offer(text,bigint,uuid,text,text,text) to service_role;
grant execute on function public.telegram_ops_approve_order(text,text,text,text) to service_role;
grant execute on function public.telegram_ops_close_expired_quotes() to service_role;
grant execute on function public.telegram_ops_claim_outbox(integer) to service_role;
grant execute on function public.telegram_ops_finish_outbox(uuid,boolean,text,text) to service_role;

comment on table public.telegram_ops_items is '활성 주문/견적의 텔레그램 4자리 운영키와 수명주기';
comment on table public.telegram_ops_outbox is '텔레그램·고객 카카오 발송 재시도 큐';
comment on table public.quote_offer_events is '업체 앱의 금액 수정까지 포함해 모든 제안가를 보존하는 불변 이벤트';
comment on table public.quote_closure_reports is '72시간 종료 시점의 업체별 가격·연락처·발송결과 스냅샷';
