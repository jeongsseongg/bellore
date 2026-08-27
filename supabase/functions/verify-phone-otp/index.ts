import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import { corsHeaders, jsonResponse, normalizePhone, rejectDisallowedOrigin, requireUser, safeText, sha256Hex } from "../_shared/verification-core.mjs";
import { publicOtpVerifyError, verifyOtpChallenge } from "../_shared/phone-otp.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SIGNING_KEY = Deno.env.get("PHONE_OTP_SIGNING_KEY") ?? "";
const ENABLED = Deno.env.get("PHONE_OTP_ENABLED") === "true";

async function consumeRateLimit(admin: any, scope: string, value: string) {
  const rateKey = await sha256Hex(`phone-otp-verify-rate-v1\0${SIGNING_KEY}\0${scope}\0${value}`);
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
  if (!ENABLED || !SUPABASE_URL || !SERVICE_ROLE || !SIGNING_KEY) {
    return jsonResponse(req, { ok: false, code: "SMS_NOT_CONFIGURED", traceId }, 503);
  }

  try {
    const body = await req.json() as Record<string, unknown>;
    const phone = normalizePhone(body.phone);
    const code = String(body.code ?? "").replace(/\D/g, "");
    const challenge = safeText(body.challenge, 2000);
    if (!phone || !/^010\d{8}$/.test(phone)) return jsonResponse(req, { ok: false, code: "BAD_PHONE", traceId }, 400);
    if (!/^\d{6}$/.test(code) || !challenge) return jsonResponse(req, { ok: false, code: "BAD_OTP", traceId }, 400);
    const forwarded = safeText(req.headers.get("x-forwarded-for"), 120)?.split(",")[0]?.trim() || "unknown";
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    await consumeRateLimit(admin, "challenge", challenge);
    await consumeRateLimit(admin, "ip", forwarded);
    const checked = await verifyOtpChallenge({ secret: SIGNING_KEY, challenge, phone, code });
    const user = await requireUser(admin, req);
    const verifiedAt = new Date().toISOString();
    const referenceHash = await sha256Hex(`solapi-sms-otp-v1\0${checked.nonce}`);
    if (!user) {
      const ticket = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
      const tokenHash = await sha256Hex(`signup-phone-ticket-v1\0${ticket}`);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { error } = await admin.from("member_signup_phone_tickets").insert({
        token_hash: tokenHash, phone, verified_name: null, provider: "solapi_sms_otp",
        provider_reference_hash: referenceHash, verified_at: verifiedAt, expires_at: expiresAt,
      });
      if (error) {
        const failure = error.code === "23505" ? "OTP_ALREADY_USED" : "TICKET_CREATE_FAILED";
        return jsonResponse(req, { ok: false, code: failure, traceId }, failure === "OTP_ALREADY_USED" ? 409 : 502);
      }
      return jsonResponse(req, { ok: true, phone, signupTicket: ticket, verifiedAt, expiresAt, traceId });
    }
    const { error } = await admin.rpc("finalize_member_verification", {
      p_user_id: user.id, p_method: "phone", p_provider: "solapi_sms_otp",
      p_provider_reference_hash: referenceHash, p_subject: { phone }, p_verified_at: verifiedAt,
    });
    if (error) throw error;
    return jsonResponse(req, { ok: true, phone, verifiedAt, traceId });
  } catch (error) {
    const detail = safeText((error as Error)?.message, 80) ?? "OTP_VERIFY_FAILED";
    const { code, status } = publicOtpVerifyError(error);
    console.error(JSON.stringify({ event: "phone_otp_verify_failed", traceId, code, detail }));
    return jsonResponse(req, { ok: false, code, traceId }, status);
  }
});
