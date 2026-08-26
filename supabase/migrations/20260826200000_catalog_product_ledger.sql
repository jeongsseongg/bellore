-- 벨로르 상품 운영 원장.
-- 결제 정본(listings.status/reserved_order_id/sold_order_id)은 유지하고
-- 승인·검수·판매의도·실물재고·전시를 별도 원장으로 관리한다.

do $$
declare v_required text;
begin
  foreach v_required in array array[
    '20260826155000','20260826160000','20260826170000','20260826180000','20260826190000'
  ] loop
    if not exists(select 1 from supabase_migrations.schema_migrations where version=v_required) then
      raise exception 'CATALOG_UPSTREAM_MIGRATION_MISSING:%',v_required;
    end if;
  end loop;
  if exists(select 1 from supabase_migrations.schema_migrations where version='20260826200000' and name is distinct from 'catalog_product_ledger')
     or exists(select 1 from supabase_migrations.schema_migrations where version='20260826201000' and name is distinct from 'catalog_product_operations') then
    raise exception 'CATALOG_MIGRATION_VERSION_COLLISION';
  end if;
end $$;

alter table public.listings
  add column if not exists product_no text,
  add column if not exists reference_no text,
  add column if not exists set_grade text,
  add column if not exists movement text,
  add column if not exists case_spec text,
  add column if not exists band_spec text,
  add column if not exists condition_notes text,
  add column if not exists dial_color text,
  add column if not exists material text,
  add column if not exists has_diamond boolean not null default false,
  add column if not exists has_warranty boolean not null default false,
  add column if not exists size_mm integer,
  add column if not exists accessories text,
  add column if not exists stamping text,
  add column if not exists misu text,
  add column if not exists purchase_year text,
  add column if not exists special_note text,
  add column if not exists detail_desc text,
  add column if not exists components text,
  add column if not exists sale_method text,
  add column if not exists ship_info text,
  add column if not exists sale_price bigint,
  add column if not exists sale_started_at timestamptz;

create table if not exists public.catalog_brand_codes (
  brand_alias text primary key,
  brand_code text not null check (brand_code ~ '^[A-Z0-9]{2,5}$'),
  canonical_name text not null,
  active boolean not null default true
);

