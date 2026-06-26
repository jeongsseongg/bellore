-- ============================================================
-- 벨로르(BELLORE) · 회원가입 통합 트리거 + 알림 권한 (정본)
-- Supabase 대시보드 > SQL Editor 에 "통째로" 붙여넣고 RUN (여러 번 실행해도 안전)
--
-- 무엇을 하나:
--   - 모든 회원: 아이디(username)·연락처·주소를 가입 즉시 profiles 에 저장.
--   - 업체/제휴사: 상호·사업자등록번호·대표자·개업일·정산계좌를 저장.
--   - 알림(notifications) "스와이프 삭제" 가 되도록 본인 알림 삭제 권한(RLS) 부여.
--
--   ※ 이 파일은 예전 account_admin / partner / username_login 의
--      handle_new_user() 를 "하나로 합친 정본" 입니다.
--      (예전엔 마지막에 실행한 파일이 username 저장을 덮어써서,
--       신규 가입자의 아이디 로그인이 깨지던 문제가 있었음 → 여기서 통합 수정)
--
--   - biz_verified / account_verified / phone_verified 같은 "인증 통과" 플래그는
--     여기서 켜지 "않습니다". 실제 인증(국세청 진위확인 / 계좌 실명조회 /
--     본인인증)을 통과해야만 서버(Edge Function) 또는 관리자가 켭니다.
--
-- ※ partner.sql, verify.sql 을 먼저 실행해 역할(user_role)/인증 컬럼이 있어야 합니다.
-- ============================================================

-- 0) profiles 컬럼 보강(이미 있으면 무시) -----------------------------
alter table public.profiles
  add column if not exists username             text,
  add column if not exists phone                text,
  add column if not exists postcode             text,
  add column if not exists addr1                text,
  add column if not exists addr2                text,
  add column if not exists bank_name            text,
  add column if not exists bank_account         text,
  add column if not exists bank_holder          text,
  add column if not exists account_submitted_at timestamptz;

-- 아이디(username)는 대소문자 구분 없이 유니크
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- 1) 가입 트리거(정본): 역할 제한(admin 차단) + 아이디/주소/사업자/계좌 저장 -----
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r       user_role;
  is_biz  boolean;
begin
  begin
    r := coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer');
  exception when others then
    r := 'customer';
  end;
  if r::text = 'admin' then r := 'customer'; end if;   -- ★ 권한상승 차단
  is_biz := r::text in ('vendor','partner');

  insert into public.profiles (
    id, role, display_name, company_name, approved, email, username,
    phone, postcode, addr1, addr2,
    business_no, ceo_name, biz_open_date, biz_name,
    bank_name, bank_account, bank_holder, account_submitted_at
  )
  values (
    new.id, r,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'company_name',
    (not is_biz),                       -- 업체/제휴사는 승인 대기(false), 고객은 자동승인
    new.email,
    nullif(new.raw_user_meta_data->>'username', ''),
    -- 연락처·주소(모든 회원)
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'postcode', ''),
    nullif(new.raw_user_meta_data->>'addr1', ''),
    nullif(new.raw_user_meta_data->>'addr2', ''),
    -- 사업자정보(업체/제휴사)
    case when is_biz then nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'business_no',''), '[^0-9]', '', 'g'), '') end,
    case when is_biz then nullif(new.raw_user_meta_data->>'ceo_name', '') end,
    case when is_biz then nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'biz_open_date',''), '[^0-9]', '', 'g'), '') end,
    case when is_biz then nullif(new.raw_user_meta_data->>'biz_name', '') end,
    -- 정산계좌(업체/제휴사)
    case when is_biz then nullif(new.raw_user_meta_data->>'bank_name', '') end,
    case when is_biz then nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'bank_account',''), '[^0-9-]', '', 'g'), '') end,
    case when is_biz then nullif(new.raw_user_meta_data->>'bank_holder', '') end,
    case when is_biz and nullif(new.raw_user_meta_data->>'bank_account','') is not null then now() end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- 가입 트리거가 auth.users 에 붙어 있도록 보장(이미 있으면 재생성)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) 아이디 → 가입 이메일 조회 함수(아이디 로그인용) 보장 ----------------
create or replace function public.email_for_username(uname text)
returns text language sql security definer set search_path = public as $$
  select u.email
    from public.profiles p
    join auth.users u on u.id = p.id
   where lower(p.username) = lower(uname)
   limit 1;
$$;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- 3) 알림 본인 권한(RLS): 마이페이지 "스와이프 삭제" 가 되도록 -------------
--    알림 생성은 트리거(security definer)가 하므로 insert 정책은 불필요.
alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete using (auth.uid() = user_id);
