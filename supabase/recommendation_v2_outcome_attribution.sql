-- BELLORE Recommendation v2 · consent-cascading paid-order attribution
-- Stop checkout/confirm traffic and drain in-flight payment calls before the
-- maintenance window. Apply with the updated confirm-payment Edge Function.
-- The paid order is the canonical conversion label; recommendation
-- metadata lives in a separate 90-day/cascade-controlled evidence table.

begin;

do $precondition$
begin
  if current_user in ('anon', 'authenticated', 'service_role') then
    raise exception 'RECOMMENDATION_V2_DATABASE_OWNER_REQUIRED';
  end if;
  if to_regclass('public.orders') is null
     or to_regclass('public.listings') is null
     or to_regclass('public.customer_ai_profiles') is null
     or to_regclass('public.customer_events') is null
     or to_regprocedure(
       'public.analytics_finalize_paid_order(uuid,bigint,bigint,text,text,text,jsonb)'
     ) is null then
    raise exception 'RECOMMENDATION_V2_ANALYTICS_V3_REQUIRED';
  end if;
  if to_regclass('public.ai_consent_ledger') is null
     or to_regprocedure('public.withdraw_ai_personalization(boolean)') is null
     or to_regprocedure('public.ai_guard_personalization_write()') is null
     or not exists (
       select 1
       from pg_trigger trigger_row
       where trigger_row.tgrelid = 'public.customer_events'::regclass
         and trigger_row.tgname = 'trg_ai_consent_write'
         and trigger_row.tgisinternal is false
         and trigger_row.tgenabled in ('O', 'A')
         and trigger_row.tgfoid = to_regprocedure(
           'public.ai_guard_personalization_write()'
         )
     ) then
    raise exception 'RECOMMENDATION_V2_CONSENT_MIGRATION_REQUIRED';
  end if;
  if to_regclass('public.profiles') is null
     or to_regclass('public.coupons') is null
     or to_regclass('public.user_coupons') is null
     or to_regclass('public.point_ledger') is null then
    raise exception 'RECOMMENDATION_V2_PAYMENT_BENEFIT_SCHEMA_REQUIRED';
  end if;
  -- Function row types and financial arithmetic rely on exact live types.
  -- A name-only gate can pass a drifted bigint/text/nullable schema and fail
  -- only after a real payment, so validate every required column here.
  if exists (
    with expected(table_name, column_name, udt_name, is_nullable) as (
      values
        ('orders','id','uuid','NO'),
        ('orders','customer_id','uuid','YES'),
        ('orders','listing_id','uuid','YES'),
        ('orders','coupon_user_id','uuid','YES'),
        ('orders','amount','int8','NO'),
        ('orders','discount','int8','NO'),
        ('orders','status','text','NO'),
        ('orders','paid_at','timestamptz','YES'),
        ('orders','payment_key','text','YES'),
        ('orders','analytics_attribution','jsonb','YES'),
        ('listings','id','uuid','NO'),
        ('listings','status','text','NO'),
        ('profiles','id','uuid','NO'),
        ('profiles','points','int4','NO'),
        ('coupons','id','uuid','NO'),
        ('coupons','active','bool','NO'),
        ('coupons','starts_at','timestamptz','YES'),
        ('coupons','expires_at','timestamptz','YES'),
        ('coupons','apply_to','text','NO'),
        ('coupons','discount_type','text','NO'),
        ('coupons','discount_value','int8','NO'),
        ('coupons','min_order','int8','NO'),
        ('coupons','max_discount','int8','YES'),
        ('user_coupons','id','uuid','NO'),
        ('user_coupons','coupon_id','uuid','NO'),
        ('user_coupons','user_id','uuid','NO'),
        ('user_coupons','status','text','NO'),
        ('user_coupons','used_at','timestamptz','YES'),
        ('user_coupons','order_id','uuid','YES'),
        ('user_coupons','used_context','text','YES'),
        ('point_ledger','user_id','uuid','NO'),
        ('point_ledger','delta','int4','NO'),
        ('point_ledger','balance_after','int4','YES'),
        ('point_ledger','reason','text','YES'),
        ('point_ledger','order_id','uuid','YES')
    )
    select 1
    from expected requirement
    left join information_schema.columns actual
      on actual.table_schema = 'public'
     and actual.table_name = requirement.table_name
     and actual.column_name = requirement.column_name
    where actual.column_name is null
       or actual.udt_name <> requirement.udt_name
       or actual.is_nullable <> requirement.is_nullable
  ) then
    raise exception 'RECOMMENDATION_V2_PAYMENT_BENEFIT_COLUMNS_REQUIRED';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'analytics_attribution' and data_type = 'jsonb'
  ) then
    raise exception 'RECOMMENDATION_V2_ORDER_ATTRIBUTION_COLUMN_REQUIRED';
  end if;
  if to_regclass('public.ai_paid_recommendation_attributions') is not null then
    raise exception 'RECOMMENDATION_V2_EXISTING_PAID_ATTRIBUTION_REVIEW_REQUIRED';
  end if;

  -- Global order matches account deletion and personalization writes. Checkout
  -- and confirm traffic must already be stopped and in-flight calls drained;
  -- an already-running PL/pgSQL frame is not replaced by CREATE OR REPLACE.
  execute 'lock table auth.users, public.profiles, public.customer_ai_profiles, public.customer_events, public.listings, public.orders, public.coupons, public.user_coupons, public.point_ledger in access exclusive mode';

  -- The new design never keeps recommendation details on the legal order row.
  -- Existing rows of any status need an explicit provenance review and scrub.
  if exists (
    select 1
    from public.orders
    where analytics_attribution ? 'recommendation'
  ) then
    raise exception 'RECOMMENDATION_V2_EXISTING_ORDER_RECOMMENDATION_REVIEW_REQUIRED';
  end if;
  if exists (
    select 1
    from public.orders
    where (
          paid_at is null
          and (
            status not in ('pending', 'failed', 'canceled')
            or (status = 'canceled' and payment_key is not null)
          )
        )
       or (paid_at is not null and status in ('pending', 'failed'))
  ) then
    raise exception 'RECOMMENDATION_V2_ORDER_PAYMENT_MARKER_REVIEW_REQUIRED';
  end if;
  if exists (
    select 1
    from public.orders
    where status = 'pending' and coupon_user_id is not null
  ) then
    raise exception 'RECOMMENDATION_V2_LEGACY_PENDING_COUPON_REVIEW_REQUIRED';
  end if;
  if exists (
    select 1
    from public.orders
    where customer_id is null and coupon_user_id is not null
  ) then
    raise exception 'RECOMMENDATION_V2_GUEST_COUPON_REVIEW_REQUIRED';
  end if;
  if exists (select 1 from public.orders where listing_id is null) then
    raise exception 'RECOMMENDATION_V2_ORDER_LISTING_REVIEW_REQUIRED';
  end if;
  if exists (
    select 1
    from public.orders order_row
    join public.listings listing on listing.id = order_row.listing_id
    where order_row.paid_at is not null
      and lower(listing.status) <> 'sold'
  ) then
    raise exception 'RECOMMENDATION_V2_LEGACY_PAID_LISTING_REVIEW_REQUIRED';
  end if;
  if exists (
    select 1
    from public.orders
    where paid_at is not null and listing_id is not null
    group by listing_id
    having count(*) > 1
  ) then
    raise exception 'RECOMMENDATION_V2_DUPLICATE_PAID_LISTING_REVIEW_REQUIRED';
  end if;
  if exists (select 1 from public.profiles where points < 0) then
    raise exception 'RECOMMENDATION_V2_NEGATIVE_POINT_BALANCE_REVIEW_REQUIRED';
  end if;
