import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  corsHeaders, jsonResponse, rejectDisallowedOrigin, requireUser, safeText,
} from "../_shared/verification-core.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ACTIONS = new Set(["update_profile", "suspend", "resume", "delete"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATCH_FIELDS = new Set(["display_name", "phone", "company_name", "approved", "vip", "commission_rate"]);
type JsonRecord = Record<string, unknown>;
function errorCode(error: unknown) {
  const message = safeText((error as Error)?.message, 120) ?? "OPERATION_FAILED";
  for (const code of [
    "ADMIN_FORBIDDEN", "SELF_OPERATION_FORBIDDEN", "USER_NOT_FOUND", "PROTECTED_ROLE",
    "VERSION_REQUIRED", "VERSION_CONFLICT", "REASON_REQUIRED", "BAD_PATCH", "BAD_PATCH_FIELD", "EMPTY_PATCH",
    "BAD_DISPLAY_NAME", "BAD_PHONE", "BAD_COMPANY_NAME", "BAD_APPROVAL_ROLE",
    "BAD_VIP_ROLE", "BAD_COMMISSION_ROLE", "BAD_COMMISSION_RATE",
    "OPERATION_IN_PROGRESS", "TRANSITION_MISMATCH",
  ]) if (message.includes(code)) return code;
  return "OPERATION_FAILED";
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
  const updateAudit = async (id: string, status: string, metadata: JsonRecord) => {
    const { data, error } = await admin.from("member_admin_events").update({
      status, metadata, completed_at: new Date().toISOString(),
    }).eq("id", id).select("id").maybeSingle();
    return !error && data?.id === id;
  };
  const actor = await requireUser(admin, req);
  if (!actor) return jsonResponse(req, { ok: false, code: "UNAUTHORIZED" }, 401);
  const { data: actorProfile } = await admin.from("profiles")
    .select("role,approved,suspended").eq("id", actor.id).single();
  if (actorProfile?.role !== "admin" || actorProfile.approved !== true || actorProfile.suspended === true) {
    return jsonResponse(req, { ok: false, code: "FORBIDDEN" }, 403);
  }
  const { error: reconcileError } = await admin.rpc("admin_reconcile_member_deletes", { p_actor_id: actor.id });
  if (reconcileError) console.error("admin-member-ops-reconcile", "RECONCILE_FAILED");

  const body = await req.json().catch(() => ({})) as JsonRecord;
  const action = safeText(body.action, 24);
  const targetUserId = safeText(body.targetUserId, 40);
  if (!action || !ACTIONS.has(action)) return jsonResponse(req, { ok: false, code: "BAD_ACTION" }, 400);
  if (!targetUserId || !UUID_PATTERN.test(targetUserId)) return jsonResponse(req, { ok: false, code: "BAD_TARGET" }, 400);
  if (targetUserId === actor.id) return jsonResponse(req, { ok: false, code: "SELF_OPERATION_FORBIDDEN" }, 409);

  const reason = safeText(body.reason, 300);
  if (!reason || reason.length < 5) return jsonResponse(req, { ok: false, code: "REASON_REQUIRED" }, 400);
  let expectedVersion = Number.isSafeInteger(Number(body.expectedVersion)) && Number(body.expectedVersion) > 0
    ? Number(body.expectedVersion) : null;
  if (expectedVersion === null) {
    const { data: current, error: currentError } = await admin.from("profiles")
      .select("admin_operation_version").eq("id", targetUserId).single();
    if (currentError || !current) return jsonResponse(req, { ok: false, code: "USER_NOT_FOUND" }, 404);
    expectedVersion = Number(current.admin_operation_version);
  }

  let patch: JsonRecord = {};
  if (action === "update_profile") {
    if (!body.patch || typeof body.patch !== "object" || Array.isArray(body.patch)) {
      return jsonResponse(req, { ok: false, code: "BAD_PATCH" }, 400);
    }
    patch = Object.fromEntries(Object.entries(body.patch as JsonRecord).filter(([key]) => PATCH_FIELDS.has(key)));
    if (Object.keys(patch).length !== Object.keys(body.patch as JsonRecord).length) {
      return jsonResponse(req, { ok: false, code: "BAD_PATCH_FIELD" }, 400);
    }
  }

  if (action === "update_profile") {
    const { data, error } = await admin.rpc("admin_manage_member_profile", {
      p_actor_id: actor.id, p_target_id: targetUserId, p_action: action,
      p_patch: patch, p_reason: reason, p_expected_version: expectedVersion,
    });
    if (error) {
      const code = errorCode(error);
      return jsonResponse(req, { ok: false, code }, code === "VERSION_CONFLICT" ? 409 : 400);
    }
    return jsonResponse(req, { ok: true, action, targetUserId, ...(data || {}) });
  }

  if (action === "delete") {
    const { data: prepared, error: prepareError } = await admin.rpc("admin_prepare_member_delete", {
      p_actor_id: actor.id, p_target_id: targetUserId, p_reason: reason, p_expected_version: expectedVersion,
    });
    if (prepareError || !prepared?.auditEventId) {
      const code = errorCode(prepareError);
      return jsonResponse(req, { ok: false, code }, code === "PROTECTED_ROLE" ? 403 : 400);
    }
    const auditId = String(prepared.auditEventId);
    const { error: authError } = await admin.auth.admin.deleteUser(targetUserId, false);
    if (authError) {
      const { error: cancelError } = await admin.rpc("admin_cancel_member_delete", {
        p_actor_id: actor.id, p_event_id: auditId, p_code: "AUTH_DELETE_FAILED",
      });
      if (cancelError) console.error("admin-member-ops-delete", "DELETE_CANCEL_FAILED");
      console.error("admin-member-ops", action, "AUTH_DELETE_FAILED");
      return jsonResponse(req, { ok: false, code: "OPERATION_FAILED" }, 500);
    }
    const { error: cleanupError } = await admin.from("profiles").delete().eq("id", targetUserId);
    const metadata = { hardDeleted: true, profileCleanupWarning: cleanupError ? "PROFILE_CLEANUP_FAILED" : null };
    const auditFinalized = await updateAudit(auditId, "succeeded", metadata);
    return jsonResponse(req, {
      ok: true, action, targetUserId, deleted: true,
      warning: metadata.profileCleanupWarning || (auditFinalized ? null : "AUDIT_FINALIZE_FAILED"),
    });
  }

  const suspended = action === "suspend";
  const { data: begun, error: beginError } = await admin.rpc("admin_begin_member_auth_transition", {
    p_actor_id: actor.id, p_target_id: targetUserId, p_action: action,
    p_reason: reason, p_expected_version: expectedVersion,
  });
  if (beginError || !begun?.transitionId) {
    const code = errorCode(beginError);
    return jsonResponse(req, { ok: false, code }, ["VERSION_CONFLICT", "OPERATION_IN_PROGRESS"].includes(code) ? 409 : 400);
  }
  const transitionId = String(begun.transitionId);
  const { error: authError } = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: suspended ? "876000h" : "none",
  });
  if (authError) {
    const { error: cancelError } = await admin.rpc("admin_cancel_member_auth_transition", {
      p_actor_id: actor.id, p_target_id: targetUserId, p_transition_id: transitionId,
      p_code: "AUTH_UPDATE_FAILED",
    });
    if (cancelError) console.error("admin-member-ops-transition", "TRANSITION_CANCEL_FAILED");
    console.error("admin-member-ops", action, "AUTH_UPDATE_FAILED");
    return jsonResponse(req, { ok: false, code: "OPERATION_FAILED" }, 500);
  }
  let { data, error } = await admin.rpc("admin_complete_member_auth_transition", {
    p_actor_id: actor.id, p_target_id: targetUserId, p_transition_id: transitionId,
  });
  if (error) {
    const retried = await admin.rpc("admin_complete_member_auth_transition", {
      p_actor_id: actor.id, p_target_id: targetUserId, p_transition_id: transitionId,
    });
    data = retried.data;
    error = retried.error;
  }
  if (error) {
    console.error("admin-member-ops-transition", action, "TRANSITION_PENDING_RECONCILIATION");
    return jsonResponse(req, { ok: false, code: "PENDING_RECONCILIATION" }, 503);
  }
  return jsonResponse(req, { ok: true, action, targetUserId, suspended, ...(data || {}) });
});
