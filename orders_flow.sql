-- ============================================================
-- 벨로르(BELLORE) · 주문→배송→교환/반품 전체 플로우
-- Supabase 대시보드 > SQL Editor 에 "전체 복붙" 후 RUN (1회).
-- 여러 번 실행해도 안전(if not exists / create or replace / drop).
-- ============================================================

-- ------------------------------------------------------------
-- 1) orders 테이블에 배송/취소/환불 컬럼 추가
-- ------------------------------------------------------------
alter table public.orders add column if not exists ship_recipient text;   -- 수령인
alter table public.orders add column if not exists ship_phone     text;   -- 수령인 연락처
alter table public.orders add column if not exists ship_postcode  text;   -- 우편번호
alter table public.orders add column if not exists ship_addr1     text;   -- 기본주소
alter table public.orders add column if not exists ship_addr2     text;   -- 상세주소
alter table public.orders add column if not exists ship_request   text;   -- 배송요청사항
alter table public.orders add column if not exists courier        text;   -- 택배사
alter table public.orders add column if not exists tracking_no    text;   -- 운송장번호
alter table public.orders add column if not exists shipped_at     timestamptz; -- 발송일
alter table public.orders add column if not exists delivered_at   timestamptz; -- 배송완료일
alter table public.orders add column if not exists confirmed_at   timestamptz; -- 구매확정일
alter table public.orders add column if not exists cancel_reason  text;
alter table public.orders add column if not exists canceled_at    timestamptz;
alter table public.orders add column if not exists refund_amount  bigint;
alter table public.orders add column if not exists refunded_at    timestamptz;
alter table public.orders add column if not exists admin_memo     text;
-- (createOrder 에서 쓰는 쿠폰/할인 컬럼 — 없으면 추가)
alter table public.orders add column if not exists coupon_user_id uuid;
alter table public.orders add column if not exists discount       bigint default 0;

-- status 흐름(문자값, 강제 제약은 두지 않음):
--  pending(결제대기) → paid(결제완료) → inspecting(정품검수) → preparing(상품준비중)
--   → shipping(배송중) → delivered(배송완료) → confirmed(구매확정)
--  곁가지: canceled(취소) / cancel_req(취소요청) / refunded(환불완료)
--          return_req(반품요청) / exchange_req(교환요청) / returning(회수중) / done

create index if not exists orders_tracking_idx on public.orders (tracking_no);

-- ------------------------------------------------------------
-- 2) 주문 상태 변경 이력 (분쟁 대비 · 타임라인 표시용)
-- ------------------------------------------------------------
create table if not exists public.order_status_history (
  id          bigserial primary key,
  order_id    uuid references public.orders(id) on delete cascade,
  from_status text,
  to_status   text,
  note        text,
  changed_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists osh_order_idx on public.order_status_history (order_id, created_at);

alter table public.order_status_history enable row level security;

drop policy if exists osh_select_own on public.order_status_history;
create policy osh_select_own on public.order_status_history
  for select using (
    exists (select 1 from public.orders o
            where o.id = order_id and o.customer_id = auth.uid())
  );

drop policy if exists osh_admin_all on public.order_status_history;
create policy osh_admin_all on public.order_status_history
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ------------------------------------------------------------
-- 3) 상태 변경 시 자동: 타임스탬프 갱신 + 이력 기록
-- ------------------------------------------------------------
-- 3-1) 단계별 시각 자동 기록 (BEFORE UPDATE)
create or replace function public.bl_touch_order_stamps()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'shipping'  and new.shipped_at   is null then new.shipped_at   := now(); end if;
    if new.status = 'delivered' and new.delivered_at is null then new.delivered_at := now(); end if;
    if new.status = 'confirmed' and new.confirmed_at is null then new.confirmed_at := now(); end if;
    if new.status = 'canceled'  and new.canceled_at  is null then new.canceled_at  := now(); end if;
    if new.status = 'refunded'  and new.refunded_at  is null then new.refunded_at  := now(); end if;
    if new.status = 'paid'      and new.paid_at      is null then new.paid_at      := now(); end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_bl_touch_order_stamps on public.orders;
create trigger trg_bl_touch_order_stamps
  before update on public.orders
  for each row execute function public.bl_touch_order_stamps();