end
$precondition$;

alter table public.orders
  add column if not exists checkout_token_hash text,
  add column if not exists benefit_point_rate_bps integer,
  add column if not exists benefit_earned_points integer,
  add column if not exists benefits_reconciled_at timestamptz;

-- A one-piece watch keeps its immutable order link. Deleting a sold listing
-- must not silently SET NULL the legal order and erase the inventory key.
alter table public.orders alter column listing_id set not null;
do $listing_fk$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.orders'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.listings'::regclass
      and constraint_row.conkey @> array[
        (select attribute.attnum::smallint
         from pg_attribute attribute
         where attribute.attrelid = 'public.orders'::regclass
           and attribute.attname = 'listing_id'
           and not attribute.attisdropped)
      ]::smallint[]
  loop
    execute format('alter table public.orders drop constraint %I', v_constraint.conname);
  end loop;
end
$listing_fk$;
alter table public.orders
  add constraint orders_listing_id_fkey
  foreign key (listing_id) references public.listings(id)
  on delete restrict not valid;
alter table public.orders validate constraint orders_listing_id_fkey;
create index if not exists orders_listing_id_idx on public.orders(listing_id);
create unique index if not exists uq_orders_paid_listing
  on public.orders(listing_id)
  where paid_at is not null;

do $checkout_token_precondition$
begin
  if exists (
    select 1
    from public.orders
    where checkout_token_hash is not null
      and checkout_token_hash !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'RECOMMENDATION_V2_LEGACY_CHECKOUT_HASH_REVIEW_REQUIRED';
  end if;
  if exists (
    select 1
    from public.orders
    where customer_id is null
      and status = 'pending'
      and (
        checkout_token_hash is null
        or checkout_token_hash !~ '^[0-9a-f]{64}$'
      )
  ) then
    raise exception 'RECOMMENDATION_V2_LEGACY_GUEST_PENDING_REVIEW_REQUIRED';
  end if;
end
$checkout_token_precondition$;

alter table public.orders
  drop constraint if exists orders_checkout_token_hash_check;
alter table public.orders
  add constraint orders_checkout_token_hash_check
  check (
    (checkout_token_hash is null or checkout_token_hash ~ '^[0-9a-f]{64}$')
    and (
      customer_id is not null
      or status <> 'pending'
      or (
        checkout_token_hash is not null
        and checkout_token_hash ~ '^[0-9a-f]{64}$'
      )
    )
  );
alter table public.orders
  drop constraint if exists orders_benefit_snapshot_check;
alter table public.orders
  add constraint orders_benefit_snapshot_check
  check (
    (benefit_point_rate_bps is null and benefit_earned_points is null)
    or (
      benefit_point_rate_bps is not null
      and benefit_earned_points is not null
      and
      benefit_point_rate_bps between 0 and 1000
      and benefit_earned_points between 0 and 2147483647
    )
  ) and (
    benefits_reconciled_at is null
    or (
      benefit_point_rate_bps is not null
      and benefit_earned_points is not null
    )
  ) and (
    benefit_point_rate_bps is null or paid_at is not null
  );

create table public.ai_paid_recommendation_attributions (
  order_id uuid primary key references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.customer_ai_profiles(id) on delete cascade,
  product_id uuid not null,
  recommendation_event_id uuid not null
    references public.customer_events(id) on delete cascade,
  request_id text not null check (char_length(request_id) between 1 and 120),
  surface text check (surface is null or char_length(surface) <= 40),
  rank integer check (rank is null or rank between 1 and 100),
  algorithm_version text check (
    algorithm_version is null or char_length(algorithm_version) <= 80
  ),
  variant text check (variant is null or char_length(variant) <= 80),
  experiment_id text check (
    experiment_id is null or char_length(experiment_id) <= 80
  ),
  attribution_model text not null default 'last_recommendation_click_7d'
    check (attribution_model = 'last_recommendation_click_7d'),
  paid_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_customer_events_recommendation_click_attribution
  on public.customer_events (user_id, product_id, created_at desc)
  where event_type = 'recommendation_click';
create index if not exists idx_ai_paid_reco_user_created
  on public.ai_paid_recommendation_attributions (user_id, created_at desc);
create index if not exists idx_ai_paid_reco_profile
  on public.ai_paid_recommendation_attributions (profile_id);
create index if not exists idx_ai_paid_reco_event
  on public.ai_paid_recommendation_attributions (recommendation_event_id);

alter table public.ai_paid_recommendation_attributions enable row level security;
revoke all on table public.ai_paid_recommendation_attributions
  from public, anon, authenticated, service_role;
do $paid_attribution_table_acl$
declare
  v_role text;
begin
  for v_role in
    select distinct role_row.rolname
    from pg_class relation
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) acl
    join pg_roles role_row on role_row.oid = acl.grantee
    where relation.oid = 'public.ai_paid_recommendation_attributions'::regclass
      and role_row.rolname <> current_user
  loop
    execute format(
      'revoke all on table public.ai_paid_recommendation_attributions from %I',
      v_role
    );
  end loop;
end
$paid_attribution_table_acl$;
grant select on table public.ai_paid_recommendation_attributions to service_role;

-- Permanent last line of defense for an old/cached payment function or a
-- future caller that tries to place personal recommendation metadata directly
-- on the legal order ledger.
create or replace function public.ai_strip_order_recommendation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.analytics_attribution ? 'recommendation' then
    new.analytics_attribution := new.analytics_attribution - 'recommendation';
    if new.analytics_attribution = '{}'::jsonb then
      new.analytics_attribution := null;
    end if;
  end if;
  return new;
end
$function$;

revoke all on function public.ai_strip_order_recommendation()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_ai_strip_order_recommendation on public.orders;
create trigger trg_ai_strip_order_recommendation
before insert or update of analytics_attribution on public.orders
for each row execute function public.ai_strip_order_recommendation();

-- A stale/concurrent verifier may only fail an order that is still pending.
-- Once paid_at exists, normal fulfillment/refund states remain possible, but a
-- verifier can never move the order ledger backwards to pending/failed.
create or replace function public.ai_guard_paid_order_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT'
     and (
       new.status <> 'pending'
       or new.paid_at is not null
       or new.payment_key is not null
       or new.benefit_point_rate_bps is not null
       or new.benefit_earned_points is not null
       or new.benefits_reconciled_at is not null
     ) then
    raise exception 'ORDER_CREATE_PENDING_ONLY';
  end if;
  if new.paid_at is null
     and new.status not in ('pending', 'failed', 'canceled', 'payment_review') then
    raise exception 'UNPAID_ORDER_STATE_INVALID';
  end if;
  if tg_op = 'INSERT'
     and (
       new.benefit_point_rate_bps is not null
       or new.benefit_earned_points is not null
       or new.benefits_reconciled_at is not null
     ) then
    raise exception 'ORDER_BENEFIT_SNAPSHOT_INSERT_FORBIDDEN';
  end if;
  if new.status = 'paid' and new.paid_at is null then
    raise exception 'PAID_ORDER_TIMESTAMP_REQUIRED';
  end if;
  if (
       (tg_op = 'INSERT' and new.paid_at is not null)
       or (
         tg_op = 'UPDATE'
         and old.paid_at is null
         and new.paid_at is not null
       )
     )
     and coalesce(
       current_setting('bellore.payment_finalize_rpc', true), ''
     ) <> 'on' then
    raise exception 'PAID_ORDER_FINALIZE_RPC_REQUIRED';
  end if;
  if new.paid_at is not null and new.status in ('pending', 'failed') then
    raise exception 'PAID_ORDER_STATE_REGRESSION';
  end if;
  if tg_op = 'UPDATE'
     and new.order_no is distinct from old.order_no then
    raise exception 'ORDER_NUMBER_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE'
     and new.listing_id is distinct from old.listing_id then
    raise exception 'ORDER_LISTING_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE'
     and new.pay_type is distinct from old.pay_type then
    raise exception 'ORDER_PAY_TYPE_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE'
     and new.customer_id is distinct from old.customer_id
     and not (
       old.customer_id is not null
       and new.customer_id is null
       and not exists (
         select 1 from auth.users account where account.id = old.customer_id
       )
     ) then
    raise exception 'ORDER_CUSTOMER_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE'
     and new.coupon_user_id is distinct from old.coupon_user_id
     and not (
       old.coupon_user_id is not null
       and new.coupon_user_id is null
       and not exists (
         select 1 from public.user_coupons coupon
         where coupon.id = old.coupon_user_id
       )
     ) then
    raise exception 'ORDER_COUPON_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE'
     and old.paid_at is not null
     and (
       new.amount is distinct from old.amount
       or new.discount is distinct from old.discount
       or new.method is distinct from old.method
       or new.payment_key is distinct from old.payment_key
       or new.receipt_url is distinct from old.receipt_url
     ) then
    raise exception 'PAID_ORDER_FINANCIAL_SNAPSHOT_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE'
     and old.paid_at is not null
     and new.paid_at is distinct from old.paid_at then
    raise exception 'PAID_ORDER_TIMESTAMP_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE'
     and (
       new.benefit_point_rate_bps is distinct from old.benefit_point_rate_bps
       or new.benefit_earned_points is distinct from old.benefit_earned_points
       or new.benefits_reconciled_at is distinct from old.benefits_reconciled_at
     )
     and coalesce(
       current_setting('bellore.payment_benefit_rpc', true), ''
     ) <> 'on' then
    raise exception 'ORDER_BENEFIT_RPC_REQUIRED';
  end if;
  if tg_op = 'UPDATE'
     and old.benefit_point_rate_bps is not null
     and (
       new.benefit_point_rate_bps is distinct from old.benefit_point_rate_bps
       or new.benefit_earned_points is distinct from old.benefit_earned_points
     ) then
    raise exception 'ORDER_BENEFIT_SNAPSHOT_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE'
     and old.benefits_reconciled_at is not null
     and new.benefits_reconciled_at is distinct from old.benefits_reconciled_at then
    raise exception 'ORDER_BENEFIT_RECONCILIATION_IMMUTABLE';
  end if;
  return new;
end
$function$;

revoke all on function public.ai_guard_paid_order_state()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_ai_guard_paid_order_state on public.orders;
create trigger trg_ai_guard_paid_order_state
before insert or update of order_no, customer_id, listing_id, coupon_user_id,
  pay_type, amount, discount, method, status, payment_key, receipt_url, paid_at,
  benefit_point_rate_bps, benefit_earned_points, benefits_reconciled_at
  on public.orders
for each row execute function public.ai_guard_paid_order_state();

create or replace function public.ai_guard_paid_order_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.paid_at is not null
     and coalesce(
       current_setting('bellore.paid_order_retention_rpc', true), ''
     ) <> 'on' then
    raise exception 'PAID_ORDER_DELETE_FORBIDDEN';
  end if;
  return old;
end
$function$;

revoke all on function public.ai_guard_paid_order_delete()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_ai_guard_paid_order_delete on public.orders;
create trigger trg_ai_guard_paid_order_delete
before delete on public.orders
for each row execute function public.ai_guard_paid_order_delete();

-- Once a paid order owns a one-piece listing, only a future atomic refund /
-- relist RPC may reopen it. Direct admin/service updates are fail-closed too.
create or replace function public.ai_guard_paid_listing_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if lower(old.status) = 'sold'
     and lower(new.status) <> 'sold'
     and exists (
       select 1
       from public.orders order_row
       where order_row.listing_id = old.id
         and order_row.paid_at is not null
     )
     and coalesce(
       current_setting('bellore.inventory_relist_rpc', true), ''
     ) <> 'on' then
    raise exception 'PAID_LISTING_RELIST_RPC_REQUIRED';
  end if;
  return new;
end
$function$;

revoke all on function public.ai_guard_paid_listing_status()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_ai_guard_paid_listing_status on public.listings;
create trigger trg_ai_guard_paid_listing_status
before update of status on public.listings
for each row execute function public.ai_guard_paid_listing_status();

-- profiles has broad customer self-edit paths in legacy installations. Even
-- when table/column ACLs drift, only the private benefit reconciler may mutate
-- the financial balance; ordinary profile creation is limited to zero points.
create or replace function public.ai_guard_profile_points()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.points < 0 then raise exception 'NEGATIVE_POINT_BALANCE_FORBIDDEN'; end if;
  if tg_op = 'INSERT' and new.points <> 0 then
    raise exception 'PROFILE_POINTS_RPC_REQUIRED';
  end if;
  if tg_op = 'UPDATE'
     and new.points is distinct from old.points
     and coalesce(
       current_setting('bellore.payment_benefit_rpc', true), ''
     ) <> 'on' then
    raise exception 'PROFILE_POINTS_RPC_REQUIRED';
  end if;
  return new;
end
$function$;

revoke all on function public.ai_guard_profile_points()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_ai_guard_profile_points on public.profiles;
create trigger trg_ai_guard_profile_points
before insert or update of points on public.profiles
for each row execute function public.ai_guard_profile_points();

-- Reserve an owned coupon in the same transaction that creates a pending
-- order. A second order using the same coupon then fails before PortOne opens.
create or replace function public.ai_reserve_order_coupon()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_service boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
begin
  if new.coupon_user_id is null then return new; end if;
  if new.customer_id is null then raise exception 'COUPON_REQUIRES_ACCOUNT'; end if;
  if not v_service and auth.uid() is distinct from new.customer_id then
    raise exception 'COUPON_ORDER_OWNER_REQUIRED';
  end if;

  update public.user_coupons coupon
  set status = 'reserved',
      order_id = new.id,
      used_context = 'order_reservation'
  where coupon.id = new.coupon_user_id
    and coupon.user_id = new.customer_id
    and coupon.status = 'active'
    and coupon.order_id is null
    and exists (
      select 1
      from public.coupons template
      where template.id = coupon.coupon_id
        and template.active is true
        and (template.starts_at is null or template.starts_at <= clock_timestamp())
        and (template.expires_at is null or template.expires_at >= clock_timestamp())
        and template.apply_to in ('order', 'both')
        and template.discount_type in ('amount', 'percent')
        and template.discount_value > 0
    );
  if not found then raise exception 'COUPON_UNAVAILABLE'; end if;
  return new;
end
$function$;

revoke all on function public.ai_reserve_order_coupon()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_ai_reserve_order_coupon on public.orders;
create trigger trg_ai_reserve_order_coupon
after insert on public.orders
for each row execute function public.ai_reserve_order_coupon();

-- A pending order that fails, is cancelled, or is deleted releases only its
-- own reservation. Paid/refunded orders never reactivate a coupon here.
create or replace function public.ai_release_pending_order_coupon()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_id uuid;
  v_coupon_id uuid;
  v_release boolean := false;
begin
  if tg_op = 'DELETE' then
    v_order_id := old.id;
    v_coupon_id := old.coupon_user_id;
    v_release := old.paid_at is null;
  else
    v_order_id := old.id;
    v_coupon_id := old.coupon_user_id;
    v_release := old.paid_at is null
      and new.paid_at is null
      and new.status in ('failed', 'canceled');
  end if;

  if v_release and v_coupon_id is not null then
    update public.user_coupons coupon
    set status = 'active',
        order_id = null,
        used_context = null
    where coupon.id = v_coupon_id
      and coupon.status = 'reserved'
      and (coupon.order_id = v_order_id or coupon.order_id is null);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

revoke all on function public.ai_release_pending_order_coupon()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_ai_release_pending_order_coupon on public.orders;
create trigger trg_ai_release_pending_order_coupon
after update of status or delete on public.orders
for each row execute function public.ai_release_pending_order_coupon();

-- Commission/manual redemption must not steal a coupon reserved by checkout.
create or replace function public.redeem_user_coupon(
  p_user_coupon_id uuid,
  p_context text
) returns public.user_coupons
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.user_coupons;
begin
  select * into v_row
  from public.user_coupons
  where id = p_user_coupon_id
  for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_row.user_id <> auth.uid() and not exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.role = 'admin'
  ) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_row.status = 'used' then raise exception 'ALREADY_USED'; end if;
  if v_row.status = 'reserved' then
    raise exception 'COUPON_RESERVED_FOR_ORDER';
  end if;
  if v_row.status <> 'active' or v_row.order_id is not null then
    raise exception 'COUPON_UNAVAILABLE';
  end if;

  update public.user_coupons
  set status = 'used',
      used_at = clock_timestamp(),
      used_context = coalesce(p_context, 'commission')
  where id = p_user_coupon_id
    and status = 'active'
    and order_id is null
  returning * into v_row;
  if not found then raise exception 'COUPON_UNAVAILABLE'; end if;
  return v_row;
