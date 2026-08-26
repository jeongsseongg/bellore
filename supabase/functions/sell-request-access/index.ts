import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_API_BASE = Deno.env.get("PORTONE_API_BASE") ?? "https://api.portone.io";
const PORTONE_STORE_ID = Deno.env.get("PORTONE_STORE_ID") ?? "";
const PORTONE_IDENTITY_CHANNEL_KEY = Deno.env.get("PORTONE_IDENTITY_CHANNEL_KEY") ?? "";
const ALLOW_TEST_IDENTITY = Deno.env.get("ALLOW_TEST_IDENTITY") === "true";
const PUBLIC_ORIGIN = "https://bellore.co.kr/";

type Json = Record<string, unknown>;
type AdminClient = ReturnType<typeof createClient<any>>;

const ALLOWED_ORIGINS = ["https://bellore.co.kr", "https://www.bellore.co.kr", "http://localhost", "http://127.0.0.1"];
function allowedOrigin(req: Request) {
  const origin = req.headers.get("Origin");
  if (!origin) return null;
  try {
    const url = new URL(origin);
    return ALLOWED_ORIGINS.includes(`${url.protocol}//${url.hostname}`) ? origin : null;
  } catch { return null; }
}
function corsHeaders(req: Request) {
  const origin = allowedOrigin(req);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}
