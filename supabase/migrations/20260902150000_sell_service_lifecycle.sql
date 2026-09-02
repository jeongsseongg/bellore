alter table public.sell_service_requests
  add column if not exists input_key text,
  add column if not exists offer_amount bigint,
  add column if not exists final_amount bigint,
  add column if not exists deductions jsonb not null default '[]'::jsonb,
  add column if not exists trade_method text,
  add column if not exists visit_branch text,
  add column if not exists requested_visit_at timestamptz,
  add column if not exists handoff_requested_at timestamptz,
  add column if not exists customer_contacted boolean not null default false,
  add column if not exists appointment_confirmed_at timestamptz,
  add column if not exists received_at timestamptz,
  add column if not exists inspected_at timestamptz,
  add column if not exists listed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists settled_at timestamptz;

alter table public.sell_service_requests
  drop constraint if exists sell_service_requests_offer_amount_check,
  add constraint sell_service_requests_offer_amount_check check (offer_amount is null or offer_amount > 0),
  drop constraint if exists sell_service_requests_final_amount_check,
  add constraint sell_service_requests_final_amount_check check (final_amount is null or final_amount > 0),
  drop constraint if exists sell_service_requests_trade_method_check,
  add constraint sell_service_requests_trade_method_check check (trade_method is null or trade_method in ('visit','delivery','quick')),
  drop constraint if exists sell_service_requests_visit_branch_check,
  add constraint sell_service_requests_visit_branch_check check (visit_branch is null or visit_branch in ('jongno','cheongdam')),
  drop constraint if exists sell_service_requests_input_key_check,
  add constraint sell_service_requests_input_key_check check (input_key is null or input_key ~ '^\d{4}$');

create or replace function private.sell_service_new_key()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  candidate text;
begin
  for attempt in 1..200 loop
    candidate := lpad((floor(random() * 9000) + 1000)::integer::text, 4, '0');
    if not exists (select 1 from public.telegram_ops_items where input_key = candidate and status = 'active')
       and not exists (select 1 from public.sell_service_requests where input_key = candidate and status <> 'settled') then
      return candidate;
    end if;
  end loop;
  raise exception 'SELL_INPUT_KEY_EXHAUSTED';
end;
$$;

revoke all on function private.sell_service_new_key() from public, anon, authenticated;

create or replace function private.sell_service_assign_key()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.input_key is null then new.input_key := private.sell_service_new_key(); end if;
  return new;
end;
$$;

revoke all on function private.sell_service_assign_key() from public, anon, authenticated;

drop trigger if exists trg_sell_service_assign_key on public.sell_service_requests;
create trigger trg_sell_service_assign_key
before insert on public.sell_service_requests
for each row execute function private.sell_service_assign_key();

do $$
declare item record;
begin
  for item in select id from public.sell_service_requests where input_key is null order by created_at for update
  loop
    update public.sell_service_requests set input_key = private.sell_service_new_key() where id = item.id;
  end loop;
end $$;

create unique index if not exists sell_service_requests_input_key_uidx
  on public.sell_service_requests(input_key);

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
      'sell_service_received:' || new.id::text, 'sell_service_received', 'quote_room',
      jsonb_build_object(
        'requestId', new.id, 'receiptNo', coalesce(new.receipt_no, ''),
        'inputKey', coalesce(new.input_key, ''), 'method', new.method,
        'customerName', coalesce(new.customer_name, ''), 'customerPhone', coalesce(new.customer_phone, ''),
        'brand', coalesce(new.brand, ''), 'model', coalesce(new.model, ''),
        'ref', coalesce(new.item_ref, ''), 'year', coalesce(new.item_year, ''),
        'parts', coalesce(new.item_parts, ''), 'memo', coalesce(new.item_memo, ''),
        'photos', coalesce(to_jsonb(new.photo_urls), '[]'::jsonb), 'createdAt', coalesce(new.created_at, now())
      )
    ) on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

