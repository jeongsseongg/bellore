-- ============================================================
-- 벨로르(BELLORE) · 업체 알림 수신설정 + VIP 등급 + 트리거 갱신
-- 사용법: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN (1회)
-- ※ quote_notify.sql 을 먼저 실행했다면 이어서 실행하세요. (트리거 함수 교체)
--
-- 구조:
--   - notify_quotes : 새 견적 앱알림 수신 여부 (기본 true = 켜짐)
--   - vip           : VIP 업체 여부 (true 면 카톡 알림톡까지 발송 대상)
--   - 트리거는 'open' 전환 시 (승인업체 AND notify_quotes=true) 에게만 알림
-- ============================================================

-- 1) 컬럼 추가
alter table public.profiles add column if not exists notify_quotes boolean not null default true;
alter table public.profiles add column if not exists vip           boolean not null default false;

-- 2) 트리거 함수 갱신 — 알림설정(notify_quotes) 켠 승인업체에게만 앱알림
create or replace function public.notify_vendors_on_open()
returns trigger language plpgsql security definer set search_path = public as $$
declare label text;
begin
  if new.status = 'open'
     and (tg_op = 'INSERT' or old.status is distinct from 'open') then

    label := coalesce(nullif(trim(coalesce(new.item_brand,'') || ' ' || coalesce(new.item_name,'')), ''), '시계');

    insert into public.notifications (user_id, type, title, body, ref_id)
    select p.id,
           'quote_open',
           '새 비교견적이 등록되었어요',
           label || ' 견적 요청이 들어왔습니다. 지금 입찰해 보세요.',
           new.id
      from public.profiles p
     where p.role = 'vendor'
       and p.approved = true
       and coalesce(p.notify_quotes, true) = true;
  end if;
  return new;
end $$;

-- (트리거 자체는 quote_notify.sql 에서 이미 생성됨: trg_notify_vendors_on_open)
-- 신규 환경 대비 안전하게 재연결
drop trigger if exists trg_notify_vendors_on_open on public.quote_requests;
create trigger trg_notify_vendors_on_open
  after insert or update of status on public.quote_requests
  for each row execute function public.notify_vendors_on_open();
