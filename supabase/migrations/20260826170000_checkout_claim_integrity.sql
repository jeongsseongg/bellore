-- One physical watch and one customer coupon may belong to only one unresolved
-- checkout. Provider truth, not an elapsed browser timer, releases the claim.

alter table public.orders
  add column if not exists payment_contract_version smallint;
alter table public.orders
  add column if not exists checkout_request_key_hash text;
alter table public.orders
  drop constraint if exists orders_payment_contract_version_allowed;
alter table public.orders
  add constraint orders_payment_contract_version_allowed check (
    payment_contract_version is null or payment_contract_version = 2
  ) not valid;
alter table public.orders
  validate constraint orders_payment_contract_version_allowed;
alter table public.orders
  drop constraint if exists orders_checkout_request_key_hash_format;
alter table public.orders
  add constraint orders_checkout_request_key_hash_format check (
    checkout_request_key_hash is null or checkout_request_key_hash ~ '^[0-9a-f]{64}$'
  ) not valid;
alter table public.orders
  validate constraint orders_checkout_request_key_hash_format;

comment on column public.orders.payment_contract_version is
  'Null for legacy orders; 2 for provider-terminal checkout and recovery contract.';
comment on column public.orders.checkout_request_key_hash is
  'SHA-256 of the browser request UUID; never stores the raw checkout capability.';

do $$
begin
  if exists (
    select 1
      from public.orders
     where payment_contract_version = 2
       and not public.is_payment_operation_hash_held_v1(
         public.payment_order_no_sha256_v1(order_no)
       )
       and status not in ('failed','canceled','refunded','refund_pending')
     group by listing_id
    having count(*) > 1
  ) then
    raise exception 'existing_active_listing_order_conflict';
  end if;
  if exists (
    select 1
      from public.orders
     where coupon_user_id is not null
       and payment_contract_version = 2
       and not public.is_payment_operation_hash_held_v1(
         public.payment_order_no_sha256_v1(order_no)
       )
       and status not in ('failed','canceled','refunded','refund_pending')
     group by coupon_user_id
    having count(*) > 1
  ) then
    raise exception 'existing_active_coupon_order_conflict';
  end if;
end;
$$;

create unique index if not exists orders_one_unresolved_listing_v2_idx
  on public.orders(listing_id)
  where payment_contract_version = 2
    and status not in ('failed','canceled','refunded','refund_pending');

create unique index if not exists orders_one_unresolved_coupon_idx
  on public.orders(coupon_user_id)
  where coupon_user_id is not null
    and payment_contract_version = 2
    and status not in ('failed','canceled','refunded','refund_pending');

create unique index if not exists orders_checkout_request_key_hash_uidx
  on public.orders(checkout_request_key_hash)
  where checkout_request_key_hash is not null;

create or replace function public.guard_new_checkout_claims_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only the Edge wrapper opts into this contract. Legacy/admin inserts remain
  -- nullable and are intentionally outside automated payment recovery.
  if new.payment_contract_version = 2
     and coalesce(current_setting('app.payment_contract_version', true), '') <> '2'
  then raise exception 'checkout_contract_forbidden'; end if;
  if coalesce(current_setting('app.payment_contract_version', true), '') <> '2'
  then return new; end if;
  if new.status <> 'pending' then raise exception 'checkout_status_invalid'; end if;
  new.payment_contract_version := 2;
  new.checkout_request_key_hash := nullif(
    current_setting('app.checkout_request_key_hash', true), ''
  );
  if new.checkout_request_key_hash is null
     or new.checkout_request_key_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'checkout_request_invalid'; end if;

  if exists (
    select 1
      from public.orders as existing
     where existing.listing_id = new.listing_id
       and existing.status not in ('failed','canceled','refunded','refund_pending')
  ) then
    raise exception 'listing_reserved';
  end if;

  if new.coupon_user_id is not null and exists (
    select 1
      from public.orders as existing
     where existing.coupon_user_id = new.coupon_user_id
       and existing.status not in ('failed','canceled','refunded','refund_pending')
  ) then
    raise exception 'coupon_reserved';
  end if;

  if new.checkout_token_hash is not null and (
    nullif(btrim(coalesce(new.buyer_name,'')), '') is null
    or nullif(btrim(coalesce(new.buyer_phone,'')), '') is null
    or nullif(btrim(coalesce(new.ship_recipient,'')), '') is null
    or nullif(btrim(coalesce(new.ship_phone,'')), '') is null
    or nullif(btrim(coalesce(new.ship_postcode,'')), '') is null
    or nullif(btrim(coalesce(new.ship_addr1,'')), '') is null
  ) then
    raise exception 'checkout_shipping_required';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_new_checkout_claims_v1()
  from public, anon, authenticated;

