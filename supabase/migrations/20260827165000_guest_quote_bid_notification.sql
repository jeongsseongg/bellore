-- Guest quote requests intentionally have no member notification recipient.
-- Remove the legacy duplicate trigger that assumes every quote has a customer.
-- `trg_notify_customer_on_bid` remains the single customer notification path;
-- its function already returns early when customer_id is null.

drop trigger if exists trg_notify_bid on public.bids;
drop function if exists public.notify_on_bid();

do $guard$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.bids'::regclass
      and not t.tgisinternal
      and t.tgname = 'trg_notify_customer_on_bid'
      and p.proname = 'notify_customer_on_bid'
  ) then
    raise exception 'guest_bid_notification_guard_missing';
  end if;
end
$guard$;
