create or replace function public.telegram_ops_advance_order(
  p_input_key text, p_action text, p_courier text, p_tracking_no text,
  p_actor_telegram_id text, p_chat_id text, p_dedupe_key text
) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare
  v_item public.telegram_ops_items%rowtype;
  v_order public.orders%rowtype;
  v_status text;
  v_title text;
  v_result jsonb;
begin
  select details into v_result from public.telegram_ops_audit where dedupe_key=p_dedupe_key;
  if v_result is not null then return v_result || jsonb_build_object('duplicate',true); end if;
  select * into v_item from public.telegram_ops_items
   where input_key=p_input_key and kind='order' and status in ('active','approved') for update;
  if not found then raise exception 'ORDER_KEY_NOT_FOUND'; end if;
  select * into v_order from public.orders where id=v_item.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if p_action='inspection_complete' then
    if v_order.status <> 'inspecting' then raise exception 'ORDER_NOT_INSPECTING'; end if;
    v_status:='preparing'; v_title:='상품 검수완료';
  elsif p_action='shipping' then
    if v_order.status <> 'preparing' then raise exception 'ORDER_NOT_PREPARING'; end if;
    if coalesce(v_order.fulfillment_method,'delivery')='pickup' then raise exception 'ORDER_PICKUP_EXPECTED'; end if;
    if nullif(btrim(coalesce(p_courier,'')),'') is null or nullif(btrim(coalesce(p_tracking_no,'')),'') is null then raise exception 'ORDER_TRACKING_REQUIRED'; end if;
    v_status:='shipping'; v_title:='배송 시작';
  elsif p_action='delivered' then
    if v_order.status <> 'shipping' then raise exception 'ORDER_NOT_SHIPPING'; end if;
    v_status:='delivered'; v_title:='배송완료';
  elsif p_action='pickup_delivered' then
    if v_order.status <> 'preparing' then raise exception 'ORDER_NOT_PREPARING'; end if;
    if coalesce(v_order.fulfillment_method,'delivery') <> 'pickup' then raise exception 'ORDER_DELIVERY_EXPECTED'; end if;
    v_status:='delivered'; v_title:='매장 픽업완료';
  else raise exception 'ORDER_ACTION_INVALID';
  end if;

  update public.orders set status=v_status,
    courier=case when p_action='shipping' then left(btrim(p_courier),60) else courier end,
    tracking_no=case when p_action='shipping' then left(btrim(p_tracking_no),80) else tracking_no end
  where id=v_order.id;

  v_result:=jsonb_build_object('ok',true,'orderId',v_order.id,'orderNo',v_order.order_no,
    'inputKey',p_input_key,'status',v_status,'statusLabel',v_title,'title',v_title,
    'courier',case when p_action='shipping' then left(btrim(p_courier),60) else v_order.courier end,
    'trackingNo',case when p_action='shipping' then left(btrim(p_tracking_no),80) else v_order.tracking_no end);
  insert into public.telegram_ops_audit(dedupe_key,actor_telegram_id,chat_id,action,input_key,result,details)
  values(p_dedupe_key,p_actor_telegram_id,p_chat_id,'order_'||p_action,p_input_key,'success',v_result);
  return v_result;
end $$;

revoke all on function public.telegram_ops_advance_order(text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.telegram_ops_advance_order(text,text,text,text,text,text,text) to service_role;

create or replace function private.notify_order_lifecycle()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_title text; v_body text; v_input_key text;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_title:=case new.status
    when 'inspecting' then '주문이 승인되었습니다'
    when 'preparing' then '상품 검수가 완료되었습니다'
    when 'shipping' then '배송이 시작되었습니다'
    when 'delivered' then '배송이 완료되었습니다'
    when 'confirmed' then '구매가 확정되었습니다'
    when 'cancel_req' then '주문취소 요청이 접수되었습니다'
    when 'refund_pending' then '환불을 처리하고 있습니다'
    when 'refunded' then '환불이 완료되었습니다'
    when 'canceled' then '주문이 취소되었습니다'
    when 'return_req' then '반품 요청이 접수되었습니다'
    when 'exchange_req' then '교환 요청이 접수되었습니다'
    when 'returning' then '상품을 회수하고 있습니다'
    when 'done' then '교환·반품 처리가 완료되었습니다'
    else null end;
  if v_title is null then return new; end if;
  v_body:=coalesce(new.product_name,'상품')||' · 주문번호 '||new.order_no;
  if new.status='shipping' then v_body:=v_body||' · '||coalesce(new.courier,'택배')||' '||coalesce(new.tracking_no,''); end if;
  if new.customer_id is not null then
    insert into public.notifications(user_id,type,title,body,is_read,ref_id)
    values(new.customer_id,'order_'||new.status,v_title,v_body,false,new.order_no);
  end if;
  select input_key into v_input_key from public.telegram_ops_items where order_id=new.id order by created_at desc limit 1;
  if new.status <> 'cancel_req' then
    insert into public.telegram_ops_outbox(dedupe_key,event_type,target,payload)
    values('order_status:'||new.id::text||':'||old.status||':'||new.status||':'||txid_current()::text,
      'order_status_changed','order_room',jsonb_build_object(
        'orderId',new.id,'orderNo',new.order_no,'inputKey',coalesce(v_input_key,''),
        'status',new.status,'statusLabel',v_title,'productName',coalesce(new.product_name,''),
        'buyerName',coalesce(new.buyer_name,''),'buyerPhone',coalesce(new.buyer_phone,''),
        'courier',coalesce(new.courier,''),'trackingNo',coalesce(new.tracking_no,''),
        'fulfillmentMethod',coalesce(new.fulfillment_method,'delivery'),'changedAt',now()
      )) on conflict(dedupe_key) do nothing;
  end if;
  return new;
end $$;

revoke all on function private.notify_order_lifecycle() from public, anon, authenticated;
drop trigger if exists trg_notify_order_lifecycle on public.orders;
create trigger trg_notify_order_lifecycle after update of status on public.orders
for each row when (new.status is distinct from old.status)
execute function private.notify_order_lifecycle();