function rejectDisallowedOrigin(req: Request) { return !!req.headers.get("Origin") && !allowedOrigin(req); }
function safeText(value: unknown, max = 200) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}
async function sha256Hex(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function normalizePhone(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let number = raw.replace(/[^0-9+]/g, "");
  if (number.startsWith("+82")) number = `0${number.slice(3)}`;
  else if (number.startsWith("82")) number = `0${number.slice(2)}`;
  const normalized = number.replace(/\D/g, "");
  return /^01\d{8,9}$/.test(normalized) ? normalized : null;
}
function validatePortOneIdentity(verification: Json, expected: { storeId: string; channelKey: string; allowTest: boolean }) {
  const channel = verification.channel && typeof verification.channel === "object" && !Array.isArray(verification.channel)
    ? verification.channel as Json : null;
  const channelKey = safeText(channel?.key, 120);
  const channelType = safeText(channel?.type, 20);
  if (verification.storeId !== expected.storeId) throw new Error("STORE_MISMATCH");
  if (channelKey !== expected.channelKey) throw new Error("CHANNEL_MISMATCH");
  if (!expected.allowTest && channelType !== "LIVE") throw new Error("CHANNEL_NOT_LIVE");
  if (verification.status !== "VERIFIED") return { verified: false, status: safeText(verification.status, 40) ?? "UNKNOWN", channelType };
  const customer = verification.verifiedCustomer && typeof verification.verifiedCustomer === "object" && !Array.isArray(verification.verifiedCustomer)
    ? verification.verifiedCustomer as Json : null;
  const verifiedPhone = normalizePhone(customer?.phoneNumber ?? customer?.phone);
  if (!verifiedPhone) throw new Error("VERIFIED_PHONE_MISSING");
  return { verified: true, phone: verifiedPhone, channelType };
}

function token(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function phone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^(01[016789]\d{7,8})$/.test(digits) ? digits : "";
}
function receipt(value: unknown) {
  const out = String(value ?? "").trim().toUpperCase();
  return /^BLR-[A-F0-9]{10}$/.test(out) ? out : "";
}
function photos(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter((url) =>
    /^https:\/\/iumsnacuxgssnnbckurq\.supabase\.co\/storage\/v1\/object\/(?:public|sign)\/photos\//.test(url)
  ).slice(0, 10);
}
function maskPhone(value: string) {
  return value.length >= 8 ? `${value.slice(0, 3)}-****-${value.slice(-4)}` : "";
}
async function caller(admin: AdminClient, req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const jwt = auth.slice(7).trim();
  const result = await admin.auth.getUser(jwt).catch(() => null);
  return result?.data?.user ?? null;
}
async function hashToken(value: string) {
  return sha256Hex(`bellore-sell-access-v1\0${value}`);
}
async function rateKey(req: Request, scope: string, discriminator = "") {
  const network = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  return sha256Hex(`bellore-sell-rate-v1\0${scope}\0${network}\0${discriminator}`);
}
async function limited(admin: AdminClient, req: Request, scope: string, discriminator: string, limit: number, minutes: number) {
  const key = await rateKey(req, scope, discriminator);
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const found = await admin.from("guest_sell_access_attempts").select("id", { count: "exact", head: true })
    .eq("scope", scope).eq("key_hash", key).gte("created_at", since);
  if (found.error) throw found.error;
  if ((found.count ?? 0) >= limit) return true;
  const inserted = await admin.from("guest_sell_access_attempts").insert({ scope, key_hash: key });
  if (inserted.error) throw inserted.error;
  return false;
}
async function issue(admin: AdminClient, requestId: string, kind: "link" | "session", hours: number) {
  const value = token();
  const row = {
    token_hash: await hashToken(value), request_id: requestId, token_kind: kind,
    expires_at: new Date(Date.now() + hours * 3_600_000).toISOString(),
  };
  const inserted = await admin.from("guest_sell_access_tokens").insert(row);
  if (inserted.error) throw inserted.error;
  return value;
}
async function requestView(admin: AdminClient, requestId: string) {
  const result = await admin.from("sell_service_requests").select("*").eq("id", requestId).single();
  if (result.error) throw result.error;
  const row = result.data;
  let bids: Json[] = [];
  if (row.quote_request_id) {
    const bidResult = await admin.from("bids").select("id,amount,created_at").eq("quote_request_id", row.quote_request_id).order("amount", { ascending: false });
    if (bidResult.error) throw bidResult.error;
    bids = bidResult.data ?? [];
  }
  return {
    id: row.id, receiptNo: row.receipt_no, method: row.method, status: row.status,
    brand: row.brand, model: row.model, ref: row.item_ref ?? "", year: row.item_year ?? "",
    parts: row.item_parts ?? "", memo: row.item_memo ?? "", photos: row.photo_urls ?? [],
    customerName: row.customer_name, customerPhone: maskPhone(row.customer_phone),
    quoteRequestId: row.quote_request_id, bids, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
async function createRequest(admin: AdminClient, req: Request, body: Json) {
  if (await limited(admin, req, "create", "", 5, 60)) return jsonResponse(req, { ok: false, code: "RATE_LIMIT" }, 429);
  const user = await caller(admin, req);
  const method = String(body.method ?? "");
  const customerName = safeText(body.name, 60) ?? "";
  const customerPhone = phone(body.phone);
  const brand = safeText(body.brand, 100) ?? "";
  const model = safeText(body.model, 160) ?? "";
  if (!['compare', 'consignment', 'instant'].includes(method) || !customerName || !customerPhone || !brand || !model) {
    return jsonResponse(req, { ok: false, code: "INVALID_REQUEST" }, 400);
  }
  const photoUrls = photos(body.photoUrls);
  if (!photoUrls.length) return jsonResponse(req, { ok: false, code: "PHOTO_REQUIRED" }, 400);
  const itemRef = safeText(body.ref, 100) ?? "";
  const itemYear = safeText(body.year, 60) ?? "";
  const itemParts = Array.isArray(body.parts) ? body.parts.map((x) => safeText(x, 40)).filter(Boolean).join(", ") : safeText(body.parts, 400) ?? "";
  const memo = safeText(body.memo, 2000) ?? "";
  let quoteRequestId: string | null = null;
  if (method === "compare") {
    const detail = [`[레퍼런스] ${itemRef || '-'}`, `[구입시기] ${itemYear || '-'}`, `[구성품] ${itemParts || '-'}`, memo, `[연락처] ${customerName} / ${customerPhone}`].filter(Boolean).join("\n");
    const quote = await admin.from("quote_requests").insert({
      customer_id: user?.id ?? null, item_name: model || brand, item_brand: brand,
      item_ref: itemRef || null, item_year: itemYear || null, item_parts: itemParts || null,
      item_detail: detail, photo_urls: photoUrls, photo_url: photoUrls[0], status: "pending",
    }).select("id").single();
    if (quote.error) throw quote.error;
    quoteRequestId = quote.data.id;
  }
  const created = await admin.from("sell_service_requests").insert({
    owner_user_id: user?.id ?? null, method, customer_name: customerName, customer_phone: customerPhone,
    brand, model, item_ref: itemRef || null, item_year: itemYear || null, item_parts: itemParts || null,
    item_memo: memo || null, photo_urls: photoUrls, quote_request_id: quoteRequestId,
  }).select("id,receipt_no").single();
  if (created.error) {
    if (quoteRequestId) await admin.from("quote_requests").delete().eq("id", quoteRequestId);
    throw created.error;
  }
  if (user) return jsonResponse(req, { ok: true, member: true, receiptNo: created.data.receipt_no, record: await requestView(admin, created.data.id) });
  const linkToken = await issue(admin, created.data.id, "link", 24);
  const accessUrl = `${PUBLIC_ORIGIN}?sellGuest=${encodeURIComponent(created.data.receipt_no)}&sellToken=${encodeURIComponent(linkToken)}`;
  return jsonResponse(req, { ok: true, member: false, receiptNo: created.data.receipt_no, accessUrl, record: await requestView(admin, created.data.id) });
}
async function listMember(admin: AdminClient, req: Request) {
  const user = await caller(admin, req);
  if (!user) return jsonResponse(req, { ok: false, code: "UNAUTHORIZED" }, 401);
  const result = await admin.from("sell_service_requests").select("id").eq("owner_user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (result.error) throw result.error;
  const records = await Promise.all((result.data ?? []).map((row) => requestView(admin, row.id)));
  return jsonResponse(req, { ok: true, records });
}
async function exchangeLink(admin: AdminClient, req: Request, body: Json) {
  const raw = String(body.token ?? "");
  if (raw.length < 32) return jsonResponse(req, { ok: false, code: "INVALID_TOKEN" }, 400);
  const hashed = await hashToken(raw);
  const found = await admin.from("guest_sell_access_tokens").select("request_id,expires_at,used_at,token_kind")
    .eq("token_hash", hashed).eq("token_kind", "link").maybeSingle();
  if (found.error) throw found.error;
  if (!found.data || found.data.used_at || new Date(found.data.expires_at).getTime() <= Date.now()) return jsonResponse(req, { ok: false, code: "LINK_EXPIRED" }, 401);
  const marked = await admin.from("guest_sell_access_tokens").update({ used_at: new Date().toISOString() }).eq("token_hash", hashed).is("used_at", null).select("request_id").maybeSingle();
  if (marked.error) throw marked.error;
  if (!marked.data) return jsonResponse(req, { ok: false, code: "LINK_USED" }, 409);
  const sessionToken = await issue(admin, found.data.request_id, "session", 24 * 30);
  return jsonResponse(req, { ok: true, sessionToken, record: await requestView(admin, found.data.request_id) });
}
async function statusByToken(admin: AdminClient, req: Request, body: Json) {
  const raw = String(body.sessionToken ?? "");
  if (raw.length < 32) return jsonResponse(req, { ok: false, code: "INVALID_SESSION" }, 400);
  const hashed = await hashToken(raw);
  const found = await admin.from("guest_sell_access_tokens").select("request_id,expires_at,token_kind")
    .eq("token_hash", hashed).eq("token_kind", "session").maybeSingle();
  if (found.error) throw found.error;
  if (!found.data || new Date(found.data.expires_at).getTime() <= Date.now()) return jsonResponse(req, { ok: false, code: "SESSION_EXPIRED" }, 401);
  await admin.from("guest_sell_access_tokens").update({ last_used_at: new Date().toISOString() }).eq("token_hash", hashed);
  return jsonResponse(req, { ok: true, record: await requestView(admin, found.data.request_id) });
}
async function verifyGuestPhone(admin: AdminClient, req: Request, body: Json) {
  if (!PORTONE_API_SECRET || !PORTONE_STORE_ID || !PORTONE_IDENTITY_CHANNEL_KEY) return jsonResponse(req, { ok: false, code: "NOT_CONFIGURED" }, 503);
  const receiptNo = receipt(body.receiptNo);
  const identityVerificationId = safeText(body.identityVerificationId, 80) ?? "";
  if (!receiptNo || !/^[A-Za-z0-9_-]{8,80}$/.test(identityVerificationId)) return jsonResponse(req, { ok: false, code: "INVALID_VERIFY_REQUEST" }, 400);
  if (await limited(admin, req, "verify", receiptNo, 5, 10)) return jsonResponse(req, { ok: false, code: "RATE_LIMIT" }, 429);
  const requestRow = await admin.from("sell_service_requests").select("id,customer_phone,owner_user_id").eq("receipt_no", receiptNo).maybeSingle();
  if (requestRow.error) throw requestRow.error;
  if (!requestRow.data || requestRow.data.owner_user_id) return jsonResponse(req, { ok: false, code: "NOT_FOUND" }, 404);
  const providerResponse = await fetch(`${PORTONE_API_BASE}/identity-verifications/${encodeURIComponent(identityVerificationId)}`, { headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` } });
  const verification = await providerResponse.json().catch(() => null) as Json | null;
  if (!providerResponse.ok || !verification) return jsonResponse(req, { ok: false, code: "PROVIDER_LOOKUP_FAILED" }, 502);
  const checked = validatePortOneIdentity(verification, { storeId: PORTONE_STORE_ID, channelKey: PORTONE_IDENTITY_CHANNEL_KEY, allowTest: ALLOW_TEST_IDENTITY });
  if (!checked.verified || phone(checked.phone) !== requestRow.data.customer_phone) return jsonResponse(req, { ok: false, code: "PHONE_MISMATCH" }, 403);
  const sessionToken = await issue(admin, requestRow.data.id, "session", 24 * 30);
  return jsonResponse(req, { ok: true, sessionToken, record: await requestView(admin, requestRow.data.id) });
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
  try {
    const body = await req.json() as Json;
    const action = String(body.action ?? "");
    if (action === "create") return await createRequest(admin, req, body);
    if (action === "list") return await listMember(admin, req);
    if (action === "exchange") return await exchangeLink(admin, req, body);
    if (action === "status") return await statusByToken(admin, req, body);
    if (action === "verify-phone") return await verifyGuestPhone(admin, req, body);
    return jsonResponse(req, { ok: false, code: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    const code = safeText((error as Error)?.message, 120) ?? "ERROR";
    console.error("sell_request_access_failed", code);
    return jsonResponse(req, { ok: false, code }, 500);
  }
});
