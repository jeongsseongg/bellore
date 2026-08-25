import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import { hasConfirmedPaymentStatus } from "../_shared/order-payment-states.ts";
import { cancelAndReconcile } from "../_shared/portone-cancellation.ts";
import {
  finalizePaidOrderFromProvider,
  lookupPortOnePayment,
  markPaymentReviewIfUnsettled,
  paymentRef,
  readMatchingConfirmedOrder,
  safeText,
  type JsonRecord,
} from "../_shared/payment-recovery.ts";
import {
  CONFIRMATION_RETRY_DELAYS_MS,
  providerPaidAmount,
  providerStatusKind,
} from "../_shared/payment-recovery-policy.mjs";

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

function safeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
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
    } else if (!checkoutToken || !safeEqual(await sha256Hex(checkoutToken), order.checkout_token_hash ?? "")) {
      return json(req, { error: "order_forbidden" }, 403);
    }

    if (order.status === "refund_pending") {
      return json(req, { error: "payment_refund_pending" }, 409);
    }
    if (order.status === "refunded") {
      return json(req, { error: "payment_refunded" }, 409);
    }
    if (hasConfirmedPaymentStatus(order.status)) {
      return json(req, { ok: true, alreadyPaid: true, order: publicOrder(order) });
    }

    const lookup = await lookupPortOnePayment({
      apiBase: PORTONE_API_BASE,
      apiSecret: PORTONE_API_SECRET,
      storeId: PORTONE_STORE_ID,
      paymentId,
      allowTestPayments: ALLOW_TEST_PAYMENTS,
      timeoutMs: 5000,
      retryDelaysMs: CONFIRMATION_RETRY_DELAYS_MS,
      retryPendingStatus: true,
      notFoundResult: "pending",
    });
    if (lookup.error || !lookup.payment) {
      console.warn("confirm-payment provider rejected", JSON.stringify({
        paymentRef: paymentRef(paymentId),
        code: lookup.error ?? "provider_lookup_failed",
      }));
      if (lookup.errorStatus === 202) {
        return json(req, {
          ok: false,
          pending: true,
          error: "payment_confirmation_pending",
          retryAfterMs: 2000,
        }, 202);
      }
      return json(req, { error: lookup.error ?? "provider_lookup_failed" }, lookup.errorStatus);
    }
    const payment = lookup.payment;
    const paidAmount = providerPaidAmount(payment);

    const statusKind = providerStatusKind(payment.status);
    if (statusKind === "pending") {
      console.info("confirm-payment deferred", JSON.stringify({
        paymentRef: paymentRef(paymentId),
        providerStatus: safeText(payment.status, 40),
      }));
      return json(req, {
        ok: false,
        pending: true,
        error: "payment_confirmation_pending",
        retryAfterMs: 2000,
      }, 202);
    }
    if (statusKind !== "paid") {
      if (statusKind === "failed" || statusKind === "cancelled") {
        const { data: marked, error: markError } = await admin.rpc("fail_unsettled_order", {
          p_order_no: paymentId,
          p_reason: statusKind === "failed"
            ? "provider_payment_failed"
            : "provider_payment_canceled",
        });
        if (markError || marked !== true) {
          console.warn("confirm-payment terminal state not recorded", JSON.stringify({
            paymentRef: paymentRef(paymentId),
            providerStatus: safeText(payment.status, 40),
          }));
        }
      }
      if (statusKind === "partial_cancelled") {
        const { data: marked, error: markError } = await admin.rpc("mark_order_payment_review", {
          p_order_no: paymentId,
          p_reason: "provider_payment_partially_cancelled",
        });
        if (markError || marked !== true) {
          return json(req, { error: "payment_review_not_recorded" }, 500);
        }
        return json(req, { error: "payment_requires_review" }, 409);
      }
      const code = statusKind === "failed"
        ? "payment_declined"
        : statusKind === "cancelled"
        ? "payment_canceled"
        : "payment_not_paid";
      console.warn("confirm-payment not paid", JSON.stringify({
        paymentRef: paymentRef(paymentId),
        code,
        providerStatus: safeText(payment.status, 40),
      }));
      return json(req, { error: code, status: payment.status }, 409);
    }
    if (paidAmount === null) {
      const reviewRecorded = await markPaymentReviewIfUnsettled(
        admin, order.id, "provider_paid_amount_missing",
      );
      if (!reviewRecorded) return json(req, { error: "payment_review_not_recorded" }, 500);
      return json(req, { error: "payment_requires_review" }, 409);
    }
    if (paidAmount !== Number(order.amount)) {
      const cancellation = await cancelAndReconcile({
        admin,
        apiBase: PORTONE_API_BASE,
        apiSecret: PORTONE_API_SECRET,
        storeId: PORTONE_STORE_ID,
        paymentId,
        orderNo: paymentId,
        refundAmount: paidAmount,
        intentCode: "amount_mismatch_auto_cancel",
        reason: "amount_mismatch_auto_cancel",
      });
      return json(req, {
        error: "amount_mismatch",
        cancellationState: cancellation.state,
        providerRefunded: cancellation.providerRefunded,
        recoveryTracked: cancellation.tracked,
      }, cancellation.tracked ? 409 : 500);
    }

    const finalized = await finalizePaidOrderFromProvider({
      admin,
      orderNo: paymentId,
      paymentId,
      paidAmount,
      payment,
      attribution,
      pointEarnBps: POINT_EARN_BPS,
    });
    if (!finalized.order) {
      const committed = await readMatchingConfirmedOrder(admin, paymentId, paymentId, paidAmount);
      if (committed) {
        return json(req, {
          ok: true,
          alreadyPaid: true,
          earnedPoints: 0,
          order: publicOrder(committed),
          payment: {
            status: payment.status,
            transactionId: finalized.transactionId,
            paidAt: payment.paidAt ?? null,
            method: finalized.method,
          },
        });
      }

      const dbCode = finalized.errorCode ?? "invalid_result";
      const reviewRecorded = await markPaymentReviewIfUnsettled(
        admin,
        order.id,
        `provider_paid_finalize_retry:${dbCode}`,
      );
      if (!reviewRecorded) {
        const committedAfterRace = await readMatchingConfirmedOrder(
          admin,
          paymentId,
          paymentId,
          paidAmount,
        );
        if (committedAfterRace) {
          return json(req, {
            ok: true,
            alreadyPaid: true,
            earnedPoints: 0,
            order: publicOrder(committedAfterRace),
          });
        }
        console.error("confirm-payment recovery state not recorded", JSON.stringify({
          paymentRef: paymentRef(paymentId),
          dbCode,
        }));
        return json(req, { error: "payment_recovery_not_recorded" }, 503);
      }
      console.warn("confirm-payment paid finalization deferred", JSON.stringify({
        paymentRef: paymentRef(paymentId),
        dbCode,
      }));
      return json(req, {
        ok: false,
        pending: true,
        error: "payment_confirmation_pending",
        phase: "order_finalization",
        retryAfterMs: 2000,
      }, 202);
    }

    return json(req, {
      ok: true,
      alreadyPaid: finalized.alreadyPaid,
      earnedPoints: finalized.earnedPoints,
      order: publicOrder(finalized.order),
      payment: {
        status: payment.status,
        transactionId: finalized.transactionId,
        paidAt: payment.paidAt ?? null,
        method: finalized.method,
      },
    });
  } catch (error) {
    console.error("confirm-payment", error instanceof Error ? error.message : String(error));
    return json(req, { error: "server_error" }, 500);
  }
});
