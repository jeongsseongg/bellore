drop policy if exists "site_content write" on public.site_content;

create policy "site_content write"
  on public.site_content
  for all
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
        and p.approved is true
        and coalesce(p.suspended, false) is false
    )
  )
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
        and p.approved is true
        and coalesce(p.suspended, false) is false
    )
  );
