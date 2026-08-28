import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  corsHeaders, jsonResponse, recordVerificationEvent,
  rejectDisallowedOrigin, requireUser, safeText, sha256Hex,
} from "../_shared/verification-core.mjs";
import { validatePortOneIdentity } from "../_shared/member-verification-providers.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_API_BASE = Deno.env.get("PORTONE_API_BASE") ?? "https://api.portone.io";
const PORTONE_STORE_ID = Deno.env.get("PORTONE_STORE_ID") ?? "";
const PORTONE_IDENTITY_CHANNEL_KEY = Deno.env.get("PORTONE_IDENTITY_CHANNEL_KEY") ?? "";
const ALLOW_TEST_IDENTITY = Deno.env.get("ALLOW_TEST_IDENTITY") === "true";
type JsonRecord = Record<string, unknown>;

function observedFailure(req: Request, traceId: string, code: string, status: number, details: JsonRecord = {}) {
  console.error(JSON.stringify({ event: "identity_verification_failed", traceId, code, ...details }));
  return jsonResponse(req, { ok: false, code, traceId }, status);
}

Deno.serve(async (req) => {
  const traceId = crypto.randomUUID();
  if (req.method === "OPTIONS") {
    if (rejectDisallowedOrigin(req)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return jsonResponse(req, { ok: false, code: "METHOD" }, 405);
  if (rejectDisallowedOrigin(req)) return jsonResponse(req, { ok: false, code: "ORIGIN_FORBIDDEN" }, 403);
  if (!SUPABASE_URL || !SERVICE_ROLE || !PORTONE_API_SECRET || !PORTONE_STORE_ID || !PORTONE_IDENTITY_CHANNEL_KEY) {
    return observedFailure(req, traceId, "NOT_CONFIGURED", 503);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  let user: { id: string } | null = null;
  let referenceHash: string | null = null;

  try {
    user = await requireUser(admin, req);
    const body = await req.json() as JsonRecord;
    const identityVerificationId = safeText(body.identityVerificationId, 80);
    if (!identityVerificationId || !/^[A-Za-z0-9_-]{8,80}$/.test(identityVerificationId)) {
      return observedFailure(req, traceId, "BAD_IDENTITY_ID", 400);
    }
    referenceHash = await sha256Hex(`portone-identity-v1\0${identityVerificationId}`);
    const { data: prior } = user ? await admin.from("member_verification_events")
      .select("user_id").eq("method", "phone").eq("provider", "portone_inicis_unified")
      .eq("provider_reference_hash", referenceHash).eq("status", "verified").maybeSingle() : { data: null };
    if (prior && user) {
      if (prior.user_id !== user.id) return observedFailure(req, traceId, "IDENTITY_ALREADY_USED", 409);
      const { data: profile } = await admin.from("profiles").select("phone").eq("id", user.id).single();
      return jsonResponse(req, { ok: true, alreadyVerified: true, phone: profile?.phone ?? null });
    }

    const providerResponse = await fetch(`${PORTONE_API_BASE}/identity-verifications/${encodeURIComponent(identityVerificationId)}`, {
      headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` },
    });
    const verification = await providerResponse.json().catch(() => null) as JsonRecord | null;
    if (!providerResponse.ok || !verification) {
      const providerCode = safeText(verification?.code, 80) ?? safeText(verification?.type, 80) ?? "PROVIDER_LOOKUP_FAILED";
      return observedFailure(req, traceId, "PROVIDER_LOOKUP_FAILED", 502, {
        providerStatus: providerResponse.status, providerCode,
      });
    }
    const actualChannel = verification.channel && typeof verification.channel === "object" && !Array.isArray(verification.channel)
      ? verification.channel as JsonRecord
      : null;
    const diagnostics = {
      expectedStoreId: PORTONE_STORE_ID,
      actualStoreId: safeText(verification.storeId, 120),
      expectedChannelKey: PORTONE_IDENTITY_CHANNEL_KEY,
      actualChannelKey: safeText(actualChannel?.key, 120),
      actualChannelType: safeText(actualChannel?.type, 20),
      providerStatus: safeText(verification.status, 40),
    };
    let checked;
    try {
      checked = validatePortOneIdentity(verification, {
        storeId: PORTONE_STORE_ID,
        channelKey: PORTONE_IDENTITY_CHANNEL_KEY,
        allowTest: ALLOW_TEST_IDENTITY,
      });
    } catch (validationError) {
      const code = safeText((validationError as Error)?.message, 80) ?? "PROVIDER_VALIDATION_FAILED";
      if (user) {
        await recordVerificationEvent(admin, { userId: user.id, method: "phone", status: "error",
          provider: "portone_inicis_unified", providerReferenceHash: referenceHash, reasonCode: code });
      }
      return observedFailure(req, traceId, code, 502, diagnostics);
    }
    if (!checked.verified) {
      if (user) await recordVerificationEvent(admin, { userId: user.id, method: "phone", status: "rejected",
          provider: "portone_inicis_unified", providerReferenceHash: referenceHash,
          reasonCode: `STATUS_${checked.status}` });
      return observedFailure(req, traceId, "NOT_VERIFIED", 409, diagnostics);
    }
    if (!("phone" in checked)) throw new Error("VERIFIED_PHONE_MISSING");
    const phone = checked.phone;
    const name = checked.name ?? null;
    const verifiedAt = new Date().toISOString();
    if (!user) {
      const ticket = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
      const tokenHash = await sha256Hex(`signup-phone-ticket-v1\0${ticket}`);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { error: ticketError } = await admin.from("member_signup_phone_tickets").insert({
        token_hash: tokenHash, phone, verified_name: name, provider: "portone_inicis_unified",
        provider_reference_hash: referenceHash, verified_at: verifiedAt, expires_at: expiresAt,
      });
      if (ticketError) {
        const code = ticketError.code === "23505" ? "IDENTITY_ALREADY_USED" : "TICKET_CREATE_FAILED";
        return observedFailure(req, traceId, code, code === "IDENTITY_ALREADY_USED" ? 409 : 502, {
          databaseCode: safeText(ticketError.code, 40),
        });
      }
      return jsonResponse(req, { ok: true, phone, name, verifiedAt, signupTicket: ticket, expiresAt });
    }
    const { error: finalizeError } = await admin.rpc("finalize_member_verification", {
      p_user_id: user.id, p_method: "phone", p_provider: "portone_inicis_unified",
      p_provider_reference_hash: referenceHash, p_subject: { phone }, p_verified_at: verifiedAt,
    });
    if (finalizeError) throw finalizeError;
    return jsonResponse(req, { ok: true, phone, name, verifiedAt });
  } catch (error) {
    const reason = safeText((error as Error)?.message, 80) ?? "ERROR";
    try {
      if (user) await recordVerificationEvent(admin, { userId: user.id, method: "phone", status: "error",
          provider: "portone_inicis_unified", providerReferenceHash: referenceHash, reasonCode: reason });
    } catch { /* preserve primary failure */ }
    return observedFailure(req, traceId, reason, 502);
  }
});
