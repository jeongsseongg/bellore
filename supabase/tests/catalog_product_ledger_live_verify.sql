\set ON_ERROR_STOP on

do $$
begin
  if (select count(*) from public.listing_operational_state)
     <> (select count(*) from public.listings) then
    raise exception 'CATALOG_STATE_COUNT_MISMATCH';
  end if;
  if exists (
    select 1 from public.listings
     where product_no is not null and btrim(product_no) <> ''
     group by product_no having count(*) > 1
  ) then
    raise exception 'CATALOG_DUPLICATE_PRODUCT_NO';
  end if;
  if exists (
    select distinct listing.title
      from public.listings listing
     where not exists (
       select 1 from public.catalog_brand_codes code
        where code.active = true
          and upper(btrim(code.brand_alias)) = upper(btrim(listing.title))
     )
  ) then
    raise exception 'CATALOG_BRAND_CODE_COVERAGE_INCOMPLETE';
  end if;
  if has_function_privilege('anon',
       'public.admin_manage_listing(uuid,text,jsonb,text)','execute')
     or not has_function_privilege('authenticated',
       'public.admin_manage_listing(uuid,text,jsonb,text)','execute') then
    raise exception 'CATALOG_RPC_GRANTS_INVALID';
  end if;
  if not has_function_privilege('anon','public.catalog_home_assignments_v1()','execute')
     or has_function_privilege('anon','public.admin_set_catalog_home_section(text,text,text,uuid[])','execute')
     or not has_function_privilege('authenticated','public.admin_set_catalog_home_section(text,text,text,uuid[])','execute') then
    raise exception 'CATALOG_HOME_RPC_GRANTS_INVALID';
  end if;
  if has_table_privilege('anon','public.listing_operation_events','select')
     or has_table_privilege('authenticated','public.listing_operation_events','insert')
     or has_table_privilege('authenticated','public.listing_operational_state','update') then
    raise exception 'CATALOG_TABLE_GRANTS_INVALID';
  end if;
  if not exists (
    select 1 from supabase_migrations.schema_migrations
     where version = '20260826200000' and name = 'catalog_product_ledger'
  ) or not exists (
    select 1 from supabase_migrations.schema_migrations
     where version = '20260826201000' and name = 'catalog_product_operations'
  ) then
    raise exception 'CATALOG_MIGRATION_HISTORY_MISSING';
  end if;
  if (select count(distinct listing_id) from public.listing_price_versions)
       <> (select count(*) from public.listings)
     or (select count(distinct listing_id) from public.listing_inventory_movements)
       <> (select count(*) from public.listings) then
    raise exception 'CATALOG_BASELINE_HISTORY_INCOMPLETE';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.listings'::regclass
      and tgname='trg_05_catalog_checkout_eligibility' and not tgisinternal)
     or not exists(select 1 from pg_trigger where tgrelid='public.listings'::regclass
      and tgname='trg_50_sync_listing_operational_state_from_payment' and not tgisinternal)
     or not exists(select 1 from pg_trigger where tgrelid='public.listings'::regclass
      and tgname='trg_90_capture_legacy_listing_write' and not tgisinternal)
     or not exists(select 1 from pg_trigger where tgrelid='public.listings'::regclass
      and tgname='trg_guard_listing_hard_delete' and not tgisinternal) then
    raise exception 'CATALOG_TRIGGER_SET_INCOMPLETE';
  end if;
end $$;

select
  (select count(*) from public.listings) as listing_count,
  (select count(*) from public.listing_operational_state) as operational_state_count,
  (select count(*) from public.listing_operation_events) as audit_event_count,
  (select count(*) from public.listing_inventory_movements) as inventory_movement_count,
  (select count(*) from public.listing_price_versions) as price_version_count;

\echo 'catalog product ledger live verification passed'