-- 3-2) 상태 이력 기록 (AFTER INSERT/UPDATE)
create or replace function public.bl_log_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history(order_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, new.customer_id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.order_status_history(order_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_bl_log_order_status on public.orders;
create trigger trg_bl_log_order_status
  after insert or update on public.orders
  for each row execute function public.bl_log_order_status();

-- ------------------------------------------------------------
-- 4) 고객 액션 RPC (보안: 본인 주문 + 허용 단계만)
--    RLS 는 고객의 직접 UPDATE 를 막으므로 아래 함수로만 가능.
-- ------------------------------------------------------------
-- 4-1) 구매확정 (배송완료 상태에서만)
create or replace function public.order_confirm_receipt(p_order_no text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  select * into o from public.orders where order_no = p_order_no;
  if not found then raise exception 'NOT_FOUND'; end if;
  if o.customer_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if o.status <> 'delivered' then raise exception 'BAD_STATE'; end if;
  update public.orders set status = 'confirmed' where id = o.id;
end $$;

-- 4-2) 주문취소 요청
--   미결제(pending)            → 즉시 canceled
--   결제후·발송전(paid/inspecting/preparing) → cancel_req (관리자 환불 후 canceled)
--   그 외(배송중~)              → 반품 플로우로 안내(에러)
create or replace function public.order_request_cancel(p_order_no text, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare o public.orders; v_new text;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  select * into o from public.orders where order_no = p_order_no;
  if not found then raise exception 'NOT_FOUND'; end if;
  if o.customer_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;

  if o.status = 'pending' then
    v_new := 'canceled';
  elsif o.status in ('paid','inspecting','preparing') then
    v_new := 'cancel_req';
  else
    raise exception 'BAD_STATE';
  end if;

  update public.orders
     set status = v_new,
         cancel_reason = coalesce(p_reason, cancel_reason)
   where id = o.id;
  return v_new;
end $$;

-- ------------------------------------------------------------
-- 5) 교환/반품 요청 테이블 + RPC
-- ------------------------------------------------------------
create table if not exists public.return_requests (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references public.orders(id) on delete cascade,
  customer_id  uuid references auth.users(id) on delete set null,
  rtype        text not null default 'return',     -- return(반품) | exchange(교환)
  reason       text,                                -- 사유 분류(단순변심/하자 등)
  detail       text,                                -- 상세 사유
  photos       text[],                              -- 첨부 이미지 URL
  status       text not null default 'requested',   -- requested|approved|rejected|collecting|done
  admin_memo   text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index if not exists rr_customer_idx on public.return_requests (customer_id, created_at desc);
create index if not exists rr_status_idx   on public.return_requests (status);

alter table public.return_requests enable row level security;

drop policy if exists rr_select_own on public.return_requests;
create policy rr_select_own on public.return_requests
  for select using (auth.uid() = customer_id);

drop policy if exists rr_admin_all on public.return_requests;
create policy rr_admin_all on public.return_requests
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 5-1) 교환/반품 신청 (배송완료/구매확정 상태에서, 본인 주문만)
create or replace function public.order_create_return(
  p_order_no text, p_type text, p_reason text, p_detail text, p_photos text[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders; v_id uuid; v_type text;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  select * into o from public.orders where order_no = p_order_no;
  if not found then raise exception 'NOT_FOUND'; end if;
  if o.customer_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if o.status not in ('delivered','confirmed') then raise exception 'BAD_STATE'; end if;

  v_type := case when p_type = 'exchange' then 'exchange' else 'return' end;

  insert into public.return_requests(order_id, customer_id, rtype, reason, detail, photos)
  values (o.id, auth.uid(), v_type, p_reason, p_detail, p_photos)
  returning id into v_id;

  update public.orders
     set status = case when v_type = 'exchange' then 'exchange_req' else 'return_req' end
   where id = o.id;
  return v_id;
end $$;

-- ------------------------------------------------------------
-- 완료. (관리자의 상태변경/운송장입력/교환반품 처리는 RLS admin 정책으로
--        클라이언트에서 직접 UPDATE. 환불 실제 취소는 Edge Function 에서 수행.)
-- ------------------------------------------------------------
