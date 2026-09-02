alter table public.orders
  add column if not exists cancel_inspected_at timestamptz,
  add column if not exists cancel_inspected_by uuid references auth.users(id) on delete set null,
  add column if not exists cancel_inspection_memo text;

create or replace function public.order_request_cancel(p_order_no text, p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_new_status text;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  perform public.assert_payment_operation_open_v1(p_order_no);
  select * into v_order from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_order.customer_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_order.status = 'pending' then
    v_new_status := 'canceled';
    perform set_config('app.customer_pending_cancel_v1', 'allowed', true);
  elsif v_order.status in ('paid', 'inspecting', 'preparing', 'shipping', 'delivered') then
    v_new_status := 'cancel_req';
  elsif v_order.status = 'cancel_req' then return 'cancel_req';
  else raise exception 'BAD_STATE';
  end if;
  update public.orders set status=v_new_status,
    cancel_reason=coalesce(nullif(left(trim(p_reason),300),''),cancel_reason),
    cancel_inspected_at=case when v_new_status='cancel_req' then null else cancel_inspected_at end,
    cancel_inspected_by=case when v_new_status='cancel_req' then null else cancel_inspected_by end,
    cancel_inspection_memo=case when v_new_status='cancel_req' then null else cancel_inspection_memo end
  where id=v_order.id;
  return v_new_status;
end $$;
revoke all on function public.order_request_cancel(text,text) from public, anon;
grant execute on function public.order_request_cancel(text,text) to authenticated;

create or replace function public.admin_mark_order_cancel_inspected(p_order_no text,p_memo text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_order public.orders%rowtype;
begin
  if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and role='admin' and approved=true and coalesce(suspended,false)=false) then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where order_no=p_order_no for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_order.status <> 'cancel_req' then raise exception 'BAD_STATE'; end if;
  update public.orders set cancel_inspected_at=coalesce(cancel_inspected_at,now()), cancel_inspected_by=coalesce(cancel_inspected_by,v_uid), cancel_inspection_memo=coalesce(nullif(left(trim(p_memo),1000),''),cancel_inspection_memo) where id=v_order.id;
  insert into public.notifications(user_id,type,title,body,ref_id)
  select v_order.customer_id,'order_cancel_inspected','정밀검수 완료',coalesce(v_order.product_name,'상품')||'의 정밀검수가 완료되어 취소 처리를 준비하고 있습니다.',v_order.order_no where v_order.customer_id is not null;
  return true;
end $$;
revoke all on function public.admin_mark_order_cancel_inspected(text,text) from public, anon;
grant execute on function public.admin_mark_order_cancel_inspected(text,text) to authenticated;

create or replace function private.require_cancel_inspection_before_refund()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status = 'cancel_req'
     and new.status in ('canceled', 'refund_pending', 'refunded')
     and old.cancel_inspected_at is null then
    raise exception 'CANCEL_INSPECTION_REQUIRED';
  end if;
  return new;
end $$;
revoke all on function private.require_cancel_inspection_before_refund() from public, anon, authenticated;
drop trigger if exists trg_require_cancel_inspection_before_refund on public.orders;
create trigger trg_require_cancel_inspection_before_refund before update of status on public.orders for each row when (old.status='cancel_req' and new.status is distinct from old.status) execute function private.require_cancel_inspection_before_refund();

create or replace function private.enqueue_order_cancel_request()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_previous_label text;
begin
  v_previous_label:=case old.status when 'paid' then '결제완료' when 'inspecting' then '상품검수' when 'preparing' then '배송준비중' when 'shipping' then '배송중' when 'delivered' then '배송완료' else old.status end;
  insert into public.telegram_ops_outbox (dedupe_key, event_type, target, payload)
  values ('order_cancel_requested:'||new.id::text||':'||txid_current()::text,
    'order_cancel_requested', 'order_room',
    jsonb_build_object('orderId',new.id,'orderNo',new.order_no,'productName',coalesce(new.product_name,''),'productImage',coalesce(new.product_image,''),'amount',coalesce(new.amount,0),'previousStatus',old.status,'previousStatusLabel',v_previous_label,'cancelReason',coalesce(new.cancel_reason,''),'buyerName',coalesce(new.buyer_name,''),'buyerPhone',coalesce(new.buyer_phone,''),'courier',coalesce(new.courier,''),'trackingNo',coalesce(new.tracking_no,''),'requestedAt',now()));
  insert into public.notifications(user_id,type,title,body,ref_id)
  select p.id,'order_cancel_request','주문취소 요청',coalesce(new.product_name,'상품')||' · '||new.order_no,new.order_no from public.profiles p where p.role='admin' and p.approved=true and coalesce(p.suspended,false)=false;
  return new;
end $$;
revoke all on function private.enqueue_order_cancel_request() from public, anon, authenticated;
drop trigger if exists trg_telegram_order_cancel_request on public.orders;
create trigger trg_telegram_order_cancel_request after update of status on public.orders for each row when (new.status='cancel_req' and old.status is distinct from new.status) execute function private.enqueue_order_cancel_request();
