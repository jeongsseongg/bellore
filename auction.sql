-- ============================================================
-- 벨로르(BELLORE) · 경매(Auction) 시스템 — DB 토대
-- Supabase 대시보드 > SQL Editor 에 "통째로" 붙여넣고 RUN
-- (CREATE ... IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS 라서 여러 번 실행해도 안전)
--
-- ▣ 무엇을 만드나
--   1) auctions      — 경매 예약(어떤 시계를 언제, 시작가/최소낙찰가/매입보장가)
--   2) auction_bids  — 입찰 기록(누가·얼마·자동바닥입찰 여부)
--   3) RLS           — 경매/입찰 조회는 공개, 입찰은 로그인 필요
--   4) 입찰 검증 트리거(法/무결성) — ★ 아래 "철칙" 강제
--   5) 알림 트리거   — 경매 예약 시 찜/소식받기 고객에게 알림, 상위입찰 밀림 알림, 낙찰 알림
--   6) Realtime      — 입찰이 실시간으로 화면에 반영되도록 publication 등록
--
-- ▣ 합법성 철칙(코드로 강제 — 절대 약화 금지)
--   ① 본인(매물 owner)은 자기 물건에 입찰 못 한다 = 자전거래/허위입찰 방지
--   ② 입찰은 진짜 구속력 → 인증된 사용자만(파트너 자동바닥입찰은 승인된 partner/admin만)
--   ③ 유령 없음 → 모든 입찰은 실제 로그인 사용자(bidder_id) 기록이 남는다
--   (미성년자 입찰 금지는 '만 19세 이상 본인인증' 통과 후 참여로 앱단에서 차단)
-- ============================================================

-- ① auctions ---------------------------------------------------
create table if not exists public.auctions (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.listings(id) on delete cascade,
  created_by     uuid references auth.users(id) on delete set null,  -- 예약한 관리자

  -- 표시용 스냅샷(리스팅이 바뀌어도 경매 기록 보존)
  brand          text,          -- listings.title
  model          text,          -- listings.description
  image_url      text,
  retail_price   bigint,        -- 정가(시세 기준) = listings.price
  owner_id       uuid,          -- 매물 소유자(=파트너 or 벨로르 관리자) — 본인입찰 차단용
  owner_role     public.user_role,  -- 'admin'(벨로르 직영) | 'partner'(제휴사)

  -- 금액 규칙
  start_price    bigint not null,                 -- 입찰 시작가(예: 정가의 30%)
  min_increment  bigint not null default 10000,   -- 최소 입찰 단위
  reserve_price  bigint,        -- 파트너사 물건: 최소 낙찰가(이 밑으론 낙찰 안 됨)
  guaranteed_price bigint,      -- 벨로르 물건: 최소 매입가 보장(바닥 받침)

  -- 일정
  start_at       timestamptz not null,
  end_at         timestamptz not null,

  -- 진행 상태(취소/수동제어용 — 라이브 여부는 주로 시간으로 판정)
  status         text not null default 'scheduled',  -- scheduled | live | ended | canceled

  -- 현재 최고가(트리거가 갱신)
  current_price  bigint,
  current_bidder uuid references auth.users(id) on delete set null,
  bid_count      int not null default 0,

  -- 종료 결과
  winner_id      uuid references auth.users(id) on delete set null,
  final_price    bigint,
  settled        boolean not null default false,   -- 낙찰→주문/결제 처리 여부

  created_at     timestamptz not null default now()
);

create index if not exists auctions_listing_idx on public.auctions (listing_id);
create index if not exists auctions_start_idx    on public.auctions (start_at);
create index if not exists auctions_status_idx   on public.auctions (status, end_at);

-- 참여 자격: 'all'(모든 회원) | 'adult'(성인 본인인증 회원만) — 재실행 안전
alter table public.auctions
  add column if not exists eligibility text not null default 'all';


-- ② auction_bids ----------------------------------------------
create table if not exists public.auction_bids (
  id           uuid primary key default gen_random_uuid(),
  auction_id   uuid not null references public.auctions(id) on delete cascade,
  bidder_id    uuid not null references auth.users(id) on delete cascade,
  amount       bigint not null,
  is_floor     boolean not null default false,  -- 파트너/벨로르 '매입보장 자동바닥입찰'(정직하게 표시)
  created_at   timestamptz not null default now()
);

create index if not exists auction_bids_auction_idx on public.auction_bids (auction_id, created_at desc);
create index if not exists auction_bids_bidder_idx  on public.auction_bids (bidder_id);


