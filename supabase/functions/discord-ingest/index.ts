// ============================================================
// 벨로르(BELLORE) · Discord/Slack 메시지 수집 Edge Function
// ------------------------------------------------------------
// 목적: 내부 팀(전문가) Discord/Slack 대화·이미지를 수집해 team_messages /
//   team_message_attachments 에 저장하고, 시계 키워드(브랜드/레퍼런스)를 태깅한다.
//   → 누적된 팀 지식은 ai-learn 으로 전문가 지식(expert_knowledge_notes)으로 승격.
//
// 왜 Edge Function 인가:
//   - Discord 는 채널 메시지를 임의 URL 로 자동 전송하지 않는다(봇 필요).
//   - 그래서 "작은 봇"(Discord Gateway 를 듣는 프로세스: Cloudflare Worker /
//     Deno Deploy / 라즈베리파이 등 아무 곳)이 메시지를 받아 이 함수로 POST 한다.
//   - 봇 토큰은 봇 쪽에만 두고, 이 함수는 공유 시크릿(헤더)으로 인증한다.
//     → 클라이언트/깃에 토큰이 노출되지 않는다.
//
// 배포:
//   supabase secrets set DISCORD_INGEST_SECRET=<길고-임의의-문자열>
//   supabase functions deploy discord-ingest --no-verify-jwt
//
// 봇이 보내는 요청(예):
//   POST /functions/v1/discord-ingest
//   Header: x-ingest-secret: <DISCORD_INGEST_SECRET>
//   Body(JSON):
//   {
//     "platform": "discord",                 // or "slack"
//     "channel_id": "123", "channel_name": "#시세-정보",
//     "sender_id": "u1", "sender_name": "감정사 박",
//     "message": "서브마리너 124060 풀세트 시세 1450 정도",
//     "attachments": [                        // 선택(이미지/파일)
//       { "url": "https://cdn.discord.../a.jpg", "file_name": "a.jpg",
//         "file_type": "image/jpeg", "file_size": 123456 }
//     ],
//     "created_at": "2026-06-29T08:00:00Z"    // 선택
//   }
//
// 첨부 처리: 봇이 보낸 url 을 그대로 Storage(team-message-attachments)에 미러링
//   저장하고 공개/서명 URL 을 DB 에 기록한다(원본 CDN 만료 대비). 다운로드 실패 시
//   url 만 기록(끊김 없음).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INGEST_SECRET = Deno.env.get("DISCORD_INGEST_SECRET") ?? "";
const BUCKET = "team-message-attachments";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// 시계 브랜드 키워드(한/영) — 클라이언트 ruleExtractor 와 동일 철학
const BRANDS: [string, string[]][] = [
  ["롤렉스", ["rolex", "롤렉스", "롤"]],
  ["오메가", ["omega", "오메가"]],
  ["까르띠에", ["cartier", "까르띠에"]],
  ["태그호이어", ["tag heuer", "tagheuer", "태그호이어"]],
  ["리차드밀", ["richard mille", "리차드밀"]],
  ["파텍필립", ["patek", "파텍필립", "파텍"]],
  ["오데마피게", ["audemars", "오데마피게", "오데마", "ap"]],
  ["바쉐론 콘스탄틴", ["vacheron", "바쉐론"]],
  ["IWC", ["iwc"]],
  ["파네라이", ["panerai", "파네라이"]],
  ["튜더", ["tudor", "튜더"]],
  ["브라이틀링", ["breitling", "브라이틀링"]],
  ["위블로", ["hublot", "위블로"]],
  ["예거 르쿨트르", ["jaeger", "jlc", "예거"]],
  ["브레게", ["breguet", "브레게"]],
  ["블랑팡", ["blancpain", "블랑팡"]],
];

function tagBrand(text: string): string | null {
  const low = (text ?? "").toLowerCase();
  for (const [name, keys] of BRANDS) {
    if (keys.some((k) => low.includes(k))) return name;
  }
  return null;
}
function tagReference(text: string): string | null {
  const m = (text ?? "").match(/\b(\d{4,6}[A-Za-z]{0,4})\b/);
  if (!m) return null;
  const t = m[1];
  if (/^\d{4}$/.test(t) && +t > 1900 && +t < 2100) return null; // 연도 제외
  return t.toUpperCase();
}

async function mirrorAttachment(
  admin: ReturnType<typeof createClient>,
  msgId: string,
  att: { url?: string; file_name?: string; file_type?: string; file_size?: number },
) {
  let storagePath = "";
  let fileUrl = att.url ?? null;
  try {
    if (att.url) {
      const res = await fetch(att.url);
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        const ext = (att.file_name?.split(".").pop() || "bin").toLowerCase();
        storagePath = `${msgId}/${crypto.randomUUID()}.${ext}`;
        const up = await admin.storage.from(BUCKET).upload(storagePath, buf, {
          contentType: att.file_type || res.headers.get("content-type") || "application/octet-stream",
          upsert: false,
        });
        if (up.error) { storagePath = ""; }
        else {
          const signed = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 365);
          fileUrl = signed.data?.signedUrl ?? fileUrl;
        }
      }
    }
  } catch (_e) { /* 미러링 실패 → 원본 url 만 기록 */ }

  await admin.from("team_message_attachments").insert({
    team_message_id: msgId,
    storage_path: storagePath || (att.url ?? ""),
    file_url: fileUrl,
    file_name: att.file_name ?? null,
    file_type: att.file_type ?? null,
    file_size: att.file_size ?? null,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // 공유 시크릿 인증(봇만 호출 가능)
  if (!INGEST_SECRET) return json({ error: "DISCORD_INGEST_SECRET_not_set" }, 503);
  if (req.headers.get("x-ingest-secret") !== INGEST_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const items = Array.isArray(body) ? body : [body]; // 단건/배치 모두 허용
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const results: unknown[] = [];

    for (const it of items) {
      const text = String(it.message ?? "");
      const attachments = Array.isArray(it.attachments) ? it.attachments : [];
      const row = {
        platform: String(it.platform ?? "discord"),
        channel_id: it.channel_id ?? null,
        channel_name: it.channel_name ?? null,
        sender_id: it.sender_id ?? null,
        sender_name: it.sender_name ?? null,
        message: text,
        has_attachment: attachments.length > 0,
        metadata: {
          brand: tagBrand(text),
          reference_number: tagReference(text),
          raw: it.metadata ?? {},
        },
        created_at: it.created_at ?? new Date().toISOString(),
      };
      const { data, error } = await admin.from("team_messages").insert(row).select("id").single();
      if (error) { results.push({ error: error.message }); continue; }

      for (const att of attachments) {
        await mirrorAttachment(admin, data.id, att);
      }
      results.push({ id: data.id, attachments: attachments.length });
    }

    return json({ ok: true, ingested: results.length, results });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
