\set ON_ERROR_STOP on

begin;
set local lock_timeout='5s';
set local statement_timeout='2min';
\i /repo/supabase/migrations/20260826200000_catalog_product_ledger.sql
\i /repo/supabase/migrations/20260826201000_catalog_product_operations.sql

do $$
begin
  if (select count(*) from public.listing_operational_state)
     <> (select count(*) from public.listings) then
    raise exception 'CATALOG_STATE_BACKFILL_INCOMPLETE';
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
  if (select count(*) from pg_class
       where oid in (
         'public.catalog_brand_codes'::regclass,
         'public.listing_product_no_sequences'::regclass,
         'public.listing_operational_state'::regclass,
         'public.listing_inventory_movements'::regclass,
         'public.listing_price_versions'::regclass,
         'public.listing_display_assignments'::regclass,
         'public.listing_operation_events'::regclass
       ) and relrowsecurity) <> 7 then
    raise exception 'CATALOG_RLS_INCOMPLETE';
  end if;
  if has_function_privilege('anon',
       'public.admin_manage_listing(uuid,text,jsonb,text)','execute')
     or not has_function_privilege('authenticated',
       'public.admin_manage_listing(uuid,text,jsonb,text)','execute') then
    raise exception 'CATALOG_RPC_GRANTS_INVALID';
  end if;
  if has_table_privilege('anon','public.listing_operation_events','select')
     or has_table_privilege('authenticated','public.listing_operation_events','insert')
     or has_table_privilege('authenticated','public.listing_operational_state','update') then
    raise exception 'CATALOG_TABLE_GRANTS_INVALID';
  end if;
end $$;

select id as catalog_admin_id
  from public.profiles
 where role = 'admin' and approved = true and coalesce(suspended,false) = false
 order by created_at
 limit 1 \gset

\if :{?catalog_admin_id}
\else
  \echo 'CATALOG_ACTIVE_ADMIN_REQUIRED'
  \quit 1
\endif

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'catalog_admin_id', 'role', 'authenticated')::text,
  true
);

do $$
declare v_listing uuid; v_rows integer;
begin
  select id into v_listing from public.listings order by created_at limit 1;
  if v_listing is null then raise exception 'CATALOG_EXISTING_LISTING_REQUIRED'; end if;
  begin
    update public.listings set updated_at=now() where id=v_listing;
    get diagnostics v_rows=row_count;
    if v_rows>0 then raise exception 'CATALOG_DIRECT_UPDATE_NOT_BLOCKED'; end if;
  exception when others then
    if sqlerrm not like '%CATALOG_RPC_REQUIRED%' and sqlerrm not like '%permission denied%'
       and sqlerrm not like '%row-level security%' then raise; end if;
  end;
end $$;

select
  (result->'listing'->>'id')::uuid as catalog_test_id,
  result->'listing'->>'product_no' as catalog_product_no,
  (result->'operationalState'->>'operation_version')::bigint as catalog_version
from (
  select public.admin_manage_listing(
    null,
    'save',
    jsonb_build_object(
      'title','롤렉스',
      'description','운영 원장 자동 검증 상품',
      'reference_no','AUTOMATED-CHECK',
      'price',1000000,
      'sale_active',false,
      'commission_rate',0.1,
      'inventory_status','available',
      'inventory_location','운영 검증 위치',
      'image_urls',jsonb_build_array('https://example.invalid/catalog-check.jpg'),
      'display_channels',jsonb_build_array('판매시계','홈'),
      'home_section','최근 등록된 시계',
      'display_sort_order',9999
    ),
    null
  ) as result
) created \gset

select set_config('bellore.catalog_test_id', :'catalog_test_id', true),
       set_config('bellore.catalog_product_no', :'catalog_product_no', true);

do $$
begin
  if current_setting('bellore.catalog_product_no') !~ '^ROL-N[0-9]+-[0-9]+$' then
    raise exception 'CATALOG_PRODUCT_NO_GENERATION_FAILED';
  end if;
  if not exists (
    select 1 from public.listing_price_versions
     where listing_id = current_setting('bellore.catalog_test_id')::uuid and expected_settlement = 900000
  ) then
    raise exception 'CATALOG_PRICE_HISTORY_FAILED';
  end if;
  if not exists (
    select 1 from public.listing_inventory_movements
     where listing_id = current_setting('bellore.catalog_test_id')::uuid and to_status = 'available'
  ) then
    raise exception 'CATALOG_INVENTORY_HISTORY_FAILED';
  end if;
  if not exists (
    select 1 from public.site_content
     where key = 'home_row_new'
       and public.catalog_body_product_ids(body) ? current_setting('bellore.catalog_test_id')
  ) then
    raise exception 'CATALOG_HOME_ROW_SYNC_FAILED';
  end if;
end $$;