-- ③ 예약 시 스냅샷 채우기: auctions insert 전에 listing 정보 복사 -----
create or replace function public.fill_auction_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare l public.listings%rowtype; r public.user_role;
begin
  select * into l from public.listings where id = new.listing_id;
  if not found then raise exception '존재하지 않는 매물입니다.'; end if;

  new.brand        := coalesce(new.brand, l.title);
  new.model        := coalesce(new.model, l.description);
  new.image_url    := coalesce(new.image_url, l.image_url,
                        case when array_length(l.image_urls,1) > 0 then l.image_urls[1] end);
  new.retail_price := coalesce(new.retail_price, l.price);
  new.owner_id     := coalesce(new.owner_id, l.owner_id);

  select p.role into r from public.profiles p where p.id = new.owner_id;
  new.owner_role := coalesce(new.owner_role, r);

  -- 시작가 미지정 시 정가의 30% 로 자동(도메인 규칙)
  if new.start_price is null or new.start_price <= 0 then
    new.start_price := greatest(floor(coalesce(l.price,0) * 0.30)::bigint, 10000);
  end if;
  return new;
end $$;

drop trigger if exists trg_fill_auction_snapshot on public.auctions;
create trigger trg_fill_auction_snapshot
  before insert on public.auctions
  for each row execute function public.fill_auction_snapshot();


-- ④ 입찰 검증 트리거(★ 철칙 강제 + 현재가 갱신) -------------------
create or replace function public.validate_and_apply_bid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a        public.auctions%rowtype;
  bidder_role public.user_role;
  min_ok   bigint;
begin
  select * into a from public.auctions where id = new.auction_id for update;
  if not found then raise exception '경매를 찾을 수 없습니다.'; end if;

  -- (상태) 취소/종료된 경매 입찰 불가
  if a.status = 'canceled' then raise exception '취소된 경매입니다.'; end if;
  if a.status = 'ended' or now() >= a.end_at then raise exception '이미 종료된 경매입니다.'; end if;
  if now() < a.start_at then raise exception '아직 시작 전인 경매입니다.'; end if;

  -- ★철칙①: 본인(매물 owner)은 자기 물건에 입찰 금지(자전거래/허위입찰 방지)
  if new.bidder_id = a.owner_id then
    raise exception '본인이 등록한 물건에는 입찰할 수 없습니다.';
  end if;

  -- ★철칙②: 자동 바닥입찰(is_floor)은 승인된 partner 또는 admin 만
  if new.is_floor then
    select role into bidder_role from public.profiles where id = new.bidder_id;
    if bidder_role not in ('partner','admin') then
      raise exception '자동 매입보장 입찰은 인증 파트너만 가능합니다.';
    end if;
  end if;

  -- (금액) 첫 입찰은 시작가 이상, 이후는 현재가+최소단위 이상
  if a.bid_count = 0 or a.current_price is null then
    min_ok := a.start_price;
  else
    min_ok := a.current_price + a.min_increment;
  end if;
  if new.amount < min_ok then
    raise exception '입찰가는 % 원 이상이어야 합니다.', to_char(min_ok, 'FM999,999,999,999');
  end if;

  -- 현재가 갱신
  update public.auctions
     set current_price = new.amount,
         current_bidder = new.bidder_id,
         bid_count = bid_count + 1,
         status = case when status = 'scheduled' then 'live' else status end
   where id = new.auction_id;

  return new;
end $$;

drop trigger if exists trg_validate_and_apply_bid on public.auction_bids;
create trigger trg_validate_and_apply_bid
  before insert on public.auction_bids
  for each row execute function public.validate_and_apply_bid();


-- ⑤-1 알림: 경매 예약되면 찜/소식받기 한 고객에게 "곧 시작해요" -------
--   - 찜(user_picks.kind='wish', item_key = listing id) 한 고객
--   - 소식받기(watch_alerts) 에서 브랜드/모델이 일치하는 고객
--   (경매 소유자 본인에게는 보내지 않음)
create or replace function public.notify_wishers_on_auction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  label text;
  whenq text;
begin
  label := coalesce(nullif(trim(coalesce(new.brand,'') || ' ' || coalesce(new.model,'')), ''), '관심 시계');
  -- 한국시간 기준 'M월 D일 HH24시' 표기
  whenq := to_char(new.start_at at time zone 'Asia/Seoul', 'FMMM월 FMDD일 HH24시');

  -- 찜한 고객
  insert into public.notifications (user_id, type, title, body, ref_id)
  select distinct up.user_id, 'auction_soon', '관심 시계 경매가 열려요',
         label || ' 경매가 ' || whenq || '에 시작해요! 시작가부터 노려보세요.',
         new.id::text
    from public.user_picks up
   where up.kind = 'wish'
     and up.item_key = new.listing_id::text
     and up.user_id <> coalesce(new.owner_id, '00000000-0000-0000-0000-000000000000');

  -- 소식받기(브랜드/모델 일치) 고객 — 위에서 이미 받은 사람은 제외
  insert into public.notifications (user_id, type, title, body, ref_id)
  select distinct wa.user_id, 'auction_soon', '기다리던 시계가 경매에 나왔어요',
         label || ' 경매가 ' || whenq || '에 시작해요! 지금 확인해보세요.',
         new.id::text
    from public.watch_alerts wa
   where coalesce(wa.brand,'') = coalesce(new.brand,'')
     and (coalesce(wa.model,'') = coalesce(new.model,'') or nullif(wa.model,'') is null)
     and wa.user_id <> coalesce(new.owner_id, '00000000-0000-0000-0000-000000000000')
     and not exists (
        select 1 from public.user_picks up
         where up.kind = 'wish' and up.item_key = new.listing_id::text
           and up.user_id = wa.user_id);
  return new;