end
$function$;

revoke all on function public.redeem_user_coupon(uuid, text)
  from public, anon, authenticated, service_role;
do $redeem_coupon_acl$
declare
  v_role text;
begin
  for v_role in
    select distinct role_row.rolname
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) acl
    join pg_roles role_row on role_row.oid = acl.grantee
    where procedure.oid = to_regprocedure(
      'public.redeem_user_coupon(uuid,text)'
    )
      and role_row.rolname not in (current_user, 'authenticated')
  loop
    execute format(
      'revoke all on function public.redeem_user_coupon(uuid,text) from %I',
      v_role
    );
  end loop;
end
$redeem_coupon_acl$;
grant execute on function public.redeem_user_coupon(uuid, text)
  to authenticated;

create or replace function public.analytics_finalize_paid_order(
  p_order_id uuid,
  p_amount bigint,
  p_discount bigint,
  p_method text,
  p_payment_key text,
  p_receipt_url text,
  p_attribution jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_user_id uuid;
  v_listing_id uuid;
  v_listing_status text;
  v_profile_id uuid;
  v_event_id uuid;
  v_recommendation jsonb;
  v_requested_request_id text;
  v_newly_paid boolean := false;
  v_session uuid;
  v_anon uuid;
  v_final_attribution jsonb;
begin
  -- Discover the owner without locking, then take every lock in the same order
  -- as account deletion and personalization withdrawal: auth -> profile -> order.
  select order_row.customer_id, order_row.listing_id
  into v_user_id, v_listing_id
  from public.orders order_row
  where order_row.id = p_order_id;
  if not found then raise exception 'order_not_found'; end if;

  if v_user_id is not null then
    perform 1 from auth.users account
    where account.id = v_user_id
    for key share;
    if found then
      select profile.id into v_profile_id
      from public.customer_ai_profiles profile
      where profile.user_id = v_user_id
        and profile.consent_personalization is true
      for update;
    end if;
  end if;

  if v_listing_id is null then raise exception 'order_listing_required'; end if;
  select listing.status into v_listing_status
  from public.listings listing
  where listing.id = v_listing_id
  for update;
  if not found then raise exception 'listing_not_found'; end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'order_not_found'; end if;

  -- A concurrent ownership change cannot borrow the first customer's lock or
  -- evidence. Payment still completes, but without recommendation attribution.
  if v_order.customer_id is distinct from v_user_id then
    v_profile_id := null;
  end if;
  if v_order.listing_id is distinct from v_listing_id then
    raise exception 'order_listing_changed_retry';
  end if;

  if v_order.paid_at is null then
    if v_order.status <> 'pending' then
      raise exception 'order_not_payable';
    end if;
    if lower(v_listing_status) <> 'on_sale' then
      raise exception 'listing_not_available';
    end if;
    v_newly_paid := true;
    v_recommendation := null;
    v_event_id := null;
    v_requested_request_id := nullif(
      p_attribution #>> '{recommendation,request_id}', ''
    );
    if v_profile_id is not null
       and v_order.listing_id is not null then
      select
        event.id,
        jsonb_strip_nulls(jsonb_build_object(
          'request_id', nullif(left(event.value->>'request_id', 120), ''),
          'surface', nullif(left(event.value->>'surface', 40), ''),
          'rank', case when coalesce(event.value->>'rank', '') ~ '^[0-9]{1,3}$'
            then least(100, greatest(1, (event.value->>'rank')::integer)) else null end,
          'algorithm_version', nullif(left(event.value->>'algorithm_version', 80), ''),
          'variant', nullif(left(event.value->>'variant', 80), ''),
          'experiment_id', nullif(left(event.value->>'experiment_id', 80), '')
        ))
      into v_event_id, v_recommendation
      from public.customer_events event
      where event.profile_id = v_profile_id
        and event.user_id = v_user_id
        and event.product_id = v_order.listing_id
        and event.event_type = 'recommendation_click'
        and event.created_at >= clock_timestamp() - interval '7 days'
        and jsonb_typeof(event.value) = 'object'
        and nullif(event.value->>'request_id', '') is not null
        and (
          v_requested_request_id is null
          or event.value @> jsonb_build_object('request_id', v_requested_request_id)
        )
      order by event.created_at desc
      limit 1
      for key share;
    end if;

    -- Acquisition attribution may stay on the order. Raw/browser recommendation
    -- objects are always stripped and never written back to the legal ledger.
    v_final_attribution := coalesce(
      v_order.analytics_attribution, p_attribution, '{}'::jsonb
    ) - 'recommendation';
    if v_final_attribution = '{}'::jsonb then v_final_attribution := null; end if;

    perform set_config('bellore.payment_finalize_rpc', 'on', true);
    update public.orders
    set status = 'paid',
        amount = p_amount,
        discount = p_discount,
        method = left(p_method, 80),
        payment_key = left(p_payment_key, 160),
        receipt_url = left(p_receipt_url, 500),
        analytics_attribution = v_final_attribution,
        paid_at = clock_timestamp()
    where id = p_order_id
    returning * into v_order;
    perform set_config('bellore.payment_finalize_rpc', '', true);

    update public.listings
    set status = 'sold'
    where id = v_listing_id
      and lower(status) = 'on_sale';
    if not found then raise exception 'listing_not_available'; end if;

    if v_event_id is not null and v_recommendation is not null then
      insert into public.ai_paid_recommendation_attributions (
        order_id, user_id, profile_id, product_id,
        recommendation_event_id, request_id, surface, rank,
        algorithm_version, variant, experiment_id, attribution_model, paid_at
      ) values (
        v_order.id, v_user_id, v_profile_id, v_order.listing_id,
        v_event_id, v_recommendation->>'request_id',
        v_recommendation->>'surface',
        nullif(v_recommendation->>'rank', '')::integer,
        v_recommendation->>'algorithm_version',
        v_recommendation->>'variant',
        v_recommendation->>'experiment_id',
        'last_recommendation_click_7d',
        coalesce(v_order.paid_at, clock_timestamp())
      ) on conflict (order_id) do nothing;
    end if;
  end if;

  -- A retry cannot create or rewrite a recommendation attribution, nor can it
  -- move a fulfillment/refund status backwards to paid.
  p_attribution := v_order.analytics_attribution;
  begin
    v_session := coalesce(
      v_order.analytics_session_id,
      nullif(p_attribution->>'session_id', '')::uuid
    );
    v_anon := coalesce(
      v_order.analytics_anonymous_id,
      nullif(p_attribution->>'anonymous_id', '')::uuid
    );
  exception when invalid_text_representation then
    v_session := null;
    v_anon := null;
  end;

  if p_attribution is not null and v_session is not null then
    insert into public.analytics_conversion_attributions (
      site_id, conversion_id, session_id, anonymous_id, user_id,
      first_touch, session_touch, conversion_touch, value, currency, converted_at
    ) values (
      'bellore', v_order.id, v_session, v_anon, v_order.customer_id,
      p_attribution->'first_touch', p_attribution->'session_touch',
      p_attribution->'conversion_touch', v_order.amount, 'KRW',
      coalesce(v_order.paid_at, clock_timestamp())
    ) on conflict (site_id, conversion_id) do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'newly_paid', v_newly_paid,
    'order', to_jsonb(v_order)
  );
