-- ============================================================
-- 벨로르(BELLORE) · 시세 정리 + 콘텐츠 초안 보강 (추가 마이그레이션)
-- ------------------------------------------------------------
-- Supabase SQL Editor 에 통째로 붙여넣고 RUN (1회). 여러 번 실행해도 안전.
-- 전제: ai_advisor.sql 이미 실행됨(watch_market_prices, expert_knowledge_notes 존재).
--
-- 왜 필요한가:
--   - watch_market_prices 는 만들어만 두고 아무도 채우지 않고 있었다.
--   - 이 마이그레이션은 그 테이블에 "이 시세가 어느 팀 메시지에서 나왔는지"
--     "매입/판매/참고 중 무엇인지"를 기록할 수 있게 컬럼 2개만 추가한다(파괴적 변경 없음).
-- ============================================================

alter table public.watch_market_prices
  add column if not exists deal_type text,              -- 매입 | 판매 | 참고
  add column if not exists source_message_id uuid references public.team_messages(id) on delete set null;

-- 같은 팀 메시지에서 중복 추출되지 않도록(재실행 시 중복 방지)
create unique index if not exists uq_wmp_source_message
  on public.watch_market_prices (source_message_id) where source_message_id is not null;

create index if not exists idx_wmp_deal_type on public.watch_market_prices (deal_type);
