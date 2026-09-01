import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import { corsHeaders, digits, jsonResponse, rejectDisallowedOrigin, requireUser, safeText, sha256Hex } from "../_shared/verification-core.mjs";

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
  if (!SUPABASE_URL || !SERVICE_ROLE) return jsonResponse(req, { ok: false, code: "NOT_CONFIGURED" }, 503);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const user = await requireUser(admin, req);
  if (!user || !user.email_confirmed_at) return jsonResponse(req, { ok: false, code: "EMAIL_VERIFICATION_REQUIRED" }, 401);
  const body = await req.json().catch(() => ({})) as JsonRecord;
  const username = safeText(body.username, 40);
  const roleInput = safeText(body.role, 20);
  const role = roleInput === "vendor" || roleInput === "partner" ? roleInput : "customer";
  if (!username || !/^[A-Za-z0-9_]{4,40}$/.test(username)) return jsonResponse(req, { ok: false, code: "BAD_USERNAME" }, 400);
  const businessNo = digits(body.businessNo, 20);
  const bizOpenDate = digits(body.bizOpenDate, 20);
  if ((role === "vendor" || role === "partner") && businessNo && businessNo.length !== 10) {
    return jsonResponse(req, { ok: false, code: "BAD_BNO" }, 400);
  }
  if ((role === "vendor" || role === "partner") && bizOpenDate && bizOpenDate.length !== 8) {
    return jsonResponse(req, { ok: false, code: "BAD_OPEN_DATE" }, 400);
  }

  const { data: current, error: currentError } = await admin.from("profiles")
    .select("username,phone_verified,biz_verified,account_verified").eq("id", user.id).single();
  if (currentError || !current) return jsonResponse(req, { ok: false, code: "PROFILE_NOT_FOUND" }, 404);
  if (current.username && current.username.toLowerCase() !== username.toLowerCase()) {
    return jsonResponse(req, { ok: false, code: "ALREADY_REGISTERED" }, 409);
  }
  const phoneTicket = safeText(body.phoneVerificationTicket, 160);
  let verifiedPhone: string | null = null;
  if (phoneTicket) {
    const tokenHash = await sha256Hex(`signup-phone-ticket-v1\0${phoneTicket}`);
    const { data: consumed, error: consumeError } = await admin.rpc("consume_member_signup_phone_ticket", {
      p_user_id: user.id, p_token_hash: tokenHash,
    });
    if (consumeError) return jsonResponse(req, { ok: false, code: safeText(consumeError.message, 80) ?? "PHONE_TICKET_FAILED" }, 409);
    verifiedPhone = safeText(consumed?.phone, 20);
  }
  const { data: verifiedIdentity, error: identityError } = await admin.from("member_verified_identities")
    .select("phone,verified_name,birth_date").eq("user_id", user.id).maybeSingle();
  if (identityError || !verifiedIdentity) {
    return jsonResponse(req, { ok: false, code: "IDENTITY_VERIFICATION_REQUIRED" }, 409);
  }
  const verifiedName = safeText(verifiedIdentity.verified_name, 80);
  const identityPhone = digits(verifiedIdentity.phone, 20);
  const birthDate = safeText(verifiedIdentity.birth_date, 10);
  if (!verifiedName || !identityPhone || !birthDate) {
    return jsonResponse(req, { ok: false, code: "VERIFIED_IDENTITY_INCOMPLETE" }, 409);
  }
  const patch: JsonRecord = { username, display_name: verifiedName, verified_name: verifiedName,
    birth_date: birthDate, phone: identityPhone, role, approved: role === "customer",
    email: user.email, postcode: safeText(body.postcode, 20), addr1: safeText(body.addr1, 240),
    addr2: safeText(body.addr2, 240) };
  if (verifiedPhone && verifiedPhone !== identityPhone) {
    return jsonResponse(req, { ok: false, code: "VERIFIED_PHONE_MISMATCH" }, 409);
  }
  if (role === "vendor" || role === "partner") {
    patch.company_name = safeText(body.companyName, 160);
    patch.biz_name = safeText(body.bizName, 160);
    if (!current.biz_verified) {
      patch.business_no = businessNo || null;
      patch.ceo_name = safeText(body.ceoName, 80);
      patch.biz_open_date = bizOpenDate || null;
    }
    if (!current.account_verified) {
      patch.bank_name = safeText(body.bankName, 40);
      patch.bank_account = digits(body.bankAccount, 40) || null;
      patch.bank_holder = safeText(body.bankHolder, 80);
      if (patch.bank_account) patch.account_submitted_at = new Date().toISOString();
    }
  }
  const { error } = await admin.from("profiles").update(patch).eq("id", user.id);
  if (error) return jsonResponse(req, { ok: false,
    code: error.code === "23505" && String(error.message || "").includes("phone")
      ? "IDENTITY_ALREADY_REGISTERED"
      : error.code === "23505" ? "USERNAME_TAKEN" : "PROFILE_UPDATE_FAILED" }, 409);
  return jsonResponse(req, { ok: true, userId: user.id, role });
});
