-- ============================================================
-- 벨로르(BELLORE) · 고객별 AI 시계 전문비서 시스템 (1차 기반 구조)
-- ------------------------------------------------------------
-- 사용법: Supabase 대시보드 > SQL Editor 에 "통째로" 붙여넣고 RUN (1회).
--   여러 번 실행해도 안전(IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).
--
-- 이 마이그레이션은 외부 AI API(OpenAI/Claude)를 호출하지 않습니다.
-- 데이터 저장소 + 고객 기억 + 추천/알림 후보 구조만 만듭니다.
-- 이미지/파일은 DB가 아니라 Storage 버킷에 저장하고 URL/path 만 기록합니다.
--
-- 안전성:
--   - 기존 테이블을 삭제/변경하지 않습니다(destructive 없음). 전부 신규 테이블.
--   - is_admin_uid() 가 없으면(= support_chat.sql 미실행) 아래에서 생성합니다.
--   - RLS: 고객은 "본인 행"만, 관리자는 전체. 비로그인(게스트) 데이터는
--     클라이언트(ai-advisor.js)가 localStorage 로 폴백 보관 후 로그인 시 병합합니다.
-- ============================================================

-- ── 관리자 판정 헬퍼 (이미 있으면 그대로 재정의: 무해) ──
create or replace function public.is_admin_uid(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.role = 'admin');
$$;

-- updated_at 자동 갱신 트리거 함수 (공용)
create or replace function public.ai_touch_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

-- ============================================================
-- 1. customer_ai_profiles — 고객별 AI 기억 프로필
-- ============================================================
create table if not exists public.customer_ai_profiles (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users(id) on delete set null,
  phone                    text,
  name                     text,
  email                    text,
  region                   text,
  preferred_brands         text[] default '{}',
  preferred_models         text[] default '{}',
  preferred_references     text[] default '{}',
  budget_min               numeric,
  budget_max               numeric,
  actual_budget_min        numeric,
  actual_budget_max        numeric,
  preferred_condition      text,
  preferred_size           text,
  preferred_color          text,
  preferred_material       text,
  price_sensitivity        int default 50,
  speed_preference         int default 50,
  detail_preference        int default 50,
  risk_tolerance           int default 50,
  resale_importance        int default 50,
  customer_type            text,
  buying_stage             text default 'unknown',
  buy_probability          int default 0,
  ai_summary               text,
  consent_personalization  boolean default false,
  consent_marketing        boolean default false,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

-- 로그인 사용자 1인당 프로필 1개(빠른 upsert). 게스트(user_id null)는 제외.
create unique index if not exists uq_cap_user on public.customer_ai_profiles (user_id) where user_id is not null;
create index if not exists idx_cap_phone   on public.customer_ai_profiles (phone);
create index if not exists idx_cap_stage   on public.customer_ai_profiles (buying_stage);
create index if not exists idx_cap_updated on public.customer_ai_profiles (updated_at desc);

drop trigger if exists trg_cap_touch on public.customer_ai_profiles;
create trigger trg_cap_touch before update on public.customer_ai_profiles
  for each row execute function public.ai_touch_updated_at();

-- ============================================================
-- 2. ai_conversations — 고객 ↔ AI/상담사 모든 대화
-- ============================================================
create table if not exists public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  profile_id uuid references public.customer_ai_profiles(id) on delete set null,
  session_id uuid,
  channel    text default 'web',
  role       text check (role in ('user','assistant','admin','system')),
  message    text not null,
  metadata   jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists idx_conv_profile on public.ai_conversations (profile_id, created_at);
create index if not exists idx_conv_user    on public.ai_conversations (user_id, created_at);
create index if not exists idx_conv_session on public.ai_conversations (session_id, created_at);

-- ============================================================
-- 3. customer_watch_interests — 고객별 관심 브랜드/모델/레퍼런스 점수
-- ============================================================
create table if not exists public.customer_watch_interests (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users(id) on delete set null,
  profile_id           uuid references public.customer_ai_profiles(id) on delete cascade,
  brand                text,
  model                text,
  reference_number     text,
  interest_score       int default 0,
  price_target         numeric,
  condition_preference text,
  source               text,
  last_mentioned_at    timestamptz,
  last_clicked_at      timestamptz,
  last_wishlisted_at   timestamptz,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);
-- 동일 프로필 내 (브랜드,모델,레퍼런스) 조합 1행 → 점수 누적 upsert.
-- null 도 빈 문자열로 정규화해 충돌키가 일관되도록 coalesce 인덱스 사용.
create unique index if not exists uq_cwi_combo on public.customer_watch_interests
  (profile_id, coalesce(brand,''), coalesce(model,''), coalesce(reference_number,''));
create index if not exists idx_cwi_profile on public.customer_watch_interests (profile_id, interest_score desc);
create index if not exists idx_cwi_brand   on public.customer_watch_interests (brand);

drop trigger if exists trg_cwi_touch on public.customer_watch_interests;
create trigger trg_cwi_touch before update on public.customer_watch_interests
  for each row execute function public.ai_touch_updated_at();

-- ============================================================
-- 4. customer_events — 고객 행동 로그
-- ============================================================
create table if not exists public.customer_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete set null,
  profile_id       uuid references public.customer_ai_profiles(id) on delete set null,
  event_type       text not null,   -- product_view|wishlist_add|wishlist_remove|inquiry_submit|price_alert_set|chat_message|purchase_request|sell_request
  product_id       uuid,
  brand            text,
  model            text,
  reference_number text,
  value            jsonb default '{}',
  created_at       timestamptz default now()
);
create index if not exists idx_evt_profile on public.customer_events (profile_id, created_at desc);
create index if not exists idx_evt_user    on public.customer_events (user_id, created_at desc);
create index if not exists idx_evt_type    on public.customer_events (event_type, created_at desc);