insert into public.catalog_brand_codes(brand_alias,brand_code,canonical_name) values
  ('롤렉스','ROL','롤렉스'),('ROLEX','ROL','롤렉스'),
  ('파텍필립','PAT','파텍필립'),('PATEK PHILIPPE','PAT','파텍필립'),
  ('오데마피게','AP','오데마피게'),('AUDEMARS PIGUET','AP','오데마피게'),
  ('바쉐론 콘스탄틴','VAC','바쉐론 콘스탄틴'),('바쉐론콘스탄틴','VAC','바쉐론 콘스탄틴'),
  ('VACHERON CONSTANTIN','VAC','바쉐론 콘스탄틴'),('VACHERON','VAC','바쉐론 콘스탄틴'),
  ('까르띠에','CAR','까르띠에'),('CARTIER','CAR','까르띠에'),
  ('오메가','OME','오메가'),('OMEGA','OME','오메가'),
  ('위블로','HUB','위블로'),('HUBLOT','HUB','위블로'),
  ('태그호이어','TAG','태그호이어'),('TAG HEUER','TAG','태그호이어'),
  ('IWC','IWC','IWC'),('브라이틀링','BRT','브라이틀링'),('BREITLING','BRT','브라이틀링'),
  ('파네라이','PAN','파네라이'),('PANERAI','PAN','파네라이'),
  ('튜더','TUD','튜더'),('TUDOR','TUD','튜더'),('구찌','GUC','구찌'),('GUCCI','GUC','구찌'),
  ('샤넬','CHA','샤넬'),('CHANEL','CHA','샤넬'),
  ('프랭크 뮬러','FRM','프랭크 뮬러'),('프랭크뮬러','FRM','프랭크 뮬러'),('FRANCK MULLER','FRM','프랭크 뮬러'),
  ('리차드밀','RM','리차드밀'),('RICHARD MILLE','RM','리차드밀'),
  ('예거 르쿨트르','JLC','예거 르쿨트르'),('JAEGER-LECOULTRE','JLC','예거 르쿨트르'),
  ('로저 드뷔','RDU','로저 드뷔'),('로저드뷔','RDU','로저 드뷔'),('ROGER DUBUIS','RDU','로저 드뷔'),
  ('브레게','BRG','브레게'),('BREGUET','BRG','브레게'),('블랑팡','BLP','블랑팡'),('BLANCPAIN','BLP','블랑팡'),
  ('A. 랑에 운트 죄네','ALS','A. 랑에 운트 죄네'),('A. LANGE & SOHNE','ALS','A. 랑에 운트 죄네'),
  ('피아제','PIA','피아제'),('PIAGET','PIA','피아제'),('에르메스','HER','에르메스'),('HERMES','HER','에르메스'),
  ('불가리','BVL','불가리'),('BVLGARI','BVL','불가리'),('론진','LON','론진'),('LONGINES','LON','론진'),
  ('라도','RAD','라도'),('RADO','RAD','라도'),('미도','MID','미도'),('MIDO','MID','미도'),
  ('오리스','ORI','오리스'),('ORIS','ORI','오리스'),('세이코','SEI','세이코'),('SEIKO','SEI','세이코'),
  ('티쏘','TIS','티쏘'),('TISSOT','TIS','티쏘'),('해밀턴','HAM','해밀턴'),('HAMILTON','HAM','해밀턴'),
  ('프레드릭 콘스탄트','FRC','프레드릭 콘스탄트'),('FREDERIQUE CONSTANT','FRC','프레드릭 콘스탄트'),
  ('그랜드세이코','GRS','그랜드세이코'),('GRAND SEIKO','GRS','그랜드세이코'),
  ('리브토만','RTH','리브토만'),('REVUE THOMMEN','RTH','리브토만'),
  ('몽블랑','MON','몽블랑'),('MONTBLANC','MON','몽블랑'),
  ('보메 메르시에','BME','보메 메르시에'),('BAUME & MERCIER','BME','보메 메르시에'),
  ('부쉐러','BUC','부쉐러'),('CARL F. BUCHERER','BUC','부쉐러'),
  ('예거르쿨트르','JLC','예거 르쿨트르'),
  ('제니스','ZEN','제니스'),('ZENITH','ZEN','제니스'),
  ('제랄드 젠타','GGE','제랄드 젠타'),('GERALD GENTA','GGE','제랄드 젠타'),
  ('코럼','COR','코럼'),('CORUM','COR','코럼'),('콩코드','CON','콩코드'),('CONCORD','CON','콩코드'),
  ('브랜드미상','UNK','브랜드미상')
on conflict (brand_alias) do update set brand_code=excluded.brand_code,canonical_name=excluded.canonical_name,active=true;

create table if not exists public.listing_product_no_sequences (
  brand_code text not null,
  local_date date not null,
  last_value integer not null check (last_value between 0 and 999),
  primary key (brand_code,local_date)
);

create table if not exists public.listing_operational_state (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  approval_status text not null default 'pending' check (approval_status in ('draft','pending','approved','rejected')),
  inspection_status text not null default 'pending' check (inspection_status in ('pending','in_progress','passed','rejected','legacy_waived')),
  sale_status text not null default 'paused' check (sale_status in ('draft','active','paused','completed')),
  inventory_status text not null default 'expected' check (inventory_status in ('expected','in_transit','available','reserved','shipping','sold','returned')),
  display_status text not null default 'hidden' check (display_status in ('hidden','visible','scheduled')),
  inventory_location text,
  custody_holder text,
  inventory_courier text,
  inventory_tracking_no text,
  inventory_receiver text,
  inventory_received_at timestamptz,
  commission_rate numeric(7,6) not null default 0 check (commission_rate between 0 and 1),
  expected_settlement bigint not null default 0 check (expected_settlement >= 0),
  display_channels text[] not null default array['판매시계']::text[],
  home_section text,
  display_sort_order integer not null default 0,
  display_start_at timestamptz,
  display_end_at timestamptz,
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  archive_reason text,
  operation_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (display_end_at is null or display_start_at is null or display_end_at > display_start_at),
  check ((archived_at is null and archived_by is null) or (archived_at is not null and archive_reason is not null))
);

