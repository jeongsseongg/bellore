-- Keep listing availability aligned with the durable order state.
--
-- finalize_paid_order_v2 currently marks a listing sold after changing the
-- order to paid. A deferred constraint trigger is intentional here: it runs
-- at transaction end, after that legacy sold write, and normalizes the
-- listing to a reservation without duplicating the payment-finalization RPC.

-- The listing-state contract is versioned. Define the discriminator before
-- installing any trigger or running any backfill so historical (NULL) orders
-- remain observational data and can never rewrite current inventory state.
alter table public.orders
  add column if not exists payment_contract_version smallint;

-- A completed provider refund does not prove that a watch which already left
-- Bellore is physically ready to sell again. This flag is durable financial
-- state: payment services set it, inventory stays sold/owned by the order, and
-- an operator may reopen the listing only after return intake and inspection.
alter table public.orders
  add column if not exists restock_required boolean not null default false;

alter table public.orders
  add column if not exists payment_review_required boolean not null default false;

-- A terminal sweep must follow when an order was closed, not when an old
-- checkout was created. This timestamp is server-owned and sticky so a later
-- failed -> canceled rewrite cannot move or erase the first closure time.
alter table public.orders
  add column if not exists payment_terminal_at timestamptz;

update public.orders as orders
   set payment_terminal_at = least(
     coalesce(
       orders.canceled_at,
       nullif(to_jsonb(orders)->>'updated_at','')::timestamptz,
       orders.created_at,
       now()
     ),
     now()
   )
 where orders.payment_contract_version = 2
   and orders.status in ('failed','canceled')
   and orders.payment_terminal_at is null;

alter table public.orders
  drop constraint if exists orders_v2_terminal_timestamp_required;
alter table public.orders
  add constraint orders_v2_terminal_timestamp_required check (
    payment_contract_version is distinct from 2
    or status not in ('failed','canceled')
    or payment_terminal_at is not null
  ) not valid;
alter table public.orders
  validate constraint orders_v2_terminal_timestamp_required;

create index if not exists orders_recent_payment_terminal_v2_idx
  on public.orders(payment_terminal_at,id)
  where payment_contract_version = 2
    and status in ('failed','canceled')
    and payment_terminal_at is not null;

create or replace function public.stamp_order_payment_terminal_at_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.payment_terminal_at := case
      when new.payment_contract_version = 2
       and new.status in ('failed','canceled') then now()
      else null
    end;
    return new;
  end if;

  if old.payment_terminal_at is not null then
    new.payment_terminal_at := old.payment_terminal_at;
  elsif new.payment_contract_version = 2
    and new.status in ('failed','canceled')
    and old.status not in ('failed','canceled') then
    new.payment_terminal_at := now();
  else
    new.payment_terminal_at := old.payment_terminal_at;
  end if;
  return new;
end $$;

revoke all on function public.stamp_order_payment_terminal_at_v1()
  from public, anon, authenticated;

drop trigger if exists trg_stamp_order_payment_terminal_at_v1 on public.orders;
create trigger trg_stamp_order_payment_terminal_at_v1
  before insert or update on public.orders
  for each row execute function public.stamp_order_payment_terminal_at_v1();

comment on column public.orders.restock_required is
  'Server-owned v2 hold: refunded physical inventory must be inspected before an operator reopens the listing.';

comment on column public.orders.payment_review_required is
  'Server-owned v2 flag: provider financial state needs review without overwriting fulfilment lifecycle status.';

comment on column public.orders.payment_terminal_at is
  'Server-owned first transition time into failed/canceled for contract-v2 late-payment reconciliation.';