-- ============================================================
-- 5. ai_customer_memories — AI 장기 문장형 메모리
-- ============================================================
create table if not exists public.ai_customer_memories (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references auth.users(id) on delete set null,
  profile_id             uuid references public.customer_ai_profiles(id) on delete cascade,
  memory_type            text not null,   -- preference|budget|personality|risk|brand_interest|buying_intent|alert_rule
  content                text not null,
  confidence             int default 50,
  source_conversation_id uuid,
  source_event_id        uuid,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);
create index if not exists idx_mem_profile on public.ai_customer_memories (profile_id, created_at desc);
create index if not exists idx_mem_type    on public.ai_customer_memories (memory_type);

drop trigger if exists trg_mem_touch on public.ai_customer_memories;
create trigger trg_mem_touch before update on public.ai_customer_memories
  for each row execute function public.ai_touch_updated_at();

-- ============================================================
-- 6. ai_recommendation_logs — 추천 기록
-- ============================================================
create table if not exists public.ai_recommendation_logs (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid references public.customer_ai_profiles(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  product_id      uuid,
  score           numeric not null,
  reason          text,
  score_breakdown jsonb default '{}',
  status          text default 'candidate',  -- candidate|shown|clicked|dismissed
  created_at      timestamptz default now()
);
create index if not exists idx_rec_profile on public.ai_recommendation_logs (profile_id, score desc);
create index if not exists idx_rec_product on public.ai_recommendation_logs (product_id);

-- ============================================================
-- 7. ai_alert_candidates — 입고/가격변동/조건충족 알림 후보
-- ============================================================
create table if not exists public.ai_alert_candidates (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.customer_ai_profiles(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  product_id  uuid,
  alert_type  text not null,            -- new_arrival|price_drop|condition_match
  title       text not null,
  message     text not null,
  match_score numeric default 0,
  reason      text,
  status      text default 'pending',   -- pending|approved|sent|dismissed
  created_at  timestamptz default now(),
  approved_at timestamptz,
  sent_at     timestamptz
);
create index if not exists idx_alert_status  on public.ai_alert_candidates (status, created_at desc);
create index if not exists idx_alert_profile on public.ai_alert_candidates (profile_id, created_at desc);

-- ============================================================
-- 8. watch_market_prices — 해외/국내 "참고" 시세 (확정시세 아님)
-- ============================================================
create table if not exists public.watch_market_prices (
  id               uuid primary key default gen_random_uuid(),
  brand            text not null,
  model            text,
  reference_number text not null,
  source           text not null,       -- chrono24|국내_참고 등
  source_url       text,
  price            numeric,
  currency         text,
  price_krw        numeric,
  country          text,
  condition        text,
  production_year  int,
  has_box          boolean,
  has_papers       boolean,
  seller_type      text,
  listed_at        timestamptz,
  scraped_at       timestamptz default now(),
  raw_data         jsonb default '{}'
);
create index if not exists idx_wmp_ref   on public.watch_market_prices (reference_number, scraped_at desc);
create index if not exists idx_wmp_brand on public.watch_market_prices (brand, model);

-- ============================================================
-- 9. expert_knowledge_notes — 전문가 시계 지식 저장소
-- ============================================================
create table if not exists public.expert_knowledge_notes (
  id               uuid primary key default gen_random_uuid(),
  category         text,
  brand            text,
  model            text,
  reference_number text,
  title            text not null,
  content          text not null,
  source           text,
  confidence       int default 70,
  status           text default 'draft',  -- draft|reviewed|approved|archived
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists idx_ekn_status on public.expert_knowledge_notes (status, updated_at desc);
create index if not exists idx_ekn_brand  on public.expert_knowledge_notes (brand, model);

drop trigger if exists trg_ekn_touch on public.expert_knowledge_notes;
create trigger trg_ekn_touch before update on public.expert_knowledge_notes
  for each row execute function public.ai_touch_updated_at();

-- ============================================================
-- 10. team_messages — Slack/Discord 내부 대화 수집(연동은 추후)
-- ============================================================
create table if not exists public.team_messages (
  id             uuid primary key default gen_random_uuid(),
  platform       text not null,         -- slack|discord
  channel_id     text,
  channel_name   text,
  sender_id      text,
  sender_name    text,
  message        text,
  has_attachment boolean default false,
  metadata       jsonb default '{}',
  created_at     timestamptz default now()
);
create index if not exists idx_tm_platform on public.team_messages (platform, created_at desc);
create index if not exists idx_tm_channel  on public.team_messages (channel_id, created_at desc);

-- ============================================================
-- 11. team_message_attachments — Slack/Discord 첨부 메타데이터
-- ============================================================
create table if not exists public.team_message_attachments (
  id              uuid primary key default gen_random_uuid(),
  team_message_id uuid references public.team_messages(id) on delete cascade,
  storage_path    text not null,
  file_url        text,
  file_name       text,
  file_type       text,
  file_size       bigint,
  metadata        jsonb default '{}',
  created_at      timestamptz default now()
);
create index if not exists idx_tma_msg on public.team_message_attachments (team_message_id);

-- ============================================================
-- RLS (행 수준 보안)
-- ------------------------------------------------------------
-- 고객 데이터: 본인(user_id = auth.uid()) 또는 관리자만.
-- 운영/지식 데이터(시세·전문가지식·팀메시지): 관리자만.
-- ============================================================
alter table public.customer_ai_profiles      enable row level security;
alter table public.ai_conversations          enable row level security;
alter table public.customer_watch_interests  enable row level security;
alter table public.customer_events           enable row level security;
alter table public.ai_customer_memories      enable row level security;
alter table public.ai_recommendation_logs    enable row level security;
alter table public.ai_alert_candidates       enable row level security;
alter table public.watch_market_prices       enable row level security;
alter table public.expert_knowledge_notes    enable row level security;
alter table public.team_messages             enable row level security;
alter table public.team_message_attachments  enable row level security;

-- 1) customer_ai_profiles : 본인 또는 관리자
drop policy if exists cap_select on public.customer_ai_profiles;
create policy cap_select on public.customer_ai_profiles
  for select using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));
