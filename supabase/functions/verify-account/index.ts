import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  corsHeaders, digits, jsonResponse, recordVerificationEvent,
  rejectDisallowedOrigin, requireUser, safeText, sha256Hex,
} from "../_shared/verification-core.mjs";
import {
  kftcBaseUrl, lookupKftcAccount, normalizeAccountHolder,
  requestKftcClientToken, resolveKftcBankCode,
} from "../_shared/kftc-account-provider.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const KFTC_ENVIRONMENT = Deno.env.get("KFTC_OPENBANKING_ENV") ?? "";
const KFTC_CLIENT_ID = Deno.env.get("KFTC_CLIENT_ID") ?? "";
const KFTC_CLIENT_SECRET = Deno.env.get("KFTC_CLIENT_SECRET") ?? "";
const KFTC_HOLDER_INFO_TYPE = Deno.env.get("KFTC_ACCOUNT_HOLDER_INFO_TYPE") ?? "";
type JsonRecord = Record<string, unknown>;
type TokenCache = { accessToken: string; clientUseCode: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

async function accessToken(baseUrl: string) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache;
  const token = await requestKftcClientToken({
    baseUrl, clientId: KFTC_CLIENT_ID, clientSecret: KFTC_CLIENT_SECRET,
  });
  tokenCache = { accessToken: token.accessToken, clientUseCode: token.clientUseCode,
    expiresAt: Date.now() + (token.expiresIn * 1000) };
  return tokenCache;
}

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
  const account = digits(body.account, 16);
  const holder = safeText(body.holder, 80);
  if (!bank || !account || !holder) return jsonResponse(req, { ok: false, code: "MISSING" }, 400);
  const bankCode = resolveKftcBankCode(bank);
  if (!bankCode) return jsonResponse(req, { ok: false, code: "UNSUPPORTED_BANK" }, 400);

  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("business_no,biz_verified").eq("id", user.id).single();
  if (profileError || !profile) return jsonResponse(req, { ok: false, code: "PROFILE_NOT_FOUND" }, 404);
  const businessNo = digits(profile.business_no, 10);
  if (profile.biz_verified !== true || businessNo.length !== 10) {
    return jsonResponse(req, { ok: false, code: "BUSINESS_VERIFICATION_REQUIRED" }, 409);
  }

  const subjectHash = await sha256Hex(
    `kftc-account-v1\0${bankCode}\0${account}\0${normalizeAccountHolder(holder)}\0${businessNo}`,
  );
  const baseUrl = kftcBaseUrl(KFTC_ENVIRONMENT);
  const provider = KFTC_ENVIRONMENT === "production" ? "kftc-openbanking" : "kftc-openbanking-test";
  if (!baseUrl || !KFTC_CLIENT_ID || !KFTC_CLIENT_SECRET || !KFTC_HOLDER_INFO_TYPE) {
    await recordVerificationEvent(admin, { userId: user.id, method: "account", status: "error",
      provider: "unconfigured", providerReferenceHash: subjectHash, reasonCode: "NOT_CONFIGURED" });
    return jsonResponse(req, { ok: false, valid: false, code: "NOT_CONFIGURED" }, 503);
  }

  try {
    const token = await accessToken(baseUrl);
    const result = await lookupKftcAccount({
      baseUrl, accessToken: token.accessToken, clientUseCode: token.clientUseCode,
      bankCode, accountNumber: account, holderInfoType: KFTC_HOLDER_INFO_TYPE,
      holderInfo: businessNo,
    });
    const valid = result.ok && normalizeAccountHolder(result.holderName) === normalizeAccountHolder(holder);
    if (!valid) {
      await recordVerificationEvent(admin, { userId: user.id, method: "account", status: "rejected",
        provider, providerReferenceHash: subjectHash, reasonCode: result.code ?? "HOLDER_MISMATCH" });
      return jsonResponse(req, { ok: false, valid: false, code: result.code ?? "HOLDER_MISMATCH" }, 409);
    }

    const verifiedAt = new Date().toISOString();
    const { error: finalizeError } = await admin.rpc("finalize_member_verification", {
      p_user_id: user.id, p_method: "account", p_provider: provider,
      p_provider_reference_hash: subjectHash,
      p_subject: { bank_name: bank, bank_account: account, bank_holder: holder },
      p_verified_at: verifiedAt,
    });
    if (finalizeError) throw finalizeError;
    return jsonResponse(req, { ok: true, valid: true, verifiedAt });
  } catch (error) {
    const reason = safeText((error as Error)?.message, 80) ?? "KFTC_ERROR";
    try {
      await recordVerificationEvent(admin, { userId: user.id, method: "account", status: "error",
        provider, providerReferenceHash: subjectHash, reasonCode: reason });
    } catch { /* preserve primary failure */ }
    return jsonResponse(req, { ok: false, valid: false, code: reason }, 502);
  }
});
