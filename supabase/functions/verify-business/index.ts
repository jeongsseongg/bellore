import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  corsHeaders, digits, jsonResponse, recordVerificationEvent,
  rejectDisallowedOrigin, requireUser, safeText, sha256Hex,
} from "../_shared/verification-core.mjs";
import { ntsBusinessResult } from "../_shared/member-verification-providers.mjs";

const NTS_SERVICE_KEY = Deno.env.get("NTS_SERVICE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
type JsonRecord = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (rejectDisallowedOrigin(req)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return jsonResponse(req, { ok: false, code: "METHOD" }, 405);
  if (rejectDisallowedOrigin(req)) return jsonResponse(req, { ok: false, code: "ORIGIN_FORBIDDEN" }, 403);
  if (!NTS_SERVICE_KEY || !SUPABASE_URL || !SERVICE_ROLE) return jsonResponse(req, { ok: false, code: "NOT_CONFIGURED" }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const user = await requireUser(admin, req);
  if (!user) return jsonResponse(req, { ok: false, code: "UNAUTHORIZED" }, 401);
  let subjectHash: string | null = null;

  try {
    const body = await req.json() as JsonRecord;
    const bno = digits(body.b_no, 20);
    const startDate = digits(body.start_dt, 20);
    const representative = safeText(body.p_nm, 80);
    if (bno.length !== 10) return jsonResponse(req, { ok: false, code: "BAD_BNO" }, 400);
    if (startDate.length !== 8) return jsonResponse(req, { ok: false, code: "BAD_OPEN_DATE" }, 400);
    if (!representative) return jsonResponse(req, { ok: false, code: "BAD_REPRESENTATIVE" }, 400);
    subjectHash = await sha256Hex(`nts-business-v1\0${bno}\0${startDate}\0${representative.replace(/\s/g, "")}`);

    const ntsResponse = await fetch(`https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey=${encodeURIComponent(NTS_SERVICE_KEY)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businesses: [{ b_no: bno, start_dt: startDate, p_nm: representative }] }),
    });
    const nts = await ntsResponse.json().catch(() => null) as JsonRecord | null;
    if (!ntsResponse.ok || !nts) throw new Error("NTS_LOOKUP_FAILED");
    if (!ntsBusinessResult(nts).valid) {
      await recordVerificationEvent(admin, { userId: user.id, method: "business", status: "rejected",
        provider: "nts", providerReferenceHash: subjectHash, reasonCode: "MISMATCH" });
      return jsonResponse(req, { ok: false, valid: false, code: "MISMATCH",
        message: "사업자번호·개업일·대표자명이 일치하지 않습니다." }, 409);
    }

    const verifiedAt = new Date().toISOString();
    const { error: finalizeError } = await admin.rpc("finalize_member_verification", {
      p_user_id: user.id, p_method: "business", p_provider: "nts",
      p_provider_reference_hash: subjectHash,
      p_subject: { business_no: bno, biz_open_date: startDate, ceo_name: representative },
      p_verified_at: verifiedAt,
    });
    if (finalizeError) throw finalizeError;
    return jsonResponse(req, { ok: true, valid: true, verifiedAt });
  } catch (error) {
    const reason = safeText((error as Error)?.message, 80) ?? "ERROR";
    try {
      await recordVerificationEvent(admin, { userId: user.id, method: "business", status: "error",
        provider: "nts", providerReferenceHash: subjectHash, reasonCode: reason });
    } catch { /* preserve primary failure */ }
    return jsonResponse(req, { ok: false, code: reason }, 502);
  }
});