drop policy if exists cap_insert on public.customer_ai_profiles;
create policy cap_insert on public.customer_ai_profiles
  for insert with check (user_id = auth.uid() or public.is_admin_uid(auth.uid()));
drop policy if exists cap_update on public.customer_ai_profiles;
create policy cap_update on public.customer_ai_profiles
  for update using (user_id = auth.uid() or public.is_admin_uid(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin_uid(auth.uid()));
drop policy if exists cap_delete on public.customer_ai_profiles;
create policy cap_delete on public.customer_ai_profiles
  for delete using (public.is_admin_uid(auth.uid()));

-- 공용 매크로 성격: "본인 또는 관리자" 4종 정책을 테이블마다 동일 패턴으로 부여.
-- 2) ai_conversations
drop policy if exists conv_select on public.ai_conversations;
create policy conv_select on public.ai_conversations
  for select using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));
drop policy if exists conv_insert on public.ai_conversations;
create policy conv_insert on public.ai_conversations
  for insert with check (user_id = auth.uid() or public.is_admin_uid(auth.uid()));

-- 3) customer_watch_interests
drop policy if exists cwi_select on public.customer_watch_interests;
create policy cwi_select on public.customer_watch_interests
  for select using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));
drop policy if exists cwi_write on public.customer_watch_interests;
create policy cwi_write on public.customer_watch_interests
  for all using (user_id = auth.uid() or public.is_admin_uid(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin_uid(auth.uid()));

-- 4) customer_events
drop policy if exists evt_select on public.customer_events;
create policy evt_select on public.customer_events
  for select using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));