drop trigger if exists trg_guard_new_checkout_claims_v1 on public.orders;
create trigger trg_guard_new_checkout_claims_v1
before insert on public.orders
for each row execute function public.guard_new_checkout_claims_v1();

create or replace function public.guard_listing_reservation_owner_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reserved_order_id is not null and new.sold_order_id is null then
    if old.reserved_order_id is not null
       and old.reserved_order_id <> new.reserved_order_id
       and coalesce(old.reserved_until, 'infinity'::timestamptz) > now() then
      raise exception 'listing_reserved';
    end if;
    new.reserved_until := 'infinity'::timestamptz;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_listing_reservation_owner_v1()
  from public, anon, authenticated;

drop trigger if exists trg_guard_listing_reservation_owner_v1 on public.listings;
create trigger trg_guard_listing_reservation_owner_v1
before update of reserved_order_id, reserved_until, sold_order_id on public.listings
for each row execute function public.guard_listing_reservation_owner_v1();

-- The Edge wrapper no longer exposes a false 15-minute expiry. A checkout
-- remains claimed until provider verification records a terminal state.
-- Drop the prior signature explicitly so it cannot remain as a callable
-- overload that omits the browser's quoted amount.
drop function if exists public.create_checkout_order_edge_v1(
  text,uuid,uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb
);
drop function if exists public.create_checkout_order_edge_v1(
  text,uuid,uuid,text,bigint,uuid,text,text,text,text,text,text,text,text,jsonb
);

create or replace function public.create_checkout_order_edge_v1(
  p_rate_key text,
  p_customer_id uuid,
  p_listing_id uuid,
  p_checkout_request_key_hash text,
  p_checkout_token_hash text,
  p_expected_amount bigint,
  p_coupon_user_id uuid default null,
  p_buyer_name text default null,
  p_buyer_phone text default null,
  p_ship_recipient text default null,
  p_ship_phone text default null,
  p_ship_postcode text default null,
  p_ship_addr1 text default null,
  p_ship_addr2 text default null,
  p_ship_request text default null,
  p_attribution jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_existing public.orders%rowtype;
  v_error text;
  v_error_state text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'checkout_core_forbidden';
  end if;
  if p_rate_key is null or p_rate_key !~ '^[0-9a-f]{64}$' then
    raise exception 'checkout_rate_key_invalid';
  end if;
  if p_checkout_request_key_hash is null
     or p_checkout_request_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'checkout_request_invalid';
  end if;
  if p_checkout_token_hash is null or p_checkout_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'checkout_token_invalid';
  end if;
  if p_expected_amount is null or p_expected_amount <= 0 then
    raise exception 'checkout_amount_invalid';
  end if;

  -- A response-loss replay must not materialize a protected order. The hold is
  -- keyed only by the SHA-256 identifier and is checked before selecting the
  -- existing row into a record or taking its row lock.
  if exists (
    select 1
      from public.orders as held_order
     where held_order.checkout_request_key_hash = p_checkout_request_key_hash
       and public.is_payment_operation_hash_held_v1(
         public.payment_order_no_sha256_v1(held_order.order_no)
       )
  ) then
    raise exception 'payment_operation_held';
  end if;

  -- Serialize the first insert and every retry before rate consumption. A
  -- concurrent response-loss retry waits, then reuses the committed order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bellore-checkout-v1:' || p_checkout_request_key_hash, 0)
  );
  select * into v_existing
    from public.orders
   where checkout_request_key_hash = p_checkout_request_key_hash
     and not public.is_payment_operation_hash_held_v1(
       public.payment_order_no_sha256_v1(order_no)
     )
   for update;
  if found then
    if v_existing.payment_contract_version = 2
       and v_existing.status = 'pending'
       and v_existing.customer_id is not distinct from p_customer_id
       and v_existing.listing_id = p_listing_id
       and v_existing.checkout_token_hash = p_checkout_token_hash
       and v_existing.amount = p_expected_amount
       and v_existing.coupon_user_id is not distinct from p_coupon_user_id
       and v_existing.buyer_name is not distinct from left(p_buyer_name,120)
       and v_existing.buyer_phone is not distinct from left(p_buyer_phone,40)
       and v_existing.ship_recipient is not distinct from left(p_ship_recipient,120)
       and v_existing.ship_phone is not distinct from left(p_ship_phone,40)
       and v_existing.ship_postcode is not distinct from left(p_ship_postcode,20)
       and v_existing.ship_addr1 is not distinct from left(p_ship_addr1,300)
       and v_existing.ship_addr2 is not distinct from left(p_ship_addr2,300)
       and v_existing.ship_request is not distinct from left(p_ship_request,300)
       and exists (
         select 1 from public.listings as claimed
          where claimed.id = v_existing.listing_id
            and claimed.status = 'on_sale'
            and claimed.sold_order_id is null
            and claimed.reserved_order_id = v_existing.id
       )
    then
      return jsonb_build_object(
        'orderNo',v_existing.order_no,
        'amount',v_existing.amount,
        'payType',v_existing.pay_type,
        'listingId',v_existing.listing_id,
        'reservationMode','provider_terminal',
        'paymentContractVersion',2,
        'checkoutReplayed',true
      );
    end if;
    return jsonb_build_object('error','checkout_request_conflict');
  end if;

  perform public.consume_checkout_rate_limit(p_rate_key);
  -- Keep the rate increment outside this exception subtransaction. Expected
  -- checkout rejection rolls back its order/reservation work but returns a
  -- structured code, allowing the abuse counter itself to commit.
  begin
    perform set_config('app.payment_contract_version', '2', true);
    perform set_config('app.checkout_request_key_hash', p_checkout_request_key_hash, true);
    v_result := public.create_checkout_order(
      p_listing_id => p_listing_id,
      p_checkout_token_hash => p_checkout_token_hash,
      p_coupon_user_id => p_coupon_user_id,
      p_buyer_name => p_buyer_name,
      p_buyer_phone => p_buyer_phone,
      p_ship_recipient => p_ship_recipient,
      p_ship_phone => p_ship_phone,
      p_ship_postcode => p_ship_postcode,
      p_ship_addr1 => p_ship_addr1,
      p_ship_addr2 => p_ship_addr2,
      p_ship_request => p_ship_request,
      p_attribution => p_attribution,
      p_customer_id => p_customer_id
    );
    if jsonb_typeof(v_result->'amount') is distinct from 'number'
       or (v_result->>'amount')::numeric is distinct from p_expected_amount::numeric
    then
      raise exception 'checkout_amount_changed';
    end if;
  exception when others then
    v_error := sqlerrm;
    v_error_state := sqlstate;
    if v_error_state = '23505' and position('orders_one_unresolved_coupon_idx' in v_error) > 0 then
      v_error := 'coupon_reserved';
    elsif v_error_state = '23505' and position('orders_one_unresolved_listing_v2_idx' in v_error) > 0 then
      v_error := 'listing_reserved';
    elsif v_error not in (
      'listing_required','checkout_token_invalid','attribution_invalid',
      'listing_not_found','listing_unavailable','listing_reserved',
      'listing_price_invalid','guest_coupon_not_allowed','coupon_invalid',
      'checkout_amount_too_small','checkout_amount_changed'
    ) then
      raise;
    end if;
    return jsonb_build_object('error',v_error);
  end;
  return (v_result - 'expiresAt') || jsonb_build_object(
    'reservationMode','provider_terminal',
    'paymentContractVersion',2,
    'checkoutReplayed',false
  );
