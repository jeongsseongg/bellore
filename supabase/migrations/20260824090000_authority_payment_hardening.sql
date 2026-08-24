-- BELLORE phases 7-8: authority boundary + atomic payment lifecycle.
-- Production preconditions verified on 2026-08-24:
--   * public.orders contains no rows.
--   * public.listings contains 166 on_sale rows and no other status.
--   * this migration is additive/idempotent and is applied only after a fresh backup.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Orders are created through one server-owned RPC. Browser table inserts
--    are removed, so status/amount/payment fields cannot be forged by RLS input.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists checkout_token_hash text,
  add column if not exists provider_transaction_id text;

alter table public.listings
  add column if not exists reserved_order_id uuid references public.orders(id) on delete set null,
  add column if not exists reserved_until timestamptz,
  add column if not exists sold_order_id uuid references public.orders(id) on delete set null;

create index if not exists listings_reservation_idx
  on public.listings (reserved_until)
  where reserved_order_id is not null;

alter table public.orders drop constraint if exists orders_pay_type_full;
alter table public.orders add constraint orders_pay_type_full
  check (pay_type = 'full') not valid;
alter table public.orders validate constraint orders_pay_type_full;

alter table public.orders drop constraint if exists orders_amount_positive;
alter table public.orders add constraint orders_amount_positive
  check (amount >= 100) not valid;
alter table public.orders validate constraint orders_amount_positive;

alter table public.orders drop constraint if exists orders_discount_nonnegative;
alter table public.orders add constraint orders_discount_nonnegative
  check (discount >= 0 and discount <= amount + discount) not valid;
alter table public.orders validate constraint orders_discount_nonnegative;

alter table public.orders drop constraint if exists orders_status_known;
alter table public.orders add constraint orders_status_known check (status in (
  'pending', 'payment_review', 'paid', 'failed', 'canceled',
  'inspecting', 'preparing', 'shipping', 'shipped', 'delivered', 'confirmed',
  'cancel_req', 'cancel_requested', 'refund_pending', 'refunded',
  'return_req', 'exchange_req', 'returning', 'done'
)) not valid;
alter table public.orders validate constraint orders_status_known;

alter table public.orders drop constraint if exists orders_checkout_token_hash_format;
alter table public.orders add constraint orders_checkout_token_hash_format
  check (checkout_token_hash is null or checkout_token_hash ~ '^[0-9a-f]{64}$') not valid;
alter table public.orders validate constraint orders_checkout_token_hash_format;

revoke all on public.orders from anon;
revoke all on public.orders from authenticated;
grant select, update on public.orders to authenticated;
grant select, insert, update, delete on public.orders to service_role;

drop policy if exists orders_insert_guest on public.orders;
drop policy if exists orders_insert_own on public.orders;

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated
  using (auth.uid() = customer_id);

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all to authenticated
  using (public.is_admin_uid(auth.uid()))
  with check (public.is_admin_uid(auth.uid()));

create or replace function public.guard_order_money_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and (
    new.status is distinct from old.status and new.status in ('paid','payment_review','refund_pending','refunded')
    or new.amount is distinct from old.amount
    or new.discount is distinct from old.discount
    or new.product_price is distinct from old.product_price
    or new.payment_key is distinct from old.payment_key
    or new.provider_transaction_id is distinct from old.provider_transaction_id
    or new.receipt_url is distinct from old.receipt_url
    or new.paid_at is distinct from old.paid_at
    or new.refund_amount is distinct from old.refund_amount
    or new.refunded_at is distinct from old.refunded_at
    or new.checkout_token_hash is distinct from old.checkout_token_hash
  ) then
    raise exception 'payment_fields_are_server_owned';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_order_money_fields on public.orders;
create trigger trg_guard_order_money_fields
  before update on public.orders
  for each row execute function public.guard_order_money_fields();

create table if not exists public.checkout_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_attempt_at timestamptz not null default now()
);
create index if not exists checkout_rate_limits_window_idx
  on public.checkout_rate_limits(window_started_at);
