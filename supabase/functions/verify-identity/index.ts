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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (rejectDisallowedOrigin(req)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return jsonResponse(req, { ok: false, code: "METHOD" }, 405);
  if (rejectDisallowedOrigin(req)) return jsonResponse(req, { ok: false, code: "ORIGIN_FORBIDDEN" }, 403);
  if (!SUPABASE_URL || !SERVICE_ROLE || !PORTONE_API_SECRET || !PORTONE_STORE_ID || !PORTONE_IDENTITY_CHANNEL_KEY) {
    return jsonResponse(req, { ok: false, code: "NOT_CONFIGURED" }, 503);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const user = await requireUser(admin, req);
  if (!user) return jsonResponse(req, { ok: false, code: "UNAUTHORIZED" }, 401);
  let referenceHash: string | null = null;

  try {
    const body = await req.json() as JsonRecord;
    const identityVerificationId = safeText(body.identityVerificationId, 80);
    if (!identityVerificationId || !/^[A-Za-z0-9_-]{8,80}$/.test(identityVerificationId)) {
      return jsonResponse(req, { ok: false, code: "BAD_IDENTITY_ID" }, 400);
    }
    referenceHash = await sha256Hex(`portone-identity-v1\0${identityVerificationId}`);
    const { data: prior } = await admin.from("member_verification_events")
      .select("user_id").eq("method", "phone").eq("provider", "portone_inicis_unified")
      .eq("provider_reference_hash", referenceHash).eq("status", "verified").maybeSingle();
    if (prior) {
      if (prior.user_id !== user.id) return jsonResponse(req, { ok: false, code: "IDENTITY_ALREADY_USED" }, 409);
      const { data: profile } = await admin.from("profiles").select("phone").eq("id", user.id).single();
      return jsonResponse(req, { ok: true, alreadyVerified: true, phone: profile?.phone ?? null });
    }

    const providerResponse = await fetch(`${PORTONE_API_BASE}/identity-verifications/${encodeURIComponent(identityVerificationId)}`, {
      headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` },
    });
    const verification = await providerResponse.json().catch(() => null) as JsonRecord | null;
    if (!providerResponse.ok || !verification) throw new Error("PROVIDER_LOOKUP_FAILED");
    const checked = validatePortOneIdentity(verification, {
      storeId: PORTONE_STORE_ID,
      channelKey: PORTONE_IDENTITY_CHANNEL_KEY,
      allowTest: ALLOW_TEST_IDENTITY,
    });
    if (!checked.verified) {
      await recordVerificationEvent(admin, { userId: user.id, method: "phone", status: "rejected",
        provider: "portone_inicis_unified", providerReferenceHash: referenceHash,
        reasonCode: `STATUS_${checked.status}` });
      return jsonResponse(req, { ok: false, code: "NOT_VERIFIED" }, 409);
    }
    const phone = checked.phone;
    const verifiedAt = new Date().toISOString();
    const { error: finalizeError } = await admin.rpc("finalize_member_verification", {
      p_user_id: user.id, p_method: "phone", p_provider: "portone_inicis_unified",
      p_provider_reference_hash: referenceHash, p_subject: { phone }, p_verified_at: verifiedAt,
    });
    if (finalizeError) throw finalizeError;
    return jsonResponse(req, { ok: true, phone, verifiedAt });
  } catch (error) {
    const reason = safeText((error as Error)?.message, 80) ?? "ERROR";
    try {
      await recordVerificationEvent(admin, { userId: user.id, method: "phone", status: "error",
        provider: "portone_inicis_unified", providerReferenceHash: referenceHash, reasonCode: reason });
    } catch { /* preserve primary failure */ }
    return jsonResponse(req, { ok: false, code: reason }, 502);
  }
});
