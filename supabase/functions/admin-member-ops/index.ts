import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  corsHeaders, jsonResponse, rejectDisallowedOrigin, requireUser, safeText,
} from "../_shared/verification-core.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ACTIONS = new Set(["suspend", "resume", "delete"]);
const MEMBER_ROLES = new Set(["customer", "vendor", "partner"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type JsonRecord = Record<string, unknown>;

async function updateAudit(admin: ReturnType<typeof createClient>, id: string, status: string, metadata: JsonRecord) {
  const { data, error } = await admin.from("member_admin_events").update({
    status, metadata, completed_at: new Date().toISOString(),
  }).eq("id", id).select("id").maybeSingle();
  return !error && data?.id === id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (rejectDisallowedOrigin(req)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return jsonResponse(req, { ok: false, code: "METHOD" }, 405);
  if (rejectDisallowedOrigin(req)) return jsonResponse(req, { ok: false, code: "ORIGIN_FORBIDDEN" }, 403);
  if (!SUPABASE_URL || !SERVICE_ROLE) return jsonResponse(req, { ok: false, code: "NOT_CONFIGURED" }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const actor = await requireUser(admin, req);
  if (!actor) return jsonResponse(req, { ok: false, code: "UNAUTHORIZED" }, 401);
  const { data: actorProfile } = await admin.from("profiles")
    .select("role,approved,suspended").eq("id", actor.id).single();
  if (actorProfile?.role !== "admin" || actorProfile.approved !== true || actorProfile.suspended === true) {
    return jsonResponse(req, { ok: false, code: "FORBIDDEN" }, 403);
  }

  const body = await req.json().catch(() => ({})) as JsonRecord;
  const action = safeText(body.action, 20);
  const targetUserId = safeText(body.targetUserId, 40);
  if (!action || !ACTIONS.has(action)) return jsonResponse(req, { ok: false, code: "BAD_ACTION" }, 400);
  if (!targetUserId || !UUID_PATTERN.test(targetUserId)) return jsonResponse(req, { ok: false, code: "BAD_TARGET" }, 400);
  if (targetUserId === actor.id) return jsonResponse(req, { ok: false, code: "SELF_OPERATION_FORBIDDEN" }, 409);

  const { data: target } = await admin.from("profiles")
    .select("id,role,suspended").eq("id", targetUserId).single();
  if (!target) return jsonResponse(req, { ok: false, code: "USER_NOT_FOUND" }, 404);
  if (!MEMBER_ROLES.has(target.role)) return jsonResponse(req, { ok: false, code: "PROTECTED_ROLE" }, 403);

  const suppliedReason = safeText(body.reason, 300);
  if (action === "delete" && (!suppliedReason || suppliedReason.length < 5)) {
    return jsonResponse(req, { ok: false, code: "REASON_REQUIRED" }, 400);
  }
  const reason = suppliedReason ?? (action === "suspend" ? "관리자 계정 정지" : "관리자 계정 재개");
  const { data: audit, error: auditError } = await admin.from("member_admin_events").insert({
    target_user_id: targetUserId,
    actor_user_id: actor.id,
    target_role: target.role,
    action,
    status: "pending",
    reason,
    metadata: { suspendedBefore: target.suspended === true },
  }).select("id").single();
  if (auditError || !audit) return jsonResponse(req, { ok: false, code: "AUDIT_WRITE_FAILED" }, 500);

  try {
    if (action === "delete") {
      const { error } = await admin.auth.admin.deleteUser(targetUserId, false);
      if (error) throw error;
      const { error: cleanupError } = await admin.from("profiles").delete().eq("id", targetUserId);
      const metadata = { hardDeleted: true, profileCleanupWarning: cleanupError ? "PROFILE_CLEANUP_FAILED" : null };
      const auditFinalized = await updateAudit(admin, audit.id, "succeeded", metadata);
      const warning = metadata.profileCleanupWarning || (auditFinalized ? null : "AUDIT_FINALIZE_FAILED");
      return jsonResponse(req, { ok: true, action, targetUserId, deleted: true, warning });
    }

    const suspended = action === "suspend";
    const { error: authError } = await admin.auth.admin.updateUserById(targetUserId, {
      ban_duration: suspended ? "876000h" : "none",
    });
    if (authError) throw authError;
    const { error: profileError } = await admin.from("profiles").update({ suspended }).eq("id", targetUserId);
    if (profileError) {
      const { error: rollbackError } = await admin.auth.admin.updateUserById(targetUserId, {
        ban_duration: suspended ? "none" : "876000h",
      });
      if (rollbackError) {
        console.error("admin-member-ops-rollback", action, "AUTH_ROLLBACK_FAILED");
        throw new Error("PROFILE_UPDATE_FAILED_AUTH_ROLLBACK_FAILED");
      }
      throw profileError;
    }
    const auditFinalized = await updateAudit(admin, audit.id, "succeeded", {
      suspendedBefore: target.suspended === true, suspendedAfter: suspended,
    });
    return jsonResponse(req, {
      ok: true, action, targetUserId, suspended,
      warning: auditFinalized ? null : "AUDIT_FINALIZE_FAILED",
    });
  } catch (error) {
    const failure = safeText((error as Error)?.message, 120) ?? "OPERATION_FAILED";
    const failureRecorded = await updateAudit(admin, audit.id, "failed", { code: failure });
    if (!failureRecorded) console.error("admin-member-ops-audit", action, "AUDIT_FINALIZE_FAILED");
    console.error("admin-member-ops", action, failure);
    return jsonResponse(req, { ok: false, code: "OPERATION_FAILED" }, 500);
  }
});
