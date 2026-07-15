-- ============================================================
-- 벨로르(BELLORE) · 디스코드 비교견적 v2 — 금액 후속 메시지 매칭
-- 사용법: Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN (1회)
-- 여러 번 실행해도 안전.
--
-- 무엇: 디스코드에 [사진+모델명] 먼저 → "검수 후 최대 1300만원" 처럼
--   금액을 따로 올려도, 같은 채널의 직전 자동 견적에 1차 견적이 붙도록
--   견적에 출처 채널 ID 를 기록하는 컬럼을 추가한다.
--
-- ⚠️ 함께 필요: Edge Functions > discord-ingest 재배포(새 index.ts 붙여넣기).
--   이 컬럼이 없어도 함수는 동작하지만(채널 구분 없이 최근 견적에 매칭),
--   채널이 여러 개면 엉뚱한 견적에 붙을 수 있으니 실행을 권장.
-- ============================================================

alter table public.quote_requests add column if not exists source_channel_id text;
create index if not exists idx_quote_requests_source_channel
  on public.quote_requests (source_channel_id, created_at desc)
  where source_channel_id is not null;
