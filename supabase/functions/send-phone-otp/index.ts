import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import { corsHeaders, jsonResponse, normalizePhone, rejectDisallowedOrigin, safeText, sha256Hex } from "../_shared/verification-core.mjs";
import { createOtpChallenge, solapiAuthorization } from "../_shared/phone-otp.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const API_KEY = Deno.env.get("SOLAPI_API_KEY") ?? "";
const API_SECRET = Deno.env.get("SOLAPI_API_SECRET") ?? "";
const SENDER = (Deno.env.get("SOLAPI_SENDER") ?? "").replace(/\D/g, "");
const SIGNING_KEY = Deno.env.get("PHONE_OTP_SIGNING_KEY") ?? "";
const ENABLED = Deno.env.get("PHONE_OTP_ENABLED") === "true";

async function consumeRateLimit(admin: any, scope: string, value: string) {
  const rateKey = await sha256Hex(`phone-otp-rate-v1\0${SIGNING_KEY}\0${scope}\0${value}`);
  const { error } = await admin.rpc("consume_checkout_rate_limit", { p_rate_key: rateKey });
  if (error) throw new Error(String(error.message || "OTP_RATE_LIMITED").includes("rate_limited") ? "OTP_RATE_LIMITED" : "OTP_RATE_LIMIT_FAILED");
}

Deno.serve(async (req) => {
  const traceId = crypto.randomUUID();
  if (req.method === "OPTIONS") {
    if (rejectDisallowedOrigin(req)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return jsonResponse(req, { ok: false, code: "METHOD" }, 405);
  if (rejectDisallowedOrigin(req)) return jsonResponse(req, { ok: false, code: "ORIGIN_FORBIDDEN" }, 403);
  if (!ENABLED || !SUPABASE_URL || !SERVICE_ROLE || !API_KEY || !API_SECRET || !SENDER || !SIGNING_KEY) {
    return jsonResponse(req, { ok: false, code: "SMS_NOT_CONFIGURED", traceId }, 503);
  }

  try {
    const body = await req.json() as Record<string, unknown>;
    const phone = normalizePhone(body.phone);
    if (!phone || !/^010\d{8}$/.test(phone)) return jsonResponse(req, { ok: false, code: "BAD_PHONE", traceId }, 400);
    const forwarded = safeText(req.headers.get("x-forwarded-for"), 120)?.split(",")[0]?.trim() || "unknown";
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    await consumeRateLimit(admin, "phone", phone);
    await consumeRateLimit(admin, "ip", forwarded);

    const code = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    const otp = String(code).padStart(6, "0");
    const created = await createOtpChallenge({ secret: SIGNING_KEY, phone, code: otp });
    const response = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
      method: "POST",
      headers: { authorization: await solapiAuthorization(API_KEY, API_SECRET), "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ to: phone, from: SENDER, type: "SMS", autoTypeDetect: false,
        text: `[벨로르] 휴대폰 인증번호는 ${otp}입니다. 5분 안에 입력해 주세요.` }] }),
    });
    const output = await response.json().catch(() => ({})) as Record<string, unknown>;
    const failures = Array.isArray(output.failedMessageList) ? output.failedMessageList as Record<string, unknown>[] : [];
    const accepted = Array.isArray(output.messageList) ? output.messageList as Record<string, unknown>[] : [];
    if (!response.ok || failures.length > 0 || accepted.length !== 1) {
      const first = failures[0] ?? output;
      const providerCode = safeText(first.statusCode, 80) ?? safeText(first.errorCode, 80)
        ?? safeText(first.statusMessage, 80) ?? safeText(first.errorMessage, 80) ?? "SOLAPI_SEND_FAILED";
      console.error(JSON.stringify({ event: "phone_otp_send_failed", traceId, code: "SMS_PROVIDER_FAILED", providerStatus: response.status, providerCode }));
      return jsonResponse(req, { ok: false, code: "SMS_PROVIDER_FAILED", traceId }, 502);
    }
    console.log(JSON.stringify({ event: "phone_otp_sent", traceId, providerStatus: response.status }));
    return jsonResponse(req, { ok: true, challenge: created.challenge, expiresAt: new Date(created.expiresAt).toISOString(), traceId });
  } catch (error) {
    const code = safeText((error as Error)?.message, 80) ?? "SMS_SEND_FAILED";
    const status = code === "OTP_RATE_LIMITED" ? 429 : 502;
    console.error(JSON.stringify({ event: "phone_otp_send_failed", traceId, code }));
    return jsonResponse(req, { ok: false, code, traceId }, status);
  }
});
