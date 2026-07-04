// ============================================================
// 벨로르(BELLORE) · AI 학습/요약 Edge Function (실제 AI 연결 지점)
// ------------------------------------------------------------
// "누적 학습"의 의미(중요):
//   고객별로 신경망을 재학습(fine-tune)하지 않는다. 그건 비싸고 불필요하다.
//   대신 ① 매 상호작용마다 구조화된 "기억"을 쌓고(customer_ai_profiles /
//   customer_watch_interests / customer_events / ai_conversations),
//   ② 이 함수가 주기적으로/요청 시 그 누적 데이터를 LLM 으로 "해석·요약"해
//   고품질 프로필 요약(ai_summary)과 장기 메모리(ai_customer_memories)를 만든다.
//   = Retrieval + Summarization 기반의 "고객 메모리" 아키텍처.
//
// 이 함수는 클라이언트의 RuleBasedAIProvider 를 대체하는 서버측 Provider 다.
//   - AI 키는 여기(서버 시크릿)에만 둔다. 절대 클라이언트/깃에 두지 않는다.
//   - 키 미설정 시 규칙기반 폴백(요약 생성을 건너뛰고 ok:skipped 반환).
//
// 호출(관리자/크론):
//   POST /functions/v1/ai-learn  { "action": "summarize_profile", "profile_id": "..." }
//   POST /functions/v1/ai-learn  { "action": "summarize_all", "limit": 50 }
//   POST /functions/v1/ai-learn  { "action": "extract_knowledge", "limit": 30 }
//
// 배포:
//   supabase secrets set AI_PROVIDER=anthropic            # or openai
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...     # (anthropic 일 때)
//   supabase secrets set OPENAI_API_KEY=sk-...            # (openai 일 때)
//   supabase secrets set AI_MODEL=claude-haiku-4-5-20251001   # 비용 절감용 기본
//   supabase functions deploy ai-learn
//
// 정기 학습(누적 → 재요약)은 Supabase Scheduled Functions(pg_cron)로 매일 1회
//   summarize_all / extract_knowledge 를 호출하도록 등록하면 된다(아래 SQL 주석 참고).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PROVIDER = (Deno.env.get("AI_PROVIDER") ?? "anthropic").toLowerCase();
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
// OpenAI 호환 무료 제공자(Groq/OpenRouter/Together 등)용 base URL 오버라이드.
//   예) Groq:       AI_BASE_URL=https://api.groq.com/openai/v1
//       OpenRouter: AI_BASE_URL=https://openrouter.ai/api/v1
const OPENAI_BASE = (Deno.env.get("AI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
const DEFAULT_MODEL: Record<string, string> = {
  gemini: "gemini-2.0-flash",        // 무료 티어(구글 AI 스튜디오)
  openai: "gpt-4o-mini",             // Groq 무료면 AI_MODEL=llama-3.3-70b-versatile 등으로
  anthropic: "claude-haiku-4-5-20251001",
};
const MODEL = Deno.env.get("AI_MODEL") ?? DEFAULT_MODEL[PROVIDER] ?? DEFAULT_MODEL.anthropic;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}
function hasKey(): boolean {
  if (PROVIDER === "openai") return !!OPENAI_KEY;
  if (PROVIDER === "gemini") return !!GEMINI_KEY;
  return !!ANTHROPIC_KEY;
}

// ── LLM 호출 어댑터(provider 무관 인터페이스) ──
// system + user → 텍스트(가능하면 JSON) 반환. 실패 시 throw.
async function llm(system: string, user: string, maxTokens = 700): Promise<string> {
  // 무료: Google Gemini / Gemma (AI 스튜디오 무료 티어)
  //   Gemma 모델은 system 역할을 지원하지 않으므로 system 을 user 앞에 합친다.
  if (PROVIDER === "gemini") {
    const isGemma = /^gemma/i.test(MODEL);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;
    const payload: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: isGemma ? (system + "\n\n" + user) : user }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    };
    if (!isGemma) payload.system_instruction = { parts: [{ text: system }] };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out?.error?.message ?? "gemini_failed");
    return (out.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  }
  // OpenAI 및 OpenAI 호환 무료 제공자(Groq/OpenRouter/Together …) — AI_BASE_URL 로 전환
  if (PROVIDER === "openai") {
    const isGroq = /groq\.com/.test(OPENAI_BASE);
    const reqBody: Record<string, unknown> = {
      model: MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
    // Groq 추론모델(qwen3/gpt-oss 등)의 사고과정이 답변에 새지 않도록 숨김
    if (isGroq) reqBody.reasoning_format = "hidden";
    const res = await fetch(OPENAI_BASE + "/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out?.error?.message ?? "openai_failed");
    // reasoning_format 미지원 모델이면 content 에 <think> 가 남을 수 있어 서버에서도 한번 제거
    let txt = out.choices?.[0]?.message?.content ?? "";
    txt = txt.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/?think>/gi, "").trim();
    return txt;
  }
  // 기본: Anthropic Messages API
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out?.error?.message ?? "anthropic_failed");
  return (out.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
}

