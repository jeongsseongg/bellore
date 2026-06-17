-- ============================================================
-- 벨로르(BELLORE) · 비교견적 페이지 리뉴얼 (예상견적/시세/조회수/카운트다운)
-- 사용법: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN (1회)
-- 여러 번 실행해도 안전(IF NOT EXISTS / CREATE OR REPLACE).
--
-- 추가 내용:
--   1) 시계 상세 항목 컬럼 (레퍼런스/구입시기/상태등급/스템핑/구성품)
--      → 견적 확인 페이지(첫 번째 이미지)와 업체 상세(두 번째 이미지)에 표시
--   2) view_count : 실제 조회수 누적 (업체가 견적을 열어볼 때 +1)
--      ※ "10분에 5명 / 2시간 자동증가"는 프론트에서 created_at 기준으로
--        자동 계산하고, 여기에 실제 조회수(view_count)를 합산해 보여줍니다.
--   3) bump_quote_view(qid) : 실제 조회수 +1 RPC (anon/authenticated 호출 가능)
-- ============================================================

-- 1) 시계 상세 항목 컬럼 ------------------------------------
alter table public.quote_requests add column if not exists item_ref      text;  -- 레퍼런스(예: 126610LN)
alter table public.quote_requests add column if not exists item_year     text;  -- 구입시기/구매일(예: 2023년 05월)
alter table public.quote_requests add column if not exists item_grade    text;  -- 상태 등급(예: A등급)
alter table public.quote_requests add column if not exists item_stamping text;  -- 스템핑(각인) 정보
alter table public.quote_requests add column if not exists item_parts    text;  -- 구성품(콤마 구분)

-- 2) 실제 조회수 ---------------------------------------------
alter table public.quote_requests add column if not exists view_count integer not null default 0;

-- 3) 조회수 +1 RPC (보안 정의자 — RLS 우회해 카운트만 증가) ----
create or replace function public.bump_quote_view(qid bigint)
returns integer
language sql
security definer
set search_path = public as $$
  update public.quote_requests
     set view_count = coalesce(view_count, 0) + 1
   where id = qid
   returning view_count;
$$;

grant execute on function public.bump_quote_view(bigint) to anon, authenticated;

-- 4) 신규 등록 / 수정(재승인) 시 관리자에게 앱 알림 ----------------
--    이메일(formsubmit)은 최초 1회 활성화가 필요해 누락될 수 있어,
--    관리자 알림(notifications)을 트리거로 항상 남긴다.
--    관리자 = profiles.email = 'bellorekr@gmail.com'
create or replace function public.notify_admin_quote()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if (TG_OP = 'INSERT')
     or (NEW.status = 'pending' and NEW.status is distinct from OLD.status) then
    insert into public.notifications (user_id, type, title, body, is_read)
    select p.id, 'quote_new', '새 비교견적 등록(승인 대기)',
           trim(coalesce(NEW.item_brand, '') || ' ' || coalesce(NEW.item_name, '')) ||
             case when TG_OP = 'UPDATE' then ' · 수정 재승인 요청' else ' · 신규 신청' end,
           false
      from public.profiles p
     where lower(p.email) = lower('bellorekr@gmail.com');
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_admin_quote on public.quote_requests;
create trigger trg_notify_admin_quote
  after insert or update on public.quote_requests
  for each row execute function public.notify_admin_quote();