drop policy if exists evt_insert on public.customer_events;
create policy evt_insert on public.customer_events
  for insert with check (user_id = auth.uid() or public.is_admin_uid(auth.uid()));

-- 5) ai_customer_memories : 본인 조회, 관리자 전체. 생성은 관리자/본인.
drop policy if exists mem_select on public.ai_customer_memories;
create policy mem_select on public.ai_customer_memories
  for select using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));
drop policy if exists mem_write on public.ai_customer_memories;
create policy mem_write on public.ai_customer_memories
  for all using (user_id = auth.uid() or public.is_admin_uid(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin_uid(auth.uid()));

-- 6) ai_recommendation_logs : 본인 조회, 관리자 전체/생성
drop policy if exists rec_select on public.ai_recommendation_logs;
create policy rec_select on public.ai_recommendation_logs
  for select using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));
drop policy if exists rec_write on public.ai_recommendation_logs;
create policy rec_write on public.ai_recommendation_logs
  for all using (user_id = auth.uid() or public.is_admin_uid(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin_uid(auth.uid()));

-- 7) ai_alert_candidates : 본인 조회(발송 대상), 생성/승인/관리는 관리자
drop policy if exists alert_select on public.ai_alert_candidates;
create policy alert_select on public.ai_alert_candidates
  for select using (user_id = auth.uid() or public.is_admin_uid(auth.uid()));
drop policy if exists alert_write on public.ai_alert_candidates;
create policy alert_write on public.ai_alert_candidates
  for all using (public.is_admin_uid(auth.uid()))
  with check (public.is_admin_uid(auth.uid()));

-- 8~11) 운영/지식 데이터 : 관리자 전용(조회·쓰기)
drop policy if exists wmp_admin on public.watch_market_prices;
create policy wmp_admin on public.watch_market_prices
  for all using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

drop policy if exists ekn_admin on public.expert_knowledge_notes;
create policy ekn_admin on public.expert_knowledge_notes
  for all using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

drop policy if exists tm_admin on public.team_messages;
create policy tm_admin on public.team_messages
  for all using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

drop policy if exists tma_admin on public.team_message_attachments;
create policy tma_admin on public.team_message_attachments
  for all using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

