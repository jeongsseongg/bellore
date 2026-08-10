import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const IP_HASH_KEY = Deno.env.get("ANALYTICS_IP_HASH_KEY") ?? "";
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("ANALYTICS_ALLOWED_ORIGINS") ?? "https://bellore.co.kr,https://www.bellore.co.kr")
    .split(",").map((v) => v.trim()).filter(Boolean),
);
const MAX_BODY = 16 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 90;
const rate = new Map<string, { start: number; count: number }>();

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
function json(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}
function rateLimited(key: string) {
  const now = Date.now();
  const entry = rate.get(key);
  if (!entry || now - entry.start >= RATE_WINDOW_MS) {
    rate.set(key, { start: now, count: 1 });
    if (rate.size > 5000) for (const [k, v] of rate) if (now - v.start > RATE_WINDOW_MS * 2) rate.delete(k);
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function clientIp(req: Request) {
  const value = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "";
  return value.split(",")[0].trim().replace(/^\[|\]$/g, "").slice(0, 64) || null;
}

async function hmacIp(ip: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(IP_HASH_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`bellore:${ip}`));
  return Array.from(new Uint8Array(signed)).map((v) => v.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json(origin, { error: "method_not_allowed" }, 405);
  if (!ALLOWED_ORIGINS.has(origin)) return json(origin, { error: "origin_not_allowed" }, 403);
  if (!SUPABASE_URL || !SERVICE_ROLE || IP_HASH_KEY.length < 32) return json(origin, { error: "server_not_configured" }, 503);
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY) return json(origin, { error: "payload_too_large" }, 413);
  const ua = req.headers.get("user-agent") ?? "";
  if (/bot|crawler|spider|headless|lighthouse/i.test(ua)) return json(origin, { accepted: false, reason: "bot" }, 202);
  const ip = clientIp(req);
  if (!ip) return json(origin, { error: "client_ip_unavailable" }, 503);
  const ipHash = await hmacIp(ip);
  if (rateLimited(`${origin}:${ipHash}`)) return json(origin, { error: "rate_limited" }, 429);

  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY) return json(origin, { error: "payload_too_large" }, 413);
    const event = JSON.parse(raw);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    let userId: string | null = null;
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (bearer && bearer !== SERVICE_ROLE) {
      const { data } = await admin.auth.getUser(bearer);
      userId = data.user?.id ?? null;
    }
    const { data, error } = await admin.rpc("analytics_ingest_event", {
      p_event: event, p_origin: origin, p_authenticated_user: userId,
      p_ip_hash: ipHash, p_ip: ip,
    });
    if (error) {
      const message = String(error.message || "rejected");
      const status = /not_configured/.test(message) ? 503 : (/not_allowed|consent|required|invalid|payload/.test(message) ? 400 : 500);
      return json(origin, { error: message.split("\n")[0].slice(0, 160) }, status);
    }
    return json(origin, data ?? { accepted: true }, 202);
  } catch (_error) {
    return json(origin, { error: "invalid_json" }, 400);
  }
});