function safeJson(text: string): any {
  try { return JSON.parse(text); } catch (_e) {}
  // 모델이 설명을 덧붙였을 때 객체/배열 본문만 추출
  const obj = text.match(/\{[\s\S]*\}/);
  const arr = text.match(/\[[\s\S]*\]/);
  for (const m of [arr, obj]) {
    if (m) { try { return JSON.parse(m[0]); } catch (_e) {} }
  }
  return null;
}

type SB = ReturnType<typeof createClient>;

// 활성 응답 지침(플레이북)을 우선순위 순으로 묶어 시스템 프롬프트 조각으로 반환
async function guidelinesText(admin: SB): Promise<string> {
  const { data } = await admin.from("ai_response_guidelines")
    .select("title,category,content,priority").eq("is_active", true)
    .order("priority", { ascending: true }).limit(30);
  if (!data?.length) return "";
  return "## 응답 지침(반드시 준수)\n" +
    data.map((g) => `- [${g.category ?? "general"}] ${g.title}: ${g.content}`).join("\n");
}

// ── action 1: 한 고객 프로필 요약 + 장기 메모리 추출 ──
async function summarizeProfile(admin: SB, profileId: string) {
  const { data: p } = await admin.from("customer_ai_profiles").select("*").eq("id", profileId).single();
  if (!p) return { profile_id: profileId, error: "not_found" };
  const { data: convs } = await admin.from("ai_conversations")
    .select("role,message,created_at").eq("profile_id", profileId)
    .order("created_at", { ascending: true }).limit(60);
  const { data: ints } = await admin.from("customer_watch_interests")
    .select("brand,model,reference_number,interest_score").eq("profile_id", profileId)
    .order("interest_score", { ascending: false }).limit(20);
  const { data: evts } = await admin.from("customer_events")
    .select("event_type,brand,model,reference_number,created_at").eq("profile_id", profileId)
    .order("created_at", { ascending: false }).limit(40);

  const facts = {
    preferred_brands: p.preferred_brands, preferred_models: p.preferred_models,
    preferred_references: p.preferred_references, budget_min: p.budget_min, budget_max: p.budget_max,
    buying_stage: p.buying_stage, buy_probability: p.buy_probability,
    scores: {
      price_sensitivity: p.price_sensitivity, speed_preference: p.speed_preference,
      detail_preference: p.detail_preference, resale_importance: p.resale_importance,
      risk_tolerance: p.risk_tolerance,
    },
    interests: ints, recent_events: evts,
    conversation: (convs ?? []).map((c) => `${c.role}: ${c.message}`).join("\n").slice(0, 6000),
  };

  const system =
    "너는 명품시계 거래 플랫폼 벨로르의 고객 분석 전문가다. 주어진 고객의 누적 데이터(대화/관심/행동/점수)를 보고 " +
    "①한국어 2~3문장 영업용 요약(ai_summary) ②핵심 장기메모리 배열(memories) ③확신이 안 서서 관리자에게 " +
    "물어보고 싶은 질문(questions, 최대 3개, 없으면 빈 배열)을 만든다. questions 는 예를 들어 " +
    "'예산 상한을 직접 확인한 적이 없는데 여쭤봐도 될까요?' 처럼 실제로 도움될 때만 만들고 억지로 채우지 마라. " +
    "추측은 confidence 를 낮춰라. 반드시 아래 JSON 만 출력: " +
    '{"ai_summary":"...","customer_type":"value_seeker|collector|gift_buyer|investor|unknown",' +
    '"memories":[{"memory_type":"preference|budget|personality|risk|brand_interest|buying_intent","content":"...","confidence":0-100}],' +
    '"questions":["..."]}';
  const user = "고객 누적 데이터:\n" + JSON.stringify(facts, null, 0);

  const raw = await llm(system, user, 800);
  const parsed = safeJson(raw);
  if (!parsed) return { profile_id: profileId, error: "parse_failed", raw: raw.slice(0, 300) };

  // 프로필 요약 갱신
  await admin.from("customer_ai_profiles").update({
    ai_summary: String(parsed.ai_summary ?? "").slice(0, 1000),
    customer_type: parsed.customer_type ?? p.customer_type ?? null,
  }).eq("id", profileId);

  // 장기 메모리 저장. 재실행 시 누적 폭증을 막기 위해 이전 AI생성 메모리
  // (이벤트/대화에 직접 연결되지 않은 = source_*_id 가 NULL 인 행)만 교체한다.
  // '궁금한 점'(memory_type='question')도 같이 갈아끼운다 — 매번 최신 상황 기준으로 다시 물어봄.
  await admin.from("ai_customer_memories").delete()
    .eq("profile_id", profileId).is("source_conversation_id", null).is("source_event_id", null);
  const mems = Array.isArray(parsed.memories) ? parsed.memories.slice(0, 12) : [];
  const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 3) : [];
  const rows = mems.map((m: any) => ({
    profile_id: profileId, user_id: p.user_id ?? null,
    memory_type: String(m.memory_type ?? "preference"),
    content: String(m.content ?? "").slice(0, 500),
    confidence: Math.max(0, Math.min(100, Number(m.confidence) || 50)),
  })).concat(questions.map((q: string) => ({
    profile_id: profileId, user_id: p.user_id ?? null,
    memory_type: "question", content: String(q).slice(0, 500), confidence: 40,
  })));
  if (rows.length) await admin.from("ai_customer_memories").insert(rows);
  return { profile_id: profileId, ai_summary: parsed.ai_summary, memories: mems.length, questions: questions.length };
}

