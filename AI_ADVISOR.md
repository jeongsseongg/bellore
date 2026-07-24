# 벨로르 · 고객별 AI 시계 전문비서 — 누적 학습 / Discord 연동 / 실제 AI

이 문서는 "어떻게 누적으로 학습하는가 → Discord 연동 → 실제 AI 학습"의 전체 흐름과
배포 방법을 정리한다. 외부 AI와 사무실 PC의 Ollama 로컬 AI 중 하나를 선택할 수 있다.

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

### 사무실 로컬 AI 연결

로컬 AI는 고객 브라우저에서 사무실 PC로 직접 접속하지 않는다. 고객 질문을 Supabase의
보안 큐에 넣고, 사무실 PC의 워커가 Ollama로 답변한 뒤 결과만 돌려준다. 방화벽 포트 개방,
고정 IP, Ollama 외부 공개가 필요 없다.

1. Supabase SQL Editor에서 `local_ai_bridge.sql` 전체를 한 번 실행한다.
2. `.env.local.example`을 참고해 프로젝트 루트의 `.env.local`을 설정한다.
   실제 파일은 Git에 올라가지 않는다.
3. 모델 생성:
   ```powershell
   ollama create bellore-shop-ai:1 -f ai\Modelfile
   ```
4. 워커 실행:
   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\run-local-ai-worker.ps1
   ```
5. 모델 검증:
   ```powershell
   node tools\eval-bellore-shop-ai.mjs
   ```

워커가 45초 이상 응답하지 않으면 웹은 로컬 큐를 건너뛰고 기존 서버/규칙 답변으로 즉시
전환한다. 답변은 실제 판매 후보 ID만 추천할 수 있고, 검증되지 않은 가격·정품 판정·과거
대화 기억·민감정보 요구는 모델 응답과 DB 저장 단계에서 모두 차단한다.

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

### (A) 무료 — Google Gemini (권장, 무료 티어)
키 발급: https://aistudio.google.com/apikey
```bash
supabase secrets set AI_PROVIDER=gemini
supabase secrets set GEMINI_API_KEY=AIza...      # 구글 AI 스튜디오 무료 키
supabase secrets set AI_MODEL=gemini-2.0-flash   # 생략 가능(기본값)
supabase functions deploy ai-learn
```

### (B) 무료 — Groq (OpenAI 호환, 무료·빠름, 제로 데이터 보존=학습 안 함) ★고객데이터 안전
키 발급(카드 불필요): https://console.groq.com/keys
```bash
supabase secrets set AI_PROVIDER=openai
supabase secrets set AI_BASE_URL=https://api.groq.com/openai/v1
supabase secrets set OPENAI_API_KEY=gsk_...       # Groq 무료 키
supabase secrets set AI_MODEL=qwen/qwen3.6-27b    # 현재 Groq 최상급(한국어 강함). 대안: openai/gpt-oss-120b
supabase functions deploy ai-learn
```
> ⚠️ 모델 목록은 바뀝니다(llama-3.3-70b 등 구모델 폐기됨). 최신 모델ID는
> https://console.groq.com/docs/models 에서 확인해 AI_MODEL 만 교체.

### (B-2) 무료 — Gemma (구글 오픈모델, Gemini 키 그대로)
Gemma 는 Gemini 와 같은 키/엔드포인트로 돌아간다. 모델명만 바꾸면 됨.
```bash
supabase secrets set AI_PROVIDER=gemini
supabase secrets set GEMINI_API_KEY=AIza...          # aistudio.google.com/apikey
supabase secrets set AI_MODEL=gemma-3-27b-it         # 또는 gemma-3-12b-it
supabase functions deploy ai-learn
```
(Gemma 는 system 역할 미지원 → 함수가 자동으로 지침을 프롬프트 앞에 합쳐서 처리)

### (B-3) GLM (Zhipu / Z.ai, OpenAI 호환)
키 발급: https://z.ai  (중국: https://open.bigmodel.cn)
```bash
supabase secrets set AI_PROVIDER=openai
supabase secrets set AI_BASE_URL=https://api.z.ai/api/paas/v4     # 중국내: https://open.bigmodel.cn/api/paas/v4
supabase secrets set OPENAI_API_KEY=<Z.AI_API_KEY>
supabase secrets set AI_MODEL=glm-5.2                # 최신 플래그십(유료/무료체험). 완전무료는 flash 계열
supabase functions deploy ai-learn
```
> 모델명은 언제든 교체 가능: 최고성능은 `glm-5.2`, 무료 위주면 `glm-*-flash` 계열이나
> Gemini/Gemma 로 `AI_MODEL`(및 필요시 `AI_BASE_URL`)만 바꾸면 됨. 코드 수정 불필요.

### (C) 유료 — Anthropic / OpenAI
```bash
supabase secrets set AI_PROVIDER=anthropic        # 또는 openai
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... # 또는 OPENAI_API_KEY=sk-...
supabase functions deploy ai-learn
```
- 어느 경우든 **키 미설정 시 규칙기반 폴백**(skipped). 프런트 `window.BELLORE_AI_REPLY=true` 여야 답변 생성에 사용.
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

## 4-1) 학습소 2곳 + 통합 저장소
- **학습소 ①: 고객과의 대화** → `ai_conversations`(모든 고객 메시지/응답 저장).
- **학습소 ②: Discord 그룹톡** → `team_messages`(+첨부). 시계 지식 대화가 쌓이는 곳.
- **정제 저장소**: 두 학습소에서 추출·승인된 지식 → `expert_knowledge_notes`
  (draft→reviewed→approved). ai-learn 답변(generate_reply)이 이 승인 지식을 근거로 인용.
- 즉 "모든 대화 저장소"는 `ai_conversations`(고객) + `team_messages`(디스코드)이고,
  관리자 패널의 '대화 로그' / '팀 메시지' 탭에서 각각 열람한다.

## 4-2) 응답 지침(플레이북) 업로드
- SQL: `ai_guidelines.sql` 실행 → `ai_response_guidelines` 테이블 + 기본 지침 3종.
- 관리자 패널 **'응답 지침'** 탭에서 "어떻게 답변할지"를 직접 작성/수정/활성화.
- 활성 지침은 `ai-learn` 의 `generate_reply`·요약 시 **시스템 프롬프트**로 들어간다.

## 4-3) 실제 시계 추천 (무료, 채팅에서 동작)
- 고객이 "추천/예산/매물" 또는 브랜드·레퍼런스를 말하면, 클라이언트가 `listings`(판매시계)를
  조회해 추천엔진(100점)으로 매칭하여 **상위 매물을 채팅에 바로 표시**한다(외부 AI 불필요).
- AI 키를 켜고 `window.BELLORE_AI_REPLY = true` 로 두면, 답변 문장은 ai-learn(지침+기억+지식
  기반)이 생성하고 추천 매물 목록은 그대로 붙는다. (기본값 off = 규칙기반, 비용 0)

## 5) AIProvider 우선순위
- 실제 판매 시세가 확인되는 질문: 기존 시세 함수.
- 워커가 온라인: Supabase 큐 → `bellore-shop-ai:1`(Ollama) → 응답 검증.
- 워커가 오프라인/실패: `ai-learn` Edge Function.
- 외부 AI도 미설정/실패: `RuleBasedAIProvider`.

## 6) 보안/개인정보
- 전화·지역·실제예산·성향은 민감 데이터 → `consent_personalization` /
  `consent_marketing` 동의 필드로 관리(AI 비서 첫 사용 시 동의 화면).
- 모든 AI/봇 키는 Supabase 시크릿에만. RLS 로 고객은 본인 데이터만, 운영 데이터는 관리자만.
- 크로노24 등 외부 크롤링은 미포함(시세는 `watch_market_prices` 에 "참고가"로만 저장).
