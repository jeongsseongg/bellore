-- Keep listing availability aligned with the durable order state.
--
-- finalize_paid_order_v2 currently marks a listing sold after changing the
-- order to paid. A deferred constraint trigger is intentional here: it runs
-- at transaction end, after that legacy sold write, and normalizes the
-- listing to a reservation without duplicating the payment-finalization RPC.

create or replace function public.sync_listing_state_from_order_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if new.listing_id is null then
    return null;
  end if;

  if new.status = 'payment_review' then
    -- Keep the legacy finalizer compatible: it accepts payment_review only
    -- while the listing remains on_sale. The non-expiring owner reference
    -- still prevents a second order from taking the listing.
    update public.listings
       set status = 'on_sale',
           reserved_order_id = new.id,
           reserved_until = 'infinity'::timestamptz,
           sold_order_id = null,
           updated_at = now()
     where id = new.listing_id
       and (sold_order_id is null or sold_order_id = new.id)
       and (
         reserved_order_id is null
         or reserved_order_id = new.id
         or reserved_until <= now()
       );

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'listing_state_conflict:%', new.listing_id;
    end if;

  elsif new.status in (
    'paid',
    'inspecting',
    'preparing',
    'shipping',
    'shipped',
    'delivered',
    'refund_pending'
  ) then
    update public.listings
       set status = 'reserved',
           reserved_order_id = new.id,
           reserved_until = 'infinity'::timestamptz,
           sold_order_id = null,
           updated_at = now()
     where id = new.listing_id
       and (sold_order_id is null or sold_order_id = new.id)
       and (
         reserved_order_id is null
         or reserved_order_id = new.id
         or reserved_until <= now()
       );

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'listing_state_conflict:%', new.listing_id;
    end if;

  elsif new.status in ('confirmed', 'done') then
    update public.listings
       set status = 'sold',
           sold_order_id = new.id,
           reserved_order_id = null,
           reserved_until = null,
           updated_at = now()
     where id = new.listing_id
       and (sold_order_id is null or sold_order_id = new.id)
       and (
         reserved_order_id is null
         or reserved_order_id = new.id
         or reserved_until <= now()
       );

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'listing_state_conflict:%', new.listing_id;
    end if;

  elsif new.status in ('refunded', 'canceled', 'failed') then
    update public.listings
       set status = 'on_sale',
           sold_order_id = null,
           reserved_order_id = null,
           reserved_until = null,
           updated_at = now()
     where id = new.listing_id
       and (
         sold_order_id = new.id
         or reserved_order_id = new.id
       );
  end if;

  return null;
end;
$$;

revoke all on function public.sync_listing_state_from_order_v1() from public;
revoke all on function public.sync_listing_state_from_order_v1() from anon;
revoke all on function public.sync_listing_state_from_order_v1() from authenticated;

drop trigger if exists trg_sync_listing_state_from_order_v1 on public.orders;

create constraint trigger trg_sync_listing_state_from_order_v1
after insert or update on public.orders
deferrable initially deferred
for each row
execute function public.sync_listing_state_from_order_v1();

-- Backfill listings directly. Touching orders here would re-fire unrelated
-- order history, notification and settlement triggers.
do $$
declare
  v_listing_id uuid;
begin
  select orders.listing_id
    into v_listing_id
    from public.orders as orders
   where orders.listing_id is not null
     and orders.status in (
       'payment_review',
       'paid',
       'inspecting',
       'preparing',
       'shipping',
       'shipped',
       'delivered',
       'refund_pending',
       'confirmed',
       'done'
     )
   group by orders.listing_id
  having count(*) > 1
   limit 1;

  if v_listing_id is not null then
    raise exception 'multiple_active_orders_for_listing:%', v_listing_id;
  end if;
end;
$$;

-- Release references that still belong to an already terminal order. The
-- owner equality prevents historical orders from releasing a newer order.
update public.listings as listing
   set status = 'on_sale',
       sold_order_id = null,
       reserved_order_id = null,
       reserved_until = null,
       updated_at = now()
  from public.orders as orders
 where listing.id = orders.listing_id
   and orders.status in ('refunded', 'canceled', 'failed')
   and (
     listing.sold_order_id = orders.id
     or listing.reserved_order_id = orders.id
   );

do $$
declare
  v_listing_id uuid;
begin
  select orders.listing_id
    into v_listing_id
    from public.orders as orders
    join public.listings as listing on listing.id = orders.listing_id
   where orders.status in (
     'payment_review',
     'paid',
     'inspecting',
     'preparing',
     'shipping',
     'shipped',
     'delivered',
     'refund_pending',
     'confirmed',
     'done'
   )
     and (
       (listing.sold_order_id is not null and listing.sold_order_id <> orders.id)
       or (
         listing.reserved_order_id is not null
         and listing.reserved_order_id <> orders.id
         and listing.reserved_until > now()
       )
     )
   limit 1;

  if v_listing_id is not null then
    raise exception 'listing_state_conflict:%', v_listing_id;
  end if;
end;
$$;

update public.listings as listing
   set status = 'on_sale',
       reserved_order_id = orders.id,
       reserved_until = 'infinity'::timestamptz,
       sold_order_id = null,
       updated_at = now()
  from public.orders as orders
 where listing.id = orders.listing_id
   and orders.status = 'payment_review';

update public.listings as listing
   set status = 'reserved',
       reserved_order_id = orders.id,
       reserved_until = 'infinity'::timestamptz,
       sold_order_id = null,
       updated_at = now()
  from public.orders as orders
 where listing.id = orders.listing_id
   and orders.status in (
     'paid',
     'inspecting',
     'preparing',
     'shipping',
     'shipped',
     'delivered',
     'refund_pending'
   );

update public.listings as listing
   set status = 'sold',
       sold_order_id = orders.id,
       reserved_order_id = null,
       reserved_until = null,
       updated_at = now()
  from public.orders as orders
 where listing.id = orders.listing_id
   and orders.status in ('confirmed', 'done');

-- The database has no provider truth, so this repair function never changes a
-- pending order. Provider lookup and any 24-hour terminal decision belong to
-- reconcile-payments; this function only releases already-terminal owners.
create or replace function public.release_expired_checkout_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released integer := 0;
begin
  with terminal_orders as (
    select id, listing_id
      from public.orders
     where status in ('refunded', 'canceled', 'failed')
  ), released_listings as (
    update public.listings as listing
       set status = 'on_sale',
           sold_order_id = null,
           reserved_order_id = null,
           reserved_until = null,
           updated_at = now()
      from terminal_orders as terminal
     where listing.id = terminal.listing_id
       and (
         listing.sold_order_id = terminal.id
         or listing.reserved_order_id = terminal.id
       )
    returning 1
  )
  select count(*)::integer
    into v_released
    from released_listings;

  return v_released;
end;
$$;

revoke all on function public.release_expired_checkout_reservations() from public;
revoke all on function public.release_expired_checkout_reservations() from anon;
revoke all on function public.release_expired_checkout_reservations() from authenticated;
grant execute on function public.release_expired_checkout_reservations() to service_role;