end $$;

drop trigger if exists trg_notify_wishers_on_auction on public.auctions;
create trigger trg_notify_wishers_on_auction
  after insert on public.auctions
  for each row execute function public.notify_wishers_on_auction();


-- ⑤-2 알림: 새 입찰로 밀린 직전 최고입찰자에게 "다시 참여하세요" -------
create or replace function public.notify_outbid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  prev uuid;
  a public.auctions%rowtype;
begin
  select * into a from public.auctions where id = new.auction_id;
  -- 이번 입찰 직전의 최고입찰자(= 나 자신 제외한 가장 최근 입찰자)
  select b.bidder_id into prev
    from public.auction_bids b
   where b.auction_id = new.auction_id and b.id <> new.id and b.bidder_id <> new.bidder_id
   order by b.amount desc, b.created_at desc
   limit 1;

  if prev is not null then
    insert into public.notifications (user_id, type, title, body, ref_id)
    values (prev, 'auction_outbid', '누군가 더 높게 입찰했어요',
            coalesce(nullif(trim(coalesce(a.brand,'') || ' ' || coalesce(a.model,'')),''),'경매')
            || ' 경매에서 상위 입찰이 나왔어요. 다시 참여하시겠어요?',
            new.auction_id::text);
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_outbid on public.auction_bids;
create trigger trg_notify_outbid
  after insert on public.auction_bids
  for each row execute function public.notify_outbid();


-- ⑤-3 낙찰 처리: 경매가 'ended' 로 바뀔 때 낙찰자 확정 + 알림 --------
--   (라이브 상태를 시간으로 판정하므로, 종료 확정은 앱/스케줄러가 status='ended' 로 UPDATE)
create or replace function public.finalize_auction()
returns trigger language plpgsql security definer set search_path = public as $$
declare floor_ok bigint;
begin
  if new.status = 'ended' and coalesce(old.status,'') <> 'ended' then
    -- 최소낙찰가/매입보장가(둘 중 설정된 값) 미달이면 유찰
    floor_ok := coalesce(new.reserve_price, new.guaranteed_price, 0);
    if new.current_price is not null and new.current_price >= floor_ok then
      new.winner_id  := new.current_bidder;
      new.final_price := new.current_price;
      if new.winner_id is not null then
        insert into public.notifications (user_id, type, title, body, ref_id)
        values (new.winner_id, 'auction_won', '축하합니다! 낙찰되셨어요',
                coalesce(nullif(trim(coalesce(new.brand,'') || ' ' || coalesce(new.model,'')),''),'시계')
                || ' 경매에 낙찰되었어요. 결제를 진행해 주세요.',
                new.id::text);
      end if;
    else
      -- 유찰(바닥가 미달) — 낙찰자 없음
      new.winner_id := null; new.final_price := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_finalize_auction on public.auctions;
create trigger trg_finalize_auction
  before update on public.auctions
  for each row execute function public.finalize_auction();


-- ⑥ RLS -------------------------------------------------------
alter table public.auctions     enable row level security;
alter table public.auction_bids enable row level security;

-- 경매: 누구나 조회(비회원 공개 — 상품·경매 공개 원칙)
drop policy if exists auctions_select_all on public.auctions;
create policy auctions_select_all on public.auctions for select using (true);

-- 경매 생성/수정/삭제: 관리자만
drop policy if exists auctions_admin_write on public.auctions;
create policy auctions_admin_write on public.auctions for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 입찰: 누구나 조회(참여 활성도 표시)
drop policy if exists auction_bids_select_all on public.auction_bids;
create policy auction_bids_select_all on public.auction_bids for select using (true);

-- 입찰 등록: 로그인 사용자 본인 명의로만(bidder_id = 나). 나머지 검증은 트리거가 담당.
drop policy if exists auction_bids_insert_own on public.auction_bids;
create policy auction_bids_insert_own on public.auction_bids for insert
  with check (auth.uid() = bidder_id);


-- ⑦ Realtime: 입찰이 실시간 반영되도록 publication 에 추가 ----------
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.auctions';     exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.auction_bids';  exception when others then null; end;
end $$;

-- ============================================================
-- ✅ 완료. 이 파일 실행 후 확인 순서:
--   1) 관리자 계정으로 auctions 에 1건 insert (아래 예시) → 그 시계를 '찜'한 고객에게 알림이 생기는지
--        insert into public.auctions (listing_id, created_by, start_at, end_at)
--        values ('<매물 UUID>', auth.uid(), now(), now() + interval '30 minutes');
--        (start_price 비우면 정가의 30% 자동)
--   2) 다른(고객) 계정으로 auction_bids insert → current_price 갱신 + 직전입찰자 알림
--   3) 본인(owner) 계정으로 입찰 시도 → "본인 물건 입찰 불가" 에러가 나면 철칙① 정상
-- ============================================================
