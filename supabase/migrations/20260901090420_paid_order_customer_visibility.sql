-- A checkout attempt is not a customer order until the provider payment has
-- been verified and paid_at has been committed by the service-only finalizer.
-- Administrators retain their separate all-row policy for reconciliation.
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated
  using (
    (select auth.uid()) = customer_id
    and paid_at is not null
  );

comment on policy orders_select_own on public.orders is
  'Customers can read only provider-verified paid orders; pending checkout attempts remain service/admin-only.';