end
$function$;

revoke all on function public.analytics_finalize_paid_order(
  uuid, bigint, bigint, text, text, text, jsonb
) from public, anon, authenticated, service_role;
do $paid_finalize_acl$
declare
  v_role text;
begin
  for v_role in
    select distinct role_row.rolname
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) acl
    join pg_roles role_row on role_row.oid = acl.grantee
    where procedure.oid = to_regprocedure(
      'public.analytics_finalize_paid_order(uuid,bigint,bigint,text,text,text,jsonb)'
    )
      and role_row.rolname <> current_user
  loop
    execute format(
      'revoke all on function public.analytics_finalize_paid_order(uuid,bigint,bigint,text,text,text,jsonb) from %I',
      v_role
    );
  end loop;
end
$paid_finalize_acl$;

-- Existing duplicate rewards need human reconciliation before an exactly-once
-- order invariant can be added.
do $point_ledger_idempotency$
begin
  if exists (
    select 1
    from public.point_ledger ledger
    left join public.orders order_row on order_row.id = ledger.order_id
    where ledger.order_id is not null and order_row.id is null
  ) then
    raise exception 'RECOMMENDATION_V2_POINT_LEDGER_ORDER_ORPHAN_REVIEW_REQUIRED';
  end if;
  if exists (
    select 1
    from public.point_ledger
    where reason = 'order_earn' and order_id is not null
    group by order_id
    having count(*) > 1
  ) then
    raise exception 'RECOMMENDATION_V2_DUPLICATE_ORDER_EARN_REVIEW_REQUIRED';
  end if;
  if exists (
    select 1
    from public.point_ledger ledger
    left join public.orders order_row on order_row.id = ledger.order_id
    where ledger.reason = 'order_earn'
      and (
        ledger.order_id is null
        or order_row.id is null
        or order_row.paid_at is null
        or ledger.user_id is distinct from order_row.customer_id
        or ledger.delta is null
        or ledger.delta < 0
        or ledger.balance_after is null
        or ledger.balance_after < 0
      )
  ) then
    raise exception 'RECOMMENDATION_V2_INVALID_ORDER_EARN_REVIEW_REQUIRED';
  end if;
  if to_regclass('public.uq_point_ledger_order_earn') is not null then
    raise exception 'RECOMMENDATION_V2_EXISTING_POINT_INDEX_REVIEW_REQUIRED';
  end if;
  if exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.point_ledger'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.conkey = array[
        (
          select attribute.attnum
          from pg_attribute attribute
          where attribute.attrelid = 'public.point_ledger'::regclass
            and attribute.attname = 'order_id'
            and not attribute.attisdropped
        )::smallint
      ]::smallint[]
  ) then
    raise exception 'RECOMMENDATION_V2_EXISTING_POINT_ORDER_FK_REVIEW_REQUIRED';
  end if;
  create unique index uq_point_ledger_order_earn
    on public.point_ledger (order_id)
    where reason = 'order_earn' and order_id is not null;
