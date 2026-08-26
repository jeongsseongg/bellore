-- Close only contract-v2 checkouts whose terminal, non-paid provider state was
-- verified by an Edge function. Provider PENDING and legacy orders are never
-- eligible for this path.
create or replace function public.cancel_unsettled_checkout_v1(
  p_order_no text,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'checkout_core_forbidden';
  end if;

  perform public.assert_payment_operation_open_v1(p_order_no);

  update public.orders
     set status = 'canceled',
         cancel_reason = left(coalesce(p_reason, 'provider_verified_checkout_canceled'), 300),
         canceled_at = coalesce(canceled_at, now())
   where order_no = p_order_no
     and payment_contract_version = 2
     and status in ('pending', 'payment_review')
   returning id into v_order_id;

  return v_order_id is not null;
end $$;

revoke all on function public.cancel_unsettled_checkout_v1(text,text)
  from public, anon, authenticated;
grant execute on function public.cancel_unsettled_checkout_v1(text,text)
  to service_role;

comment on function public.cancel_unsettled_checkout_v1(text,text) is
  'Service-only close for provider-verified non-paid contract-v2 checkouts; deferred listing sync releases the matching reservation.';

-- Checkout intent does not own inventory. Multiple customers may prepare a
-- payment for the same one-off listing; the first provider-verified PAID
-- finalization wins the listing row lock and every later paid attempt follows
-- the existing automatic provider-cancellation path.
drop index if exists public.orders_one_unresolved_listing_v2_idx;

create or replace function public.guard_new_checkout_claims_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

  -- Coupon use remains single-owner while a checkout is unresolved. Only the
  -- physical listing claim changes to paid-only ownership.
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

-- A review-only or pending v2 order cannot make the listing unavailable.
-- Explicit hash holds remain untouched and continue to override normal sale.
create or replace function public.guard_listing_reservation_owner_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract smallint;
  v_status text;
  v_order_no text;
begin
  if new.reserved_order_id is not null and new.sold_order_id is null then
    select payment_contract_version, status, order_no
      into v_contract, v_status, v_order_no
      from public.orders
     where id = new.reserved_order_id;

    if v_contract = 2
       and v_status in ('pending','payment_review')
       and not public.is_payment_operation_hash_held_v1(
         public.payment_order_no_sha256_v1(v_order_no)
       ) then
      new.reserved_order_id := null;
      new.reserved_until := null;
      return new;
    end if;

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

-- Release every non-held checkout-only reference already written by the old
-- contract. Paid/fulfilment rows have listing.status reserved/sold and are not
-- included. Orphan references on an on-sale listing are also non-financial.
update public.listings as listing
   set reserved_order_id = null,
       reserved_until = null,
       updated_at = now()
 where listing.status = 'on_sale'
   and listing.sold_order_id is null
   and listing.reserved_order_id is not null
   and not exists (
     select 1
       from public.orders as held_order
      where held_order.id = listing.reserved_order_id
        and public.is_payment_operation_hash_held_v1(
          public.payment_order_no_sha256_v1(held_order.order_no)
        )
   );

create or replace function public.create_checkout_order_paid_only_v1(
  p_listing_id uuid,
  p_checkout_token_hash text,
  p_coupon_user_id uuid default null,
  p_buyer_name text default null,
  p_buyer_phone text default null,
  p_ship_recipient text default null,
  p_ship_phone text default null,
  p_ship_postcode text default null,
  p_ship_addr1 text default null,
  p_ship_addr2 text default null,
  p_ship_request text default null,
  p_attribution jsonb default null,
  p_customer_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := p_customer_id;
  v_listing public.listings%rowtype;
  v_coupon public.user_coupons%rowtype;
  v_coupon_def public.coupons%rowtype;
  v_order public.orders%rowtype;
  v_order_no text;
  v_list_price bigint;
  v_true_price bigint;
  v_base bigint;
  v_discount bigint := 0;
  v_amount bigint;
  v_sale_base timestamptz;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'checkout_core_forbidden';
  end if;
  if p_listing_id is null then raise exception 'listing_required'; end if;
  if p_checkout_token_hash is null or p_checkout_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'checkout_token_invalid';
  end if;
  if p_attribution is not null and jsonb_typeof(p_attribution) <> 'object' then
    raise exception 'attribution_invalid';
  end if;

  select * into v_listing
    from public.listings
   where id = p_listing_id
   for update;
  if not found then raise exception 'listing_not_found'; end if;
  if v_listing.status <> 'on_sale' or v_listing.sold_order_id is not null then
    raise exception 'listing_unavailable';
  end if;

  v_list_price := trunc(coalesce(v_listing.price, 0))::bigint;
  v_sale_base := coalesce(v_listing.sale_started_at, v_listing.created_at);
  v_true_price := case
    when 'sale' = any(coalesce(v_listing.tags, '{}'::text[]))
     and v_listing.sale_price is not null
     and v_listing.sale_price > 0
     and v_listing.sale_price < v_list_price
     and v_sale_base + interval '72 hours' > now()
      then v_listing.sale_price
    else v_list_price
  end;
  if v_true_price <= 0 then raise exception 'listing_price_invalid'; end if;
  v_base := v_true_price + case when v_true_price >= 5000000 then 35000 else 0 end;

  if p_coupon_user_id is not null then
    if v_uid is null then raise exception 'guest_coupon_not_allowed'; end if;
    select * into v_coupon
      from public.user_coupons
     where id = p_coupon_user_id
     for update;
    if not found or v_coupon.user_id <> v_uid or v_coupon.status <> 'active' then
      raise exception 'coupon_invalid';
    end if;
    select * into v_coupon_def
      from public.coupons
     where id = v_coupon.coupon_id;
    if not found or not v_coupon_def.active
       or (v_coupon_def.starts_at is not null and now() < v_coupon_def.starts_at)
       or (v_coupon_def.expires_at is not null and now() > v_coupon_def.expires_at)
       or v_coupon_def.apply_to not in ('order','both')
       or v_base < coalesce(v_coupon_def.min_order, 0) then
      raise exception 'coupon_invalid';
    end if;
    v_discount := case v_coupon_def.discount_type
      when 'percent' then floor(v_base * coalesce(v_coupon_def.discount_value,0) / 100.0)::bigint
      else coalesce(v_coupon_def.discount_value, 0)
    end;
    if v_coupon_def.max_discount is not null then
      v_discount := least(v_discount, v_coupon_def.max_discount);
    end if;
    v_discount := greatest(0, least(v_discount, v_base));
  end if;

  v_amount := v_base - v_discount;
  if v_amount < 100 then raise exception 'checkout_amount_too_small'; end if;
  v_order_no := 'BLR' || upper(substr(encode(extensions.gen_random_bytes(16), 'hex'), 1, 24));

  insert into public.orders (
    order_no, customer_id, listing_id, product_name, product_brand,
    product_image, product_price, pay_type, amount, status,
    coupon_user_id, discount, buyer_name, buyer_phone,
    ship_recipient, ship_phone, ship_postcode, ship_addr1, ship_addr2,
    ship_request, checkout_token_hash,
    analytics_session_id, analytics_anonymous_id, analytics_attribution
  ) values (
    v_order_no, v_uid, v_listing.id,
    left(trim(v_listing.title || ' ' || coalesce(v_listing.description,'')), 300),
    left(v_listing.title, 160),
    coalesce(v_listing.image_url, v_listing.image_urls[1]),
    v_true_price, 'full', v_amount, 'pending',
    p_coupon_user_id, v_discount, left(p_buyer_name,120), left(p_buyer_phone,40),
    left(p_ship_recipient,120), left(p_ship_phone,40), left(p_ship_postcode,20),
    left(p_ship_addr1,300), left(p_ship_addr2,300), left(p_ship_request,300),
    p_checkout_token_hash,
    nullif(p_attribution->>'session_id','')::uuid,
    nullif(p_attribution->>'anonymous_id','')::uuid,
    p_attribution
  ) returning * into v_order;

  return jsonb_build_object(
    'orderNo', v_order.order_no,
    'amount', v_order.amount,
    'payType', v_order.pay_type,
    'listingId', v_order.listing_id
  );
exception
  when invalid_text_representation then
    raise exception 'attribution_invalid';
end;
$$;

revoke all on function public.create_checkout_order_paid_only_v1(
  uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb,uuid
) from public, anon, authenticated;
grant execute on function public.create_checkout_order_paid_only_v1(
  uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb,uuid
) to service_role;

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
         select 1 from public.listings as available
          where available.id = v_existing.listing_id
            and available.status = 'on_sale'
            and available.sold_order_id is null
       )
    then
      return jsonb_build_object(
        'orderNo',v_existing.order_no,
        'amount',v_existing.amount,
        'payType',v_existing.pay_type,
        'listingId',v_existing.listing_id,
        'reservationMode','paid_only',
        'paymentContractVersion',2,
        'checkoutReplayed',true
      );
    end if;
    return jsonb_build_object('error','checkout_request_conflict');
  end if;

  perform public.consume_checkout_rate_limit(p_rate_key);
  begin
    perform set_config('app.payment_contract_version', '2', true);
    perform set_config('app.checkout_request_key_hash', p_checkout_request_key_hash, true);
    v_result := public.create_checkout_order_paid_only_v1(
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
    if v_error_state = '23505'
       and position('orders_one_unresolved_coupon_idx' in v_error) > 0 then
      v_error := 'coupon_reserved';
    elsif v_error not in (
      'listing_required','checkout_token_invalid','attribution_invalid',
      'listing_not_found','listing_unavailable','listing_price_invalid',
      'guest_coupon_not_allowed','coupon_invalid','coupon_reserved',
      'checkout_amount_too_small','checkout_amount_changed'
    ) then
      raise;
    end if;
    return jsonb_build_object('error',v_error);
  end;

  return v_result || jsonb_build_object(
    'reservationMode','paid_only',
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

-- A verified payment blocks the listing as reserved; purchase confirmation is
-- the separate transition that marks it sold. The listing row lock is still
-- the single-winner gate for simultaneous provider-verified payments.
create or replace function public.finalize_paid_order_v2(
  p_order_no text,
  p_paid_amount bigint,
  p_method text,
  p_payment_key text,
  p_provider_transaction_id text,
  p_receipt_url text,
  p_attribution jsonb default null,
  p_point_earn_bps integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_listing public.listings%rowtype;
  v_earned integer := 0;
  v_balance integer;
  v_session uuid;
  v_anon uuid;
begin
  if p_order_no is null or p_payment_key is null then raise exception 'payment_identity_missing'; end if;
  if p_point_earn_bps < 0 or p_point_earn_bps > 10000 then raise exception 'point_rate_invalid'; end if;
  perform public.assert_payment_operation_open_v1(p_order_no);

  select * into v_order
    from public.orders
   where order_no = p_order_no
   for update;
  if not found then raise exception 'order_not_found'; end if;

  if v_order.status = 'paid' then
    if v_order.payment_key is distinct from p_payment_key
       or v_order.amount is distinct from p_paid_amount then
      raise exception 'paid_order_conflict';
    end if;
    return jsonb_build_object('ok', true, 'alreadyPaid', true, 'order', to_jsonb(v_order));
  end if;
  if v_order.status in ('failed','canceled') then
    raise exception using
      errcode = 'P0001',
      message = 'order_closed_before_paid_finalization';
  end if;
  if v_order.status not in ('pending','payment_review') then
    raise exception 'order_state_invalid:%', v_order.status;
  end if;
  if v_order.amount <> p_paid_amount then raise exception 'amount_mismatch'; end if;

  select * into v_listing
    from public.listings
   where id = v_order.listing_id
   for update;
  if not found then raise exception 'listing_not_found'; end if;
  if v_listing.status <> 'on_sale' or v_listing.sold_order_id is not null then
    raise exception 'listing_unavailable';
  end if;
  if v_listing.reserved_order_id is not null
     and v_listing.reserved_order_id <> v_order.id
     and v_listing.reserved_until > now() then
    raise exception 'listing_reserved_by_other_order';
  end if;

  if v_order.coupon_user_id is not null then
    perform 1 from public.user_coupons
      where id = v_order.coupon_user_id
        and user_id = v_order.customer_id
        and status = 'active'
      for update;
    if not found then raise exception 'coupon_not_available'; end if;
    update public.user_coupons
       set status = 'used', used_at = now(), order_id = v_order.id, used_context = 'order'
     where id = v_order.coupon_user_id;
  end if;

  update public.orders
     set status = 'paid',
         method = left(p_method, 80),
         payment_key = left(p_payment_key, 160),
         provider_transaction_id = left(p_provider_transaction_id, 160),
         receipt_url = left(p_receipt_url, 500),
         paid_at = coalesce(paid_at, now())
   where id = v_order.id
   returning * into v_order;

  update public.listings
     set status = 'reserved', sold_order_id = null,
         reserved_order_id = v_order.id,
         reserved_until = 'infinity'::timestamptz,
         updated_at = now()
   where id = v_listing.id;

  if p_point_earn_bps > 0 and v_order.customer_id is not null
     and not exists (
       select 1 from public.point_ledger
        where order_id = v_order.id and reason = 'order_earn'
     ) then
    v_earned := floor(v_order.amount * p_point_earn_bps / 10000.0)::integer;
    if v_earned > 0 then
      update public.profiles
         set points = points + v_earned
       where id = v_order.customer_id
       returning points into v_balance;
      insert into public.point_ledger(user_id, delta, balance_after, reason, order_id)
      values(v_order.customer_id, v_earned, v_balance, 'order_earn', v_order.id);
    end if;
  end if;

  p_attribution := coalesce(v_order.analytics_attribution, p_attribution);
  begin
    v_session := coalesce(v_order.analytics_session_id, nullif(p_attribution->>'session_id','')::uuid);
    v_anon := coalesce(v_order.analytics_anonymous_id, nullif(p_attribution->>'anonymous_id','')::uuid);
  exception when invalid_text_representation then
    v_session := null;
    v_anon := null;
  end;
  if to_regclass('public.analytics_conversion_attributions') is not null
     and p_attribution is not null and v_session is not null then
    insert into public.analytics_conversion_attributions (
      site_id, conversion_id, session_id, anonymous_id, user_id,
      first_touch, session_touch, conversion_touch, value, currency, converted_at
    ) values (
      'bellore', v_order.id, v_session, v_anon, v_order.customer_id,
      p_attribution->'first_touch', p_attribution->'session_touch',
      p_attribution->'conversion_touch', v_order.amount, 'KRW', v_order.paid_at
    ) on conflict (site_id, conversion_id) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'alreadyPaid', false,
    'earnedPoints', v_earned, 'order', to_jsonb(v_order));
end $$;

revoke all on function public.finalize_paid_order_v2(
  text,bigint,text,text,text,text,jsonb,integer
) from public, anon, authenticated;
grant execute on function public.finalize_paid_order_v2(
  text,bigint,text,text,text,text,jsonb,integer
) to service_role;

-- Align already-verified pre-confirmation v2 purchases with the same visible
-- reserved state. Active payment-operation holds are intentionally untouched.
update public.listings as listing
   set status = 'reserved',
       sold_order_id = null,
       reserved_order_id = orders.id,
       reserved_until = 'infinity'::timestamptz,
       updated_at = now()
  from public.orders as orders
 where listing.id = orders.listing_id
   and orders.payment_contract_version = 2
   and orders.status in ('paid','inspecting','preparing','shipping','shipped','delivered')
   and (listing.sold_order_id = orders.id or listing.reserved_order_id = orders.id)
   and not public.is_payment_operation_hash_held_v1(
     public.payment_order_no_sha256_v1(orders.order_no)
   );