select (result->'operationalState'->>'operation_version')::bigint as catalog_version
from (select public.admin_manage_listing(
  :'catalog_test_id'::uuid,'set_inspection',
  jsonb_build_object('status','passed','operation_version',:'catalog_version'::bigint),
  '운영 검증 검수 통과'
) result) changed \gset

select (result->'operationalState'->>'operation_version')::bigint as catalog_version
from (select public.admin_manage_listing(
  :'catalog_test_id'::uuid,'set_approval',
  jsonb_build_object('status','approved','operation_version',:'catalog_version'::bigint),
  '운영 검증 승인 처리'
) result) changed \gset

select operation_version as stale_version
  from public.listing_operational_state where listing_id = :'catalog_test_id'::uuid \gset

select (result->'operationalState'->>'operation_version')::bigint as catalog_version
from (select public.admin_manage_listing(
  :'catalog_test_id'::uuid,'set_sale',
  jsonb_build_object('status','active','operation_version',:'catalog_version'::bigint),
  '운영 검증 판매 시작'
) result) changed \gset

select set_config('bellore.catalog_stale_version', :'stale_version', true);

do $$
begin
    begin
      perform public.admin_manage_listing(
      current_setting('bellore.catalog_test_id')::uuid,'set_visibility',
      jsonb_build_object('status','visible','operation_version',current_setting('bellore.catalog_stale_version')::bigint),
      '운영 검증 오래된 수정'
    );
    raise exception 'CATALOG_VERSION_CONFLICT_NOT_BLOCKED';
  exception when others then
    if sqlerrm not like '%VERSION_CONFLICT%' then raise; end if;
  end;
end $$;

select (result->'operationalState'->>'operation_version')::bigint as catalog_version
from (select public.admin_manage_listing(
  :'catalog_test_id'::uuid,'set_visibility',
  jsonb_build_object('status','visible','operation_version',:'catalog_version'::bigint),
  '운영 검증 전시 시작'
) result) changed \gset

do $$
begin
  if not exists (
    select 1
      from public.listings listing
      join public.listing_operational_state state on state.listing_id = listing.id
     where listing.id = current_setting('bellore.catalog_test_id')::uuid
       and listing.status = 'on_sale'
       and state.approval_status = 'approved'
       and state.inspection_status = 'passed'
       and state.sale_status = 'active'
       and state.inventory_status = 'available'
       and state.display_status = 'visible'
  ) then
    raise exception 'CATALOG_LIFECYCLE_ACTIVATION_FAILED';
  end if;
end $$;

select public.admin_set_catalog_home_section(
  'home_row_new','최근 등록된 시계','운영 검증',array[:'catalog_test_id'::uuid]
);

do $$
begin
  if not exists(
    select 1 from public.catalog_home_assignments_v1()
     where section_key='home_row_new'
       and listing_id=current_setting('bellore.catalog_test_id')::uuid
       and sort_order=1
  ) then raise exception 'CATALOG_HOME_ASSIGNMENT_READ_FAILED'; end if;
  begin
    perform public.admin_set_catalog_home_section(
      'home_row_sale','이번 주 특별가','운영 검증',array[current_setting('bellore.catalog_test_id')::uuid]
    );
    raise exception 'CATALOG_HOME_SALE_GUARD_NOT_BLOCKED';
  exception when others then
    if sqlerrm not like '%HOME_SALE_REQUIRED%' then raise; end if;
  end;
end $$;

set local role service_role;
set local request.jwt.claims='{"role":"service_role"}';
select public.create_checkout_order_edge_v1(
  repeat('8',64),null,:'catalog_test_id'::uuid,repeat('9',64)
);
select order_no as catalog_order_no,amount as catalog_order_amount
  from public.orders where checkout_token_hash=repeat('9',64)
  order by created_at desc limit 1 \gset
select public.finalize_paid_order_v2(
  :'catalog_order_no',:'catalog_order_amount'::bigint,'CARD',:'catalog_order_no','catalog-dry-run',null,null,0
);

do $$
begin
  if not exists(
    select 1 from public.listing_operational_state
     where listing_id=current_setting('bellore.catalog_test_id')::uuid
       and inventory_status='sold' and sale_status='completed' and display_status='hidden'
  ) then raise exception 'CATALOG_PAYMENT_SYNC_FAILED'; end if;
end $$;

select public.finalize_order_refund_v2(
  :'catalog_order_no',:'catalog_order_amount'::bigint,'catalog-dry-run','catalog-dry-run-cancel'
);

do $$
begin
  if not exists(
    select 1 from public.listing_operational_state
     where listing_id=current_setting('bellore.catalog_test_id')::uuid
       and inventory_status='available' and sale_status='active' and display_status='visible'
  ) then raise exception 'CATALOG_REFUND_SYNC_FAILED'; end if;
