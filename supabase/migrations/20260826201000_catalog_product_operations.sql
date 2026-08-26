-- 상품 원장의 유일한 관리자 쓰기 경로.

create or replace function public.catalog_assert_admin()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not exists(
    select 1 from public.profiles profile where profile.id=v_actor and profile.role='admin'
      and profile.approved=true and coalesce(profile.suspended,false)=false
  ) then raise exception 'ADMIN_FORBIDDEN' using errcode='42501'; end if;
  return v_actor;
end $$;

create or replace function public.catalog_event(
  p_listing_id uuid,p_actor uuid,p_action text,p_reason text,p_before jsonb,p_after jsonb,p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_product_no text;
begin
  select product_no into v_product_no from public.listings where id=p_listing_id;
  insert into public.listing_operation_events(listing_id,product_no,actor_user_id,action,reason,before_data,after_data,metadata)
  values(p_listing_id,v_product_no,p_actor,p_action,nullif(trim(p_reason),''),p_before,p_after,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.catalog_body_product_ids(p_body text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_body jsonb;
begin
  begin v_body:=coalesce(nullif(p_body,'')::jsonb,'{}'::jsonb); exception when others then v_body:='{}'::jsonb; end;
  if jsonb_typeof(v_body)='array' then return v_body; end if;
  if jsonb_typeof(v_body->'productIds')='array' then return v_body->'productIds'; end if;
  return '[]'::jsonb;
end $$;

create or replace function public.catalog_sync_home_section(
  p_listing_id uuid,p_section text,p_actor uuid,p_sort integer,p_starts timestamptz,p_ends timestamptz
) returns void language plpgsql security definer set search_path='' as $$
declare v_key text; v_title text; v_ids jsonb; v_row record; v_id text:=p_listing_id::text;
begin
  v_key:=case p_section when '이번 주 특별가' then 'home_row_sale' when '기간 한정 특가' then 'home_row_drop'
    when '최근 등록된 시계' then 'home_row_new' else null end;
  delete from public.listing_display_assignments where listing_id=p_listing_id and channel='홈';
  for v_row in select key,body from public.site_content where key in ('home_row_sale','home_row_drop','home_row_new') loop
    select coalesce(jsonb_agg(item.value),'[]'::jsonb) into v_ids
      from jsonb_array_elements_text(public.catalog_body_product_ids(v_row.body)) as item(value) where item.value<>v_id;
    if v_row.key=v_key then v_ids:=v_ids||to_jsonb(v_id); end if;
    update public.site_content set body=jsonb_build_object('productIds',v_ids)::text,updated_at=now() where key=v_row.key;
  end loop;
  if v_key is not null then
    v_title:=p_section;
    if not exists(select 1 from public.site_content where key=v_key) then
      insert into public.site_content(key,title,subtitle,body,images,updated_at)
      values(v_key,v_title,'',jsonb_build_object('productIds',jsonb_build_array(v_id))::text,array[]::text[],now());
    end if;
    insert into public.listing_display_assignments(listing_id,channel,section_key,sort_order,starts_at,ends_at,actor_user_id)
    values(p_listing_id,'홈',v_key,coalesce(p_sort,0),p_starts,p_ends,p_actor);
  end if;
end $$;

create or replace function public.catalog_home_assignments_v1()
returns table(section_key text,listing_id uuid,sort_order integer)
language sql stable security definer set search_path='' as $$
  select assignment.section_key,assignment.listing_id,assignment.sort_order
    from public.listing_display_assignments assignment
    join public.listing_operational_state state on state.listing_id=assignment.listing_id
    join public.listings listing on listing.id=assignment.listing_id
   where assignment.channel='홈' and assignment.active=true
     and assignment.section_key in ('home_row_sale','home_row_drop','home_row_new')
     and (assignment.starts_at is null or assignment.starts_at<=now())
     and (assignment.ends_at is null or assignment.ends_at>now())
     and state.approval_status='approved'
     and state.inspection_status in ('passed','legacy_waived')
     and state.sale_status='active' and state.inventory_status='available'
     and state.display_status='visible' and state.archived_at is null
     and listing.status='on_sale' and listing.reserved_order_id is null and listing.sold_order_id is null
      and (assignment.section_key<>'home_row_sale' or (
        listing.sale_price is not null and listing.sale_price>0 and listing.sale_price<listing.price
        and listing.tags @> array['sale']::text[] and listing.sale_started_at is not null
        and listing.sale_started_at + interval '72 hours' > now()
      ))
   order by assignment.section_key,assignment.sort_order,assignment.created_at,assignment.listing_id
$$;

create or replace function public.admin_set_catalog_home_section(
  p_key text,p_title text,p_subtitle text,p_listing_ids uuid[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=public.catalog_assert_admin(); v_section text; v_ids uuid[]:=coalesce(p_listing_ids,array[]::uuid[]);
  v_count integer; v_removed uuid[]:=array[]::uuid[]; v_state record;
begin
  v_section:=case p_key when 'home_row_sale' then '이번 주 특별가' when 'home_row_drop' then '기간 한정 특가'
    when 'home_row_new' then '최근 등록된 시계' else null end;
  if v_section is null then raise exception 'BAD_HOME_SECTION'; end if;
  if cardinality(v_ids)>20 then raise exception 'HOME_SECTION_LIMIT'; end if;
  select count(distinct item) into v_count from unnest(v_ids) item;
  if v_count<>cardinality(v_ids) then raise exception 'DUPLICATE_HOME_PRODUCT'; end if;
  if exists(
    select 1 from unnest(v_ids) item
    left join public.listings listing on listing.id=item
    left join public.listing_operational_state state on state.listing_id=item
    where listing.id is null or state.listing_id is null or state.approval_status<>'approved'
      or state.inspection_status not in ('passed','legacy_waived') or state.sale_status<>'active'
      or state.inventory_status<>'available' or state.display_status<>'visible' or state.archived_at is not null
      or listing.status<>'on_sale' or listing.reserved_order_id is not null or listing.sold_order_id is not null
  ) then raise exception 'HOME_PRODUCT_NOT_READY'; end if;
  if p_key='home_row_sale' and exists(
    select 1 from unnest(v_ids) item join public.listings listing on listing.id=item
     where listing.sale_price is null or listing.sale_price<=0 or listing.sale_price>=listing.price
       or not (listing.tags @> array['sale']::text[]) or listing.sale_started_at is null
       or listing.sale_started_at + interval '72 hours' <= now()
  ) then raise exception 'HOME_SALE_REQUIRED'; end if;

  select coalesce(array_agg(state.listing_id),array[]::uuid[]) into v_removed
    from public.listing_operational_state state
   where state.home_section=v_section and not (state.listing_id=any(v_ids));
  perform 1 from public.listings where id=any(v_ids||v_removed) for update;

  for v_state in
    select state.* from public.listing_operational_state state where state.listing_id=any(v_removed)
  loop
    perform public.catalog_sync_home_section(v_state.listing_id,null,v_actor,0,null,null);
    update public.listing_operational_state set home_section=null,display_sort_order=0,
      operation_version=operation_version+1,updated_at=now() where listing_id=v_state.listing_id;
    perform public.catalog_event(v_state.listing_id,v_actor,'홈 전시 해제','관리자 홈 화면 설정',null,null,
      jsonb_build_object('sectionKey',p_key));
  end loop;

  for v_state in
    select state.*,selected.ordinality::integer as selected_order
      from unnest(v_ids) with ordinality selected(item,ordinality)
      join public.listing_operational_state state on state.listing_id=selected.item
     order by selected.ordinality
  loop
    perform public.catalog_sync_home_section(v_state.listing_id,v_section,v_actor,v_state.selected_order,
      v_state.display_start_at,v_state.display_end_at);
    update public.listing_operational_state set home_section=v_section,display_sort_order=v_state.selected_order,
      operation_version=operation_version+1,updated_at=now() where listing_id=v_state.listing_id;
    perform public.catalog_event(v_state.listing_id,v_actor,'홈 전시 배치','관리자 홈 화면 설정',null,null,
      jsonb_build_object('sectionKey',p_key,'sortOrder',v_state.selected_order,
        'startsAt',v_state.display_start_at,'endsAt',v_state.display_end_at));
  end loop;

  insert into public.site_content(key,title,subtitle,body,images,updated_at)
  values(p_key,coalesce(nullif(trim(p_title),''),v_section),coalesce(p_subtitle,''),
    jsonb_build_object('productIds',to_jsonb(v_ids))::text,array[]::text[],now())
  on conflict(key) do update set title=excluded.title,subtitle=excluded.subtitle,body=excluded.body,updated_at=excluded.updated_at;
  return jsonb_build_object('ok',true,'key',p_key,'title',coalesce(nullif(trim(p_title),''),v_section),
    'subtitle',coalesce(p_subtitle,''),'body',jsonb_build_object('productIds',to_jsonb(v_ids)),'images','[]'::jsonb);
end $$;

drop policy if exists site_content_catalog_home_insert_guard on public.site_content;
create policy site_content_catalog_home_insert_guard on public.site_content as restrictive for insert to authenticated
  with check (key not in ('home_row_sale','home_row_drop','home_row_new'));
drop policy if exists site_content_catalog_home_update_guard on public.site_content;
create policy site_content_catalog_home_update_guard on public.site_content as restrictive for update to authenticated
  using (key not in ('home_row_sale','home_row_drop','home_row_new'))
  with check (key not in ('home_row_sale','home_row_drop','home_row_new'));
drop policy if exists site_content_catalog_home_delete_guard on public.site_content;
create policy site_content_catalog_home_delete_guard on public.site_content as restrictive for delete to authenticated
  using (key not in ('home_row_sale','home_row_drop','home_row_new'));

create or replace function public.admin_manage_listing(
  p_listing_id uuid,p_action text,p_payload jsonb default '{}'::jsonb,p_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=public.catalog_assert_admin(); v_listing public.listings%rowtype; v_state public.listing_operational_state%rowtype;
  v_before jsonb; v_after jsonb; v_price bigint; v_sale_price bigint; v_rate numeric; v_expected bigint;
  v_sale_active boolean; v_images text[]; v_channels text[]; v_tags text[]; v_target text;
  v_inventory text; v_location text; v_reason text:=trim(coalesce(p_reason,'')); v_version bigint;
  v_prior_rpc text:=coalesce(current_setting('bellore.catalog_rpc',true),'');
begin
  perform set_config('bellore.catalog_rpc','1',true);
  if p_action='save' then
    v_price:=greatest(coalesce(nullif(p_payload->>'price','')::bigint,0),0);
    v_sale_price:=nullif(p_payload->>'sale_price','')::bigint;
    v_rate:=coalesce(nullif(p_payload->>'commission_rate','')::numeric,0);
    v_sale_active:=coalesce((p_payload->>'sale_active')::boolean,false);
    if nullif(trim(p_payload->>'title'),'') is null then raise exception 'TITLE_REQUIRED'; end if;
    if v_price<=0 then raise exception 'PRICE_REQUIRED'; end if;
    if v_rate<0 or v_rate>1 then raise exception 'BAD_COMMISSION_RATE'; end if;
    if v_sale_active and (v_sale_price is null or v_sale_price<=0 or v_sale_price>=v_price) then raise exception 'BAD_SALE_PRICE'; end if;
    if not v_sale_active then v_sale_price:=null; end if;
    if nullif(p_payload->>'home_section','')='이번 주 특별가' and not v_sale_active then raise exception 'HOME_SALE_REQUIRED'; end if;
    v_expected:=floor(coalesce(v_sale_price,v_price)*(1-v_rate))::bigint;
    select coalesce(array_agg(value),array[]::text[]) into v_images from jsonb_array_elements_text(coalesce(p_payload->'image_urls','[]'::jsonb));
    select coalesce(array_agg(value),array['판매시계']::text[]) into v_channels from jsonb_array_elements_text(coalesce(p_payload->'display_channels','["판매시계"]'::jsonb));
    select coalesce(array_agg(value),array[]::text[]) into v_tags from jsonb_array_elements_text(coalesce(p_payload->'tags','[]'::jsonb));
    v_tags:=array_remove(v_tags,'sale'); if v_sale_active then v_tags:=array_append(v_tags,'sale'); end if;
    v_inventory:=coalesce(nullif(p_payload->>'inventory_status',''),'expected'); v_location:=nullif(p_payload->>'inventory_location','');
    if v_inventory not in ('expected','in_transit','available','reserved','shipping','sold','returned') then raise exception 'BAD_INVENTORY_STATUS'; end if;

    if p_listing_id is null then
      insert into public.listings(owner_id,title,description,reference_no,price,sale_price,category,status,tags,condition,pack,
        set_grade,size_mm,movement,case_spec,band_spec,stamping,components,condition_notes,dial_color,material,has_diamond,
        has_warranty,accessories,misu,purchase_year,special_note,ship_info,sale_method,detail_desc,image_urls,image_url,sale_started_at)
      values(v_actor,trim(p_payload->>'title'),nullif(trim(p_payload->>'description'),''),nullif(trim(p_payload->>'reference_no'),''),
        v_price,v_sale_price,coalesce(nullif(p_payload->>'category',''),'벨로르판매'),'hidden',v_tags,
        nullif(p_payload->>'condition',''),nullif(p_payload->>'pack',''),nullif(p_payload->>'set_grade',''),
        nullif(p_payload->>'size_mm','')::integer,nullif(p_payload->>'movement',''),nullif(p_payload->>'case_spec',''),
        nullif(p_payload->>'band_spec',''),nullif(p_payload->>'stamping',''),nullif(p_payload->>'components',''),
        nullif(p_payload->>'condition_notes',''),nullif(p_payload->>'dial_color',''),nullif(p_payload->>'material',''),
        coalesce((p_payload->>'has_diamond')::boolean,false),coalesce((p_payload->>'has_warranty')::boolean,false),
        nullif(p_payload->>'accessories',''),nullif(p_payload->>'misu',''),nullif(p_payload->>'purchase_year',''),
        nullif(p_payload->>'special_note',''),nullif(p_payload->>'ship_info',''),nullif(p_payload->>'sale_method',''),
        nullif(p_payload->>'detail_desc',''),v_images,v_images[1],case when v_sale_active then coalesce(nullif(p_payload->>'sale_started_at','')::timestamptz,now()) end)
      returning * into v_listing;
      update public.listing_operational_state set approval_status='draft',inspection_status='pending',sale_status='draft',
        inventory_status=v_inventory,inventory_location=v_location,custody_holder=nullif(p_payload->>'custody_holder',''),
        inventory_courier=nullif(p_payload->>'inventory_courier',''),inventory_tracking_no=nullif(p_payload->>'inventory_tracking_no',''),
        inventory_receiver=nullif(p_payload->>'inventory_receiver',''),inventory_received_at=nullif(p_payload->>'inventory_received_at','')::timestamptz,
        commission_rate=v_rate,expected_settlement=v_expected,display_channels=v_channels,home_section=nullif(p_payload->>'home_section',''),
        display_sort_order=coalesce(nullif(p_payload->>'display_sort_order','')::integer,0),
        display_start_at=nullif(p_payload->>'display_start_at','')::timestamptz,display_end_at=nullif(p_payload->>'display_end_at','')::timestamptz,
        assigned_admin_id=v_actor,updated_at=now() where listing_id=v_listing.id returning * into v_state;
      insert into public.listing_price_versions(listing_id,price,sale_price,commission_rate,expected_settlement,actor_user_id,reason)
      values(v_listing.id,v_price,v_sale_price,v_rate,v_expected,v_actor,'상품 최초 등록');
      insert into public.listing_inventory_movements(listing_id,to_status,to_location,actor_user_id,reason)
      values(v_listing.id,v_inventory,v_location,v_actor,'상품 최초 등록');
      insert into public.listing_display_assignments(listing_id,channel,sort_order,starts_at,ends_at,actor_user_id)
      select v_listing.id,channels.channel,coalesce(v_state.display_sort_order,0),v_state.display_start_at,v_state.display_end_at,v_actor
        from unnest(v_channels) as channels(channel) where channels.channel<>'홈';
      perform public.catalog_sync_home_section(v_listing.id,v_state.home_section,v_actor,v_state.display_sort_order,v_state.display_start_at,v_state.display_end_at);
      perform public.catalog_event(v_listing.id,v_actor,'상품 등록',null,null,jsonb_build_object('listing',to_jsonb(v_listing),'state',to_jsonb(v_state)));
    else
      if length(v_reason)<5 then raise exception 'REASON_REQUIRED'; end if;
      select * into v_listing from public.listings where id=p_listing_id for update; if not found then raise exception 'LISTING_NOT_FOUND'; end if;
      select * into v_state from public.listing_operational_state where listing_id=p_listing_id for update; if not found then raise exception 'LISTING_STATE_NOT_FOUND'; end if;
      if not (p_payload ? 'operation_version') or nullif(p_payload->>'operation_version','') is null then raise exception 'VERSION_REQUIRED'; end if;
      v_version:=nullif(p_payload->>'operation_version','')::bigint;
      if v_version<>v_state.operation_version then raise exception 'VERSION_CONFLICT'; end if;
       if v_listing.reserved_order_id is not null then raise exception 'CHECKOUT_RESERVATION_ACTIVE'; end if;
      if v_listing.sold_order_id is not null or v_listing.status='sold' then raise exception 'SOLD_LISTING_LOCKED'; end if;
      if v_inventory in ('reserved','sold') and v_inventory<>v_state.inventory_status then raise exception 'PAYMENT_OWNS_INVENTORY_STATE'; end if;
      v_before:=jsonb_build_object('listing',to_jsonb(v_listing),'state',to_jsonb(v_state));
      update public.listings set title=trim(p_payload->>'title'),description=nullif(trim(p_payload->>'description'),''),
        reference_no=nullif(trim(p_payload->>'reference_no'),''),price=v_price,sale_price=v_sale_price,
        category=coalesce(nullif(p_payload->>'category',''),category),tags=v_tags,condition=nullif(p_payload->>'condition',''),
        pack=nullif(p_payload->>'pack',''),set_grade=nullif(p_payload->>'set_grade',''),size_mm=nullif(p_payload->>'size_mm','')::integer,
        movement=nullif(p_payload->>'movement',''),case_spec=nullif(p_payload->>'case_spec',''),band_spec=nullif(p_payload->>'band_spec',''),
        stamping=nullif(p_payload->>'stamping',''),components=nullif(p_payload->>'components',''),condition_notes=nullif(p_payload->>'condition_notes',''),
        dial_color=nullif(p_payload->>'dial_color',''),material=nullif(p_payload->>'material',''),
        has_diamond=coalesce((p_payload->>'has_diamond')::boolean,false),has_warranty=coalesce((p_payload->>'has_warranty')::boolean,false),
        accessories=nullif(p_payload->>'accessories',''),misu=nullif(p_payload->>'misu',''),purchase_year=nullif(p_payload->>'purchase_year',''),
        special_note=nullif(p_payload->>'special_note',''),ship_info=nullif(p_payload->>'ship_info',''),sale_method=nullif(p_payload->>'sale_method',''),
        detail_desc=nullif(p_payload->>'detail_desc',''),image_urls=v_images,image_url=v_images[1],
        sale_started_at=case when v_sale_active then coalesce(nullif(p_payload->>'sale_started_at','')::timestamptz,sale_started_at,now()) end,updated_at=now()
      where id=p_listing_id returning * into v_listing;
      if row(v_listing.price,v_listing.sale_price,v_rate) is distinct from row((v_before->'listing'->>'price')::bigint,nullif(v_before->'listing'->>'sale_price','')::bigint,v_state.commission_rate) then
        update public.listing_price_versions set effective_until=now() where listing_id=p_listing_id and effective_until is null;
        insert into public.listing_price_versions(listing_id,price,sale_price,commission_rate,expected_settlement,actor_user_id,reason)
        values(p_listing_id,v_price,v_sale_price,v_rate,v_expected,v_actor,v_reason);
      end if;
      if v_inventory is distinct from v_state.inventory_status or v_location is distinct from v_state.inventory_location then
        insert into public.listing_inventory_movements(listing_id,from_status,to_status,from_location,to_location,actor_user_id,reason)
        values(p_listing_id,v_state.inventory_status,v_inventory,v_state.inventory_location,v_location,v_actor,v_reason);
      end if;
      update public.listing_operational_state set inventory_status=v_inventory,inventory_location=v_location,
        custody_holder=nullif(p_payload->>'custody_holder',''),inventory_courier=nullif(p_payload->>'inventory_courier',''),
        inventory_tracking_no=nullif(p_payload->>'inventory_tracking_no',''),inventory_receiver=nullif(p_payload->>'inventory_receiver',''),
        inventory_received_at=nullif(p_payload->>'inventory_received_at','')::timestamptz,commission_rate=v_rate,expected_settlement=v_expected,
        display_channels=v_channels,home_section=nullif(p_payload->>'home_section',''),display_sort_order=coalesce(nullif(p_payload->>'display_sort_order','')::integer,0),
        display_start_at=nullif(p_payload->>'display_start_at','')::timestamptz,display_end_at=nullif(p_payload->>'display_end_at','')::timestamptz,
        assigned_admin_id=coalesce(assigned_admin_id,v_actor),
        sale_status=case when v_inventory<>'available' then 'paused' else sale_status end,
        display_status=case when v_inventory<>'available' then 'hidden' else display_status end,
        operation_version=operation_version+1,updated_at=now()
      where listing_id=p_listing_id returning * into v_state;
      if v_inventory<>'available' then
        update public.listings set status=case when status='sold' then status else 'hidden' end,updated_at=now()
          where id=p_listing_id returning * into v_listing;
      end if;
      delete from public.listing_display_assignments where listing_id=p_listing_id and channel<>'홈';
      insert into public.listing_display_assignments(listing_id,channel,sort_order,starts_at,ends_at,actor_user_id)
      select p_listing_id,channels.channel,coalesce(v_state.display_sort_order,0),v_state.display_start_at,v_state.display_end_at,v_actor
        from unnest(v_channels) as channels(channel) where channels.channel<>'홈';
      perform public.catalog_sync_home_section(p_listing_id,v_state.home_section,v_actor,v_state.display_sort_order,v_state.display_start_at,v_state.display_end_at);
      v_after:=jsonb_build_object('listing',to_jsonb(v_listing),'state',to_jsonb(v_state));
      perform public.catalog_event(p_listing_id,v_actor,'상품 정보 변경',v_reason,v_before,v_after);
    end if;

  elsif p_action in ('set_approval','set_inspection','set_visibility','set_sale','archive','restore') then
    if length(v_reason)<5 then raise exception 'REASON_REQUIRED'; end if;
    select * into v_listing from public.listings where id=p_listing_id for update; if not found then raise exception 'LISTING_NOT_FOUND'; end if;
    select * into v_state from public.listing_operational_state where listing_id=p_listing_id for update; if not found then raise exception 'LISTING_STATE_NOT_FOUND'; end if;
    if not (p_payload ? 'operation_version') or nullif(p_payload->>'operation_version','') is null then raise exception 'VERSION_REQUIRED'; end if;
    v_version:=nullif(p_payload->>'operation_version','')::bigint;
    if v_version<>v_state.operation_version then raise exception 'VERSION_CONFLICT'; end if;
    if v_listing.reserved_order_id is not null then raise exception 'CHECKOUT_RESERVATION_ACTIVE'; end if;
    v_before:=jsonb_build_object('listing',to_jsonb(v_listing),'state',to_jsonb(v_state)); v_target:=p_payload->>'status';
    if p_action='set_approval' then
      if v_target not in ('pending','approved','rejected') then raise exception 'BAD_APPROVAL_STATUS'; end if;
      if v_target='approved' and v_state.inspection_status not in ('passed','legacy_waived') then raise exception 'INSPECTION_REQUIRED'; end if;
      if v_target='approved' and (v_listing.price<=0 or (v_listing.image_url is null and coalesce(array_length(v_listing.image_urls,1),0)=0))
        then raise exception 'LISTING_CONTENT_REQUIRED'; end if;
      update public.listing_operational_state set approval_status=v_target,approved_by=case when v_target='approved' then v_actor end,
        approved_at=case when v_target='approved' then now() end,
        sale_status=case when v_target='rejected' then 'paused' else sale_status end,
        display_status=case when v_target='rejected' then 'hidden' else display_status end,
        operation_version=operation_version+1,updated_at=now()
      where listing_id=p_listing_id returning * into v_state;
      if v_target='rejected' then update public.listings set status=case when status='sold' then status else 'hidden' end,updated_at=now() where id=p_listing_id returning * into v_listing; end if;
    elsif p_action='set_inspection' then
      if v_target not in ('in_progress','passed','rejected') then raise exception 'BAD_INSPECTION_STATUS'; end if;
      update public.listing_operational_state set inspection_status=v_target,
        approval_status=case when v_target='rejected' then 'rejected' else approval_status end,
        sale_status=case when v_target='rejected' then 'paused' else sale_status end,
        display_status=case when v_target='rejected' then 'hidden' else display_status end,
        operation_version=operation_version+1,updated_at=now() where listing_id=p_listing_id returning * into v_state;
      if v_target='rejected' then update public.listings set status=case when status='sold' then status else 'hidden' end,updated_at=now() where id=p_listing_id returning * into v_listing; end if;
    elsif p_action='set_sale' then
      if v_target not in ('active','paused') then raise exception 'BAD_SALE_STATUS'; end if;
      if v_target='active' and (v_state.approval_status<>'approved' or v_state.inspection_status not in ('passed','legacy_waived')
        or v_state.inventory_status<>'available' or v_state.archived_at is not null or v_listing.price<=0
        or (v_listing.image_url is null and coalesce(array_length(v_listing.image_urls,1),0)=0)) then raise exception 'LISTING_NOT_READY'; end if;
      update public.listing_operational_state set sale_status=v_target,display_status=case when v_target='paused' then 'hidden' else display_status end,
        operation_version=operation_version+1,updated_at=now() where listing_id=p_listing_id returning * into v_state;
      if v_target='paused' then update public.listings set status=case when status='sold' then status else 'hidden' end,updated_at=now() where id=p_listing_id returning * into v_listing; end if;
    elsif p_action='set_visibility' then
      if v_target not in ('visible','hidden','scheduled') then raise exception 'BAD_DISPLAY_STATUS'; end if;
      if v_target='visible' and (v_state.approval_status<>'approved' or v_state.inspection_status not in ('passed','legacy_waived')
        or v_state.sale_status<>'active' or v_state.inventory_status<>'available' or v_state.archived_at is not null or v_listing.price<=0
        or (v_listing.image_url is null and coalesce(array_length(v_listing.image_urls,1),0)=0)) then raise exception 'LISTING_NOT_READY'; end if;
      update public.listing_operational_state set display_status=v_target,operation_version=operation_version+1,updated_at=now()
        where listing_id=p_listing_id returning * into v_state;
      update public.listings set status=case when v_target='visible' then 'on_sale' when status='sold' then status else 'hidden' end,updated_at=now()
        where id=p_listing_id returning * into v_listing;
    elsif p_action='archive' then
      update public.listing_operational_state set archived_at=now(),archived_by=v_actor,archive_reason=v_reason,sale_status='paused',display_status='hidden',home_section=null,
        operation_version=operation_version+1,updated_at=now() where listing_id=p_listing_id returning * into v_state;
      update public.listings set status=case when status='sold' then status else 'hidden' end,updated_at=now() where id=p_listing_id returning * into v_listing;
      perform public.catalog_sync_home_section(p_listing_id,null,v_actor,0,null,null);
    else
      update public.listing_operational_state set archived_at=null,archived_by=null,archive_reason=null,sale_status='paused',display_status='hidden',
        operation_version=operation_version+1,updated_at=now() where listing_id=p_listing_id returning * into v_state;
      update public.listings set status=case when status='sold' then status else 'hidden' end,updated_at=now() where id=p_listing_id returning * into v_listing;
    end if;
    v_after:=jsonb_build_object('listing',to_jsonb(v_listing),'state',to_jsonb(v_state));
    perform public.catalog_event(p_listing_id,v_actor,case p_action when 'set_approval' then '승인 상태 변경' when 'set_inspection' then '검수 상태 변경'
      when 'set_visibility' then '전시 상태 변경' when 'set_sale' then '판매 상태 변경' when 'archive' then '상품 보관' else '보관 해제' end,
      v_reason,v_before,v_after);

  elsif p_action='delete_draft' then
    if length(v_reason)<5 then raise exception 'REASON_REQUIRED'; end if;
    select * into v_listing from public.listings where id=p_listing_id for update; if not found then raise exception 'LISTING_NOT_FOUND'; end if;
    select * into v_state from public.listing_operational_state where listing_id=p_listing_id for update; if not found then raise exception 'LISTING_STATE_NOT_FOUND'; end if;
    if not (p_payload ? 'operation_version') or nullif(p_payload->>'operation_version','') is null then raise exception 'VERSION_REQUIRED'; end if;
    v_version:=nullif(p_payload->>'operation_version','')::bigint;
    if v_version<>v_state.operation_version then raise exception 'VERSION_CONFLICT'; end if;
    perform public.catalog_event(p_listing_id,v_actor,'초안 영구삭제',v_reason,jsonb_build_object('listing',to_jsonb(v_listing),'state',to_jsonb(v_state)),null);
    delete from public.listings where id=p_listing_id;
    perform set_config('bellore.catalog_rpc',v_prior_rpc,true);
    return jsonb_build_object('ok',true,'deleted',true,'productNo',v_listing.product_no);
  else raise exception 'BAD_ACTION'; end if;

  select * into v_listing from public.listings where id=coalesce(p_listing_id,v_listing.id);
  select * into v_state from public.listing_operational_state where listing_id=v_listing.id;
  perform set_config('bellore.catalog_rpc',v_prior_rpc,true);
  return jsonb_build_object('ok',true,'listing',to_jsonb(v_listing),'operationalState',to_jsonb(v_state));
end $$;

revoke execute on function public.catalog_assert_admin(),public.catalog_event(uuid,uuid,text,text,jsonb,jsonb,jsonb),
  public.catalog_body_product_ids(text),public.catalog_sync_home_section(uuid,text,uuid,integer,timestamptz,timestamptz)
  from public,anon,authenticated,service_role;
revoke execute on function public.catalog_home_assignments_v1() from public;
grant execute on function public.catalog_home_assignments_v1() to anon,authenticated;
revoke execute on function public.admin_set_catalog_home_section(text,text,text,uuid[]) from public,anon;
grant execute on function public.admin_set_catalog_home_section(text,text,text,uuid[]) to authenticated;
revoke execute on function public.admin_manage_listing(uuid,text,jsonb,text) from public,anon;
grant execute on function public.admin_manage_listing(uuid,text,jsonb,text) to authenticated;

notify pgrst,'reload schema';
