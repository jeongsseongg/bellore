const DEFAULT_ALLOWED_ORIGINS = [
  "https://bellore.co.kr",
  "https://www.bellore.co.kr",
  "http://localhost",
  "http://127.0.0.1",
];

export function allowedOrigin(req, allowed = DEFAULT_ALLOWED_ORIGINS) {
  const origin = req.headers.get("Origin");
  if (!origin) return null;
  try {
    const url = new URL(origin);
    const normalized = `${url.protocol}//${url.hostname}`;
    return allowed.includes(normalized) ? origin : null;
  } catch {
    return null;
  }
}

export function corsHeaders(req) {
  const origin = allowedOrigin(req);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function jsonResponse(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export function rejectDisallowedOrigin(req) {
  return !!req.headers.get("Origin") && !allowedOrigin(req);
}

export function safeText(value, max = 200) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

export function digits(value, max = 80) {
  return String(value ?? "").replace(/\D/g, "").slice(0, max);
}

export function normalizePhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let number = raw.replace(/[^0-9+]/g, "");
  if (number.startsWith("+82")) number = `0${number.slice(3)}`;
  else if (number.startsWith("82")) number = `0${number.slice(2)}`;
  const normalized = number.replace(/\D/g, "");
  return /^01\d{8,9}$/.test(normalized) ? normalized : null;
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function requireUser(admin, req) {
  const authorization = req.headers.get("Authorization") ?? "";
  const bearer = authorization.replace(/^Bearer\s+/i, "");
  if (!bearer) return null;
  const { data, error } = await admin.auth.getUser(bearer);
  return error ? null : data.user ?? null;
}

export async function recordVerificationEvent(admin, event) {
  const payload = {
    user_id: event.userId ?? null,
    actor_user_id: event.actorUserId ?? event.userId ?? null,
    method: event.method,
    status: event.status,
    provider: event.provider ?? null,
    provider_reference_hash: event.providerReferenceHash ?? null,
    reason_code: event.reasonCode ?? null,
    metadata: event.metadata ?? {},
  };
  const { data, error } = await admin
    .from("member_verification_events")
    .insert(payload)
    .select("id,created_at")
    .single();
  if (error) throw error;
  return data;
}

export function publicVerificationStatus(profile) {
  const item = (verified, verifiedAt, provider) => ({
    verified: verified === true,
    verifiedAt: verifiedAt ?? null,
    provider: provider ?? null,
  });
  return {
    phone: item(profile?.phone_verified, profile?.phone_verified_at, profile?.phone_verification_provider),
    email: item(profile?.email_verified, profile?.email_verified_at, profile?.email_verification_provider),
    business: item(profile?.biz_verified, profile?.biz_verified_at, profile?.biz_verification_provider),
    account: item(profile?.account_verified, profile?.account_verified_at, profile?.account_verification_provider),
  };
}
