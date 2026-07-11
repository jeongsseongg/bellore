-- ============================================================
-- 벨로르(BELLORE) · 지갑(충전금) + 경매 예약금(5%) 시스템
-- Supabase 대시보드 > SQL Editor 에 "통째로" 붙여넣고 RUN
-- (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS — 여러 번 실행해도 안전)
-- ※ auction.sql 을 먼저 실행한 상태여야 합니다.
--
-- ▣ 규칙(사장님 확정)
--   · 입찰하려면 입찰가의 5% 를 '예약금'으로 건다(충전금 잔액에서 잠금).
--   · 밀리면(상위입찰 등장) 즉시 예약금 잠금 해제 = 자동 환불.
--   · 낙찰 안 되면 전액 환불. 낙찰 후 취소하면 5% 는 환불 불가(몰수).
--   · 충전금은 환불 가능(사용가능 잔액 한도).
--
-- ▣ 보안
--   · 잔액(balance/held)은 오직 security definer 함수로만 변경 → 위변조 차단.
--   · 사용자는 본인 지갑/거래내역만 조회 가능(RLS). 직접 insert/update 불가.
--   · 입찰은 place_auction_bid RPC 로만(예약금 홀드와 원자적 처리).
-- ============================================================

-- ① 지갑 -------------------------------------------------------
create table if not exists public.wallets (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    bigint not null default 0,   -- 사용 가능 잔액(원)
  held       bigint not null default 0,   -- 예약금으로 잠긴 금액(원)
  updated_at timestamptz not null default now(),
  constraint wallets_nonneg check (balance >= 0 and held >= 0)
);

-- ② 거래 내역(장부) -------------------------------------------
create table if not exists public.wallet_txns (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null,   -- charge|refund|hold|release|forfeit|capture|adjust
  amount        bigint not null, -- 표시용(양수). 방향은 type 로 판단
  balance_after bigint,          -- 처리 후 사용가능 잔액
  ref_auction   uuid,            -- 관련 경매(있으면)
  status        text,            -- refund 등에서 pending|done
  memo          text,
  created_at    timestamptz not null default now()
);
create index if not exists wallet_txns_user_idx on public.wallet_txns (user_id, created_at desc);

-- ③ 경매 예약금(경매×사용자 1건) ------------------------------
create table if not exists public.auction_deposits (
  id          uuid primary key default gen_random_uuid(),
  auction_id  uuid not null references public.auctions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      bigint not null,     -- 예약금(입찰가의 5%)
  status      text not null default 'held',  -- held|released|forfeited|captured
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (auction_id, user_id)
);
create index if not exists auction_deposits_user_idx on public.auction_deposits (user_id);

-- ④ 내부 헬퍼: 지갑 보장 + 장부 기록 --------------------------
create or replace function public._wallet_row(p_uid uuid)
returns public.wallets language plpgsql security definer set search_path = public as $$
declare w public.wallets;
begin
  insert into public.wallets(user_id) values (p_uid) on conflict (user_id) do nothing;
  select * into w from public.wallets where user_id = p_uid for update;
  return w;
end $$;