-- `cancel_req`/`cancel_requested` can replace the visible lifecycle status.
-- Determine the physical hold from sticky evidence which survives that status
-- change: the server flag, fulfilment timestamps, or the status history.
create or replace function public.order_requires_restock_v1(
  p_order_id uuid,
  p_payment_contract_version smallint,
  p_status text,
  p_existing boolean,
  p_shipped_at timestamptz,
  p_delivered_at timestamptz,
  p_confirmed_at timestamptz
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_had_post_fulfilment_status boolean := false;
begin
  if p_payment_contract_version is distinct from 2 then return false; end if;
  if coalesce(p_existing, false)
     or p_shipped_at is not null
     or p_delivered_at is not null
     or p_confirmed_at is not null
     or p_status in (
       'shipping','shipped','delivered','confirmed',
       'return_req','exchange_req','returning','done'
     ) then
    return true;
  end if;

  -- Some installations predate orders_flow.sql. Keep cancellation/refund
  -- callable there: history strengthens the decision when present, but its
  -- absence never turns a pre-fulfilment refund into a runtime SQL failure.
  if p_order_id is null
     or to_regclass('public.order_status_history') is null then
    return false;
  end if;

  execute $query$
    select exists (
      select 1
        from public.order_status_history as history
       where history.order_id = $1
         and history.to_status in (
           'shipping','shipped','delivered','confirmed',
           'return_req','exchange_req','returning','done'
         )
    )
  $query$
  into v_had_post_fulfilment_status
  using p_order_id;
  return v_had_post_fulfilment_status;
end $$;

revoke all on function public.order_requires_restock_v1(
  uuid,smallint,text,boolean,timestamptz,timestamptz,timestamptz
) from public, anon, authenticated;
grant execute on function public.order_requires_restock_v1(
  uuid,smallint,text,boolean,timestamptz,timestamptz,timestamptz
) to service_role;

create or replace function public.sync_listing_state_from_order_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if new.payment_contract_version is distinct from 2 then
    return null;
  end if;

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
       and (reserved_order_id is null or reserved_order_id = new.id);

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'listing_state_conflict:%', new.listing_id;
    end if;

  elsif new.status in ('cancel_req', 'cancel_requested', 'refund_pending') then
    if coalesce(new.restock_required, false) then
      -- Once fulfilment has started, a pending refund must not make the watch
      -- look like reservable inventory. Keep the physical item sold-owned by
      -- this order until it returns and passes inspection.
      update public.listings
         set status = 'sold',
             sold_order_id = new.id,
             reserved_order_id = null,
             reserved_until = null,
             updated_at = now()
       where id = new.listing_id
         and (sold_order_id is null or sold_order_id = new.id)
         and (reserved_order_id is null or reserved_order_id = new.id);
    else
      -- Keep a late-payment refund intent durable without stealing a newer
      -- checkout's reservation. Provider cancellation must be able to proceed.
      update public.listings
         set status = 'reserved',
             reserved_order_id = new.id,
             reserved_until = 'infinity'::timestamptz,
             sold_order_id = null,
             updated_at = now()
       where id = new.listing_id
         and (sold_order_id is null or sold_order_id = new.id)
         and (reserved_order_id is null or reserved_order_id = new.id);
    end if;

  elsif new.status in (
    'paid',
    'inspecting',
    'preparing',
    'shipping',
    'shipped',
    'delivered'
  ) then
    update public.listings
       set status = 'reserved',
           reserved_order_id = new.id,
           reserved_until = 'infinity'::timestamptz,
           sold_order_id = null,
           updated_at = now()
     where id = new.listing_id
       and (sold_order_id is null or sold_order_id = new.id)
       and (reserved_order_id is null or reserved_order_id = new.id);

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'listing_state_conflict:%', new.listing_id;
    end if;

  elsif new.status in (
    'confirmed',
    'return_req',
    'exchange_req',
    'returning',
    'done'
  ) then
    update public.listings
       set status = 'sold',
           sold_order_id = new.id,
           reserved_order_id = null,
           reserved_until = null,
           updated_at = now()
     where id = new.listing_id
       and (sold_order_id is null or sold_order_id = new.id)
       and (reserved_order_id is null or reserved_order_id = new.id);

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'listing_state_conflict:%', new.listing_id;
    end if;

  elsif new.status in ('refunded', 'canceled', 'failed') then
    if coalesce(new.restock_required, false) then
      update public.listings
         set status = 'sold',
             sold_order_id = new.id,
             reserved_order_id = null,
             reserved_until = null,
             updated_at = now()
       where id = new.listing_id
         and (sold_order_id is null or sold_order_id = new.id)
         and (reserved_order_id is null or reserved_order_id = new.id);
    else
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
  end if;

  return null;
end;
$$;

revoke all on function public.sync_listing_state_from_order_v1() from public;
revoke all on function public.sync_listing_state_from_order_v1() from anon;
revoke all on function public.sync_listing_state_from_order_v1() from authenticated;

-- Machine cancellation intent must not compete with a human-readable memo's
-- 1,000-character limit. Keep it in a server-owned, constrained column.
alter table public.orders
  add column if not exists refund_intent_code text;
alter table public.orders
  drop constraint if exists orders_refund_intent_code_allowed;
alter table public.orders
  add constraint orders_refund_intent_code_allowed check (
    refund_intent_code is null or refund_intent_code in (
      'amount_mismatch_auto_cancel',
      'paid_finalization_conflict_auto_cancel',
      'late_payment_unknown_amount_auto_cancel',
      'administrator_provider_verified_refund',
      'provider_already_cancelled_recovery'
    )
  ) not valid;

update public.orders
   set refund_intent_code = case
     when coalesce(admin_memo,'') like '%cancellation_intent:amount_mismatch_auto_cancel%'
       then 'amount_mismatch_auto_cancel'
     when coalesce(admin_memo,'') like '%cancellation_intent:paid_finalization_conflict_auto_cancel%'
       then 'paid_finalization_conflict_auto_cancel'
     when coalesce(admin_memo,'') like '%cancellation_intent:administrator_provider_verified_refund%'
       then 'administrator_provider_verified_refund'
     when coalesce(admin_memo,'') like '%cancellation_intent:provider_already_cancelled_recovery%'
       then 'provider_already_cancelled_recovery'
     else null
   end
 where refund_intent_code is null
   and (
     coalesce(admin_memo,'') like '%cancellation_intent:amount_mismatch_auto_cancel%'
     or coalesce(admin_memo,'') like '%cancellation_intent:paid_finalization_conflict_auto_cancel%'
     or coalesce(admin_memo,'') like '%cancellation_intent:administrator_provider_verified_refund%'
     or coalesce(admin_memo,'') like '%cancellation_intent:provider_already_cancelled_recovery%'
   );

alter table public.orders validate constraint orders_refund_intent_code_allowed;

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
    or new.refund_intent_code is distinct from old.refund_intent_code
    or new.restock_required is distinct from old.restock_required
    or new.payment_review_required is distinct from old.payment_review_required
    or new.payment_terminal_at is distinct from old.payment_terminal_at
  ) then
    raise exception 'payment_fields_are_server_owned';
  end if;
  return new;