end;
$$;

revoke all on function public.create_checkout_order_edge_v1(
  text,uuid,uuid,text,text,bigint,uuid,text,text,text,text,text,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.create_checkout_order_edge_v1(
  text,uuid,uuid,text,text,bigint,uuid,text,text,text,text,text,text,text,text,jsonb
) to service_role;

-- Checkout recovery is server-owned so the Edge function never reads orders
-- directly. Active holds return NULL and expose no order fields.
create or replace function public.recover_checkout_order_edge_v1(
  p_checkout_request_key_hash text,
  p_checkout_token_hash text,
  p_customer_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'checkout_core_forbidden';
  end if;
  if p_checkout_request_key_hash is null
     or p_checkout_request_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'checkout_request_invalid';
  end if;
  if p_checkout_token_hash is null
     or p_checkout_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'checkout_token_invalid';
  end if;

  select jsonb_build_object(
    'order_no', orders.order_no,
    'amount', orders.amount,
    'status', orders.status,
    'listing_id', orders.listing_id,
    'customer_id', orders.customer_id,
    'payment_contract_version', orders.payment_contract_version
  )
    into v_result
    from public.orders as orders
   where orders.checkout_request_key_hash = p_checkout_request_key_hash
     and orders.checkout_token_hash = p_checkout_token_hash
     and orders.payment_contract_version = 2
     and orders.customer_id is not distinct from p_customer_id
     and not public.is_payment_operation_hash_held_v1(
       public.payment_order_no_sha256_v1(orders.order_no)
     )
   limit 1;

  return v_result;
end;
$$;

revoke all on function public.recover_checkout_order_edge_v1(text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.recover_checkout_order_edge_v1(text,text,uuid)
  to service_role;
