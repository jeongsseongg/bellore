import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  corsHeaders, jsonResponse, publicVerificationStatus,
  rejectDisallowedOrigin, requireUser, safeText,
} from "../_shared/verification-core.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const METHODS = new Set(["phone", "email", "business", "account"]);
const PROFILE_COLUMNS = "phone_verified,phone_verified_at,phone_verification_provider,email_verified,email_verified_at,email_verification_provider,biz_verified,biz_verified_at,biz_verification_provider,account_verified,account_verified_at,account_verification_provider";
type JsonRecord = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (rejectDisallowedOrigin(req)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return jsonResponse(req, { ok: false, code: "METHOD" }, 405);
  if (rejectDisallowedOrigin(req)) return jsonResponse(req, { ok: false, code: "ORIGIN_FORBIDDEN" }, 403);
  if (!SUPABASE_URL || !SERVICE_ROLE) return jsonResponse(req, { ok: false, code: "NOT_CONFIGURED" }, 503);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const actor = await requireUser(admin, req);
  if (!actor) return jsonResponse(req, { ok: false, code: "UNAUTHORIZED" }, 401);
  const { data: actorProfile } = await admin.from("profiles").select("role,approved,suspended").eq("id", actor.id).single();
  if (actorProfile?.role !== "admin" || actorProfile.approved !== true || actorProfile.suspended === true) {
    return jsonResponse(req, { ok: false, code: "FORBIDDEN" }, 403);
  }

  const body = await req.json().catch(() => ({})) as JsonRecord;
  const action = safeText(body.action, 30);
  const targetUserId = safeText(body.targetUserId, 40);
  if (!targetUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return jsonResponse(req, { ok: false, code: "BAD_TARGET" }, 400);
  }

  if (action === "list_events") {
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 100);
    const { data, error } = await admin.from("member_verification_events")
      .select("id,user_id,actor_user_id,method,status,provider,reason_code,metadata,created_at")
      .eq("user_id", targetUserId).order("created_at", { ascending: false }).limit(limit);
    if (error) return jsonResponse(req, { ok: false, code: "AUDIT_READ_FAILED" }, 500);
    return jsonResponse(req, { ok: true, events: data ?? [] });
  }

  if (action === "get_status") {
    const { data, error } = await admin.from("profiles").select(PROFILE_COLUMNS).eq("id", targetUserId).single();
    if (error || !data) return jsonResponse(req, { ok: false, code: "USER_NOT_FOUND" }, 404);
    return jsonResponse(req, { ok: true, userId: targetUserId, verifications: publicVerificationStatus(data) });
  }

  if (action === "set_status") {
    const method = safeText(body.method, 20);
    const verified = body.verified === true;
    const reason = safeText(body.reason, 300);
    if (!method || !METHODS.has(method)) return jsonResponse(req, { ok: false, code: "BAD_METHOD" }, 400);
    if (!reason || reason.length < 5) return jsonResponse(req, { ok: false, code: "REASON_REQUIRED" }, 400);
    const { data: auditEventId, error: rpcError } = await admin.rpc("admin_set_member_verification", {
      p_actor_id: actor.id, p_user_id: targetUserId, p_method: method,
      p_verified: verified, p_reason: reason,
    });
    if (rpcError) return jsonResponse(req, { ok: false, code: "STATUS_UPDATE_FAILED" }, 409);
    const { data, error } = await admin.from("profiles").select(PROFILE_COLUMNS).eq("id", targetUserId).single();
    if (error || !data) return jsonResponse(req, { ok: false, code: "USER_NOT_FOUND" }, 404);
    return jsonResponse(req, { ok: true, userId: targetUserId,
      verifications: publicVerificationStatus(data), auditEventId });
  }

  return jsonResponse(req, { ok: false, code: "BAD_ACTION" }, 400);
});
