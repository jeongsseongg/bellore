# 벨로르 · 고객별 AI 시계 전문비서 — 누적 학습 / Discord 연동 / 실제 AI

이 문서는 "어떻게 누적으로 학습하는가 → Discord 연동 → 실제 AI 학습"의 전체 흐름과
배포 방법을 정리한다. 코드는 모두 들어가 있고, **활성화는 사장님이 시크릿(키)만 넣으면** 된다.

## 0) "학습"의 정의 (중요)
고객마다 신경망을 재학습(fine-tune)하지 **않는다.** 그건 비싸고 불필요하다.
대신 두 단계로 "기억"이 쌓인다.

1. **누적(매 상호작용, 실시간, 무료)** — 규칙기반
   - 채팅/클릭/찜/문의/가격알림/구매요청마다 점수·예산·성향이 누적된다.
   - 저장: `customer_ai_profiles`(요약 프로필) · `customer_watch_interests`(관심 점수)
     · `customer_events`(행동) · `ai_conversations`(대화).
   - 이 단계는 외부 AI 없이 즉시 동작한다(`ai-advisor.js`의 RuleBasedAIProvider).
2. **해석/요약(주기적 또는 버튼, 유료·저비용)** — 실제 AI
   - `ai-learn` Edge Function 이 누적 데이터를 LLM 으로 읽어 고품질 요약(`ai_summary`)과
     장기 메모리(`ai_customer_memories`)를 만든다.
   - = Retrieval + Summarization 기반 "고객 메모리" 아키텍처. (RAG 식)

즉 **데이터는 규칙기반으로 24시간 공짜로 쌓이고, AI 는 가끔 불러 비용을 통제**한다.

## 1) 데이터 흐름
```
고객 채팅/행동
  → ai_conversations / customer_events 저장
  → ruleExtractor 로 브랜드·모델·예산·성향 추출
  → customer_ai_profiles 업데이트 (누적)
  → customer_watch_interests 점수 누적
  → (상품 등록/가격변경 시) recommendationEngine → ai_recommendation_logs
  → 85점↑ → ai_alert_candidates (pending, 관리자 승인 대기)
  → [주기/버튼] ai-learn 이 누적분을 LLM 으로 재요약 → ai_summary / ai_customer_memories
관리자: 'AI 고객비서' 패널에서 프로필·대화·관심·추천·알림후보·전문가지식·팀메시지 확인
```

## 2) 설치 순서
1. **DB**: Supabase SQL Editor 에 `ai_advisor.sql` 전체 붙여넣고 RUN (1회).
   - 11개 테이블 + RLS + Storage 버킷 3종 + 샘플 데이터 생성.
2. **프런트**: 이미 `index.html` 에 `ai-advisor.js` / `ai-advisor-admin.js` 연결됨.
   배포만 하면 고객용 'BELLORE AI' 버튼과 관리자 'AI 고객비서' 메뉴가 뜬다.
   - 이 단계까지는 **무료/즉시** 동작(규칙기반).

## 3) Discord 연동 (팀 지식 수집)
Discord 는 채널 메시지를 임의 URL 로 자동 전송하지 않는다 → **작은 봇**이 필요하다.

1. Discord 개발자 포털에서 봇 생성 → 봇 토큰 확보 → 대상 서버/채널에 초대
   (권한: Read Messages, Message Content Intent ON).
2. 봇(아무 데서나 실행: Deno Deploy / Cloudflare Worker / 사내 PC)이 메시지를 받으면
   아래 Edge Function 으로 그대로 POST 한다. **봇 토큰은 봇에만, 깃/클라이언트엔 절대 X.**
3. 수신 Edge Function 배포:
   ```bash
   supabase secrets set DISCORD_INGEST_SECRET=<길고-임의의-문자열>
   supabase functions deploy discord-ingest --no-verify-jwt
   ```
4. 봇 → 함수 호출 형식(헤더 `x-ingest-secret` 로 인증):
   ```
   POST /functions/v1/discord-ingest
   x-ingest-secret: <DISCORD_INGEST_SECRET>
   { "platform":"discord", "channel_name":"#시세", "sender_name":"감정사",
     "message":"서브마리너 124060 풀세트 1450", "attachments":[{"url":"...","file_name":"a.jpg"}] }
   ```
   → `team_messages` + `team_message_attachments` 저장(이미지는 Storage 미러링),
     브랜드/레퍼런스 자동 태깅. 관리자 '팀 메시지' 탭에서 확인.
   - Slack 도 동일 함수 사용(`platform:"slack"`), Slack Events API 로 같은 형식 POST.

> 봇 코드 예시는 표준 discord.js/Deno 게이트웨이 코드라 레포에 포함하지 않았다.
> 필요하면 "discord 봇 릴레이 코드 만들어줘"라고 하면 별도 파일로 추가한다.

## 4) 실제 AI 학습 켜기 (ai-learn)
```bash
supabase secrets set AI_PROVIDER=anthropic            # 또는 openai
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...     # anthropic 일 때
# 또는: supabase secrets set OPENAI_API_KEY=sk-...     # openai 일 때
supabase secrets set AI_MODEL=claude-haiku-4-5-20251001   # 비용 절감 기본(생략 가능)
supabase functions deploy ai-learn
```
- 키 **미설정 시** `ai-learn` 은 `skipped` 를 반환하고, 규칙기반 요약이 그대로 유지된다.
- 관리자 패널 버튼:
  - 고객 상세 → **"AI 요약·메모리 생성"** → `summarize_profile`
  - 팀 메시지 → **"AI로 지식 일괄 추출"** → `extract_knowledge`

### 정기(누적→재요약) 자동화 — pg_cron
매일 새벽 누적분을 자동 재요약하려면 Supabase SQL Editor 에서:
```sql
-- pg_cron / pg_net 확장(대시보드 Database > Extensions 에서 켜기)
select cron.schedule(
  'ai-learn-nightly', '0 18 * * *',   -- UTC 18:00 = KST 03:00
  $$
  select net.http_post(
    url := 'https://<PROJECT>.supabase.co/functions/v1/ai-learn',
    headers := jsonb_build_object('Content-Type','application/json',
               'Authorization','Bearer <SERVICE_ROLE_OR_ANON_JWT>'),
    body := jsonb_build_object('action','summarize_all','limit',50)
  );
  $$
);
```

## 5) AIProvider 교체 지점
- 클라이언트: `ai-advisor.js` 의 `provider = RuleBasedAIProvider`(현재).
- 서버(실제 AI): `ai-learn` Edge Function 의 `llm()` 어댑터(anthropic/openai 선택).
- 나중에 `LocalLLMProvider` 등을 붙이려면 `llm()` 에 분기만 추가하면 된다.

## 6) 보안/개인정보
- 전화·지역·실제예산·성향은 민감 데이터 → `consent_personalization` /
  `consent_marketing` 동의 필드로 관리(AI 비서 첫 사용 시 동의 화면).
- 모든 AI/봇 키는 Supabase 시크릿에만. RLS 로 고객은 본인 데이터만, 운영 데이터는 관리자만.
- 크로노24 등 외부 크롤링은 미포함(시세는 `watch_market_prices` 에 "참고가"로만 저장).
