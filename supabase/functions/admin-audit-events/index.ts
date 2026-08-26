import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  corsHeaders, jsonResponse, rejectDisallowedOrigin, requireUser,
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

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 200);
  const [verificationResult, accountResult] = await Promise.all([
    admin.from("member_verification_events")
      .select("id,user_id,actor_user_id,method,status,provider,reason_code,metadata,created_at")
      .order("created_at", { ascending: false }).limit(limit),
    admin.from("member_admin_events")
      .select("id,target_user_id,actor_user_id,target_role,action,status,reason,metadata,created_at,completed_at")
      .order("created_at", { ascending: false }).limit(limit),
  ]);
  if (verificationResult.error || accountResult.error) {
    return jsonResponse(req, { ok: false, code: "AUDIT_READ_FAILED" }, 500);
  }

  const verificationEvents = (verificationResult.data ?? []).map((event) => ({
    ...event, source: "verification", target_user_id: event.user_id,
    action: event.method, reason: event.metadata?.reason ?? event.reason_code ?? null,
  }));
  const accountEvents = (accountResult.data ?? []).map((event) => ({ ...event, source: "account" }));
  const events = [...verificationEvents, ...accountEvents]
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
    .slice(0, limit);
  return jsonResponse(req, { ok: true, events });
});

