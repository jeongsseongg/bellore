-- ============================================================
-- 벨로르(BELLORE) · 고객센터 채팅 (support_messages)
-- 사용법: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN (1회)
-- 여러 번 실행해도 안전(IF NOT EXISTS / CREATE OR REPLACE).
--
-- 고객 ↔ 관리자 1:1 문의 채팅.
--   thread_user : 대화 상대(고객) 계정 id (스레드 키)
--   sender_role : 'customer' | 'admin' | 'vendor'
--   ref_quote   : "이 시계 문의" 시 연결된 비교견적 id (선택)
-- ============================================================

create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_user uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null default 'customer',
  sender_id   uuid,
  body        text not null default '',
  ref_quote   uuid,
  created_at  timestamptz not null default now()
);

create index if not exists idx_support_thread on public.support_messages (thread_user, created_at);

alter table public.support_messages enable row level security;

-- 관리자 여부
create or replace function public.is_admin_uid(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.role = 'admin');
$$;

-- 본인 스레드 또는 관리자만 조회
drop policy if exists support_select on public.support_messages;
create policy support_select on public.support_messages
  for select using (thread_user = auth.uid() or public.is_admin_uid(auth.uid()));

-- 고객은 자기 스레드에만, 관리자는 모든 스레드에 작성 가능
drop policy if exists support_insert on public.support_messages;
create policy support_insert on public.support_messages
  for insert with check (
    sender_id = auth.uid()
    and (thread_user = auth.uid() or public.is_admin_uid(auth.uid()))
  );

-- 실시간 구독용 publication 등록(이미 있으면 무시)
do $$
begin
  begin
    alter publication supabase_realtime add table public.support_messages;
  exception when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

-- 새 메시지 → 상대방에게 앱 알림
create or replace function public.notify_support_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.sender_role = 'admin' then
    -- 관리자 답장 → 고객에게
    insert into public.notifications (user_id, type, title, body, is_read)
    values (NEW.thread_user, 'support_reply', '고객센터 답변 도착',
            left(NEW.body, 60), false);
  else
    -- 고객/업체 문의 → 관리자에게
    insert into public.notifications (user_id, type, title, body, is_read)
    select p.id, 'support_new', '새 고객센터 문의',
           left(NEW.body, 60), false
      from public.profiles p
     where lower(p.email) = lower('bellorekr@gmail.com');
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_support_message on public.support_messages;
create trigger trg_notify_support_message
  after insert on public.support_messages
  for each row execute function public.notify_support_message();