-- ============================================================
-- Storage 버킷 (이미지/파일 — DB엔 path/URL만 저장)
-- ------------------------------------------------------------
-- storage.buckets 에 직접 insert 합니다(이미 있으면 무시).
--   ai-conversation-attachments : AI 비서 대화 첨부(영수증/사진)
--   team-message-attachments    : Slack/Discord 첨부
--   expert-watch-images         : 전문가 지식 시계 이미지
-- 정책은 보수적으로: 인증 사용자 업로드 + 관리자 전체 관리. 공개읽기는 필요 시 켜세요.
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('ai-conversation-attachments','ai-conversation-attachments', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('team-message-attachments','team-message-attachments', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('expert-watch-images','expert-watch-images', true)
  on conflict (id) do nothing;

-- 인증 사용자: 위 버킷에 업로드 허용 / 관리자: 전체 관리
drop policy if exists ai_bucket_insert on storage.objects;
create policy ai_bucket_insert on storage.objects
  for insert to authenticated
  with check (bucket_id in ('ai-conversation-attachments','team-message-attachments','expert-watch-images'));

drop policy if exists ai_bucket_admin on storage.objects;
create policy ai_bucket_admin on storage.objects
  for all
  using (bucket_id in ('ai-conversation-attachments','team-message-attachments','expert-watch-images')
         and public.is_admin_uid(auth.uid()))
  with check (bucket_id in ('ai-conversation-attachments','team-message-attachments','expert-watch-images')
         and public.is_admin_uid(auth.uid()));

-- 공개 버킷(expert-watch-images) 읽기 허용
drop policy if exists ai_bucket_public_read on storage.objects;
create policy ai_bucket_public_read on storage.objects
  for select using (bucket_id = 'expert-watch-images');

-- ============================================================
-- 실시간 구독 등록(관리자 화면 라이브 갱신용) — 이미 있으면 무시
-- ============================================================
do $$
begin
  begin alter publication supabase_realtime add table public.ai_conversations;   exception when others then null; end;
  begin alter publication supabase_realtime add table public.ai_alert_candidates; exception when others then null; end;
  begin alter publication supabase_realtime add table public.customer_ai_profiles; exception when others then null; end;
end $$;

-- ============================================================
-- 테스트(샘플) 데이터 — 관리자 화면 확인용. 필요 없으면 이 블록만 지우세요.
-- 동일 이메일 프로필이 이미 있으면 건너뜁니다(중복 방지).
-- ============================================================
do $$
declare
  pid uuid;
begin
  if not exists (select 1 from public.customer_ai_profiles where email = 'demo.customer@bellore.test') then
    insert into public.customer_ai_profiles
      (phone, name, email, region, preferred_brands, preferred_models, preferred_references,
       budget_min, budget_max, price_sensitivity, speed_preference, detail_preference,
       resale_importance, customer_type, buying_stage, buy_probability, ai_summary,
       consent_personalization, consent_marketing)
    values
      ('010-1234-5678','김벨로','demo.customer@bellore.test','서울',
       array['롤렉스'], array['서브마리너'], array['124060'],
       8000000, 13000000, 70, 60, 55, 65, 'value_seeker', 'considering', 62,
       '롤렉스 서브마리너 124060 관심. 예산 800만~1,300만. 가격 민감도 높고 리셀가치 중시.',
       true, true)
    returning id into pid;

    insert into public.customer_watch_interests
      (profile_id, brand, model, reference_number, interest_score, price_target, source, last_mentioned_at)
    values
      (pid, '롤렉스', '서브마리너', '124060', 55, 12000000, 'chat', now()),
      (pid, '오메가', '스피드마스터', null, 12, null, 'click', now());

    insert into public.ai_conversations (profile_id, role, message, channel)
    values
      (pid, 'user', '롤렉스 서브마리너 124060 1300만원 이하로 급매 있나요?', 'web'),
      (pid, 'assistant', '관심 정보를 저장했습니다. 선호 브랜드/모델/예산을 분석하고 있습니다.', 'web');

    insert into public.customer_events (profile_id, event_type, brand, model, reference_number)
    values
      (pid, 'chat_message', '롤렉스', '서브마리너', '124060'),
      (pid, 'product_view', '롤렉스', '서브마리너', '124060');
  end if;

  if not exists (select 1 from public.expert_knowledge_notes where title = '서브마리너 124060 풀세트 시세 메모(샘플)') then
    insert into public.expert_knowledge_notes (category, brand, model, reference_number, title, content, source, confidence, status)
    values ('시세', '롤렉스', '서브마리너', '124060',
            '서브마리너 124060 풀세트 시세 메모(샘플)',
            '논데이트 124060 풀세트 국내 시장가 참고. 박스/보증서 유무에 따라 변동. 해외 참고가는 확정시세로 표기하지 말 것.',
            'expert_note', 75, 'draft');
  end if;
end $$;

-- 완료. (외부 AI API 미연결 — RuleBasedAIProvider 가 클라이언트에서 동작)
