import { runBelloreShopAi, getShopAiConfig } from "./bellore-shop-ai.mjs";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || "");
const WORKER_NAME = String(process.env.BELLORE_LOCAL_WORKER_NAME || "bellore-shop-office");
const WORKER_SECRET = String(process.env.BELLORE_LOCAL_WORKER_SECRET || "");
const POLL_MS = Math.max(800, Number(process.env.BELLORE_LOCAL_AI_POLL_MS || 1200));
const RUN_ONCE = process.argv.includes("--once");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !WORKER_SECRET) {
  throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, BELLORE_LOCAL_WORKER_SECRET가 필요합니다.");
}

let knowledgeCache = { expiresAt: 0, documents: [] };

async function rpc(name, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`${name} 실패: ${response.status} ${detail}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function loadKnowledge() {
  if (knowledgeCache.expiresAt > Date.now()) return knowledgeCache.documents;
  const rows = await rpc("get_shop_ai_knowledge", {
    p_worker_name: WORKER_NAME,
    p_worker_secret: WORKER_SECRET
  });
  const documents = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      key: row.knowledge_key,
      title: row.title,
      content: row.content
    }))
    .filter((row) => row.key && row.content);
  knowledgeCache = {
    expiresAt: Date.now() + 5 * 60 * 1000,
    documents
  };
  return documents;
}

async function claimRequest() {
  const rows = await rpc("claim_shop_ai_chat", {
    p_worker_name: WORKER_NAME,
    p_worker_secret: WORKER_SECRET
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function completeRequest(request, result) {
  const completed = await rpc("complete_shop_ai_chat", {
    p_worker_name: WORKER_NAME,
    p_worker_secret: WORKER_SECRET,
    p_request_id: request.request_id,
    p_response: result.response,
    p_model_name: result.meta.model,
    p_grounding_sources: result.meta.groundingSources,
    p_validation_errors: result.meta.validationErrors,
    p_fallback_used: result.meta.mode === "safe_fallback",
    p_latency_ms: result.meta.latencyMs
  });
  if (completed !== true) throw new Error("요청 완료 상태를 저장하지 못했습니다.");
}

async function processOne() {
  const request = await claimRequest();
  if (!request) return false;
  const documents = await loadKnowledge();
  const result = await runBelloreShopAi(
    {
      message: request.message,
      candidates: request.candidate_list
    },
    documents
  );
  await completeRequest(request, result);
  console.log(
    JSON.stringify({
      event: "bellore_shop_ai_completed",
      requestId: request.request_id,
      mode: result.meta.mode,
      model: result.meta.model,
      latencyMs: result.meta.latencyMs,
      validationErrorCount: result.meta.validationErrors.length
    })
  );
  return true;
}

async function healthCheck() {
  const config = getShopAiConfig();
  const response = await fetch(`${config.baseUrl}/api/tags`);
  if (!response.ok) throw new Error(`Ollama 상태 확인 실패: ${response.status}`);
  const payload = await response.json();
  const names = (payload.models || []).map((model) => model.name);
  if (!names.includes(config.model)) throw new Error(`로컬 모델이 없습니다: ${config.model}`);
  if (!names.includes(config.embeddingModel)) {
    throw new Error(`임베딩 모델이 없습니다: ${config.embeddingModel}`);
  }
  console.log(
    JSON.stringify({
      event: "bellore_shop_ai_worker_started",
      model: config.model,
      embeddingModel: config.embeddingModel,
      pollMs: POLL_MS,
      runOnce: RUN_ONCE
    })
  );
}

async function main() {
  await healthCheck();
  do {
    try {
      const processed = await processOne();
      if (RUN_ONCE) break;
      if (!processed) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "bellore_shop_ai_worker_error",
          message: error instanceof Error ? error.message : "worker_error"
        })
      );
      if (RUN_ONCE) {
        process.exitCode = 1;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(POLL_MS, 3000)));
    }
  } while (true);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
