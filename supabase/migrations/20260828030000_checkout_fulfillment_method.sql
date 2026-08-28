-- Store the selected handoff method in the authoritative order record.
-- Valex delivery keeps the premium shipping rule. Bellore store pickup has
-- no shipping charge and is followed by a consultant call after payment.

do $$
declare
  v_type text;
  v_nullable text;
  v_default text;
begin
  select data_type, is_nullable, column_default
    into v_type, v_nullable, v_default
    from information_schema.columns
   where table_schema='public' and table_name='orders'
     and column_name='fulfillment_method';
  if found and (
    v_type <> 'text'
    or v_nullable <> 'NO'
    or coalesce(v_default,'') <> '''delivery''::text'
  ) then
    raise exception 'checkout_fulfillment_column_contract_mismatch';
  end if;
end $$;

alter table public.orders
  add column if not exists fulfillment_method text not null default 'delivery';

alter table public.orders drop constraint if exists orders_fulfillment_method_check;
alter table public.orders add constraint orders_fulfillment_method_check
  check (fulfillment_method in ('delivery', 'pickup')) not valid;
alter table public.orders validate constraint orders_fulfillment_method_check;

comment on column public.orders.fulfillment_method is
  'delivery=Valex insured delivery; pickup=Bellore consultant-arranged store handoff';

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
  if new.fulfillment_method is null or new.fulfillment_method not in ('delivery', 'pickup') then
    raise exception 'checkout_fulfillment_invalid';
  end if;
  new.payment_contract_version := 2;
  new.checkout_request_key_hash := nullif(current_setting('app.checkout_request_key_hash', true), '');
  if new.checkout_request_key_hash is null or new.checkout_request_key_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'checkout_request_invalid'; end if;

  if new.coupon_user_id is not null and exists (
    select 1 from public.orders as existing
     where existing.coupon_user_id = new.coupon_user_id
       and existing.status not in ('failed','canceled','refunded','refund_pending')
  ) then raise exception 'coupon_reserved'; end if;

  if new.checkout_token_hash is not null and (
    nullif(btrim(coalesce(new.buyer_name,'')), '') is null
    or nullif(btrim(coalesce(new.buyer_phone,'')), '') is null
  ) then raise exception 'checkout_buyer_required'; end if;

  if new.checkout_token_hash is not null and new.fulfillment_method = 'delivery' and (
    nullif(btrim(coalesce(new.ship_recipient,'')), '') is null
    or nullif(btrim(coalesce(new.ship_phone,'')), '') is null
    or nullif(btrim(coalesce(new.ship_postcode,'')), '') is null
    or nullif(btrim(coalesce(new.ship_addr1,'')), '') is null
  ) then raise exception 'checkout_shipping_required'; end if;
  return new;
end;
$$;

revoke all on function public.guard_new_checkout_claims_v1()
  from public, anon, authenticated;

create or replace function public.create_checkout_order_paid_only_v2(
  p_listing_id uuid,
  p_checkout_token_hash text,
  p_fulfillment_method text,
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
  if p_fulfillment_method is null or p_fulfillment_method not in ('delivery', 'pickup') then
    raise exception 'checkout_fulfillment_invalid';
  end if;
  if p_attribution is not null and jsonb_typeof(p_attribution) <> 'object' then
    raise exception 'attribution_invalid';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
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
  v_base := v_true_price + case
    when p_fulfillment_method = 'delivery' and v_true_price >= 5000000 then 35000
    else 0
  end;

  if p_coupon_user_id is not null then
    if v_uid is null then raise exception 'guest_coupon_not_allowed'; end if;
    select * into v_coupon from public.user_coupons
     where id = p_coupon_user_id for update;
    if not found or v_coupon.user_id <> v_uid or v_coupon.status <> 'active' then
      raise exception 'coupon_invalid';
    end if;
    select * into v_coupon_def from public.coupons where id = v_coupon.coupon_id;
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
    coupon_user_id, discount, buyer_name, buyer_phone, fulfillment_method,
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
    p_fulfillment_method,
    case when p_fulfillment_method='pickup' then null else left(p_ship_recipient,120) end,
    case when p_fulfillment_method='pickup' then null else left(p_ship_phone,40) end,
    case when p_fulfillment_method='pickup' then null else left(p_ship_postcode,20) end,
    case when p_fulfillment_method='pickup' then null else left(p_ship_addr1,300) end,
    case when p_fulfillment_method='pickup' then null else left(p_ship_addr2,300) end,
    case when p_fulfillment_method='pickup' then null else left(p_ship_request,300) end,
    p_checkout_token_hash,
    nullif(p_attribution->>'session_id','')::uuid,
    nullif(p_attribution->>'anonymous_id','')::uuid,
    p_attribution
  ) returning * into v_order;

  return jsonb_build_object(
    'orderNo', v_order.order_no,
    'amount', v_order.amount,
    'payType', v_order.pay_type,
    'listingId', v_order.listing_id,
    'fulfillmentMethod', v_order.fulfillment_method
  );
exception when invalid_text_representation then
  raise exception 'attribution_invalid';
end;
$$;

revoke all on function public.create_checkout_order_paid_only_v2(
  uuid,text,text,uuid,text,text,text,text,text,text,text,text,jsonb,uuid
) from public, anon, authenticated;
grant execute on function public.create_checkout_order_paid_only_v2(
  uuid,text,text,uuid,text,text,text,text,text,text,text,text,jsonb,uuid
) to service_role;

create or replace function public.create_checkout_order_edge_v2(
  p_rate_key text,
  p_customer_id uuid,
  p_listing_id uuid,
  p_checkout_request_key_hash text,
  p_checkout_token_hash text,
  p_expected_amount bigint,
  p_fulfillment_method text,
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
  if p_checkout_request_key_hash is null or p_checkout_request_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'checkout_request_invalid';
  end if;
  if p_checkout_token_hash is null or p_checkout_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'checkout_token_invalid';
  end if;
  if p_expected_amount is null or p_expected_amount <= 0 then
    raise exception 'checkout_amount_invalid';
  end if;
  if p_fulfillment_method is null or p_fulfillment_method not in ('delivery', 'pickup') then
    raise exception 'checkout_fulfillment_invalid';
  end if;

  if exists (
    select 1 from public.orders as held_order
     where held_order.checkout_request_key_hash = p_checkout_request_key_hash
       and public.is_payment_operation_hash_held_v1(public.payment_order_no_sha256_v1(held_order.order_no))
  ) then raise exception 'payment_operation_held'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bellore-checkout-v2:' || p_checkout_request_key_hash, 0)
  );
  select * into v_existing from public.orders
   where checkout_request_key_hash = p_checkout_request_key_hash
     and not public.is_payment_operation_hash_held_v1(public.payment_order_no_sha256_v1(order_no))
   for update;
  if found then
    if v_existing.payment_contract_version = 2
       and v_existing.status = 'pending'
       and v_existing.customer_id is not distinct from p_customer_id
       and v_existing.listing_id = p_listing_id
       and v_existing.checkout_token_hash = p_checkout_token_hash
       and v_existing.amount = p_expected_amount
       and v_existing.fulfillment_method = p_fulfillment_method
       and v_existing.coupon_user_id is not distinct from p_coupon_user_id
       and v_existing.buyer_name is not distinct from left(p_buyer_name,120)
       and v_existing.buyer_phone is not distinct from left(p_buyer_phone,40)
       and v_existing.ship_recipient is not distinct from (
         case when p_fulfillment_method='pickup' then null else left(p_ship_recipient,120) end
       )
       and v_existing.ship_phone is not distinct from (
         case when p_fulfillment_method='pickup' then null else left(p_ship_phone,40) end
       )
       and v_existing.ship_postcode is not distinct from (
         case when p_fulfillment_method='pickup' then null else left(p_ship_postcode,20) end
       )
       and v_existing.ship_addr1 is not distinct from (
         case when p_fulfillment_method='pickup' then null else left(p_ship_addr1,300) end
       )
       and v_existing.ship_addr2 is not distinct from (
         case when p_fulfillment_method='pickup' then null else left(p_ship_addr2,300) end
       )
       and v_existing.ship_request is not distinct from (
         case when p_fulfillment_method='pickup' then null else left(p_ship_request,300) end
       )
       and exists (
         select 1 from public.listings as available
          where available.id = v_existing.listing_id
            and available.status = 'on_sale'
            and available.sold_order_id is null
       )
    then
      return jsonb_build_object(
        'orderNo',v_existing.order_no, 'amount',v_existing.amount,
        'payType',v_existing.pay_type, 'listingId',v_existing.listing_id,
        'fulfillmentMethod',v_existing.fulfillment_method,
        'reservationMode','paid_only', 'paymentContractVersion',2,
        'checkoutReplayed',true
      );
    end if;
    return jsonb_build_object('error','checkout_request_conflict');
  end if;

  perform public.consume_checkout_rate_limit(p_rate_key);
  begin
    perform set_config('app.payment_contract_version', '2', true);
    perform set_config('app.checkout_request_key_hash', p_checkout_request_key_hash, true);
    v_result := public.create_checkout_order_paid_only_v2(
      p_listing_id => p_listing_id,
      p_checkout_token_hash => p_checkout_token_hash,
      p_fulfillment_method => p_fulfillment_method,
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
    then raise exception 'checkout_amount_changed'; end if;
  exception when others then
    v_error := sqlerrm;
    v_error_state := sqlstate;
    if v_error_state = '23505' and position('orders_one_unresolved_coupon_idx' in v_error) > 0 then
      v_error := 'coupon_reserved';
    elsif v_error not in (
      'listing_required','checkout_token_invalid','checkout_fulfillment_invalid',
      'attribution_invalid','listing_not_found','listing_unavailable',
      'listing_price_invalid','guest_coupon_not_allowed','coupon_invalid',
      'coupon_reserved','checkout_amount_too_small','checkout_amount_changed'
    ) then raise; end if;
    return jsonb_build_object('error',v_error);
  end;

  return v_result || jsonb_build_object(
    'reservationMode','paid_only', 'paymentContractVersion',2,
    'checkoutReplayed',false
  );
end;
$$;

revoke all on function public.create_checkout_order_edge_v2(
  text,uuid,uuid,text,text,bigint,text,uuid,text,text,text,text,text,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.create_checkout_order_edge_v2(
  text,uuid,uuid,text,text,bigint,text,uuid,text,text,text,text,text,text,text,text,jsonb
) to service_role;

comment on function public.create_checkout_order_edge_v2(
  text,uuid,uuid,text,text,bigint,text,uuid,text,text,text,text,text,text,text,text,jsonb
) is 'Service-only checkout contract for Valex delivery or consultant-arranged Bellore store pickup.';
