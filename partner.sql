-- ============================================================
-- 벨로르(BELLORE) · 제휴사(직영 판매사) 역할 + 정산 구조
-- Supabase 대시보드 > SQL Editor 에 "통째로" 붙여넣고 RUN (여러 번 실행해도 안전)
--
-- 무엇을 만드나:
--  1) user_role 에 'partner'(제휴사/직영) 추가
--  2) profiles 에 사업자/대표자/정산수수료/인증상태 컬럼 추가
--  3) 가입 트리거: 역할을 customer/vendor/partner 로만 제한(admin 자동승격 차단)
--     - vendor/partner 는 approved=false(관리자 승인 대기)
--  4) settlements(정산) 테이블 + RLS
--  5) 주문 결제완료 시 정산행 자동 생성 트리거(서버측), 매물 owner 역할로 정산 대상 판별
--     - 관리자 매물 판매 → 정산 대상 '벨로르'(내부)
--     - 제휴사 매물 판매 → 정산 대상 = 제휴사 계좌
--
-- ⚠️ "실제" 인증 안내(코드만으로는 안 되는 부분):
--   - 휴대폰: Authentication > Providers > Phone 에 SMS 제공자 키 등록해야 문자 발송
--   - 사업자: 국세청 진위확인은 Edge Function(verify-business) + data.go.kr 서비스키 필요
--   - 계좌: 현재는 통장사본 업로드 + 관리자 승인. 토스 1원인증 승인 후 자동화 가능
--   - 이메일: Authentication > Providers > Email 에서 "Confirm email" 켜면 실제 인증메일 발송
-- ============================================================

-- ① user_role 에 partner 추가 (이미 있으면 건너뜀) ----------------
alter type public.user_role add value if not exists 'partner';


-- ② profiles 컬럼 보강 -------------------------------------------
alter table public.profiles
  add column if not exists business_no       text,      -- 사업자등록번호(숫자만)
  add column if not exists ceo_name          text,      -- 대표자명
  add column if not exists biz_open_date     text,      -- 개업일 YYYYMMDD
  add column if not exists biz_name          text,      -- 상호(법인/상호명)
  add column if not exists biz_verified      boolean default false,   -- 사업자 진위확인 통과
  add column if not exists biz_verified_at   timestamptz,
  add column if not exists email_verified    boolean default false,   -- 이메일 인증(폴백; auth.email_confirmed_at 우선)
  add column if not exists commission_rate   numeric  default 0.10;   -- 제휴사 정산 수수료율(0.10 = 10%)