-- ⑤ 충전(관리자/서버 전용). 실결제 검증 후 호출되어야 함 --------
--   · 관리자 수동충전(테스트) 또는 결제검증 Edge Function(service_role)에서 호출.
create or replace function public.wallet_charge(p_uid uuid, p_amount bigint, p_memo text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare w public.wallets;
begin
  if p_amount is null or p_amount <= 0 then raise exception '충전 금액이 올바르지 않습니다.'; end if;
  -- 호출 권한: 서버(service_role/SQL Editor) 또는 관리자만.
  -- ⚠️ 비로그인(anon) 호출도 auth.uid() 가 NULL 이라, 'uid null = 서버' 판정은
  --    비로그인 무단 충전 구멍이 된다 → auth.role() 로 anon 을 반드시 차단(절대 되돌리지 말 것).
  if coalesce(auth.role(), '') = 'anon'
     or (auth.uid() is not null
         and not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')) then
    raise exception '충전 권한이 없습니다.';
  end if;

  w := public._wallet_row(p_uid);
  update public.wallets set balance = balance + p_amount, updated_at = now() where user_id = p_uid
    returning balance into w.balance;
  insert into public.wallet_txns(user_id, type, amount, balance_after, status, memo)
    values (p_uid, 'charge', p_amount, w.balance, 'done', coalesce(p_memo,'충전'));
  return w.balance;
end $$;

-- ⑥ 충전금 환불 요청(본인). 사용가능 잔액에서 즉시 차감 후 관리자 지급 --
create or replace function public.wallet_refund_request(p_amount bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare w public.wallets; uid uuid := auth.uid();
begin
  if uid is null then raise exception '로그인이 필요합니다.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception '환불 금액이 올바르지 않습니다.'; end if;
  w := public._wallet_row(uid);
  if w.balance < p_amount then raise exception '환불 가능 잔액이 부족합니다.'; end if;
  update public.wallets set balance = balance - p_amount, updated_at = now() where user_id = uid
    returning balance into w.balance;
  insert into public.wallet_txns(user_id, type, amount, balance_after, status, memo)
    values (uid, 'refund', p_amount, w.balance, 'pending', '충전금 환불 요청(계좌 지급 대기)');
  return w.balance;
end $$;

-- ⑦ 예약금 홀드/해제/몰수(내부) ------------------------------
create or replace function public._deposit_release(p_uid uuid, p_auction uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.auction_deposits; nb bigint;
begin
  select * into d from public.auction_deposits
    where auction_id = p_auction and user_id = p_uid and status = 'held' for update;
  if not found then return; end if;
  update public.wallets set held = held - d.amount, balance = balance + d.amount, updated_at = now()
    where user_id = p_uid returning balance into nb;
  update public.auction_deposits set status = 'released', updated_at = now() where id = d.id;
  insert into public.wallet_txns(user_id, type, amount, balance_after, ref_auction, status, memo)
    values (p_uid, 'release', d.amount, nb, p_auction, 'done', '예약금 잠금 해제(환불)');
end $$;

create or replace function public._deposit_forfeit(p_uid uuid, p_auction uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.auction_deposits; nb bigint;
begin
  select * into d from public.auction_deposits
    where auction_id = p_auction and user_id = p_uid and status = 'held' for update;
  if not found then return; end if;
  update public.wallets set held = held - d.amount, updated_at = now()
    where user_id = p_uid returning balance into nb;
  update public.auction_deposits set status = 'forfeited', updated_at = now() where id = d.id;
  insert into public.wallet_txns(user_id, type, amount, balance_after, ref_auction, status, memo)
    values (p_uid, 'forfeit', d.amount, nb, p_auction, 'done', '낙찰 후 취소 — 예약금 몰수');
end $$;

-- ⑧ ★입찰 RPC: 예약금 홀드와 함께 원자적으로 입찰 --------------
create or replace function public.place_auction_bid(p_auction uuid, p_amount bigint)
returns public.auction_bids language plpgsql security definer set search_path = public as $$
declare
  a public.auctions%rowtype;
  uid uuid := auth.uid();
  w public.wallets;
  required bigint;
  v_prev uuid;
  bid public.auction_bids;
begin
  if uid is null then raise exception '로그인이 필요합니다.'; end if;
  select * into a from public.auctions where id = p_auction for update;
  if not found then raise exception '경매를 찾을 수 없습니다.'; end if;
  if a.owner_id = uid then raise exception '본인이 등록한 물건에는 입찰할 수 없습니다.'; end if;

  required := ceil(p_amount * 0.05)::bigint;   -- 예약금 5%
  v_prev := a.current_bidder;

  -- 내 기존 예약금(같은 경매)이 있으면 먼저 해제 후 새로 홀드
  perform public._deposit_release(uid, p_auction);
  w := public._wallet_row(uid);
  if w.balance < required then
    raise exception 'NEED_CHARGE:예약금 % 원이 필요해요. 충전 후 입찰해 주세요.', to_char(required, 'FM999,999,999,999');
  end if;

  -- 예약금 홀드
  update public.wallets set balance = balance - required, held = held + required, updated_at = now()
    where user_id = uid returning balance into w.balance;
  insert into public.auction_deposits(auction_id, user_id, amount, status)
    values (p_auction, uid, required, 'held')
    on conflict (auction_id, user_id) do update set amount = excluded.amount, status = 'held', updated_at = now();
  insert into public.wallet_txns(user_id, type, amount, balance_after, ref_auction, status, memo)
    values (uid, 'hold', required, w.balance, p_auction, 'done', '입찰 예약금 잠금');

  -- 입찰 등록(auction.sql 의 검증 트리거가 최소금액·시간·현재가 갱신 담당)
  insert into public.auction_bids(auction_id, bidder_id, amount, is_floor)
    values (p_auction, uid, p_amount, false) returning * into bid;

  -- 직전 최고입찰자(밀린 사람) 예약금 즉시 해제
  if v_prev is not null and v_prev <> uid then
    perform public._deposit_release(v_prev, p_auction);
  end if;

  return bid;
end $$;

-- ⑨ 낙찰자 취소(본인 or 관리자): 예약금 5% 몰수 -----------------
create or replace function public.auction_winner_cancel(p_auction uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.auctions%rowtype; uid uuid := auth.uid(); is_admin boolean;
begin
  select * into a from public.auctions where id = p_auction for update;
  if not found then raise exception '경매를 찾을 수 없습니다.'; end if;
  is_admin := exists (select 1 from public.profiles where id = uid and role = 'admin');
  if a.winner_id is null then raise exception '낙찰자가 없는 경매입니다.'; end if;
  -- uid 가 NULL(비로그인)이면 아래 비교가 NULL 이 되어 통과해버림 → 명시적으로 차단
  if uid is null or (uid <> a.winner_id and not is_admin) then raise exception '권한이 없습니다.'; end if;
  perform public._deposit_forfeit(a.winner_id, p_auction);
  update public.auctions set settled = true where id = p_auction;
end $$;

-- ⑩ 경매 종료 시: 낙찰자 외 남은 예약금 정리(안전망) ------------
--    (평소엔 밀릴 때마다 해제되어 낙찰자만 홀드 상태지만, 혹시 남아있으면 해제)
create or replace function public.release_deposits_on_end()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ended' and coalesce(old.status,'') <> 'ended' then
    -- 낙찰자가 아닌, 아직 held 인 예약금 전부 해제(전액 환불)
    perform public._deposit_release(d.user_id, new.id)
      from public.auction_deposits d
     where d.auction_id = new.id and d.status = 'held'
       and (new.winner_id is null or d.user_id <> new.winner_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_release_deposits_on_end on public.auctions;
create trigger trg_release_deposits_on_end
  after update on public.auctions
  for each row execute function public.release_deposits_on_end();

-- ⑪ 입찰 직접 insert 잠금(예약금 우회 방지) → RPC 로만 -----------
drop policy if exists auction_bids_insert_own on public.auction_bids;
-- (insert 정책을 제거 = 직접 insert 불가. place_auction_bid(정의자 권한)만 insert)

-- ⑫ RLS -------------------------------------------------------
alter table public.wallets           enable row level security;
alter table public.wallet_txns       enable row level security;
alter table public.auction_deposits  enable row level security;

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets for select using (auth.uid() = user_id);
drop policy if exists wallets_admin_all on public.wallets;
create policy wallets_admin_all on public.wallets for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'));

drop policy if exists wtxn_select_own on public.wallet_txns;
create policy wtxn_select_own on public.wallet_txns for select using (auth.uid() = user_id);
drop policy if exists wtxn_admin_all on public.wallet_txns;
create policy wtxn_admin_all on public.wallet_txns for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'));

drop policy if exists dep_select_own on public.auction_deposits;
create policy dep_select_own on public.auction_deposits for select using (auth.uid() = user_id);
drop policy if exists dep_admin_all on public.auction_deposits;
create policy dep_admin_all on public.auction_deposits for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'));

-- ⑬ 실행 권한(RPC) -------------------------------------------
--    Supabase 는 public 함수에 기본으로 anon 실행권한을 주므로,
--    돈이 움직이는 함수는 anon/public 에서 반드시 revoke 한다(재실행 시에도 유지).
grant execute on function public.place_auction_bid(uuid, bigint)   to authenticated;
grant execute on function public.wallet_refund_request(bigint)     to authenticated;
grant execute on function public.auction_winner_cancel(uuid)       to authenticated;
grant execute on function public.wallet_charge(uuid, bigint, text) to authenticated; -- 내부에서 관리자 검사

revoke execute on function public.wallet_charge(uuid, bigint, text)  from public, anon;
revoke execute on function public.place_auction_bid(uuid, bigint)    from public, anon;
revoke execute on function public.wallet_refund_request(bigint)      from public, anon;
revoke execute on function public.auction_winner_cancel(uuid)        from public, anon;
-- 내부 전용 함수는 클라이언트(anon/authenticated) 직접 호출 금지
-- (security definer 함수끼리의 내부 호출은 영향 없음)
revoke execute on function public._wallet_row(uuid)            from public, anon, authenticated;
revoke execute on function public._deposit_release(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._deposit_forfeit(uuid, uuid) from public, anon, authenticated;

-- ============================================================
-- ✅ 완료. 확인 순서
--   1) 관리자 수동충전(테스트):  select public.wallet_charge('<사용자UUID>', 100000, '테스트충전');
--   2) 그 사용자로 place_auction_bid 로 입찰 → wallets.held 5% 증가, balance 감소
--   3) 다른 사용자가 더 높게 입찰 → 앞 사람 held 자동 해제(balance 복원)
--   4) 경매 status='ended' → 낙찰자 외 held 정리, 낙찰자만 유지
--   5) auction_winner_cancel → 낙찰자 5% 몰수
-- ============================================================