// ── action 2: 팀 메시지 → 전문가 지식 추출 ──
async function extractKnowledge(admin: SB, limit: number) {
  const { data: msgs } = await admin.from("team_messages")
    .select("id,platform,channel_name,message,created_at")
    .order("created_at", { ascending: false }).limit(limit);
  if (!msgs?.length) return { extracted: 0 };

  const system =
    "너는 명품시계 전문가다. 팀 내부 대화에서 '재사용 가능한 시계 지식'(시세 근거/감정 포인트/모델 특징/" +
    "구성품 영향 등)만 골라 정리한다. 잡담/일정/개인정보는 제외. 반드시 JSON 배열만 출력: " +
    '[{"brand":null,"model":null,"reference_number":null,"category":"시세|감정|모델|구성품|기타",' +
    '"title":"...","content":"...","confidence":0-100}]';
  const user = "팀 대화 목록:\n" + msgs.map((m) => `- ${m.message}`).join("\n").slice(0, 6000);

  const raw = await llm(system, user, 1200);
  const parsed = safeJson(raw);
  const notes = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.notes) ? parsed.notes : []);
  if (!notes.length) return { extracted: 0, raw: raw.slice(0, 200) };

  const rows = notes.slice(0, 20).map((n: any) => ({
    category: n.category ?? null, brand: n.brand ?? null, model: n.model ?? null,
    reference_number: n.reference_number ?? null,
    title: String(n.title ?? "지식").slice(0, 120),
    content: String(n.content ?? "").slice(0, 2000),
    source: "ai-learn:team", confidence: Math.max(0, Math.min(100, Number(n.confidence) || 60)),
    status: "draft",
  }));
  await admin.from("expert_knowledge_notes").insert(rows);
  return { extracted: rows.length };
}

