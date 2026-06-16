// ============================================================
// 벨로르(BELLORE) · VIP 업체 카톡 알림톡 발송 Edge Function
// ------------------------------------------------------------
// 배포:
//   1) 솔라피(solapi.com) 가입 → 카카오 채널 연동 → 알림톡 템플릿 등록(심사)
//   2) 시크릿 등록 (절대 깃에 올리지 말 것!):
//        supabase secrets set SOLAPI_API_KEY=...
//        supabase secrets set SOLAPI_API_SECRET=...
//        supabase secrets set SOLAPI_PFID=...          # 카카오 발신프로필 ID
//        supabase secrets set SOLAPI_TEMPLATE_ID=...    # 등록한 알림톡 템플릿 ID
//        supabase secrets set SOLAPI_SENDER=025550000   # 등록된 발신번호(대체문자용)
//   3) supabase functions deploy notify-vip-kakao --no-verify-jwt
//
// 동작:
//   - 관리자가 비교견적을 승인(open)하면 클라이언트가 { quoteId } 로 호출.
//   - 서버에서 견적/대상(VIP 승인업체 + 휴대폰)을 다시 조회(위·변조 방지)하고
//     솔라피 알림톡으로 발송합니다. 시크릿 미설정 시 조용히 skip.
//   - 템플릿 변수: #{label} (예: "롤렉스 서브마리너")
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const API_KEY = Deno.env.get("SOLAPI_API_KEY") ?? "";
const API_SECRET = Deno.env.get("SOLAPI_API_SECRET") ?? "";
const PFID = Deno.env.get("SOLAPI_PFID") ?? "";
const TEMPLATE_ID = Deno.env.get("SOLAPI_TEMPLATE_ID") ?? "";
const SENDER = (Deno.env.get("SOLAPI_SENDER") ?? "").replace(/[^0-9]/g, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// 솔라피 HMAC-SHA256 인증 헤더 생성
async function solapiAuth(): Promise<string> {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(API_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(date + salt),
  );
  const signature = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { quoteId } = await req.json();
    if (!quoteId) return json({ error: "missing_params" }, 400);

    // 시크릿 미설정 시 조용히 skip (앱알림은 트리거가 이미 처리)
    if (!API_KEY || !API_SECRET || !PFID || !TEMPLATE_ID) {
      return json({ ok: true, skipped: "solapi_not_configured" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) 견적 조회 → 라벨 구성
    const { data: quote } = await admin
      .from("quote_requests")
      .select("item_brand,item_name,status")
      .eq("id", quoteId)
      .single();
    if (!quote) return json({ error: "quote_not_found" }, 404);

    const label =
      `${quote.item_brand ?? ""} ${quote.item_name ?? ""}`.trim() || "시계";

    // 2) 발송 대상: VIP + 승인업체 + 휴대폰 보유
    const { data: vendors } = await admin
      .from("profiles")
      .select("phone")
      .eq("role", "vendor")
      .eq("approved", true)
      .eq("vip", true);

    const tos = (vendors ?? [])
      .map((v) => (v.phone ?? "").replace(/[^0-9]/g, ""))
      .filter((p) => p.length >= 10);

    if (!tos.length) return json({ ok: true, sent: 0, reason: "no_vip_targets" });

    // 3) 솔라피 알림톡 발송 (send-many)
    const messages = tos.map((to) => ({
      to,
      from: SENDER || undefined,
      type: "ATA",
      kakaoOptions: {
        pfId: PFID,
        templateId: TEMPLATE_ID,
        variables: { "#{label}": label },
      },
    }));

    const res = await fetch("https://api.solapi.com/messages/v4/send-many", {
      method: "POST",
      headers: {
        Authorization: await solapiAuth(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });
    const out = await res.json();

    if (!res.ok) return json({ error: "solapi_failed", detail: out }, 400);
    return json({ ok: true, sent: tos.length, result: out });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
