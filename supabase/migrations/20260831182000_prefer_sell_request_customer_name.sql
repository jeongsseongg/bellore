create or replace function public.telegram_ops_prefer_sell_request_customer_name()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_customer_name text;
begin
  if new.target <> 'customer_kakao'
     or new.event_type not in ('customer_quote_approved', 'customer_quote_price')
     or nullif(new.payload ->> 'quoteId', '') is null then
    return new;
  end if;

  select nullif(btrim(s.customer_name), '')
    into v_customer_name
    from public.sell_service_requests s
   where s.quote_request_id = (new.payload ->> 'quoteId')::uuid
   order by s.created_at desc
   limit 1;

  if v_customer_name is not null then
    new.payload := jsonb_set(new.payload, '{customerName}', to_jsonb(v_customer_name), true);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_telegram_ops_customer_name on public.telegram_ops_outbox;
create trigger trg_telegram_ops_customer_name
before insert or update of payload on public.telegram_ops_outbox
for each row execute function public.telegram_ops_prefer_sell_request_customer_name();

revoke all on function public.telegram_ops_prefer_sell_request_customer_name() from public, anon, authenticated;

update public.telegram_ops_outbox o
   set payload = o.payload
 where o.target = 'customer_kakao'
   and o.event_type in ('customer_quote_approved', 'customer_quote_price')
   and o.status in ('pending', 'processing', 'failed')
   and nullif(o.payload ->> 'quoteId', '') is not null;