end
$point_ledger_idempotency$;

-- Reward audit rows retain their idempotency key. Order deletion is rejected
-- until a reviewed financial reversal/retention workflow has handled them.
alter table public.point_ledger
  add constraint point_ledger_order_id_fkey
  foreign key (order_id) references public.orders(id) on delete restrict
  not valid;
alter table public.point_ledger
  validate constraint point_ledger_order_id_fkey;

-- Coupon consumption and point earning are reconciled idempotently. A new
-- payment snapshots integer basis points and earned points on the order in the
-- same transaction. Online retries never invent rewards for legacy paid rows.
create or replace function public.reconcile_paid_order_benefits(
  p_order_id uuid,
  p_point_rate_bps integer default null,
  p_allow_initialize boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_discovered_user uuid;
  v_order public.orders%rowtype;
  v_profile_points integer;
  v_profile_locked boolean := false;
  v_existing_user uuid;
  v_existing_delta integer;
  v_existing_balance integer;
  v_earned integer := 0;
  v_balance integer;
  v_coupon_status text := 'none';
  v_coupon_order uuid;
  v_reversed boolean := false;
begin
  perform pg_catalog.set_config(
    'bellore.payment_benefit_rpc', 'on', true
  );
  if p_allow_initialize is true
     and (p_point_rate_bps is null or p_point_rate_bps not between 0 and 1000) then
    raise exception 'INVALID_POINT_RATE_BPS';
  end if;

  -- Discover without locking, then use the same global order as account
  -- deletion: auth user -> public profile -> order -> coupon/ledger.
  select order_row.customer_id into v_discovered_user
  from public.orders order_row
  where order_row.id = p_order_id;
  if not found then raise exception 'order_not_found'; end if;

  if v_discovered_user is not null then
    perform 1
    from auth.users account
    where account.id = v_discovered_user
    for key share;
    if found then
      select profile.points into v_profile_points
      from public.profiles profile
      where profile.id = v_discovered_user
      for update;
      v_profile_locked := found;
    else
      v_discovered_user := null;
    end if;
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.paid_at is null then raise exception 'order_not_paid'; end if;

  if v_order.customer_id is distinct from v_discovered_user then
    if v_order.customer_id is null then
      return jsonb_build_object(
        'ok', true,
        'coupon_status', 'account_removed',
        'points_status', 'account_removed',
        'earned_points', 0
      );
    end if;
    raise exception 'order_owner_changed_retry';
  end if;
  if p_allow_initialize is true
     and v_discovered_user is not null
     and not v_profile_locked then
    raise exception 'POINT_PROFILE_REQUIRED';
  end if;

  v_reversed := v_order.status in ('canceled', 'refunded');
  if v_reversed then
    return jsonb_build_object(
      'ok', true,
      'coupon_status', 'post_payment_reversal',
      'points_status', 'post_payment_reversal',
      'earned_points', 0
    );
  end if;

  -- No online request may backfill an old paid order at today's rate. Legacy
  -- gaps need a reviewed allowlist/backfill outside the public payment path.
  if v_order.benefit_point_rate_bps is null then
    if p_allow_initialize is not true then
      select ledger.user_id, ledger.delta, ledger.balance_after
      into v_existing_user, v_existing_delta, v_existing_balance
      from public.point_ledger ledger
      where ledger.order_id = v_order.id
        and ledger.reason = 'order_earn'
      limit 1
      for update;
      if found then
        if v_existing_user is distinct from v_discovered_user
           or v_existing_delta is null
           or v_existing_delta < 0
           or v_existing_balance is null
           or v_existing_balance < 0 then
          raise exception 'LEGACY_POINT_LEDGER_INVALID';
        end if;
        return jsonb_build_object(
          'ok', true,
          'coupon_status', 'legacy_review_required',
          'points_status', 'legacy_already_applied',
          'earned_points', v_existing_delta,
          'balance_after', v_existing_balance
        );
      end if;
      return jsonb_build_object(
        'ok', true,
        'coupon_status', 'legacy_review_required',
        'points_status', 'legacy_review_required',
        'earned_points', 0
      );
    end if;

    if v_discovered_user is null then
      v_earned := 0;
    else
      v_earned := least(
        2147483647::numeric,
        floor(
          greatest(v_order.amount, 0)::numeric
          * p_point_rate_bps::numeric / 10000
        )
      )::integer;
    end if;
    update public.orders
    set benefit_point_rate_bps = p_point_rate_bps,
        benefit_earned_points = v_earned
    where id = v_order.id
    returning * into v_order;
  else
    v_earned := v_order.benefit_earned_points;
    if v_earned is null then raise exception 'POINT_SNAPSHOT_INCOMPLETE'; end if;
    if p_allow_initialize is true
       and p_point_rate_bps is distinct from v_order.benefit_point_rate_bps then
      raise exception 'POINT_RATE_SNAPSHOT_MISMATCH';
    end if;
  end if;

  if v_order.coupon_user_id is not null and v_discovered_user is not null then
    if coalesce(v_order.discount, 0) > 0 then
      update public.user_coupons coupon
      set status = 'used',
          used_at = coalesce(coupon.used_at, clock_timestamp()),
          order_id = v_order.id,
          used_context = 'order'
      where coupon.id = v_order.coupon_user_id
        and coupon.user_id = v_discovered_user
        and coupon.status = 'reserved'
        and coupon.order_id = v_order.id
      returning coupon.status into v_coupon_status;

      if not found then
        select coupon.status, coupon.order_id
        into v_coupon_status, v_coupon_order
        from public.user_coupons coupon
        where coupon.id = v_order.coupon_user_id
          and coupon.user_id = v_discovered_user
        for update;
        if found and v_coupon_status = 'used' and v_coupon_order = v_order.id then
          v_coupon_status := 'already_used_for_order';
        else
          raise exception 'COUPON_RESERVATION_INVALID';
        end if;
      else
        v_coupon_status := 'applied';
      end if;
    else
      update public.user_coupons coupon
      set status = 'active',
          order_id = null,
          used_context = null
      where coupon.id = v_order.coupon_user_id
        and coupon.user_id = v_discovered_user
        and coupon.status = 'reserved'
        and coupon.order_id = v_order.id;
      v_coupon_status := 'not_applied';
    end if;
  end if;

  if v_discovered_user is null then
    update public.orders
    set benefits_reconciled_at = coalesce(
      benefits_reconciled_at, clock_timestamp()
    )
    where id = v_order.id;
    return jsonb_build_object(
      'ok', true,
      'coupon_status', v_coupon_status,
      'points_status', 'guest',
      'earned_points', 0
    );
  end if;

  select ledger.user_id, ledger.delta, ledger.balance_after
  into v_existing_user, v_existing_delta, v_existing_balance
  from public.point_ledger ledger
  where ledger.order_id = v_order.id
    and ledger.reason = 'order_earn'
  limit 1
  for update;
  if found then
    if v_existing_user is distinct from v_discovered_user
       or v_existing_delta is distinct from v_earned then
      raise exception 'POINT_LEDGER_SNAPSHOT_MISMATCH';
    end if;
    update public.orders
    set benefits_reconciled_at = coalesce(
      benefits_reconciled_at, clock_timestamp()
    )
    where id = v_order.id;
    return jsonb_build_object(
      'ok', true,
      'coupon_status', v_coupon_status,
      'points_status', 'already_applied',
      'earned_points', v_existing_delta,
      'balance_after', v_existing_balance
    );
  end if;

  if not v_profile_locked then
    return jsonb_build_object(
      'ok', true,
      'coupon_status', v_coupon_status,
      'points_status', 'profile_missing',
      'earned_points', 0
    );
  end if;

  if v_earned <= 0 then
    update public.orders
    set benefits_reconciled_at = coalesce(
      benefits_reconciled_at, clock_timestamp()
    )
    where id = v_order.id;
    return jsonb_build_object(
      'ok', true,
      'coupon_status', v_coupon_status,
      'points_status', 'zero',
      'earned_points', 0,
      'balance_after', v_profile_points
    );
  end if;
  if v_profile_points > 2147483647 - v_earned then
    raise exception 'POINT_BALANCE_OVERFLOW';
  end if;

  v_balance := v_profile_points + v_earned;
  insert into public.point_ledger (
    user_id, delta, balance_after, reason, order_id
  ) values (
    v_discovered_user, v_earned, v_balance, 'order_earn', v_order.id
  );
  update public.profiles
  set points = v_balance
  where id = v_discovered_user;
  update public.orders
  set benefits_reconciled_at = coalesce(
    benefits_reconciled_at, clock_timestamp()
  )
  where id = v_order.id;

  return jsonb_build_object(
    'ok', true,
    'coupon_status', v_coupon_status,
    'points_status', 'applied',
    'earned_points', v_earned,
    'balance_after', v_balance
  );
end
$function$;

revoke all on function public.reconcile_paid_order_benefits(uuid, integer, boolean)
  from public, anon, authenticated, service_role;
do $benefit_rpc_acl$
declare
  v_role text;
begin
  for v_role in
    select distinct role_row.rolname
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) acl
    join pg_roles role_row on role_row.oid = acl.grantee
    where procedure.oid = to_regprocedure(
      'public.reconcile_paid_order_benefits(uuid,integer,boolean)'
    )
      and role_row.rolname <> current_user
  loop
    execute format(
      'revoke all on function public.reconcile_paid_order_benefits(uuid,integer,boolean) from %I',
      v_role
    );
  end loop;
