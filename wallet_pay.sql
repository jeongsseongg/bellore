-- ============================================================
-- 벨로르(BELLORE) · 벨로르 캐시 '상품 구매 사용' 준비
-- wallet.sql 이후 실행 · 재실행 안전
-- (구매 시 캐시 사용 + 캐시 사용액의 1% 즉시 할인 — 결제검증 confirm-payment 연동은 다음 단계)
-- ============================================================

-- orders 에 캐시 사용액 컬럼
alter table public.orders add column if not exists cash_used bigint not null default 0;

-- 캐시 차감(구매 결제 확정 시 confirm-payment 가 service_role 로 호출)
create or replace function public.wallet_capture(p_uid uuid, p_amount bigint, p_order uuid, p_memo text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare w public.wallets;
begin
  if p_amount is null or p_amount <= 0 then
    return (select balance from public.wallets where user_id = p_uid);
  end if;
  -- 호출 권한: 서버(service_role/SQL Editor) 또는 관리자만.
  -- ⚠️ 비로그인(anon) 호출도 auth.uid() 가 NULL 이라, 'uid null = 서버' 판정은
  --    타인 캐시 무단 차감 구멍이 된다 → auth.role() 로 anon 을 반드시 차단(절대 되돌리지 말 것).
  if coalesce(auth.role(), '') = 'anon'
     or (auth.uid() is not null
         and not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')) then
    raise exception '권한이 없습니다.';
  end if;
  w := public._wallet_row(p_uid);
  if w.balance < p_amount then raise exception '캐시 잔액이 부족합니다.'; end if;
  update public.wallets set balance = balance - p_amount, updated_at = now() where user_id = p_uid returning balance into w.balance;
  insert into public.wallet_txns(user_id, type, amount, balance_after, ref_auction, status, memo)
    values (p_uid, 'capture', p_amount, w.balance, null, 'done', coalesce(p_memo, '상품 구매 캐시 사용'));
  return w.balance;
end $$;
grant execute on function public.wallet_capture(uuid, bigint, uuid, text) to authenticated; -- 내부에서 관리자 검사
revoke execute on function public.wallet_capture(uuid, bigint, uuid, text) from public, anon;