end $$;

-- A recorded cancellation intent is sticky. Generic provider-review paths must
-- never turn refund_pending back into payment_review, otherwise a later PAID
-- observation could finalize a payment that is already meant to be cancelled.
create or replace function public.mark_order_payment_review(
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
     set status=case
           when payment_contract_version = 2
             and status not in ('pending','payment_review') then status
           else 'payment_review'
         end,
         payment_review_required=coalesce(
           payment_contract_version = 2
           and status not in ('pending','payment_review'),
           false
         ),
         admin_memo=left(coalesce(p_reason,'payment_review'),1000)
   where order_no=p_order_no
     and (
       payment_contract_version = 2
       or status not in ('refunded','refund_pending')
     );
  get diagnostics v_count = row_count;
  return v_count = 1;
end $$;

revoke all on function public.mark_order_payment_review(text,text)
  from public, anon, authenticated;
grant execute on function public.mark_order_payment_review(text,text) to service_role;

-- A healthy provider recheck may clear only the review flag. It cannot alter
-- fulfilment status or repair a mismatched payment identity/value.
create or replace function public.clear_confirmed_payment_review_v1(
  p_order_no text, p_payment_key text, p_amount bigint
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'checkout_core_forbidden';
  end if;

  update public.orders
     set payment_review_required=false
   where order_no=p_order_no
     and payment_contract_version=2
     and status in (
       'paid','inspecting','preparing','shipping','shipped','delivered',
       'confirmed','cancel_req','cancel_requested','return_req','exchange_req',
       'returning','done'
     )
     and payment_key=p_payment_key
     and amount=p_amount
     and paid_at is not null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end $$;

revoke all on function public.clear_confirmed_payment_review_v1(text,text,bigint)
  from public, anon, authenticated;
grant execute on function public.clear_confirmed_payment_review_v1(text,text,bigint)
  to service_role;

create or replace function public.mark_order_refund_pending(
  p_order_no text, p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_intent_code text;
begin
  v_intent_code := case
    when coalesce(p_reason,'') like 'cancellation_intent:amount_mismatch_auto_cancel%'
      then 'amount_mismatch_auto_cancel'
    when coalesce(p_reason,'') like 'cancellation_intent:paid_finalization_conflict_auto_cancel%'
      then 'paid_finalization_conflict_auto_cancel'
    -- This exact non-claiming review marker is emitted only after a locally
    -- failed/canceled order is observed PAID without a usable provider amount.
    -- The UPDATE below independently requires that closed source state before
    -- granting the narrow actual-provider-amount exception.
    when coalesce(p_reason,'') = 'late_payment_provider_paid_amount_missing'
      then 'late_payment_unknown_amount_auto_cancel'
    when coalesce(p_reason,'') like 'cancellation_intent:administrator_provider_verified_refund%'
      then 'administrator_provider_verified_refund'
    when coalesce(p_reason,'') like 'cancellation_intent:provider_already_cancelled_recovery%'
      then 'provider_already_cancelled_recovery'
    else null
  end;
  update public.orders
     set status='refund_pending',
         payment_review_required=false,
         restock_required=public.order_requires_restock_v1(
           id, payment_contract_version, status, restock_required,
           shipped_at, delivered_at, confirmed_at
         ),
         refund_intent_code=coalesce(refund_intent_code,case
           when v_intent_code = 'late_payment_unknown_amount_auto_cancel'
             and status in ('failed','canceled') then v_intent_code
           when v_intent_code <> 'late_payment_unknown_amount_auto_cancel'
             then v_intent_code
           -- Narrow compatibility resume for a row recorded by the previous
           -- function body before this intent column contract was installed.
           -- Do not backfill: require the exact retry reason, current durable
           -- refund state, and an exact pipe-delimited server marker together.
           when coalesce(p_reason,'') = 'cancellation_intent:refund_pending_recovery'
             and status = 'refund_pending'
             and coalesce(admin_memo,'') ~
               '(^|[|])late_payment_provider_paid_amount_missing([|]|$)'
             then 'late_payment_unknown_amount_auto_cancel'
           else null
         end),
         admin_memo=left(concat_ws('|',
           coalesce(p_reason,'refund_recovery_required'),nullif(admin_memo,'')),1000)
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

create or replace function public.fail_unsettled_order(
  p_order_no text, p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_listing_id uuid;
  v_restock_required boolean := false;
begin
  update public.orders
     set status='failed', cancel_reason=left(coalesce(p_reason,'provider_payment_failed'),300)
   where order_no=p_order_no
     and status in ('pending','payment_review','failed')
   returning id, listing_id, restock_required
        into v_order_id, v_listing_id, v_restock_required;
  if v_order_id is null then return false; end if;
  if not coalesce(v_restock_required, false) then
    update public.listings
       set reserved_order_id=null, reserved_until=null, updated_at=now()
     where id=v_listing_id and reserved_order_id=v_order_id;
  end if;
  return true;
end $$;

revoke all on function public.fail_unsettled_order(text,text)
  from public, anon, authenticated;
grant execute on function public.fail_unsettled_order(text,text) to service_role;

-- A normal refund must still equal the order total. The only exception is a
-- provider-verified cancellation whose durable intent was recorded before the
-- provider call; in that case refund_amount is the actual captured/cancelled
-- provider amount, not an incorrect expected order amount.
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
  v_restock_required boolean := false;
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
  if p_refund_amount is null or p_refund_amount <= 0 then
    raise exception 'refund_amount_invalid';
  end if;
  if p_refund_amount <> v_order.amount and not (
    v_order.status = 'refund_pending'
    and v_order.refund_intent_code in (
      'amount_mismatch_auto_cancel',
      'paid_finalization_conflict_auto_cancel',
      'late_payment_unknown_amount_auto_cancel',
      'administrator_provider_verified_refund'
    )
  ) then
    raise exception 'refund_amount_mismatch';
  end if;

  -- Capture the locked lifecycle before changing the order to refunded. If a
  -- previous cancellation-intent step already captured it, the flag is sticky.
  v_restock_required := public.order_requires_restock_v1(
    v_order.id, v_order.payment_contract_version, v_order.status,
    v_order.restock_required, v_order.shipped_at, v_order.delivered_at,
    v_order.confirmed_at
  );

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

  if v_restock_required then
    update public.listings
       set status='sold', sold_order_id=v_order.id,
           reserved_order_id=null, reserved_until=null, updated_at=now()
     where id=v_order.listing_id
       and (sold_order_id is null or sold_order_id=v_order.id)
       and (reserved_order_id is null or reserved_order_id=v_order.id);
  else
    update public.listings
       set status='on_sale', sold_order_id=null,
           reserved_order_id=null, reserved_until=null, updated_at=now()
     where id=v_order.listing_id
       and (
         (sold_order_id=v_order.id and status='sold')
         or reserved_order_id=v_order.id
       );
  end if;

  if to_regclass('public.settlements') is not null then
    update public.settlements
       set status = case when status='paid' then 'refund_recovery_required' else 'canceled' end,
           memo = concat_ws(E'\n', nullif(memo,''),
             'refund:', left(coalesce(p_provider_cancellation_id,'provider'),80))
     where order_id=v_order.id and status not in ('canceled','refund_recovery_required');
  end if;

  update public.orders
     set status='refunded', refund_amount=p_refund_amount, refunded_at=now(),
         restock_required=v_restock_required,
         payment_review_required=false,
         cancel_reason=left(coalesce(p_reason,cancel_reason,'refund'),300)
   where id=v_order.id;

  return jsonb_build_object('ok',true,'alreadyRefunded',false);
end $$;

revoke all on function public.finalize_order_refund_v2(text,bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.finalize_order_refund_v2(text,bigint,text,text)
  to service_role;

-- Clearing the physical hold is also server-owned. This is the explicit
-- operator path after the returned watch has been received and inspected.
create or replace function public.complete_order_restock_v1(
  p_order_no text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_listing_id uuid;
  v_updated integer := 0;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'checkout_core_forbidden';
  end if;

  select id, listing_id
    into v_order_id, v_listing_id
    from public.orders
   where order_no = p_order_no
     and payment_contract_version = 2
     and status = 'refunded'
     and restock_required
   for update;

  if v_order_id is null then return false; end if;

  update public.listings
     set status='on_sale', sold_order_id=null,
         reserved_order_id=null, reserved_until=null, updated_at=now()
   where id=v_listing_id
     and sold_order_id=v_order_id;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'listing_state_conflict:%', v_listing_id;
  end if;

  update public.orders
     set restock_required=false
   where id=v_order_id;

  return true;
end $$;

revoke all on function public.complete_order_restock_v1(text)
  from public, anon, authenticated;
grant execute on function public.complete_order_restock_v1(text)
  to service_role;

drop trigger if exists trg_sync_listing_state_from_order_v1 on public.orders;

create constraint trigger trg_sync_listing_state_from_order_v1
after insert or update of status, listing_id, payment_contract_version, restock_required
on public.orders
deferrable initially deferred
for each row
execute function public.sync_listing_state_from_order_v1();

-- Establish the sticky hold before any terminal-owner release below. This
-- catches already-refunded v2 rows whose current status no longer says that
-- the watch had shipped, while leaving pre-fulfilment cancellations releasable.
update public.orders as orders
   set restock_required=true
 where orders.payment_contract_version=2
   and not coalesce(orders.restock_required, false)
   and public.order_requires_restock_v1(
     orders.id, orders.payment_contract_version, orders.status,
     orders.restock_required, orders.shipped_at, orders.delivered_at,
     orders.confirmed_at
   );

-- Backfill listings directly. Touching orders here would re-fire unrelated
-- order history, notification and settlement triggers.
do $$
declare
  v_listing_id uuid;
begin
  select orders.listing_id
    into v_listing_id
    from public.orders as orders
   where orders.payment_contract_version = 2
     and orders.listing_id is not null
     and (
       orders.status in (
         'payment_review',
         'paid',
         'inspecting',
         'preparing',
          'shipping',
          'shipped',
          'delivered',
          'cancel_req',
          'cancel_requested',
          'refund_pending',
         'confirmed',
         'return_req',
         'exchange_req',
         'returning',
         'done'
       )
       or (
         orders.restock_required
         and orders.status in ('refunded', 'canceled', 'failed')
       )
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
   and orders.payment_contract_version = 2
   and orders.status in ('refunded', 'canceled', 'failed')
   and not coalesce(orders.restock_required, false)
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
   where orders.payment_contract_version = 2
     and (
       orders.status in (
         'payment_review',
         'paid',
         'inspecting',
         'preparing',
          'shipping',
          'shipped',
          'delivered',
          'cancel_req',
          'cancel_requested',
          'refund_pending',
         'confirmed',
         'return_req',
         'exchange_req',
         'returning',
         'done'
       )
       or (
         orders.restock_required
         and orders.status in ('refunded', 'canceled', 'failed')
       )
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
   and orders.payment_contract_version = 2
   and orders.status = 'payment_review';

update public.listings as listing
   set status = 'reserved',
       reserved_order_id = orders.id,
       reserved_until = 'infinity'::timestamptz,
       sold_order_id = null,
       updated_at = now()
  from public.orders as orders
 where listing.id = orders.listing_id
   and orders.payment_contract_version = 2
   and orders.status in (
     'paid',
     'inspecting',
     'preparing',
     'shipping',
     'shipped',
     'delivered',
     'cancel_req',
     'cancel_requested',
     'refund_pending'
   )
   and not coalesce(orders.restock_required, false);

update public.listings as listing
   set status = 'sold',
       sold_order_id = orders.id,
       reserved_order_id = null,
       reserved_until = null,
       updated_at = now()
  from public.orders as orders
 where listing.id = orders.listing_id
   and orders.payment_contract_version = 2
   and (
     orders.status in ('confirmed', 'return_req', 'exchange_req', 'returning', 'done')
     or (
       orders.restock_required
       and orders.status in ('refund_pending', 'refunded', 'canceled', 'failed')
     )
   );

-- The database has no provider truth, so this repair function never changes a
-- pending order. Provider lookup, the candidate NOT_FOUND release threshold,
-- and the independent 24-hour PENDING review belong to reconcile-payments;
-- this function only releases already-terminal owners.
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
     where payment_contract_version = 2
       and status in ('refunded', 'canceled', 'failed')
       and not coalesce(restock_required, false)
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