end $$;

select public.create_checkout_order_edge_v1(
  repeat('a',64),null,:'catalog_test_id'::uuid,repeat('b',64)
);
select order_no as catalog_return_order_no,amount as catalog_return_order_amount
  from public.orders where checkout_token_hash=repeat('b',64)
  order by created_at desc limit 1 \gset
select public.finalize_paid_order_v2(
  :'catalog_return_order_no',:'catalog_return_order_amount'::bigint,'CARD',:'catalog_return_order_no',
  'catalog-return-dry-run',null,null,0
);
update public.orders set status='returning' where order_no=:'catalog_return_order_no';
select public.finalize_order_refund_v2(
  :'catalog_return_order_no',:'catalog_return_order_amount'::bigint,'catalog-return-dry-run','catalog-return-cancel'
);
select set_config('bellore.catalog_return_order_no', :'catalog_return_order_no', true);

do $$
begin
  if not exists(
    select 1 from public.listing_operational_state
     where listing_id=current_setting('bellore.catalog_test_id')::uuid
       and inventory_status='sold' and sale_status='completed' and display_status='hidden'
  ) or not exists(
    select 1 from public.orders where order_no=current_setting('bellore.catalog_return_order_no',true)
      and status='refunded' and restock_required=true
  ) then raise exception 'CATALOG_RETURN_HOLD_FAILED'; end if;
end $$;

select public.complete_order_restock_v1(:'catalog_return_order_no');

do $$
begin
  if not exists(
    select 1 from public.listing_operational_state
     where listing_id=current_setting('bellore.catalog_test_id')::uuid
       and inventory_status='available' and sale_status='active' and display_status='visible'
  ) then raise exception 'CATALOG_RESTOCK_SYNC_FAILED'; end if;
  if (select count(*) from public.listing_inventory_movements
       where listing_id=current_setting('bellore.catalog_test_id')::uuid) < 7 then
    raise exception 'CATALOG_PAYMENT_INVENTORY_HISTORY_INCOMPLETE';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'catalog_admin_id', 'role', 'authenticated')::text,
  true
);
select operation_version as catalog_version
  from public.listing_operational_state where listing_id=:'catalog_test_id'::uuid \gset

select (result->'operationalState'->>'operation_version')::bigint as catalog_version
from (select public.admin_manage_listing(
  :'catalog_test_id'::uuid,'archive',
  jsonb_build_object('operation_version',:'catalog_version'::bigint),
  '운영 검증 상품 보관'
) result) changed \gset

select (result->'operationalState'->>'operation_version')::bigint as catalog_version
from (select public.admin_manage_listing(
  :'catalog_test_id'::uuid,'restore',
  jsonb_build_object('operation_version',:'catalog_version'::bigint),
  '운영 검증 보관 해제'
) result) changed \gset

select
  (result->'listing'->>'id')::uuid as catalog_delete_id,
  (result->'operationalState'->>'operation_version')::bigint as catalog_delete_version
from (
  select public.admin_manage_listing(
    null,'save',
    jsonb_build_object(
      'title','오메가',
      'description','운영 원장 삭제 검증 상품',
      'price',1000000,
      'commission_rate',0,
      'inventory_status','expected',
      'image_urls',jsonb_build_array('https://example.invalid/catalog-delete-check.jpg'),
      'display_channels',jsonb_build_array('판매시계')
    ),null
  ) as result
) created \gset

select set_config('bellore.catalog_delete_id', :'catalog_delete_id', true);

do $$
declare v_rows integer;
begin
  begin
    delete from public.listings where id=current_setting('bellore.catalog_delete_id')::uuid;
    get diagnostics v_rows=row_count;
    if v_rows>0 then raise exception 'CATALOG_DIRECT_DELETE_NOT_BLOCKED'; end if;
  exception when others then
    if sqlerrm not like '%CATALOG_RPC_REQUIRED%' and sqlerrm not like '%permission denied%'
       and sqlerrm not like '%row-level security%' then raise; end if;
  end;
end $$;

select public.admin_manage_listing(
  :'catalog_delete_id'::uuid,'delete_draft',
  jsonb_build_object('operation_version',:'catalog_delete_version'::bigint),
  '운영 검증 초안 삭제'
);

do $$
begin
  if exists(select 1 from public.listings where id = current_setting('bellore.catalog_delete_id')::uuid) then
    raise exception 'CATALOG_DRAFT_DELETE_FAILED';
  end if;
  if (select count(*) from public.listing_operation_events
       where listing_id = current_setting('bellore.catalog_test_id')::uuid) < 6 then
    raise exception 'CATALOG_AUDIT_EVENT_CHAIN_INCOMPLETE';
  end if;
end $$;

reset role;
rollback;

\echo 'catalog product ledger dry-run lifecycle verified and rolled back'
