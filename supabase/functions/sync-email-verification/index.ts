import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  corsHeaders, jsonResponse, rejectDisallowedOrigin, requireUser, sha256Hex,
} from "../_shared/verification-core.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (rejectDisallowedOrigin(req)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return jsonResponse(req, { ok: false, code: "METHOD" }, 405);
  if (rejectDisallowedOrigin(req)) return jsonResponse(req, { ok: false, code: "ORIGIN_FORBIDDEN" }, 403);
  if (!SUPABASE_URL || !SERVICE_ROLE) return jsonResponse(req, { ok: false, code: "NOT_CONFIGURED" }, 503);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const user = await requireUser(admin, req);
  if (!user) return jsonResponse(req, { ok: false, code: "UNAUTHORIZED" }, 401);
  if (!user.email || !user.email_confirmed_at) return jsonResponse(req, { ok: false, code: "EMAIL_NOT_CONFIRMED" }, 409);

  const verifiedAt = user.email_confirmed_at;
  const referenceHash = await sha256Hex(`supabase-email-v1\0${user.id}\0${user.email.toLowerCase()}`);
  const { data: prior } = await admin.from("member_verification_events").select("id")
    .eq("method", "email").eq("provider", "supabase_auth")
    .eq("provider_reference_hash", referenceHash).eq("status", "verified").maybeSingle();
  if (!prior) {
    const { error } = await admin.rpc("finalize_member_verification", {
      p_user_id: user.id, p_method: "email", p_provider: "supabase_auth",
      p_provider_reference_hash: referenceHash, p_subject: { email: user.email }, p_verified_at: verifiedAt,
    });
    if (error) return jsonResponse(req, { ok: false, code: "PROFILE_UPDATE_FAILED" }, 500);
  }
  return jsonResponse(req, { ok: true, email: user.email, verifiedAt });
});
