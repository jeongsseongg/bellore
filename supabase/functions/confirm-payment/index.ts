import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_API_BASE = Deno.env.get("PORTONE_API_BASE") ?? "https://api.portone.io";
const PORTONE_STORE_ID = Deno.env.get("PORTONE_STORE_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const POINT_EARN_BPS = Number(Deno.env.get("POINT_EARN_BPS") ?? "0");
const ALLOW_TEST_PAYMENTS = Deno.env.get("ALLOW_TEST_PAYMENTS") === "true";
const ALLOWED_ORIGINS = new Set([
  "https://bellore.co.kr",
  "https://www.bellore.co.kr",
  "http://localhost",
  "http://127.0.0.1",
]);

type JsonRecord = Record<string, unknown>;

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

function sanitizeAttribution(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as JsonRecord;
  const uuid = (candidate: unknown) =>
    typeof candidate === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
      ? candidate
      : null;
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

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicOrder(order: JsonRecord | null | undefined) {
  if (!order) return null;
  return {
    id: order.id,
    order_no: order.order_no,
    listing_id: order.listing_id,
    status: order.status,
    amount: order.amount,
    paid_at: order.paid_at,
    receipt_url: order.receipt_url,
  };
}

async function cancelProviderPayment(paymentId: string, reason: string) {
  const response = await fetch(
    `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `PortOne ${PORTONE_API_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ storeId: PORTONE_STORE_ID, reason }),
    },
  );
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { ok: response.ok, payload };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (!allowedOrigin(req)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: cors(req) });
  }
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  if (req.headers.get("Origin") && !allowedOrigin(req)) {
    return json(req, { error: "origin_forbidden" }, 403);
  }
  if (!PORTONE_API_SECRET || !PORTONE_STORE_ID || !SUPABASE_URL || !SERVICE_ROLE) {
    return json(req, { error: "server_not_configured" }, 503);
  }
  if (!Number.isInteger(POINT_EARN_BPS) || POINT_EARN_BPS < 0 || POINT_EARN_BPS > 10000) {
    return json(req, { error: "point_policy_invalid" }, 503);
  }

  try {
    const body = await req.json() as JsonRecord;
    const paymentId = safeText(body.paymentId ?? body.orderId, 160);
    const checkoutToken = safeText(body.checkoutToken, 256);
    const attribution = sanitizeAttribution(body.attribution);
    if (!paymentId) return json(req, { error: "missing_payment_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,order_no,customer_id,listing_id,amount,status,checkout_token_hash,payment_key,paid_at,receipt_url")
      .eq("order_no", paymentId)
      .single();
    if (orderError || !order) return json(req, { error: "order_not_found" }, 404);

    const authorization = req.headers.get("Authorization") ?? "";
    const bearer = authorization.replace(/^Bearer\s+/i, "");
    let callerId: string | null = null;
    if (bearer) {
      const { data } = await admin.auth.getUser(bearer);
      callerId = data.user?.id ?? null;
    }
    if (order.customer_id) {
      if (!callerId || callerId !== order.customer_id) {
        return json(req, { error: "order_forbidden" }, 403);
      }
    } else if (!checkoutToken || await sha256Hex(checkoutToken) !== order.checkout_token_hash) {
      return json(req, { error: "order_forbidden" }, 403);
    }

    const settledStatuses = new Set([
      "paid", "inspecting", "preparing", "shipping", "shipped", "delivered",
      "confirmed", "cancel_req", "refund_pending", "refunded",
    ]);
    if (settledStatuses.has(order.status)) {
      return json(req, { ok: true, alreadyPaid: true, order: publicOrder(order) });
    }

    const providerResponse = await fetch(
      `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` } },
    );
    let payment: JsonRecord;
    try {
      payment = await providerResponse.json() as JsonRecord;
    } catch {
      return json(req, { error: "provider_response_invalid" }, 502);
    }
    if (!providerResponse.ok) return json(req, { error: "provider_lookup_failed" }, 502);

    const providerPaymentId = safeText(payment.id ?? payment.paymentId, 160);
    const channel = payment.channel && typeof payment.channel === "object"
      ? payment.channel as JsonRecord
      : null;
    const channelType = safeText(channel?.type, 20);
    const paidAmount = Number(
      payment.amount && typeof payment.amount === "object"
        ? (payment.amount as JsonRecord).total
        : payment.amount,
    );

    if (providerPaymentId && providerPaymentId !== paymentId) {
      return json(req, { error: "provider_payment_id_mismatch" }, 409);
    }
    if (payment.storeId !== PORTONE_STORE_ID) {
      return json(req, { error: "provider_store_mismatch" }, 409);
    }
    if (payment.currency !== "KRW") {
      return json(req, { error: "provider_currency_mismatch" }, 409);
    }
    if ((!ALLOW_TEST_PAYMENTS && channelType !== "LIVE") || (!channelType && !ALLOW_TEST_PAYMENTS)) {
      return json(req, { error: "provider_channel_not_live" }, 409);
    }
    if (payment.status !== "PAID") {
      if (payment.status === "FAILED") {
        await admin.from("orders").update({ status: "failed" }).eq("id", order.id);
      }
      return json(req, { error: "payment_not_paid", status: payment.status }, 409);
    }
    if (!Number.isSafeInteger(paidAmount) || paidAmount !== Number(order.amount)) {
      const cancellation = await cancelProviderPayment(paymentId, "amount_mismatch_auto_cancel");
      await admin.rpc("mark_order_payment_review", {
        p_order_no: paymentId,
        p_reason: cancellation.ok ? "amount_mismatch_cancelled" : "amount_mismatch_cancel_failed",
      });
      return json(req, { error: "amount_mismatch", cancelled: cancellation.ok }, 409);
    }

    const method = payment.method && typeof payment.method === "object"
      ? safeText((payment.method as JsonRecord).type ?? (payment.method as JsonRecord).provider, 80)
      : null;
    const receiptUrl = safeText(payment.receiptUrl, 500);
    const transactionId = safeText(payment.transactionId, 160);
    const { data: finalized, error: finalizeError } = await admin.rpc("finalize_paid_order_v2", {
      p_order_no: paymentId,
      p_paid_amount: paidAmount,
      p_method: method,
      p_payment_key: paymentId,
      p_provider_transaction_id: transactionId,
      p_receipt_url: receiptUrl,
      p_attribution: attribution,
      p_point_earn_bps: POINT_EARN_BPS,
    });
    if (finalizeError || !finalized?.order) {
      const cancellation = await cancelProviderPayment(paymentId, "order_finalize_failed_auto_cancel");
      await admin.rpc("mark_order_payment_review", {
        p_order_no: paymentId,
        p_reason: cancellation.ok
          ? `finalize_failed_cancelled:${finalizeError?.message ?? "unknown"}`
          : `finalize_failed_cancel_failed:${finalizeError?.message ?? "unknown"}`,
      });
      return json(req, { error: "order_finalize_failed", cancelled: cancellation.ok }, 409);
    }

    return json(req, {
      ok: true,
      alreadyPaid: Boolean(finalized.alreadyPaid),
      earnedPoints: Number(finalized.earnedPoints) || 0,
      order: publicOrder(finalized.order),
      payment: {
        status: payment.status,
        transactionId,
        paidAt: payment.paidAt ?? null,
        method,
      },
    });
  } catch (error) {
    console.error("confirm-payment", error instanceof Error ? error.message : String(error));
    return json(req, { error: "server_error" }, 500);
  }
});