create or replace function private.telegram_ops_enqueue_sell_handoff()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'handoff_requested' and new.status is distinct from old.status then
    insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
    values (
      'sell_handoff_requested:' || new.id::text, 'sell_handoff_requested', 'quote_room',
      jsonb_build_object(
        'requestId', new.id, 'receiptNo', new.receipt_no, 'inputKey', new.input_key,
        'method', new.method, 'customerName', new.customer_name, 'customerPhone', new.customer_phone,
        'brand', new.brand, 'model', new.model,
        'amount', coalesce(new.final_amount, new.offer_amount),
        'tradeMethod', new.trade_method, 'visitBranch', coalesce(new.visit_branch, ''),
        'requestedVisitAt', new.requested_visit_at, 'requestedAt', new.handoff_requested_at
      )
    ) on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.telegram_ops_enqueue_sell_handoff() from public, anon, authenticated;

drop trigger if exists trg_telegram_ops_sell_handoff on public.sell_service_requests;
create trigger trg_telegram_ops_sell_handoff
after update of status on public.sell_service_requests
for each row execute function private.telegram_ops_enqueue_sell_handoff();

create or replace function public.telegram_ops_offer_sell_service(
  p_input_key text, p_amount bigint, p_is_final boolean,
  p_actor_telegram_id text, p_chat_id text, p_dedupe_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  item public.sell_service_requests%rowtype;
  result jsonb;
  label text;
begin
  select details into result from public.telegram_ops_audit where dedupe_key = p_dedupe_key;
  if result is not null then return result || jsonb_build_object('duplicate', true); end if;
  if p_amount < 10000 or p_amount > 100000000000 then raise exception 'SELL_AMOUNT_INVALID'; end if;

  select * into item from public.sell_service_requests where input_key = p_input_key for update;
  if item.id is null or item.method not in ('instant','consignment') then raise exception 'SELL_KEY_NOT_FOUND'; end if;
  if item.status in ('settled','canceled') then raise exception 'SELL_NOT_ACTIVE'; end if;
  if p_is_final and item.method <> 'instant' then raise exception 'SELL_FINAL_INSTANT_ONLY'; end if;

  if p_is_final then
    update public.sell_service_requests
       set final_amount = p_amount, status = 'final_offer', updated_at = now()
     where id = item.id;
    label := '최종 매입금액';
  else
    update public.sell_service_requests
       set offer_amount = p_amount, status = 'offer_ready', updated_at = now()
     where id = item.id;
    label := case when item.method = 'consignment' then '위탁 판매금액' else '매입 가능금액' end;
  end if;

  if item.owner_user_id is not null then
    insert into public.notifications(user_id,type,title,body,is_read)
    values (item.owner_user_id, 'sell_offer', label || ' 안내',
      to_char(p_amount, 'FM999,999,999,999') || '원을 확인해주세요.', false);
  end if;

  result := jsonb_build_object('ok',true,'requestId',item.id,'inputKey',p_input_key,
    'method',item.method,'amount',p_amount,'isFinal',p_is_final,'label',label);
  insert into public.telegram_ops_audit(dedupe_key,actor_telegram_id,chat_id,action,input_key,result,details)
  values (p_dedupe_key,p_actor_telegram_id,p_chat_id,'sell_offer',p_input_key,'success',result);
  return result;
end;
$$;

revoke all on function public.telegram_ops_offer_sell_service(text,bigint,boolean,text,text,text)
  from public, anon, authenticated;
grant execute on function public.telegram_ops_offer_sell_service(text,bigint,boolean,text,text,text)
  to service_role;

create or replace function public.telegram_ops_advance_sell_service(
  p_input_key text, p_action text, p_actor_telegram_id text, p_chat_id text, p_dedupe_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  item public.sell_service_requests%rowtype;
  result jsonb;
  next_status text;
  title text;
  body text;
begin
  select details into result from public.telegram_ops_audit where dedupe_key = p_dedupe_key;
  if result is not null then return result || jsonb_build_object('duplicate', true); end if;
  select * into item from public.sell_service_requests where input_key = p_input_key for update;
  if item.id is null or item.method not in ('instant','consignment') then raise exception 'SELL_KEY_NOT_FOUND'; end if;

  if p_action = 'contact_complete' then
    if item.status not in ('handoff_requested','appointment_confirmed') then raise exception 'SELL_HANDOFF_NOT_REQUESTED'; end if;
    update public.sell_service_requests set customer_contacted=true, updated_at=now() where id=item.id;
    next_status := item.status; title := '담당자 연락 완료'; body := '거래 일정 안내를 위한 담당자 연락이 완료되었습니다.';
  elsif p_action = 'appointment_confirmed' then
    if item.trade_method <> 'visit' or item.requested_visit_at is null then raise exception 'SELL_VISIT_NOT_REQUESTED'; end if;
    update public.sell_service_requests set status='appointment_confirmed', appointment_confirmed_at=now(), customer_contacted=true, updated_at=now() where id=item.id;
    next_status := 'appointment_confirmed'; title := '방문 예약 확정'; body := '요청하신 방문 예약이 확정되었습니다.';
  elsif p_action = 'received' then
    if item.status not in ('handoff_requested','appointment_confirmed') then raise exception 'SELL_HANDOFF_NOT_REQUESTED'; end if;
    update public.sell_service_requests set status='received', received_at=now(), updated_at=now() where id=item.id;
    next_status := 'received'; title := '시계 인수 완료'; body := '시계가 벨로르에 안전하게 접수되었습니다.';
  elsif p_action = 'inspected' then
    if item.status <> 'received' then raise exception 'SELL_NOT_RECEIVED'; end if;
    update public.sell_service_requests set status='inspected', inspected_at=now(), updated_at=now() where id=item.id;
    next_status := 'inspected'; title := '실물 검수 완료'; body := '시계 실물 검수가 완료되었습니다.';
  elsif p_action = 'listed' then
    if item.method <> 'consignment' or item.status <> 'inspected' then raise exception 'SELL_NOT_READY_TO_LIST'; end if;
    update public.sell_service_requests set status='listed', listed_at=now(), updated_at=now() where id=item.id;
    next_status := 'listed'; title := '위탁 판매 개시'; body := '시계의 위탁 판매가 시작되었습니다.';
  elsif p_action = 'completed' then
    if (item.method='instant' and item.status not in ('inspected','final_offer'))
       or (item.method='consignment' and item.status <> 'listed') then raise exception 'SELL_NOT_READY_TO_COMPLETE'; end if;
    update public.sell_service_requests set status='completed', completed_at=now(), updated_at=now() where id=item.id;
    next_status := 'completed'; title := '거래 완료'; body := '시계 거래가 완료되어 정산을 준비하고 있습니다.';
  elsif p_action = 'settled' then
    if item.status <> 'completed' then raise exception 'SELL_NOT_COMPLETED'; end if;
    update public.sell_service_requests set status='settled', settled_at=now(), updated_at=now() where id=item.id;
    next_status := 'settled'; title := '정산 완료'; body := '시계 거래 정산이 완료되었습니다.';
  else
    raise exception 'SELL_ACTION_INVALID';
  end if;

  if item.owner_user_id is not null then
    insert into public.notifications(user_id,type,title,body,is_read)
    values (item.owner_user_id,'sell_status',title,body,false);
  end if;
  result := jsonb_build_object('ok',true,'requestId',item.id,'inputKey',p_input_key,
    'method',item.method,'action',p_action,'status',next_status,'title',title);
  insert into public.telegram_ops_audit(dedupe_key,actor_telegram_id,chat_id,action,input_key,result,details)
  values (p_dedupe_key,p_actor_telegram_id,p_chat_id,'sell_' || p_action,p_input_key,'success',result);
  return result;
end;
$$;

revoke all on function public.telegram_ops_advance_sell_service(text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.telegram_ops_advance_sell_service(text,text,text,text,text)
  to service_role;

create or replace function public.telegram_ops_complete_quote_followup(
  p_input_key text, p_step text, p_actor_telegram_id text, p_chat_id text, p_dedupe_key text
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
begin
  select details into result from public.telegram_ops_audit where dedupe_key=p_dedupe_key;
  if result is not null then return result || jsonb_build_object('duplicate',true); end if;
  select * into item from public.telegram_ops_items where input_key=p_input_key and kind='quote' order by created_at desc limit 1 for update;
  if item.id is null then raise exception 'SALE_REQUEST_NOT_FOUND'; end if;
  select * into quote_row from public.quote_requests where id=item.quote_request_id for update;
  if quote_row.status <> 'awarded' then raise exception 'SALE_REQUEST_NOT_AWARDED'; end if;
  if p_step='vendor_contacted' then
    update public.quote_requests set vendor_contacted=true,followup_updated_at=now() where id=quote_row.id;
  elsif p_step='trade_completed' then
    if not quote_row.customer_contacted or not quote_row.vendor_contacted then raise exception 'QUOTE_CONTACTS_INCOMPLETE'; end if;
    update public.quote_requests set trade_completed=true,followup_updated_at=now() where id=quote_row.id;
    if quote_row.customer_id is not null then
      insert into public.notifications(user_id,type,title,body,is_read)
      values (quote_row.customer_id,'quote_trade_completed','비교견적 거래 완료','선택하신 비교견적 거래가 완료되었습니다.',false);
    end if;
  else raise exception 'QUOTE_FOLLOWUP_INVALID'; end if;
  result := jsonb_build_object('ok',true,'quoteId',quote_row.id,'inputKey',p_input_key,'step',p_step);
  insert into public.telegram_ops_audit(dedupe_key,actor_telegram_id,chat_id,action,input_key,result,details)
  values(p_dedupe_key,p_actor_telegram_id,p_chat_id,'quote_' || p_step,p_input_key,'success',result);
  return result;
end;
$$;

revoke all on function public.telegram_ops_complete_quote_followup(text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.telegram_ops_complete_quote_followup(text,text,text,text,text)
  to service_role;

create or replace function public.telegram_ops_enqueue_cycle_followups()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare sell_count integer; quote_count integer; order_count integer; inserted integer;
begin
  select count(*) into sell_count from public.sell_service_requests
   where status not in ('settled','canceled') and updated_at < now() - interval '24 hours';
  select count(*) into quote_count from public.quote_requests
   where status='awarded' and not trade_completed and coalesce(followup_updated_at,created_at) < now() - interval '4 hours';
  select count(*) into order_count from public.orders
   where status in ('payment_review','inspecting') and created_at < now() - interval '24 hours';
  if sell_count + quote_count + order_count = 0 then return 0; end if;
  insert into public.telegram_ops_outbox(dedupe_key,event_type,target,payload)
  values ('cycle_followup:' || to_char(now() at time zone 'Asia/Seoul','YYYYMMDD'),
    'cycle_followup_report','quote_room',jsonb_build_object(
      'sellPending',sell_count,'quotePending',quote_count,'orderPending',order_count,'reportedAt',now()))
  on conflict(dedupe_key) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.telegram_ops_enqueue_cycle_followups() from public,anon,authenticated;
grant execute on function public.telegram_ops_enqueue_cycle_followups() to service_role;

comment on function public.telegram_ops_offer_sell_service(text,bigint,boolean,text,text,text) is
  '위탁·즉시매입 4자리 입력키에 고객 안내 금액을 기록한다.';
comment on function public.telegram_ops_advance_sell_service(text,text,text,text,text) is
  '판매요청의 연락·예약·인수·검수·판매·거래·정산 상태를 순서대로 전환한다.';
