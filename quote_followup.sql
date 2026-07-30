-- 판매 확정 후 벨로르가 고객·업체 연락과 거래 완료 상태를 관리한다.
-- 업체 전화번호는 관리자 대리 견적에만 저장되며 고객에게 공개하지 않는다.
alter table public.quote_requests
  add column if not exists customer_contacted boolean not null default false,
  add column if not exists vendor_contacted boolean not null default false,
  add column if not exists trade_completed boolean not null default false,
  add column if not exists followup_updated_at timestamptz;

-- 업체 연락처는 고객도 읽을 수 있는 bids 행에 두지 않는다.
-- bids.id의 실제 자료형을 그대로 사용해 관리자 전용 테이블을 만든다.
do $$
declare
  bid_id_type text;
begin
  if to_regclass('public.bid_admin_contacts') is null then
    select format_type(a.atttypid, a.atttypmod)
      into bid_id_type
      from pg_attribute a
     where a.attrelid = 'public.bids'::regclass
       and a.attname = 'id'
       and not a.attisdropped;

    execute format(
      'create table public.bid_admin_contacts (
         bid_id %s primary key references public.bids(id) on delete cascade,
         vendor_phone text,
         updated_at timestamptz not null default now()
       )',
      bid_id_type
    );
  end if;
end $$;

alter table public.bid_admin_contacts enable row level security;

drop policy if exists bid_admin_contacts_admin_all on public.bid_admin_contacts;
create policy bid_admin_contacts_admin_all on public.bid_admin_contacts
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

comment on column public.quote_requests.customer_contacted is '판매 확정 후 벨로르의 고객 연락 완료 여부';
comment on column public.quote_requests.vendor_contacted is '판매 확정 후 벨로르의 업체 연락 완료 여부';
comment on column public.quote_requests.trade_completed is '벨로르 중개 거래 최종 완료 여부';
comment on table public.bid_admin_contacts is '관리자 대리 견적 업체 연락처. 관리자만 접근 가능';
