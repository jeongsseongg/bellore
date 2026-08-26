-- Server-side rollout controls and durable per-order payment holds.
--
-- Holds store only a SHA-256 order identifier. They deliberately have no
-- foreign key to orders, so a hold can be seeded without selecting, locking or
-- otherwise touching the protected order. Release is an explicit audited
-- update; held rows are never deleted by an automated payment path.

create table if not exists public.payment_operation_controls (
  control_name text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  note text,
  constraint payment_operation_controls_name_format check (
    control_name ~ '^[a-z][a-z0-9_]{2,79}$'
  )
);

create table if not exists public.payment_operation_holds (
  order_no_sha256 text primary key,
  reason_code text not null,
  held_at timestamptz not null default now(),
  released_at timestamptz,
  release_note text,
  constraint payment_operation_holds_hash_format check (
    order_no_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint payment_operation_holds_reason_format check (
    reason_code ~ '^[a-z][a-z0-9_]{2,79}$'
  ),
  constraint payment_operation_holds_release_pair check (
    (released_at is null and release_note is null)
    or (released_at is not null and nullif(btrim(release_note), '') is not null)
  )
);

alter table public.payment_operation_controls enable row level security;
alter table public.payment_operation_holds enable row level security;

revoke all on public.payment_operation_controls
  from public, anon, authenticated, service_role;
revoke all on public.payment_operation_holds
  from public, anon, authenticated, service_role;

insert into public.payment_operation_controls(control_name, enabled, note)
values
  ('create_checkout', false, 'fail_closed_release_default'),
  ('confirm_payment', false, 'fail_closed_release_default'),
  ('cancel_payment', false, 'fail_closed_release_default'),
  ('payment_webhook', false, 'fail_closed_release_default'),
  ('reconcile_payments', false, 'fail_closed_release_default')
on conflict (control_name) do nothing;

create or replace function public.payment_order_no_sha256_v1(
  p_order_no text
) returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_order_no, 'UTF8')),
    'hex'
  )
$$;

revoke all on function public.payment_order_no_sha256_v1(text)
  from public, anon, authenticated, service_role;
grant execute on function public.payment_order_no_sha256_v1(text)
  to service_role;

create or replace function public.read_payment_operation_control_v1(
  p_control_name text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select controls.enabled
      from public.payment_operation_controls as controls
     where controls.control_name = p_control_name
  ), false)
$$;

revoke all on function public.read_payment_operation_control_v1(text)
  from public, anon, authenticated;
grant execute on function public.read_payment_operation_control_v1(text)
  to service_role;

create or replace function public.is_payment_operation_hash_held_v1(
  p_order_no_sha256 text
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_order_no_sha256 is null
     or p_order_no_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'payment_operation_hold_hash_invalid';
  end if;

  return exists (
    select 1
      from public.payment_operation_holds as holds
     where holds.order_no_sha256 = p_order_no_sha256
       and holds.released_at is null
  );
end
$$;

revoke all on function public.is_payment_operation_hash_held_v1(text)
  from public, anon, authenticated;
grant execute on function public.is_payment_operation_hash_held_v1(text)
  to service_role;

create or replace function public.assert_payment_operation_open_v1(
  p_order_no text
) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_order_no is null or public.is_payment_operation_hash_held_v1(
    public.payment_order_no_sha256_v1(p_order_no)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'payment_operation_held';
  end if;
end
$$;

revoke all on function public.assert_payment_operation_open_v1(text)
  from public, anon, authenticated, service_role;

create or replace function public.guard_payment_operation_hold_order_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.assert_payment_operation_open_v1(new.order_no);
    return new;
  end if;

  perform public.assert_payment_operation_open_v1(old.order_no);
  if tg_op = 'UPDATE' and new.order_no is distinct from old.order_no then
    perform public.assert_payment_operation_open_v1(new.order_no);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function public.guard_payment_operation_hold_order_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_00_payment_operation_hold_order on public.orders;
create trigger trg_00_payment_operation_hold_order
before insert or update or delete on public.orders
for each row execute function public.guard_payment_operation_hold_order_v1();

create or replace function public.guard_payment_operation_hold_listing_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing_ids uuid[];
  v_owner_order_ids uuid[];
begin
  -- OLD does not exist for INSERT and NEW does not exist for DELETE. Build the
  -- candidate sets in operation-specific branches before querying orders.
  if tg_op = 'INSERT' then
    v_listing_ids := array[new.id]::uuid[];
    v_owner_order_ids := array[
      new.reserved_order_id,
      new.sold_order_id
    ]::uuid[];
  elsif tg_op = 'DELETE' then
    v_listing_ids := array[old.id]::uuid[];
    v_owner_order_ids := array[
      old.reserved_order_id,
      old.sold_order_id
    ]::uuid[];
  else
    v_listing_ids := array[old.id, new.id]::uuid[];
    v_owner_order_ids := array[
      old.reserved_order_id,
      old.sold_order_id,
      new.reserved_order_id,
      new.sold_order_id
    ]::uuid[];
  end if;

  if exists (
    select 1
      from public.orders as orders
     where (
       orders.listing_id = any(v_listing_ids)
       or orders.id = any(v_owner_order_ids)
     )
       and public.is_payment_operation_hash_held_v1(
         public.payment_order_no_sha256_v1(orders.order_no)
       )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'payment_operation_held';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function public.guard_payment_operation_hold_listing_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_00_payment_operation_hold_listing on public.listings;
create trigger trg_00_payment_operation_hold_listing
before insert or update or delete on public.listings
for each row execute function public.guard_payment_operation_hold_listing_v1();

-- Row triggers do not run for TRUNCATE. During an active hold, prevent a bulk
-- wipe from bypassing the order/listing guards without reading any order row.
create or replace function public.guard_active_payment_hold_truncate_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
      from public.payment_operation_holds as holds
     where holds.released_at is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'payment_operation_held';
  end if;
  return null;
end
$$;

revoke all on function public.guard_active_payment_hold_truncate_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_00_payment_operation_hold_orders_truncate on public.orders;
create trigger trg_00_payment_operation_hold_orders_truncate
before truncate on public.orders
for each statement execute function public.guard_active_payment_hold_truncate_v1();

drop trigger if exists trg_00_payment_operation_hold_listings_truncate on public.listings;
create trigger trg_00_payment_operation_hold_listings_truncate
before truncate on public.listings
for each statement execute function public.guard_active_payment_hold_truncate_v1();

comment on table public.payment_operation_holds is
  'SHA-256 keyed, server-only payment/order holds. Active rows block automated order and listing mutation.';
comment on table public.payment_operation_controls is
  'Server-only fail-closed switches for checkout, confirmation, cancellation, webhook and reconciliation.';
