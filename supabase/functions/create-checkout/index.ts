import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  classifyCheckoutJwtClaims,
  decodeGatewayVerifiedJwtClaims,
} from "../_shared/checkout-auth.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RATE_KEY_SECRET = Deno.env.get("CHECKOUT_RATE_KEY_SECRET") ?? "";

const ALLOWED_ORIGINS = new Set([
  "https://bellore.co.kr",
  "https://www.bellore.co.kr",
  "http://localhost",
  "http://127.0.0.1",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 16 * 1024;

type JsonRecord = Record<string, unknown>;
type RpcError = { code?: string; message?: string };

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get("Origin");
  if (!origin) return null;
  try {
    const url = new URL(origin);
    const normalized = `${url.protocol}//${url.hostname}`;
    return ALLOWED_ORIGINS.has(normalized) ? origin : null;
  } catch {
    return null;
  }
}

function cors(req: Request): HeadersInit {
  const origin = allowedOrigin(req);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

function safeText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function uuid(value: unknown): string | null {
  const candidate = safeText(value, 36);
  return candidate && UUID_RE.test(candidate) ? candidate.toLowerCase() : null;
}

function sanitizeAttribution(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as JsonRecord;
  const touch = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const input = candidate as JsonRecord;
    const keys = [
      "utm_id", "utm_source", "utm_medium", "utm_campaign", "utm_source_platform",
      "utm_term", "utm_content", "gclid", "dclid", "wbraid", "gbraid", "msclkid",
      "fbclid", "ttclid", "n_media", "n_query", "n_keyword", "n_campaign",
      "n_campaign_type", "n_ad_group", "n_ad", "n_rank", "n_click_id",
      "referrer_host", "channel",
    ];
    const output: Record<string, string> = {};
    for (const key of keys) {
      const text = safeText(input[key], 200);
      if (text) output[key] = text;
    }
    return output;
  };
  return {
    event_id: uuid(source.event_id),
    anonymous_id: uuid(source.anonymous_id),
    session_id: uuid(source.session_id),
    first_touch: touch(source.first_touch),
    session_touch: touch(source.session_touch),
    conversion_touch: touch(source.conversion_touch),
  };
}

// Supabase's gateway supplies x-forwarded-for. Never accept an IP from the body.
function platformClientIp(req: Request): string | null {
  const edgeAddress = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
  const forwarded = req.headers.get("x-forwarded-for");
  const candidate = (edgeAddress || forwarded?.split(",").at(-1) || "").trim().toLowerCase();
  if (!candidate || candidate.length > 64 || !/^[0-9a-f:.]+$/.test(candidate)) return null;
  return candidate;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function randomCapability(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicCheckoutError(error: RpcError): { code: string; status: number } {
  const message = error.message ?? "";
  const known: Array<[string, number]> = [
    ["checkout_rate_limited", 429],
    ["listing_reserved", 409],
    ["listing_unavailable", 409],
    ["listing_not_found", 404],
    ["coupon_invalid", 409],
    ["guest_coupon_not_allowed", 403],
    ["checkout_amount_too_small", 409],
    ["listing_price_invalid", 409],
    ["attribution_invalid", 400],
  ];
  for (const [code, status] of known) {
    if (message.includes(code)) return { code, status };
  }
  return { code: "checkout_failed", status: 500 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (!allowedOrigin(req)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: cors(req) });
  }
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  // This endpoint is browser-only. A missing Origin is not silently trusted.
  if (!allowedOrigin(req)) return json(req, { error: "origin_forbidden" }, 403);
  if (!SUPABASE_URL || !SERVICE_ROLE || RATE_KEY_SECRET.length < 32) {
    return json(req, { error: "server_not_configured" }, 503);
  }

  const clientIp = platformClientIp(req);
  if (!clientIp) return json(req, { error: "client_address_unavailable" }, 400);

  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json(req, { error: "request_too_large" }, 413);
    }
    let body: JsonRecord;
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json(req, { error: "invalid_json" }, 400);
      }
      body = parsed as JsonRecord;
    } catch {
      return json(req, { error: "invalid_json" }, 400);
    }

    const listingId = uuid(body.listingId);
    const couponUserId = body.couponUserId == null ? null : uuid(body.couponUserId);
    if (!listingId) return json(req, { error: "listing_required" }, 400);
    if (body.couponUserId != null && !couponUserId) {
      return json(req, { error: "coupon_invalid" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const tokenContext = classifyCheckoutJwtClaims(decodeGatewayVerifiedJwtClaims(bearer));
    let callerId: string | null = null;
    if (tokenContext.kind === "user") {
      const { data, error } = await admin.auth.getUser(bearer);
      if (error || !data.user || data.user.id.toLowerCase() !== tokenContext.subject) {
        console.warn("create-checkout user token rejected", {
          authCode: safeText(error?.code, 40),
          subjectMatched: false,
        });
        return json(req, { error: "session_invalid" }, 401);
      }
      callerId = data.user.id;
    } else if (tokenContext.kind !== "guest") {
      console.warn("create-checkout token rejected", { reason: tokenContext.reason });
      return json(req, { error: "unauthorized" }, 401);
    }

    const checkoutToken = randomCapability();
    const checkoutTokenHash = await sha256Hex(checkoutToken);
    const rateKey = await sha256Hex(`checkout-ip-v1\0${RATE_KEY_SECRET}\0${clientIp}`);

    const { data, error } = await admin.rpc("create_checkout_order_edge_v1", {
      p_rate_key: rateKey,
      p_customer_id: callerId,
      p_listing_id: listingId,
      p_checkout_token_hash: checkoutTokenHash,
      p_coupon_user_id: couponUserId,
      p_buyer_name: safeText(body.buyerName, 120),
      p_buyer_phone: safeText(body.buyerPhone, 40),
      p_ship_recipient: safeText(body.shipRecipient, 120),
      p_ship_phone: safeText(body.shipPhone, 40),
      p_ship_postcode: safeText(body.shipPostcode, 20),
      p_ship_addr1: safeText(body.shipAddr1, 300),
      p_ship_addr2: safeText(body.shipAddr2, 300),
      p_ship_request: safeText(body.shipRequest, 300),
      p_attribution: sanitizeAttribution(body.attribution),
    });
    if (error) {
      const publicError = publicCheckoutError(error);
      console.error("create-checkout rpc failed", {
        rpcCode: safeText(error.code, 40),
        publicCode: publicError.code,
      });
      return json(req, { error: publicError.code }, publicError.status);
    }

    const order = data && typeof data === "object" && !Array.isArray(data)
      ? data as JsonRecord
      : null;
    const orderNo = safeText(order?.orderNo, 160);
    const amount = Number(order?.amount);
    const responseListingId = uuid(order?.listingId);
    const payType = safeText(order?.payType, 20);
    const expiresAt = safeText(order?.expiresAt, 80);
    if (!orderNo || !Number.isSafeInteger(amount) || amount < 100 ||
      responseListingId !== listingId || payType !== "full" || !expiresAt) {
      console.error("create-checkout rpc returned an invalid public order");
      return json(req, { error: "checkout_response_invalid" }, 502);
    }

    return json(req, {
      orderNo,
      amount,
      payType,
      listingId: responseListingId,
      expiresAt,
      checkoutToken,
    });
  } catch (error) {
    console.error("create-checkout failed", error instanceof Error ? error.name : "unknown");
    return json(req, { error: "checkout_failed" }, 500);
  }
});
