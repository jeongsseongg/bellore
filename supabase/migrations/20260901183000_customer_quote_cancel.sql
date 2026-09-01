-- Customer cancellation closes an active compare quote and prevents any later bid.

create or replace function public.cancel_my_quote(p_quote_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_status text;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  update public.quote_requests
     set status = 'closed'
   where id = p_quote_id
     and customer_id = auth.uid()
     and status in ('pending', 'open')
  returning status into updated_status;

  if updated_status is null then
    raise exception 'QUOTE_NOT_CANCELABLE';
  end if;

  return updated_status;
end;
$$;

revoke all on function public.cancel_my_quote(uuid) from public, anon;
grant execute on function public.cancel_my_quote(uuid) to authenticated;

create or replace function public.guard_active_quote_bid()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  quote_row public.quote_requests%rowtype;
begin
  select * into quote_row
    from public.quote_requests
   where id = new.quote_request_id;

  if quote_row.id is null or quote_row.status <> 'open' then
    raise exception 'QUOTE_NOT_ACTIVE';
  end if;
  if quote_row.created_at + interval '72 hours' <= now() then
    raise exception 'QUOTE_EXPIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists bids_require_active_quote on public.bids;
create trigger bids_require_active_quote
before insert or update of amount, message on public.bids
for each row execute function public.guard_active_quote_bid();