end
$benefit_rpc_acl$;

-- The service retry surface has no rate/initialization knobs. It can only
-- finish a snapshot created by the atomic first-payment wrapper.
create or replace function public.reconcile_existing_paid_order_benefits(
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return public.reconcile_paid_order_benefits(p_order_id, null, false);
end
$function$;

revoke all on function public.reconcile_existing_paid_order_benefits(uuid)
  from public, anon, authenticated, service_role;
do $benefit_retry_acl$
declare
  v_role text;
begin
  for v_role in
    select distinct role_row.rolname
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) acl
    join pg_roles role_row on role_row.oid = acl.grantee
    where procedure.oid = to_regprocedure(
      'public.reconcile_existing_paid_order_benefits(uuid)'
    )
      and role_row.rolname not in (current_user, 'service_role')
  loop
    execute format(
      'revoke all on function public.reconcile_existing_paid_order_benefits(uuid) from %I',
      v_role
    );
  end loop;
end
$benefit_retry_acl$;
grant execute on function public.reconcile_existing_paid_order_benefits(uuid)
  to service_role;

-- Updated payment workers call the wrapper so order finalization, paid
-- recommendation evidence, coupon consumption, and points are one transaction.
create or replace function public.analytics_finalize_paid_order_with_benefits(
  p_order_id uuid,
  p_amount bigint,
  p_discount bigint,
  p_method text,
  p_payment_key text,
  p_receipt_url text,
  p_attribution jsonb default null,
  p_point_rate_bps integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_final_user_id uuid;
  v_newly_paid boolean;
  v_finalized jsonb;
  v_benefits jsonb;
begin
  if p_point_rate_bps is distinct from 0 then
    raise exception 'POINT_REWARD_REFUND_RPC_REQUIRED';
  end if;
  -- Pre-lock the points profile before the inner finalizer reaches the order.
  -- This keeps the wrapper and standalone retry reconciler on one lock order.
  select order_row.customer_id into v_user_id
  from public.orders order_row
  where order_row.id = p_order_id;
  if not found then raise exception 'order_not_found'; end if;
  if v_user_id is not null then
    perform 1 from auth.users account
    where account.id = v_user_id
    for key share;
    if found then
      perform 1 from public.profiles profile
      where profile.id = v_user_id
      for update;
    end if;
  end if;

  v_finalized := public.analytics_finalize_paid_order(
    p_order_id, p_amount, p_discount, p_method, p_payment_key,
    p_receipt_url, p_attribution
  );
  begin
    v_final_user_id := nullif(
      v_finalized #>> '{order,customer_id}', ''
    )::uuid;
  exception when invalid_text_representation then
    raise exception 'order_owner_invalid';
  end;
  if v_final_user_id is distinct from v_user_id then
    raise exception 'order_owner_changed_retry';
  end if;
  v_newly_paid := coalesce((v_finalized->>'newly_paid')::boolean, false);
  v_benefits := public.reconcile_paid_order_benefits(
    p_order_id, p_point_rate_bps, v_newly_paid
  );

  return v_finalized || jsonb_build_object(
    'benefits', v_benefits,
    'earned_points', coalesce((v_benefits->>'earned_points')::integer, 0)
  );
end
$function$;

revoke all on function public.analytics_finalize_paid_order_with_benefits(
  uuid, bigint, bigint, text, text, text, jsonb, integer
) from public, anon, authenticated, service_role;
do $benefit_finalize_acl$
declare
  v_role text;
begin
  for v_role in
    select distinct role_row.rolname
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) acl
    join pg_roles role_row on role_row.oid = acl.grantee
    where procedure.oid = to_regprocedure(
      'public.analytics_finalize_paid_order_with_benefits(uuid,bigint,bigint,text,text,text,jsonb,integer)'
    )
      and role_row.rolname not in (current_user, 'service_role')
  loop
    execute format(
      'revoke all on function public.analytics_finalize_paid_order_with_benefits(uuid,bigint,bigint,text,text,text,jsonb,integer) from %I',
      v_role
    );
  end loop;
end
$benefit_finalize_acl$;
grant execute on function public.analytics_finalize_paid_order_with_benefits(
  uuid, bigint, bigint, text, text, text, jsonb, integer
) to service_role;

commit;