// ── action: 시세 정리 (규칙기반, AI 불필요·무료) ──
// Discord/Slack 대화에서 "브랜드 + 레퍼런스 + 금액 + 매입/판매 여부"를 추출해
// watch_market_prices 에 구조화 저장한다. 같은 메시지는 재실행해도 중복 저장 안 됨
// (source_message_id 유니크 인덱스).
const BRANDS: [string, string[]][] = [
  ["롤렉스", ["rolex", "롤렉스", "롤"]], ["오메가", ["omega", "오메가"]],
  ["까르띠에", ["cartier", "까르띠에"]], ["태그호이어", ["tag heuer", "태그호이어"]],
  ["리차드밀", ["richard mille", "리차드밀"]], ["파텍필립", ["patek", "파텍필립", "파텍"]],
  ["오데마피게", ["audemars", "오데마피게", "오데마"]], ["바쉐론 콘스탄틴", ["vacheron", "바쉐론"]],
  ["IWC", ["iwc"]], ["파네라이", ["panerai", "파네라이"]], ["튜더", ["tudor", "튜더"]],
  ["브라이틀링", ["breitling", "브라이틀링"]], ["위블로", ["hublot", "위블로"]],
];
function tagBrand(text: string): string | null {
  const low = text.toLowerCase();
  for (const [name, keys] of BRANDS) if (keys.some((k) => low.includes(k))) return name;
  return null;
}
const REF_WHITELIST = ["124060", "126610LN", "126610LV", "116610LN", "116500LN", "126500LN",
  "16233", "16220", "5711", "5712", "15202", "15500", "15510", "126710BLRO", "126710BLNR"];
function tagReference(text: string): string | null {
  for (const r of REF_WHITELIST) if (new RegExp(r, "i").test(text)) return r.toUpperCase();
  const m = text.match(/\b(\d{4,6}[A-Za-z]{0,4})\b/);
  if (!m) return null;
  const t = m[1];
  if (/^\d{4}$/.test(t) && +t > 1900 && +t < 2100) return null; // 연도 제외
  return t.toUpperCase();
}
function tagPriceKrw(text: string): number | null {
  const t = text.replace(/,/g, "");
  const re = /(\d+(?:\.\d+)?)\s*(억|천만|천|백만|만)?\s*(원)?/g;
  let m: RegExpExecArray | null; let best: number | null = null;
  while ((m = re.exec(t))) {
    const num = parseFloat(m[1]); const unit = m[2] ?? ""; const won = m[3] ?? "";
    let krw: number | null = null;
    if (unit === "억") krw = num * 100000000;
    else if (unit === "천만") krw = num * 10000000;
    else if (unit === "백만") krw = num * 1000000;
    else if (unit === "천") krw = num * 10000000;
    else if (unit === "만") krw = num * 10000;
    else if (won) krw = num;
    else if (num >= 100 && num <= 99999) krw = num * 10000; // 단위 없는 3~5자리 = 만원 단위 추정
    if (krw && krw >= 500000) best = best ? Math.max(best, krw) : krw;
  }
  return best;
}
function tagDealType(text: string): string {
  if (/매입|사왔|매입가|입고가/.test(text)) return "매입";
  if (/판매|팔았|판매가|출고가/.test(text)) return "판매";
  return "참고";
}

async function extractMarketInsights(admin: SB, limit: number) {
  const { data: already } = await admin.from("watch_market_prices")
    .select("source_message_id").not("source_message_id", "is", null);
  const done = new Set((already ?? []).map((r: any) => r.source_message_id));

  const { data: msgs } = await admin.from("team_messages")
    .select("id,message,platform,created_at").order("created_at", { ascending: false }).limit(limit);
  const rows: any[] = [];
  for (const m of msgs ?? []) {
    if (done.has(m.id)) continue;
    const text = m.message ?? "";
    const brand = tagBrand(text); const ref = tagReference(text); const price = tagPriceKrw(text);
    if (!brand || !ref || !price) continue; // 셋 다 있어야 "시세 정보"로 인정(잡담 제외)
    rows.push({
      brand, reference_number: ref, price: price, price_krw: price, currency: "KRW",
      source: m.platform ?? "discord", deal_type: tagDealType(text),
      source_message_id: m.id, raw_data: { text }, scraped_at: m.created_at,
    });
  }
  if (rows.length) {
    const { error } = await admin.from("watch_market_prices").insert(rows);
    if (error) return { extracted: 0, error: error.message };
  }
  return { extracted: rows.length, scanned: (msgs ?? []).length };
}

