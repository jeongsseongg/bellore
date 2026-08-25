-- Customer-owned reusable shipping addresses (maximum 10 per account).
create table if not exists public.shipping_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null default '배송지' check (char_length(label) between 1 and 30),
  recipient text not null check (char_length(recipient) between 1 and 120),
  phone text not null check (char_length(phone) between 9 and 40),
  postcode text not null check (char_length(postcode) between 1 and 20),
  addr1 text not null check (char_length(addr1) between 1 and 300),
  addr2 text not null default '' check (char_length(addr2) <= 300),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shipping_addresses_user_created_idx
  on public.shipping_addresses(user_id, created_at desc);
create unique index if not exists shipping_addresses_one_default_idx
  on public.shipping_addresses(user_id) where is_default;

alter table public.shipping_addresses enable row level security;
revoke all on public.shipping_addresses from anon;
grant select, insert, update, delete on public.shipping_addresses to authenticated;
grant select, insert, update, delete on public.shipping_addresses to service_role;

drop policy if exists shipping_addresses_select_own on public.shipping_addresses;
create policy shipping_addresses_select_own on public.shipping_addresses
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists shipping_addresses_insert_own on public.shipping_addresses;
create policy shipping_addresses_insert_own on public.shipping_addresses
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists shipping_addresses_update_own on public.shipping_addresses;
create policy shipping_addresses_update_own on public.shipping_addresses
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists shipping_addresses_delete_own on public.shipping_addresses;
create policy shipping_addresses_delete_own on public.shipping_addresses
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.guard_customer_shipping_address()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  address_count integer;
  request_uid uuid := auth.uid();
  request_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if new.user_id is null then
    if request_uid is null then raise exception 'shipping_address_owner_required'; end if;
    new.user_id := request_uid;
  end if;
  if request_role <> 'service_role' and (request_uid is null or new.user_id is distinct from request_uid) then
    raise exception 'shipping_address_owner_mismatch';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'shipping_address_owner_immutable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if tg_op = 'INSERT' then
    select count(*) into address_count from public.shipping_addresses where user_id = new.user_id;
    if address_count >= 10 then raise exception 'shipping_address_limit_10'; end if;
  end if;
  if new.is_default then
    update public.shipping_addresses set is_default = false, updated_at = now()
      where user_id = new.user_id and id is distinct from new.id and is_default;
    update public.profiles set postcode = new.postcode, addr1 = new.addr1, addr2 = new.addr2
      where id = new.user_id;
  end if;
  new.updated_at := now();
  return new;
end $$;

revoke all on function public.guard_customer_shipping_address() from public, anon, authenticated;
drop trigger if exists trg_guard_customer_shipping_address on public.shipping_addresses;
create trigger trg_guard_customer_shipping_address
  before insert or update on public.shipping_addresses
  for each row execute function public.guard_customer_shipping_address();
