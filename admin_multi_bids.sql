-- 메인관리자 대리 견적: 업체명을 직접 지정하고 같은 견적에 여러 입찰을 추가한다.
-- 기존 업체 계정 입찰은 계정당 최신 1건을 수정하는 프론트 로직을 유지한다.

alter table public.bids
  add column if not exists vendor_name text,
  add column if not exists created_by_admin boolean not null default false;

-- 기존 (quote_request_id, vendor_id) UNIQUE 제약은 관리자 계정의 복수 대리입찰을 막는다.
-- 실제 제약 이름이 환경마다 달라도 두 컬럼으로 구성된 UNIQUE 제약만 정확히 제거한다.
do $$
declare
  item record;
begin
  for item in
    select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'bids'
       and c.contype = 'u'
       and (
         select array_agg(a.attname::text order by a.attname::text)
           from unnest(c.conkey) as key(attnum)
           join pg_attribute a on a.attrelid = t.oid and a.attnum = key.attnum
       ) = array['quote_request_id', 'vendor_id']::text[]
  loop
    execute format('alter table public.bids drop constraint %I', item.conname);
  end loop;
end $$;

create index if not exists bids_quote_vendor_idx
  on public.bids (quote_request_id, vendor_id, created_at desc);

alter table public.bids enable row level security;

drop policy if exists bids_admin_all on public.bids;
create policy bids_admin_all on public.bids
  for all
  using (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'admin'
    )
  );

comment on column public.bids.vendor_name is
  '입찰 당시 업체명 스냅샷. 관리자가 대리입찰 업체명을 직접 지정할 때 사용';
comment on column public.bids.created_by_admin is
  '메인관리자가 업체를 대신해 추가한 중복 견적 여부';