// ── action: 고객 챗봇용 시세 조회 (규칙기반, 무료, 원본 대화 텍스트는 노출 안 함) ──
// 팀 메시지 원문(raw_data)은 내부 대화라 고객에게 그대로 보여주면 안 되므로,
// 여기서는 집계된 숫자(최소/최대/매입·판매 건수)만 반환한다.
async function lookupMarketPrice(admin: SB, brand: string | null, reference: string | null) {
  let q = admin.from("watch_market_prices").select("price_krw,price,deal_type");
  if (reference) q = q.ilike("reference_number", `%${reference}%`);
  else if (brand) q = q.eq("brand", brand);
  else return { count: 0 };
  const { data } = await q.limit(500);
  const rows = data ?? [];
  const prices = rows.map((r: any) => Number(r.price_krw ?? r.price) || 0).filter(Boolean);
  if (!prices.length) return { count: 0 };
  return {
    count: rows.length, min: Math.min(...prices), max: Math.max(...prices),
    buy: rows.filter((r: any) => r.deal_type === "매입").length,
    sell: rows.filter((r: any) => r.deal_type === "판매").length,
  };
}

// ── action: 매거진/블로그 초안 생성 (AI 필요) ──
// 최근 팀 대화(정보성) + 고객 관심 트렌드를 근거로 "요즘 시계 반응 / 주의할 점" 초안을 쓴다.
// expert_knowledge_notes 에 category='매거진초안', status='draft' 로 저장 → 관리자 승인 대기.
async function generateMagazineDraft(admin: SB) {
  const { data: msgs } = await admin.from("team_messages")
    .select("message").order("created_at", { ascending: false }).limit(80);
  const { data: profiles } = await admin.from("customer_ai_profiles")
    .select("preferred_brands").limit(300);
  const brandCount: Record<string, number> = {};
  for (const p of profiles ?? []) for (const b of p.preferred_brands ?? []) brandCount[b] = (brandCount[b] ?? 0) + 1;
  const topBrands = Object.entries(brandCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([b]) => b);

  const system =
    "너는 명품시계 매장 벨로르의 콘텐츠 에디터다. 팀 내부 대화와 고객 관심 트렌드를 바탕으로 " +
    "매거진/블로그에 쓸 한국어 초안을 작성한다. '요즘 시계 시장 반응은 이렇다' + '이런 부분을 조심해야 한다' " +
    "형식으로, 과장 없이 사실적으로. 반드시 JSON만 출력: " +
    '{"title":"...","content":"..."} (content는 400~700자, 문단 구분 포함)';
  const user = `최근 관심 브랜드 Top: ${topBrands.join(", ") || "데이터 부족"}\n` +
    "팀 대화 발췌:\n" + (msgs ?? []).map((m) => "- " + m.message).join("\n").slice(0, 5000);

  const raw = await llm(system, user, 1200);
  const parsed = safeJson(raw);
  if (!parsed?.title || !parsed?.content) return { created: false, raw: raw.slice(0, 200) };

  await admin.from("expert_knowledge_notes").insert({
    category: "매거진초안", title: String(parsed.title).slice(0, 120),
    content: String(parsed.content).slice(0, 3000), source: "ai-learn:magazine",
    confidence: 60, status: "draft",
  });
  return { created: true, title: parsed.title };
}

