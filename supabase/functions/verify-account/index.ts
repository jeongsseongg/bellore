import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  corsHeaders, digits, jsonResponse, recordVerificationEvent,
  rejectDisallowedOrigin, requireUser, safeText, sha256Hex,
} from "../_shared/verification-core.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ACCOUNT_VERIFY_PROVIDER = Deno.env.get("ACCOUNT_VERIFY_PROVIDER") ?? "";
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
  const user = await requireUser(admin, req);
  if (!user) return jsonResponse(req, { ok: false, code: "UNAUTHORIZED" }, 401);

  const body = await req.json().catch(() => ({})) as JsonRecord;
  const bank = safeText(body.bank, 40);
  const account = digits(body.account, 40);
  const holder = safeText(body.holder, 80);
  if (!bank || !account || !holder) return jsonResponse(req, { ok: false, code: "MISSING" }, 400);
  const subjectHash = await sha256Hex(`account-v1\0${bank}\0${account}\0${holder.replace(/\s/g, "")}`);

  // Provider is intentionally not guessed. A signed/authoritative response adapter
  // is added only after Bellore contracts a bank-account ownership API.
  await recordVerificationEvent(admin, { userId: user.id, method: "account", status: "error",
    provider: ACCOUNT_VERIFY_PROVIDER || "unconfigured", providerReferenceHash: subjectHash,
    reasonCode: "NOT_CONFIGURED" });
  return jsonResponse(req, { ok: false, valid: false, code: "NOT_CONFIGURED" }, 503);
});