-- ③ 가입 트리거: 역할 제한(admin 차단) + 승인 정책 -----------------
--   raw_user_meta_data.role 로 customer/vendor/partner 만 허용.
--   admin 은 절대 셀프가입 불가(콘솔/SQL 로만 승격).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r user_role;
begin
  -- 클라이언트가 보낸 role 을 신뢰하되 admin 은 막는다.
  begin
    r := coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer');
  exception when others then
    r := 'customer';
  end;
  if r = 'admin' then r := 'customer'; end if;   -- ★ 권한상승 차단

  insert into public.profiles (id, role, display_name, company_name, approved, email)
  values (
    new.id, r,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'company_name',
    (r not in ('vendor','partner')),     -- 업체/제휴사는 승인 대기(false), 고객은 자동승인
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- 역할 무단 변경 방지: 본인이 자기 role/approved 를 바꾸지 못하게(관리자/서버만 변경)
create or replace function public.lock_privileged_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 관리자(또는 service_role: auth.uid() is null)면 통과
  if auth.uid() is null
     or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    return new;
  end if;
  -- 일반 사용자는 role/approved/biz_verified/account_verified/commission_rate 변경 불가
  new.role             := old.role;
  new.approved         := old.approved;
  new.biz_verified     := old.biz_verified;
  new.account_verified := old.account_verified;
  new.commission_rate  := old.commission_rate;
  return new;
end $$;

drop trigger if exists trg_lock_privileged_profile_fields on public.profiles;
create trigger trg_lock_privileged_profile_fields
  before update on public.profiles
  for each row execute function public.lock_privileged_profile_fields();


-- ④ settlements(정산) 테이블 -------------------------------------
create table if not exists public.settlements (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid references public.orders(id)   on delete set null,
  listing_id    uuid references public.listings(id) on delete set null,
  seller_id     uuid references auth.users(id)      on delete set null,  -- 매물 owner(관리자 or 제휴사)
  seller_role   user_role,                          -- 판매 시점의 owner 역할
  product_name  text,
  gross_amount  bigint not null default 0,          -- 정산 기준 판매가
  fee_rate      numeric not null default 0.10,      -- 적용 수수료율(스냅샷)
  fee_amount    bigint not null default 0,          -- 수수료
  net_amount    bigint not null default 0,          -- 정산금액 = gross - fee
  payee_holder  text,                               -- 예금주(스냅샷)
  payee_bank    text,                               -- 은행(스냅샷)
  payee_account text,                               -- 계좌번호(스냅샷)
  status        text not null default 'pending',    -- pending(정산대기) | paid(입금완료) | hold(보류)
  memo          text,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);

create index if not exists settlements_seller_idx on public.settlements (seller_id, created_at desc);
create index if not exists settlements_status_idx on public.settlements (status);
create unique index if not exists settlements_order_uq on public.settlements (order_id);

alter table public.settlements enable row level security;

-- 제휴사(판매자) 본인 정산 내역 조회
drop policy if exists settlements_select_own on public.settlements;
create policy settlements_select_own on public.settlements
  for select using (auth.uid() = seller_id);

-- 관리자 전체 조회/수정
drop policy if exists settlements_admin_all on public.settlements;
create policy settlements_admin_all on public.settlements
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
-- ※ 정산행 생성은 아래 트리거가 service_role 컨텍스트(security definer)로 수행하므로
--   일반 사용자는 직접 insert 할 수 없습니다(정산 위변조 방지).


-- ⑤ 결제완료 → 정산행 자동 생성 트리거 ----------------------------
--   orders.status 가 'paid' 로 바뀌는 순간, 매물 owner 의 역할/계좌를 스냅샷해
--   settlements 1행을 만든다. (관리자 매물은 seller_role='admin' 으로 기록 = 벨로르 정산)
create or replace function public.make_settlement_on_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner   uuid;
  v_role    user_role;
  v_rate    numeric;
  v_holder  text;
  v_bank    text;
  v_account text;
  v_gross   bigint;
  v_fee     bigint;
begin
  if new.status = 'paid' and coalesce(old.status,'') <> 'paid' then
    -- 매물 owner 조회
    select l.owner_id into v_owner from public.listings l where l.id = new.listing_id;
    if v_owner is null then v_owner := new.listing_id; end if;  -- 폴백(없어도 진행 X)

    select p.role, coalesce(p.commission_rate, 0.10),
           p.bank_holder, p.bank_name, p.bank_account
      into v_role, v_rate, v_holder, v_bank, v_account
      from public.profiles p where p.id = v_owner;

    -- 정산 기준가 = 상품 정가(없으면 결제금액)
    v_gross := coalesce(new.product_price, new.amount, 0);
    -- 관리자(벨로르) 매물은 내부 정산이므로 수수료 0 처리(전액 벨로르)
    if v_role = 'admin' then v_rate := 0; end if;
    v_fee := floor(v_gross * coalesce(v_rate,0))::bigint;

    insert into public.settlements
      (order_id, listing_id, seller_id, seller_role, product_name,
       gross_amount, fee_rate, fee_amount, net_amount,
       payee_holder, payee_bank, payee_account, status)
    values
      (new.id, new.listing_id, v_owner, v_role, new.product_name,
       v_gross, coalesce(v_rate,0), v_fee, (v_gross - v_fee),
       v_holder, v_bank, v_account, 'pending')
    on conflict (order_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_make_settlement_on_paid on public.orders;
create trigger trg_make_settlement_on_paid
  after update on public.orders
  for each row execute function public.make_settlement_on_paid();


-- ⑥ (선택) 기존 paid 주문에 대해 정산행 소급 생성 ------------------
--   이미 결제완료된 주문이 있으면 정산행을 만들어 둔다(중복은 무시).
insert into public.settlements
  (order_id, listing_id, seller_id, seller_role, product_name,
   gross_amount, fee_rate, fee_amount, net_amount,
   payee_holder, payee_bank, payee_account, status)
select o.id, o.listing_id, l.owner_id, p.role, o.product_name,
       coalesce(o.product_price, o.amount, 0) as gross,
       case when p.role = 'admin' then 0 else coalesce(p.commission_rate, 0.10) end as rate,
       floor(coalesce(o.product_price, o.amount, 0)
             * case when p.role = 'admin' then 0 else coalesce(p.commission_rate, 0.10) end)::bigint as fee,
       coalesce(o.product_price, o.amount, 0)
         - floor(coalesce(o.product_price, o.amount, 0)
             * case when p.role = 'admin' then 0 else coalesce(p.commission_rate, 0.10) end)::bigint as net,
       p.bank_holder, p.bank_name, p.bank_account, 'pending'
from public.orders o
join public.listings l on l.id = o.listing_id
join public.profiles p on p.id = l.owner_id
where o.status = 'paid'
on conflict (order_id) do nothing;
