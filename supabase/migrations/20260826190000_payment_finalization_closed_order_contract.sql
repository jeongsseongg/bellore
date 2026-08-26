-- Never rewrite an applied migration to change the financial state machine.
-- This follow-up narrows paid finalization after the v2 terminal-state and
-- financial-field guards have been installed by the 1600-1800 migrations.

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
  -- The provider lookup can race with a local timeout or customer cancellation.
  -- Re-check the locked row instead of trusting the earlier Edge snapshot. The
  -- exact error contract is deliberately narrow because it authorizes an
  -- automatic provider cancellation in every payment recovery entrypoint.
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

-- Reconciliation must not materialize an actively held order in Edge code.
-- SECURITY BARRIER prevents caller predicates from being pushed through the
-- hold boundary; the view is read-only to the service role by privilege.
create or replace view public.payment_reconciliation_orders_edge_v1
with (security_barrier = true, security_invoker = true)
as
select orders.*
  from public.orders as orders
 where not public.is_payment_operation_hash_held_v1(
   public.payment_order_no_sha256_v1(orders.order_no)
 );

revoke all on public.payment_reconciliation_orders_edge_v1
  from public, anon, authenticated, service_role;
grant select on public.payment_reconciliation_orders_edge_v1
  to service_role;