create table if not exists public.listing_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  from_status text,
  to_status text not null,
  from_location text,
  to_location text,
  actor_user_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.listing_price_versions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  price bigint not null check (price >= 0),
  sale_price bigint,
  commission_rate numeric(7,6) not null check (commission_rate between 0 and 1),
  expected_settlement bigint not null check (expected_settlement >= 0),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  actor_user_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  check (sale_price is null or (sale_price > 0 and sale_price < price))
);

create table if not exists public.listing_display_assignments (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  channel text not null,
  section_key text,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  actor_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(listing_id,channel,section_key),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.listing_operation_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  product_no text,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  reason text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists listing_operational_state_filter_idx on public.listing_operational_state
  (archived_at,approval_status,inspection_status,sale_status,inventory_status,display_status,updated_at desc);
create index if not exists listing_inventory_movements_listing_idx on public.listing_inventory_movements(listing_id,created_at desc);
create index if not exists listing_price_versions_listing_idx on public.listing_price_versions(listing_id,effective_from desc);
create index if not exists listing_display_assignments_listing_idx on public.listing_display_assignments(listing_id,active,sort_order);
create index if not exists listing_operation_events_listing_idx on public.listing_operation_events(listing_id,created_at desc);

insert into public.listing_operational_state(
  listing_id,approval_status,inspection_status,sale_status,inventory_status,display_status,expected_settlement,created_at,updated_at
)
select listing.id,'approved','legacy_waived',
  case when listing.status='sold' then 'completed' when listing.status='hidden' then 'paused' else 'active' end,
  case when listing.sold_order_id is not null or listing.status='sold' then 'sold'
    when listing.reserved_order_id is not null or listing.status='reserved' then 'reserved' else 'available' end,
  case when listing.status='on_sale' and listing.reserved_order_id is null and listing.sold_order_id is null then 'visible' else 'hidden' end,
  greatest(coalesce(listing.sale_price,listing.price,0),0),coalesce(listing.created_at,now()),coalesce(listing.updated_at,now())
from public.listings listing
on conflict (listing_id) do nothing;

insert into public.listing_price_versions(
  listing_id,price,sale_price,commission_rate,expected_settlement,reason,effective_from
)
select listing.id,greatest(coalesce(listing.price,0),0),listing.sale_price,0,
  greatest(coalesce(listing.sale_price,listing.price,0),0),'기존 상품 기준값',coalesce(listing.created_at,now())
from public.listings listing
where not exists(select 1 from public.listing_price_versions history where history.listing_id=listing.id);

insert into public.listing_inventory_movements(listing_id,to_status,reason,created_at)
select state.listing_id,state.inventory_status,'기존 상품 기준값',state.created_at
from public.listing_operational_state state
where not exists(select 1 from public.listing_inventory_movements history where history.listing_id=state.listing_id);

create or replace function public.catalog_is_server_context()
returns boolean language sql stable set search_path='' as $$
  select coalesce(auth.role(),'')='service_role'
    or session_user in ('postgres','service_role','supabase_admin')
    or coalesce(current_setting('request.jwt.claim.role',true),'')='service_role'
    or coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'),'')='service_role'
$$;

create or replace function public.bl_set_product_no()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_code text; v_date date; v_rank integer; v_prefix text; v_existing integer;
begin
  if coalesce(current_setting('bellore.catalog_rpc',true),'')<>'1'
     and not public.catalog_is_server_context() then
    raise exception 'CATALOG_RPC_REQUIRED';
  end if;
  if nullif(btrim(new.product_no),'') is not null then
    if public.catalog_is_server_context() then return new; end if;
    raise exception 'PRODUCT_NO_SERVER_MANAGED';
  end if;
  select code.brand_code into v_code from public.catalog_brand_codes code
   where code.active=true and upper(btrim(code.brand_alias))=upper(btrim(new.title)) limit 1;
  if v_code is null then raise exception 'BRAND_CODE_REQUIRED'; end if;
  v_date := (coalesce(new.created_at,now()) at time zone 'Asia/Seoul')::date;
  v_prefix := v_code||'-N'||extract(day from v_date)::int||right(extract(year from v_date)::int::text,2)||extract(month from v_date)::int||'-';
  select coalesce(max(substring(listing.product_no from '([0-9]+)$')::integer),0) into v_existing
    from public.listings listing where listing.product_no like v_prefix||'%' and listing.product_no ~ '[0-9]+$';
  insert into public.listing_product_no_sequences(brand_code,local_date,last_value)
    values(v_code,v_date,v_existing) on conflict do nothing;
  update public.listing_product_no_sequences set last_value=greatest(last_value,v_existing)+1
   where brand_code=v_code and local_date=v_date returning last_value into v_rank;
  if v_rank is null or v_rank>999 then raise exception 'PRODUCT_NO_DAILY_LIMIT'; end if;
  new.product_no := v_prefix||v_rank;
  return new;
end $$;

create or replace function public.initialize_listing_operational_state()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.listing_operational_state(listing_id,approval_status,inspection_status,sale_status,inventory_status,display_status,expected_settlement)
  values(new.id,'pending','pending','paused','expected','hidden',greatest(coalesce(new.sale_price,new.price,0),0))
  on conflict(listing_id) do nothing;
  return new;
end $$;

create or replace function public.guard_listing_checkout_eligibility()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_state public.listing_operational_state%rowtype;
begin
  if tg_op='UPDATE' and coalesce(current_setting('bellore.catalog_rpc',true),'')<>'1'
    and not public.catalog_is_server_context() then raise exception 'CATALOG_RPC_REQUIRED'; end if;
  if tg_op='UPDATE' and new.product_no is distinct from old.product_no
    and not public.catalog_is_server_context()
    and coalesce(current_setting('bellore.catalog_rpc',true),'')<>'1' then raise exception 'PRODUCT_NO_SERVER_MANAGED'; end if;
  if tg_op='UPDATE' and new.reserved_order_id is distinct from old.reserved_order_id and new.reserved_order_id is not null then
    select * into v_state from public.listing_operational_state where listing_id=new.id;
    if not found or v_state.approval_status<>'approved'
      or v_state.inspection_status not in ('passed','legacy_waived')
      or v_state.sale_status<>'active' or v_state.inventory_status<>'available'
      or v_state.display_status<>'visible' or v_state.archived_at is not null
    then raise exception 'LISTING_NOT_OPERATIONALLY_AVAILABLE'; end if;
  end if;
  if tg_op='UPDATE' and new.status='on_sale' and exists(
    select 1 from public.listing_operational_state state where state.listing_id=new.id and state.archived_at is not null
  ) then new.status := 'hidden'; end if;
  if tg_op='UPDATE' and new.status='on_sale' and old.status is distinct from new.status
    and new.reserved_order_id is null and old.reserved_order_id is null
    and not public.catalog_is_server_context() then
    select * into v_state from public.listing_operational_state where listing_id=new.id;
    if not found or v_state.sale_status<>'active' or v_state.display_status<>'visible' or v_state.archived_at is not null
    then raise exception 'CATALOG_RPC_REQUIRED'; end if;
  end if;
  if tg_op='UPDATE' and new.status is distinct from old.status
    and row(new.reserved_order_id,new.sold_order_id) is not distinct from row(old.reserved_order_id,old.sold_order_id)
    and coalesce(current_setting('bellore.catalog_rpc',true),'')<>'1' then
    raise exception 'CATALOG_RPC_REQUIRED';
  end if;
  return new;
end $$;

create or replace function public.capture_legacy_listing_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_state public.listing_operational_state%rowtype; v_expected bigint;
begin
  if coalesce(current_setting('bellore.catalog_rpc',true),'')='1' then return null; end if;
  select * into v_state from public.listing_operational_state where listing_id=new.id;
  if row(new.price,new.sale_price) is distinct from row(old.price,old.sale_price) then
    v_expected:=floor(coalesce(new.sale_price,new.price,0)*(1-coalesce(v_state.commission_rate,0)))::bigint;
    update public.listing_price_versions set effective_until=now() where listing_id=new.id and effective_until is null;
    insert into public.listing_price_versions(listing_id,price,sale_price,commission_rate,expected_settlement,actor_user_id,reason)
    values(new.id,greatest(coalesce(new.price,0),0),new.sale_price,coalesce(v_state.commission_rate,0),greatest(v_expected,0),auth.uid(),'기존 관리 경로 자동 기록');
    update public.listing_operational_state set expected_settlement=greatest(v_expected,0),operation_version=operation_version+1,updated_at=now()
      where listing_id=new.id;
  end if;
  insert into public.listing_operation_events(listing_id,product_no,actor_user_id,action,reason,before_data,after_data,metadata)
  values(new.id,new.product_no,auth.uid(),'기존 관리 경로 변경','서버 자동 감사',to_jsonb(old),to_jsonb(new),jsonb_build_object('source','legacy'));
  return null;
end $$;

create or replace function public.sync_listing_operational_state_from_payment()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_before public.listing_operational_state%rowtype; v_after public.listing_operational_state%rowtype;
begin
  select * into v_before from public.listing_operational_state where listing_id=new.id;
  update public.listing_operational_state set
    inventory_status=case when new.sold_order_id is not null or new.status='sold' then 'sold'
      when new.reserved_order_id is not null or new.status='reserved' then 'reserved'
      when (old.sold_order_id is not null or old.reserved_order_id is not null or old.status in ('sold','reserved'))
        and new.sold_order_id is null and new.reserved_order_id is null and archived_at is null then 'available'
      else inventory_status end,
    sale_status=case when new.sold_order_id is not null or new.status='sold' then 'completed'
      when archived_at is not null then 'paused'
      when (old.sold_order_id is not null or old.status='sold') and new.sold_order_id is null and new.status='on_sale' then 'active'
      else sale_status end,
    display_status=case when new.sold_order_id is not null or new.status='sold' or archived_at is not null then 'hidden'
      when (old.sold_order_id is not null or old.status='sold') and new.sold_order_id is null and new.status='on_sale' then 'visible'
      else display_status end,
    operation_version=operation_version+1,updated_at=now()
  where listing_id=new.id returning * into v_after;
  if found and to_jsonb(v_before) is distinct from to_jsonb(v_after) then
    if v_before.inventory_status is distinct from v_after.inventory_status then
      insert into public.listing_inventory_movements(
        listing_id,from_status,to_status,from_location,to_location,actor_user_id,reason,metadata
      ) values(
        new.id,v_before.inventory_status,v_after.inventory_status,v_before.inventory_location,v_after.inventory_location,
        auth.uid(),'결제 상태 자동 반영',jsonb_build_object('oldListingStatus',old.status,'newListingStatus',new.status)
      );
    end if;
    insert into public.listing_operation_events(listing_id,product_no,actor_user_id,action,reason,before_data,after_data,metadata)
    values(new.id,new.product_no,auth.uid(),'결제 상태 동기화','주문 상태 자동 반영',to_jsonb(v_before),to_jsonb(v_after),
      jsonb_build_object('oldListingStatus',old.status,'newListingStatus',new.status,
        'oldReservedOrderId',old.reserved_order_id,'newReservedOrderId',new.reserved_order_id,
        'oldSoldOrderId',old.sold_order_id,'newSoldOrderId',new.sold_order_id));
  end if;
  return null;
end $$;

create or replace function public.guard_listing_hard_delete()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_state public.listing_operational_state%rowtype;
begin
  if coalesce(current_setting('bellore.catalog_rpc',true),'')<>'1' then
    raise exception 'CATALOG_RPC_REQUIRED';
  end if;
  select * into v_state from public.listing_operational_state where listing_id=old.id;
  if not found or v_state.approval_status not in ('draft','pending') then raise exception 'LISTING_ARCHIVE_REQUIRED'; end if;
  if exists(select 1 from public.orders where listing_id=old.id)
    or exists(select 1 from public.settlements where listing_id=old.id)
    or exists(select 1 from public.auctions where listing_id=old.id)
  then raise exception 'LISTING_HAS_LINKED_RECORDS'; end if;
  return old;
end $$;

drop trigger if exists trg_bl_set_product_no on public.listings;
create trigger trg_bl_set_product_no before insert on public.listings for each row execute function public.bl_set_product_no();
drop trigger if exists trg_05_catalog_checkout_eligibility on public.listings;
create trigger trg_05_catalog_checkout_eligibility before update on public.listings for each row execute function public.guard_listing_checkout_eligibility();
drop trigger if exists trg_initialize_listing_operational_state on public.listings;
create trigger trg_initialize_listing_operational_state after insert on public.listings for each row execute function public.initialize_listing_operational_state();
drop trigger if exists trg_sync_listing_operational_state_from_payment on public.listings;
drop trigger if exists trg_50_sync_listing_operational_state_from_payment on public.listings;
create trigger trg_50_sync_listing_operational_state_from_payment after update of status,reserved_order_id,sold_order_id on public.listings
  for each row when (old.status is distinct from new.status or old.reserved_order_id is distinct from new.reserved_order_id or old.sold_order_id is distinct from new.sold_order_id)
  execute function public.sync_listing_operational_state_from_payment();
drop trigger if exists trg_capture_legacy_listing_write on public.listings;
drop trigger if exists trg_90_capture_legacy_listing_write on public.listings;
create trigger trg_90_capture_legacy_listing_write after update on public.listings
  for each row when (old.* is distinct from new.*) execute function public.capture_legacy_listing_write();
drop trigger if exists trg_guard_listing_hard_delete on public.listings;
create trigger trg_guard_listing_hard_delete before delete on public.listings for each row execute function public.guard_listing_hard_delete();

do $$ begin
  if exists(select 1 from public.listings where product_no is not null and btrim(product_no)<>'' group by product_no having count(*)>1)
    then raise exception 'DUPLICATE_PRODUCT_NO_REQUIRES_REVIEW'; end if;
end $$;
create unique index if not exists listings_product_no_uq on public.listings(product_no) where product_no is not null and btrim(product_no)<>'';

alter table public.catalog_brand_codes enable row level security;
alter table public.listing_product_no_sequences enable row level security;
alter table public.listing_operational_state enable row level security;
alter table public.listing_inventory_movements enable row level security;
alter table public.listing_price_versions enable row level security;
alter table public.listing_display_assignments enable row level security;
alter table public.listing_operation_events enable row level security;

revoke all on public.catalog_brand_codes,public.listing_product_no_sequences,public.listing_operational_state,
  public.listing_inventory_movements,public.listing_price_versions,public.listing_display_assignments,public.listing_operation_events
  from public,anon,authenticated;
grant select on public.listing_operational_state,public.listing_inventory_movements,public.listing_price_versions,
  public.listing_display_assignments,public.listing_operation_events to authenticated;
revoke insert,update,delete on public.listings from anon,authenticated;

do $$ declare v_table text; begin
  foreach v_table in array array['listing_operational_state','listing_inventory_movements','listing_price_versions','listing_display_assignments','listing_operation_events'] loop
    execute format('drop policy if exists %I on public.%I',v_table||'_admin_select',v_table);
    execute format('create policy %I on public.%I for select to authenticated using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role=''admin'' and p.approved=true and coalesce(p.suspended,false)=false))',v_table||'_admin_select',v_table);
  end loop;
end $$;

revoke execute on function public.catalog_is_server_context(),public.bl_set_product_no(),public.initialize_listing_operational_state(),
  public.guard_listing_checkout_eligibility(),public.capture_legacy_listing_write(),
  public.sync_listing_operational_state_from_payment(),public.guard_listing_hard_delete()
  from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