// ── action 3: 지침 기반 답변 생성 (학습소 + 메모리 + 지침으로 응답) ──
async function generateReply(admin: SB, profileId: string | null, message: string, candidates: unknown) {
  const guide = await guidelinesText(admin);
  let memo = "", facts = "";
  if (profileId) {
    const { data: p } = await admin.from("customer_ai_profiles").select("*").eq("id", profileId).single();
    if (p) {
      facts = `고객 관심:${(p.preferred_brands ?? []).join(",")} ${(p.preferred_references ?? []).join(",")} / 예산:${p.budget_min ?? "?"}~${p.budget_max ?? "?"} / 단계:${p.buying_stage}`;
    }
    const { data: mems } = await admin.from("ai_customer_memories")
      .select("content").eq("profile_id", profileId).order("confidence", { ascending: false }).limit(8);
    memo = (mems ?? []).map((m) => "- " + m.content).join("\n");
  }
  // 관심 브랜드/레퍼런스 관련 전문가 지식(승인본 우선)
  const brand = (message.match(/롤렉스|오메가|파텍|오데마|까르띠에|튜더/) ?? [])[0] ?? null;
  let knowledge = "";
  if (brand) {
    const { data: kn } = await admin.from("expert_knowledge_notes")
      .select("title,content").eq("brand", brand).in("status", ["approved", "reviewed"]).limit(5);
    knowledge = (kn ?? []).map((k) => `- ${k.title}: ${k.content}`).join("\n");
  }
  const system = [
    "너는 명품시계 거래 플랫폼 벨로르의 AI 시계 전문비서다. 반드시 한국어 존댓말로만 답하라. " +
    "영어·사고과정·<think> 태그·설명 절대 출력 금지. 오직 고객에게 할 최종 답변만 2~4문장으로 간결하고 친근하게.",
    guide,
    knowledge ? ("## 참고 전문가 지식\n" + knowledge) : "",
    memo ? ("## 이 고객 기억\n" + memo) : "",
  ].filter(Boolean).join("\n\n");
  const user = [
    facts ? ("[" + facts + "]") : "",
    candidates ? ("추천 후보(점수순): " + JSON.stringify(candidates).slice(0, 1500)) : "",
    "고객 메시지: " + message,
  ].filter(Boolean).join("\n");

  const reply = await llm(system, user, 400);
  return { reply: reply.trim() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { action, profile_id, limit, message, candidates, brand, reference_number } = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 시세 정리/조회는 규칙기반(무료) — AI 키 없이도 항상 동작
    if (action === "extract_market_insights") {
      return json({ ok: true, result: await extractMarketInsights(admin, Math.min(Number(limit) || 200, 500)) });
    }
    if (action === "market_price_lookup") {
      return json({ ok: true, result: await lookupMarketPrice(admin, brand ?? null, reference_number ?? null) });
    }

    if (!hasKey()) {
      return json({ ok: true, skipped: "ai_key_not_set", provider: PROVIDER,
        hint: "무료로 켜려면 AI_PROVIDER=gemini + GEMINI_API_KEY(구글 AI 스튜디오 무료). 또는 Groq 무료: AI_PROVIDER=openai + AI_BASE_URL=https://api.groq.com/openai/v1 + OPENAI_API_KEY. 미설정 시 규칙기반이 동작합니다." });
    }

    if (action === "generate_magazine_draft") {
      return json({ ok: true, result: await generateMagazineDraft(admin) });
    }
    if (action === "summarize_profile") {
      if (!profile_id) return json({ error: "missing_profile_id" }, 400);
      return json({ ok: true, result: await summarizeProfile(admin, profile_id) });
    }
    if (action === "summarize_all") {
      // 최근 업데이트된 프로필 N개 재요약(정기 학습용)
      const { data: ps } = await admin.from("customer_ai_profiles")
        .select("id").order("updated_at", { ascending: false }).limit(Math.min(Number(limit) || 30, 100));
      const out = [];
      for (const p of ps ?? []) out.push(await summarizeProfile(admin, p.id));
      return json({ ok: true, count: out.length, results: out });
    }
    if (action === "extract_knowledge") {
      return json({ ok: true, result: await extractKnowledge(admin, Math.min(Number(limit) || 30, 100)) });
    }
    if (action === "generate_reply") {
      if (!message) return json({ error: "missing_message" }, 400);
      return json({ ok: true, result: await generateReply(admin, profile_id ?? null, String(message), candidates ?? null) });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
