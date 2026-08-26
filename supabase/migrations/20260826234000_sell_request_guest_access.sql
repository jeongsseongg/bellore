create extension if not exists pgcrypto;

create table if not exists public.sell_service_requests (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique default ('BLR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  owner_user_id uuid references auth.users(id) on delete set null,
  method text not null check (method in ('compare', 'consignment', 'instant')),
  status text not null default 'reviewing',
  customer_name text not null,
  customer_phone text not null,
  brand text not null,
  model text not null,
  item_ref text,
  item_year text,
  item_parts text,
  item_memo text,
  photo_urls text[] not null default '{}',
  quote_request_id uuid references public.quote_requests(id) on delete set null,
  source text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sell_service_requests_owner_created_idx
  on public.sell_service_requests(owner_user_id, created_at desc);

create table if not exists public.guest_sell_access_tokens (
  token_hash text primary key,
  request_id uuid not null references public.sell_service_requests(id) on delete cascade,
  token_kind text not null check (token_kind in ('link', 'session')),
  expires_at timestamptz not null,
  used_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists guest_sell_access_tokens_request_idx
  on public.guest_sell_access_tokens(request_id, expires_at desc);

create table if not exists public.guest_sell_access_attempts (
  id bigint generated always as identity primary key,
  scope text not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists guest_sell_access_attempts_lookup_idx
  on public.guest_sell_access_attempts(scope, key_hash, created_at desc);

alter table public.sell_service_requests enable row level security;
alter table public.guest_sell_access_tokens enable row level security;
alter table public.guest_sell_access_attempts enable row level security;

revoke all on table public.sell_service_requests from anon, authenticated;
revoke all on table public.guest_sell_access_tokens from anon, authenticated;
revoke all on table public.guest_sell_access_attempts from anon, authenticated;
grant select on table public.sell_service_requests to authenticated;

drop policy if exists sell_service_requests_owner_select on public.sell_service_requests;
create policy sell_service_requests_owner_select
  on public.sell_service_requests for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = owner_user_id);

comment on table public.sell_service_requests is
  '회원은 owner_user_id로, 비회원은 Edge Function이 발급한 토큰과 휴대폰 본인인증으로만 조회하는 시계판매 신청 정본';
comment on table public.guest_sell_access_tokens is
  '원문 토큰을 저장하지 않는 비회원 시계판매 일회용 링크 및 인증 세션';