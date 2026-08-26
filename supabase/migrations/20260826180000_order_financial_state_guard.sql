-- Browser/admin table updates may advance an already-paid order through the
-- operational fulfilment flow, but provider-owned financial state and value
-- must only be changed by service-role payment functions.

create or replace function public.guard_order_money_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and (
    (
      new.status is distinct from old.status
      and (
        old.status in (
          'pending','payment_review','failed','canceled','refund_pending','refunded'
        )
        or new.status in (
          'pending','payment_review','failed','canceled','refund_pending','refunded'
        )
        or new.status = 'paid'
      )
      and not (
        old.status = 'pending'
        and new.status = 'canceled'
        and current_setting('app.customer_pending_cancel_v1', true) = 'allowed'
        and old.customer_id = auth.uid()
      )
    )
    or new.amount is distinct from old.amount
    or new.discount is distinct from old.discount
    or new.product_price is distinct from old.product_price
    or new.method is distinct from old.method
    or new.payment_key is distinct from old.payment_key
    or new.provider_transaction_id is distinct from old.provider_transaction_id
    or new.receipt_url is distinct from old.receipt_url
    or new.paid_at is distinct from old.paid_at
    or new.refund_amount is distinct from old.refund_amount
    or new.refunded_at is distinct from old.refunded_at
    or new.checkout_token_hash is distinct from old.checkout_token_hash
    or new.checkout_request_key_hash is distinct from old.checkout_request_key_hash
    or new.refund_intent_code is distinct from old.refund_intent_code
    or new.payment_contract_version is distinct from old.payment_contract_version
    or new.restock_required is distinct from old.restock_required
    or new.payment_review_required is distinct from old.payment_review_required
    or new.payment_terminal_at is distinct from old.payment_terminal_at
    or new.id is distinct from old.id
    or new.order_no is distinct from old.order_no
    or new.customer_id is distinct from old.customer_id
    or new.listing_id is distinct from old.listing_id
    or new.coupon_user_id is distinct from old.coupon_user_id
    or new.pay_type is distinct from old.pay_type
  ) then
    raise exception 'payment_fields_are_server_owned';
  end if;
  return new;
end $$;

revoke all on function public.guard_order_money_fields()
  from public, anon, authenticated;

drop trigger if exists trg_guard_order_money_fields on public.orders;
create trigger trg_guard_order_money_fields
  before update on public.orders
  for each row execute function public.guard_order_money_fields();

-- Preserve the existing customer cancellation contract without allowing a
-- direct browser table update to cross the payment-state boundary. The local
-- transaction marker exists only around this owner-checked SECURITY DEFINER
-- update and is consumed by guard_order_money_fields above.
create or replace function public.order_request_cancel(
  p_order_no text,
  p_reason text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_new_status text;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  perform public.assert_payment_operation_open_v1(p_order_no);
  select * into v_order
    from public.orders
   where order_no = p_order_no
   for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_order.customer_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;

  if v_order.status = 'pending' then
    v_new_status := 'canceled';
    perform set_config('app.customer_pending_cancel_v1', 'allowed', true);
  elsif v_order.status in ('paid','inspecting','preparing') then
    v_new_status := 'cancel_req';
  else
    raise exception 'BAD_STATE';
  end if;

  update public.orders
     set status = v_new_status,
         cancel_reason = coalesce(p_reason, cancel_reason)
   where id = v_order.id;
  return v_new_status;
end $$;

revoke all on function public.order_request_cancel(text,text)
  from public, anon;
grant execute on function public.order_request_cancel(text,text)
  to authenticated;
