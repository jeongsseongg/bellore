-- ============================================================
-- 벨로르(BELLORE) · AI 응답 지침(플레이북) 저장소
-- ------------------------------------------------------------
-- 사용법: Supabase SQL Editor 에 붙여넣고 RUN (1회). 여러 번 실행해도 안전.
--   (ai_advisor.sql 을 먼저 실행했다는 전제. is_admin_uid() 재사용)
--
-- "AI 가 어떻게 답변해야 하는지" 지침을 관리자가 직접 올리고 관리한다.
--   - ai-learn Edge Function 이 답변 생성(generate_reply)·요약 시 이 지침을
--     시스템 프롬프트로 사용한다(우선순위 높은 active 지침부터).
--   - 학습소(고객 대화 + Discord)에서 쌓인 지식과 함께 답변 근거가 된다.
-- ============================================================
create or replace function public.is_admin_uid(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.role = 'admin');
$$;

create table if not exists public.ai_response_guidelines (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text,                 -- tone|recommendation|pricing|objection|forbidden|general
  content     text not null,        -- 실제 지침 본문(자유 텍스트)
  priority    int default 100,      -- 낮을수록 먼저 적용(상위 지침)
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_arg_active on public.ai_response_guidelines (is_active, priority);

-- updated_at 자동 갱신(ai_advisor.sql 의 공용 트리거 함수 재사용; 없으면 생성)
create or replace function public.ai_touch_updated_at()
returns trigger language plpgsql as $$
begin NEW.updated_at = now(); return NEW; end; $$;

drop trigger if exists trg_arg_touch on public.ai_response_guidelines;
create trigger trg_arg_touch before update on public.ai_response_guidelines
  for each row execute function public.ai_touch_updated_at();

alter table public.ai_response_guidelines enable row level security;

-- 지침 조회: 관리자 전체 / 로그인 고객은 active 만(클라이언트 톤 적용 가능하도록).
drop policy if exists arg_select on public.ai_response_guidelines;
create policy arg_select on public.ai_response_guidelines
  for select using (is_active = true or public.is_admin_uid(auth.uid()));
-- 작성/수정/삭제: 관리자만
drop policy if exists arg_write on public.ai_response_guidelines;
create policy arg_write on public.ai_response_guidelines
  for all using (public.is_admin_uid(auth.uid())) with check (public.is_admin_uid(auth.uid()));

-- 기본 지침 시드(없을 때만)
insert into public.ai_response_guidelines (title, category, content, priority, is_active)
select * from (values
  ('기본 응대 톤', 'tone',
   '항상 정중한 존댓말. 명품시계 전문가답게 신뢰감 있고 간결하게. 과장/허위 시세 금지. 해외 시세는 "참고가"로만 안내하고 국내 확정가로 단정하지 않는다.',
   10, true),
  ('추천 원칙', 'recommendation',
   '고객의 누적 관심(브랜드/모델/레퍼런스)과 예산 범위를 우선한다. 예산을 크게 벗어나는 매물은 권하지 않는다. 추천 시 이유(관심 일치/예산 적합/가격)를 한 줄로 덧붙인다.',
   20, true),
  ('금지 사항', 'forbidden',
   '확정 시세 단정, 타사 비방, 개인정보 과다 요구 금지. 결제/계약은 반드시 정식 절차(상담사/주문)로 유도한다.',
   30, true)
) as v(title, category, content, priority, is_active)
where not exists (select 1 from public.ai_response_guidelines);