alter table public.checkout_rate_limits enable row level security;
revoke all on public.checkout_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.checkout_rate_limits to service_role;

drop function if exists public.create_checkout_order(
  uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb
);
create or replace function public.create_checkout_order(
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
  if v_listing.reserved_order_id is not null and v_listing.reserved_until > now() then
    raise exception 'listing_reserved';
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

  -- Premium shipping is a server-owned business rule.
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

  update public.listings
     set reserved_order_id = v_order.id,
         reserved_until = now() + interval '15 minutes'
   where id = v_listing.id;

  return jsonb_build_object(
    'orderNo', v_order.order_no,
    'amount', v_order.amount,
    'payType', v_order.pay_type,
    'listingId', v_order.listing_id,
    'expiresAt', now() + interval '15 minutes'
  );
exception
  when invalid_text_representation then
    raise exception 'attribution_invalid';
end $$;

revoke all on function public.create_checkout_order(
  uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb,uuid
) from public, anon, authenticated;
grant execute on function public.create_checkout_order(
  uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb,uuid
) to service_role;

create or replace function public.consume_checkout_rate_limit(p_rate_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_attempts integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'checkout_rate_forbidden';
  end if;
  if p_rate_key is null or p_rate_key !~ '^[0-9a-f]{64}$' then
    raise exception 'checkout_rate_key_invalid';
  end if;
  delete from public.checkout_rate_limits
   where window_started_at < now() - interval '24 hours';
  insert into public.checkout_rate_limits(key_hash,window_started_at,attempt_count,last_attempt_at)
  values(p_rate_key,now(),1,now())
  on conflict (key_hash) do update
    set window_started_at = case
          when public.checkout_rate_limits.window_started_at < now()-interval '15 minutes'
            then now() else public.checkout_rate_limits.window_started_at end,
        attempt_count = case
          when public.checkout_rate_limits.window_started_at < now()-interval '15 minutes'
            then 1 else public.checkout_rate_limits.attempt_count+1 end,
        last_attempt_at = now()
    where public.checkout_rate_limits.window_started_at < now()-interval '15 minutes'
       or public.checkout_rate_limits.attempt_count < 5
  returning attempt_count into v_attempts;
  if v_attempts is null then raise exception 'checkout_rate_limited'; end if;
  return v_attempts;
end $$;
revoke all on function public.consume_checkout_rate_limit(text)
  from public, anon, authenticated;
grant execute on function public.consume_checkout_rate_limit(text) to service_role;

create or replace function public.create_checkout_order_edge_v1(
  p_rate_key text,
  p_customer_id uuid,
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
  p_attribution jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'checkout_edge_forbidden';
  end if;
  if p_rate_key is null or p_rate_key !~ '^[0-9a-f]{64}$' then
    raise exception 'checkout_rate_key_invalid';
  end if;

  perform public.consume_checkout_rate_limit(p_rate_key);
  return public.create_checkout_order(
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
end $$;
revoke all on function public.create_checkout_order_edge_v1(
  text,uuid,uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.create_checkout_order_edge_v1(
  text,uuid,uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb
) to service_role;
revoke all on function public.consume_checkout_rate_limit(text)
  from public, anon, authenticated;
grant execute on function public.consume_checkout_rate_limit(text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Provider-paid order finalization is one idempotent DB transaction.
--    Listing lock, coupon consumption, points, analytics and settlement input
--    all observe the same committed order snapshot.
-- ---------------------------------------------------------------------------

create unique index if not exists point_ledger_order_earn_unique
  on public.point_ledger (order_id, reason)
  where reason in ('order_earn','order_refund');

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
  if v_order.status not in ('pending','failed','payment_review') then
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
     set status = 'sold', sold_order_id = v_order.id,
         reserved_order_id = null, reserved_until = null,
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

create or replace function public.finalize_order_refund_v2(
  p_order_no text,
  p_refund_amount bigint,
  p_reason text,
  p_provider_cancellation_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_earned integer := 0;
  v_reversed integer := 0;
  v_balance integer;
begin
  select * into v_order
    from public.orders
   where order_no = p_order_no
   for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status = 'refunded' then
    if v_order.refund_amount is distinct from p_refund_amount then
      raise exception 'refund_conflict';
    end if;
    return jsonb_build_object('ok',true,'alreadyRefunded',true);
  end if;
  if v_order.status not in (
    'pending','payment_review','failed','canceled','paid','inspecting','preparing',
    'shipping','shipped','delivered','confirmed','cancel_req','cancel_requested',
    'return_req','exchange_req','returning','done','refund_pending'
  ) then
    raise exception 'refund_state_invalid:%', v_order.status;
  end if;
  if p_refund_amount <> v_order.amount then raise exception 'refund_amount_mismatch'; end if;

  select coalesce(sum(delta),0)::integer into v_earned
    from public.point_ledger
   where order_id = v_order.id and reason = 'order_earn' and delta > 0;
  if v_earned > 0 and not exists (
    select 1 from public.point_ledger
     where order_id = v_order.id and reason = 'order_refund'
  ) then
    select points into v_balance
      from public.profiles
     where id = v_order.customer_id
     for update;
    v_reversed := least(v_earned, greatest(coalesce(v_balance,0),0));
    update public.profiles
       set points = points - v_reversed
     where id = v_order.customer_id
     returning points into v_balance;
    insert into public.point_ledger(user_id, delta, balance_after, reason, order_id)
    values(v_order.customer_id, -v_reversed, v_balance, 'order_refund', v_order.id);
  end if;

  if v_order.coupon_user_id is not null then
    update public.user_coupons
       set status='active', used_at=null, order_id=null, used_context=null
     where id=v_order.coupon_user_id and order_id=v_order.id and status='used';
  end if;

  update public.listings
     set status='on_sale', sold_order_id=null,
         reserved_order_id=null, reserved_until=null, updated_at=now()
   where id=v_order.listing_id
     and (
       (sold_order_id=v_order.id and status='sold')
       or reserved_order_id=v_order.id
     );

  if to_regclass('public.settlements') is not null then
    update public.settlements
       set status = case when status='paid' then 'refund_recovery_required' else 'canceled' end,
           memo = concat_ws(E'\n', nullif(memo,''),
             'refund:', left(coalesce(p_provider_cancellation_id,'provider'),80))
     where order_id=v_order.id and status not in ('canceled','refund_recovery_required');
  end if;

  update public.orders
     set status='refunded', refund_amount=p_refund_amount, refunded_at=now(),
         cancel_reason=left(coalesce(p_reason,cancel_reason,'refund'),300)
   where id=v_order.id;

  return jsonb_build_object('ok',true,'alreadyRefunded',false);
end $$;

revoke all on function public.finalize_order_refund_v2(text,bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.finalize_order_refund_v2(text,bigint,text,text)
  to service_role;

drop function if exists public.mark_order_payment_review(text,text);
create function public.mark_order_payment_review(
  p_order_no text, p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'checkout_core_forbidden';
  end if;
  update public.orders
     set status='payment_review', admin_memo=left(coalesce(p_reason,'payment_review'),1000)
   where order_no=p_order_no and status <> 'refunded';
  get diagnostics v_count = row_count;
  return v_count = 1;
end $$;
revoke all on function public.mark_order_payment_review(text,text)
  from public, anon, authenticated;
grant execute on function public.mark_order_payment_review(text,text) to service_role;

drop function if exists public.mark_order_refund_pending(text,text);
create function public.mark_order_refund_pending(
  p_order_no text, p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update public.orders
     set status='refund_pending',
         admin_memo=left(coalesce(p_reason,'refund_recovery_required'),1000)
   where order_no=p_order_no
     and status in (
       'pending','payment_review','failed','canceled','paid','inspecting','preparing',
       'shipping','shipped','delivered','confirmed','cancel_req','cancel_requested',
       'return_req','exchange_req','returning','done','refund_pending'
     );
  get diagnostics v_count = row_count;
  return v_count = 1;
end $$;
revoke all on function public.mark_order_refund_pending(text,text)
  from public, anon, authenticated;
grant execute on function public.mark_order_refund_pending(text,text) to service_role;

drop function if exists public.fail_unsettled_order(text,text);
create function public.fail_unsettled_order(
  p_order_no text, p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_listing_id uuid;
begin
  update public.orders
     set status='failed', cancel_reason=left(coalesce(p_reason,'provider_payment_failed'),300)
   where order_no=p_order_no
     and status in ('pending','payment_review','refund_pending','failed')
   returning id, listing_id into v_order_id, v_listing_id;
  if v_order_id is null then return false; end if;
  update public.listings
     set reserved_order_id=null, reserved_until=null, updated_at=now()
   where id=v_listing_id and reserved_order_id=v_order_id;
  return true;
end $$;
revoke all on function public.fail_unsettled_order(text,text)
  from public, anon, authenticated;
grant execute on function public.fail_unsettled_order(text,text) to service_role;

create or replace function public.release_expired_checkout_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  with expired as (
    update public.listings
       set reserved_order_id=null, reserved_until=null, updated_at=now()
     where status='on_sale' and reserved_order_id is not null and reserved_until < now()
     returning 1
  ) select count(*) into v_count from expired;
  update public.orders o
     set status='canceled', cancel_reason='checkout_reservation_expired', canceled_at=now()
   where o.status='pending' and o.created_at < now()-interval '30 minutes'
     and not exists (
       select 1 from public.listings l where l.reserved_order_id=o.id
     );
  return v_count;
end $$;
revoke all on function public.release_expired_checkout_reservations()
  from public, anon, authenticated;
grant execute on function public.release_expired_checkout_reservations() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job
     where jobname='bellore-checkout-reservation-cleanup';
    perform cron.schedule(
      'bellore-checkout-reservation-cleanup', '*/5 * * * *',
      'select public.release_expired_checkout_reservations()'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Storage ownership: authenticated users can only mutate objects they own.
--    Public reads and the two deliberately bounded bot/guest upload prefixes stay.
-- ---------------------------------------------------------------------------

drop policy if exists "photos_auth_insert" on storage.objects;
drop policy if exists "photos_auth_update" on storage.objects;
drop policy if exists "photos_auth_delete" on storage.objects;
drop policy if exists "photos_upload" on storage.objects;
drop policy if exists "photos_delete" on storage.objects;

create policy "photos_auth_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id='photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "photos_auth_update"
  on storage.objects for update to authenticated
  using (
    bucket_id='photos'
    and (owner_id=auth.uid()::text or public.is_admin_uid(auth.uid()))
  )
  with check (
    bucket_id='photos'
    and (owner_id=auth.uid()::text or public.is_admin_uid(auth.uid()))
  );

create policy "photos_auth_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id='photos'
    and (owner_id=auth.uid()::text or public.is_admin_uid(auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 4. SECURITY DEFINER ACLs: default PUBLIC execution is removed. Trigger and
--    underscore-prefixed helpers remain internal; public entry points are an
--    explicit allow-list. service_role retains server execution.
-- ---------------------------------------------------------------------------

do $$
declare v_proc regprocedure;
begin
  for v_proc in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_proc);
    execute format('grant execute on function %s to service_role', v_proc);
  end loop;
end $$;

-- Safe RLS predicates and login lookup.
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_admin_caller() to anon, authenticated;
grant execute on function public.is_admin_uid(uuid) to anon, authenticated;
grant execute on function public.is_approved_vendor() to authenticated;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- Checkout is Edge-only. Browser roles must never bypass the IP rate gate.
revoke all on function public.create_checkout_order(
  uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb,uuid
) from public, anon, authenticated;
grant execute on function public.create_checkout_order(
  uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb,uuid
) to service_role;
revoke all on function public.create_checkout_order_edge_v1(
  text,uuid,uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.create_checkout_order_edge_v1(
  text,uuid,uuid,text,uuid,text,text,text,text,text,text,text,text,jsonb
) to service_role;

-- Guest-capable AI and quote counters; each function enforces its own token/data bounds.
grant execute on function public.get_shop_ai_runtime_status() to anon, authenticated;
grant execute on function public.submit_shop_ai_chat(jsonb) to anon, authenticated;
grant execute on function public.get_shop_ai_chat_result(uuid) to anon, authenticated;
grant execute on function public.log_shop_ai_turn(jsonb) to anon, authenticated;
grant execute on function public.claim_shop_ai_chat(text,text) to anon, authenticated;
grant execute on function public.get_shop_ai_knowledge(text,text) to anon, authenticated;
grant execute on function public.complete_shop_ai_chat(
  text,text,uuid,jsonb,text,text[],text[],boolean,integer
) to anon, authenticated;
grant execute on function public.bump_quote_view(uuid) to anon, authenticated;

-- Authenticated business RPCs.
grant execute on function public.claim_coupon(uuid) to authenticated;
grant execute on function public.claim_coupon_by_code(text) to authenticated;
grant execute on function public.admin_grant_coupon(uuid,uuid) to authenticated;
grant execute on function public.redeem_user_coupon(uuid,text) to authenticated;
grant execute on function public.order_confirm_receipt(text) to authenticated;
grant execute on function public.order_request_cancel(text,text) to authenticated;
grant execute on function public.order_create_return(text,text,text,text,text[]) to authenticated;
grant execute on function public.place_auction_bid(uuid,bigint) to authenticated;
grant execute on function public.auction_winner_cancel(uuid) to authenticated;
grant execute on function public.wallet_refund_request(bigint) to authenticated;

-- Admin analytics functions keep their internal administrator checks.
grant execute on function public.analytics_acquisition_keywords(integer,integer) to authenticated;
grant execute on function public.analytics_acquisition_overview(integer) to authenticated;
grant execute on function public.analytics_consent_dashboard_v1(integer) to authenticated;
grant execute on function public.analytics_dashboard_v3(integer) to authenticated;
grant execute on function public.analytics_exclude_session(text) to authenticated;
grant execute on function public.analytics_overview() to authenticated;
grant execute on function public.analytics_overview_v2(integer) to authenticated;
grant execute on function public.popular_products(integer,integer) to authenticated;
grant execute on function public.recent_activity_events(integer,integer) to authenticated;
grant execute on function public.recent_page_views_v2(integer,integer) to authenticated;
grant execute on function public.recent_product_views(integer) to authenticated;
grant execute on function public.recent_product_views_v2(integer,integer) to authenticated;
grant execute on function public.top_paths(integer,integer) to authenticated;
grant execute on function public.views_by_hour(integer) to authenticated;
grant execute on function public.visits_by_day(integer) to authenticated;

-- Fix the service-role test: auth.uid() IS NULL also describes anon requests.
create or replace function public.wallet_charge(
  p_uid uuid, p_amount bigint, p_memo text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_balance bigint;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_charge_amount'; end if;
  if coalesce(auth.role(),'') <> 'service_role'
     and not public.is_admin_uid(auth.uid()) then
    raise exception 'wallet_charge_forbidden';
  end if;
  perform public._wallet_row(p_uid);
  update public.wallets set balance=balance+p_amount, updated_at=now()
   where user_id=p_uid returning balance into v_balance;
  insert into public.wallet_txns(user_id,type,amount,balance_after,status,memo)
  values(p_uid,'charge',p_amount,v_balance,'done',coalesce(p_memo,'charge'));
  return v_balance;
end $$;
revoke all on function public.wallet_charge(uuid,bigint,text) from public, anon;
grant execute on function public.wallet_charge(uuid,bigint,text) to authenticated, service_role;

revoke all on function public.wallet_capture(uuid,bigint,uuid,text)
  from public, anon, authenticated;
grant execute on function public.wallet_capture(uuid,bigint,uuid,text) to service_role;

-- Internal composite-argument coupon helper was directly callable in production.
revoke all on function public._claim_coupon(public.coupons,uuid)
  from public, anon, authenticated;
