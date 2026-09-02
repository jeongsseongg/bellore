import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import { hasRefundablePaymentStatus } from "../_shared/order-payment-states.ts";
import {
  guardPaymentOperation,
  readPaymentOperationControl,
} from "../_shared/payment-operation-guard.ts";
import {
  cancelAndReconcile,
  finalizeKnownProviderCancellation,
} from "../_shared/portone-cancellation.ts";
import { lookupPortOnePayment } from "../_shared/payment-recovery.ts";
import {
  adminCancellationAction,
  providerCancelledAmount,
  providerPaidAmount,
  providerStatusKind,
} from "../_shared/payment-recovery-policy.mjs";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_API_BASE = Deno.env.get("PORTONE_API_BASE") ?? "https://api.portone.io";
const PORTONE_STORE_ID = Deno.env.get("PORTONE_STORE_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOW_TEST_PAYMENTS = Deno.env.get("ALLOW_TEST_PAYMENTS") === "true";

type JsonRecord = Record<string, unknown>;

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

function headers(req: Request): HeadersInit {
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
    headers: { ...headers(req), "Content-Type": "application/json" },
  });
}

function safeText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (!allowedOrigin(req)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: headers(req) });
  }
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  if (req.headers.get("Origin") && !allowedOrigin(req)) {
    return json(req, { error: "origin_forbidden" }, 403);
  }
  if (!PORTONE_API_SECRET || !PORTONE_STORE_ID || !SUPABASE_URL || !SERVICE_ROLE) {
    return json(req, { error: "server_not_configured" }, 503);
  }

  try {
    const body = await req.json() as JsonRecord;
    const orderNo = safeText(body.orderNo, 160);
    const reason = safeText(body.reason, 300) ?? "administrator_refund";
    if (!orderNo) return json(req, { error: "missing_order_no" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const cancelGate = await readPaymentOperationControl(admin, "cancel_payment");
    if (!cancelGate.ok || !cancelGate.enabled) {
      return json(req, { error: "payment_operations_temporarily_unavailable" }, 503);
    }
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!bearer) return json(req, { error: "unauthorized" }, 401);
    const { data: userResult } = await admin.auth.getUser(bearer);
    const uid = userResult.user?.id;
    if (!uid) return json(req, { error: "unauthorized" }, 401);
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", uid)
      .single();
    if (profile?.role !== "admin") return json(req, { error: "forbidden" }, 403);

    const operation = await guardPaymentOperation({
      admin,
      control: "cancel_payment",
      orderNo,
    });
    if (!operation.allowed) {
      return json(
        req,
        { error: operation.reason === "operation_held"
          ? "payment_operation_held"
          : "payment_operations_temporarily_unavailable" },
        operation.reason === "operation_held" ? 409 : 503,
      );
    }

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,order_no,status,amount,payment_key,refund_amount,cancel_inspected_at")
      .eq("order_no", orderNo)
      .single();
    if (orderError || !order) return json(req, { error: "order_not_found" }, 404);
    if (order.status === "refunded") {
      return json(req, { ok: true, alreadyRefunded: true });
    }
    if (order.status !== "cancel_req" || !order.cancel_inspected_at) {
      return json(req, { error: "cancel_inspection_required" }, 409);
    }
    if (!order.payment_key || !Number.isSafeInteger(Number(order.amount)) || !hasRefundablePaymentStatus(order.status)) {
      return json(req, { error: "paid_payment_not_found" }, 409);
    }

    // The local order is not proof of a captured payment. Read the provider
    // first and make every financial transition from that verified state.
    const lookup = await lookupPortOnePayment({
      operationAdmin: admin,
      operationControl: "cancel_payment",
      operationOrderNo: orderNo,
      apiBase: PORTONE_API_BASE,
      apiSecret: PORTONE_API_SECRET,
      storeId: PORTONE_STORE_ID,
      paymentId: order.payment_key,
      allowTestPayments: ALLOW_TEST_PAYMENTS,
      timeoutMs: 10000,
    });
    if (!lookup.payment || lookup.result !== "found") {
      if (lookup.error === "payment_operation_held") {
        return json(req, { error: "payment_operation_held" }, 409);
      }
      if (lookup.error === "payment_operations_temporarily_unavailable" ||
        lookup.error === "payment_operation_guard_unavailable") {
        return json(req, { error: "payment_operations_temporarily_unavailable" }, 503);
      }
      return json(req, { error: lookup.error ?? "provider_lookup_failed" }, lookup.errorStatus || 502);
    }
    const providerStatus = providerStatusKind(lookup.payment.status);
    const providerAmount = providerStatus === "paid"
      ? providerPaidAmount(lookup.payment)
      : providerStatus === "cancelled" ? providerCancelledAmount(lookup.payment) : null;
    const action = adminCancellationAction(lookup.payment.status, providerAmount);

    if (action === "wait") {
      return json(req, { error: "provider_payment_processing" }, 409);
    }
    if (action === "close_unsettled") {
      if (order.status === "failed" || order.status === "canceled") {
        return json(req, { ok: true, alreadyCanceled: true, refunded: false });
      }
      if (!["pending", "payment_review"].includes(order.status)) {
        return json(req, { error: "provider_order_state_mismatch" }, 409);
      }
      const { data: closed, error: closeError } = await admin.rpc("fail_unsettled_order", {
        p_order_no: orderNo,
        p_reason: "administrator_cancel_provider_failed",
      });
      if (closeError || closed !== true) return json(req, { error: "order_cancel_failed" }, 500);
      return json(req, { ok: true, canceled: true, refunded: false });
    }
    if (action === "review") {
      const { data: marked, error: markError } = await admin.rpc("mark_order_refund_pending", {
        p_order_no: orderNo,
        p_reason: "cancellation_intent:administrator_provider_review_required",
      });
      if (markError || marked !== true) {
        return json(req, { error: "refund_recovery_not_recorded" }, 500);
      }
      return json(req, { error: "refund_requires_review", recoveryTracked: true }, 409);
    }
    if (action === "finalize_cancelled" && providerAmount !== null) {
      const reconciliation = await finalizeKnownProviderCancellation({
        admin, operationControl: "cancel_payment", orderNo, refundAmount: providerAmount,
        expectedOrderAmount: Number(order.amount), reason,
      });
      if (!reconciliation.tracked) {
        return json(req, { error: "refund_recovery_not_recorded", providerRefunded: true }, 500);
      }
      if (!reconciliation.dbFinalized) {
        return json(req, { error: "refund_finalize_failed", providerRefunded: true }, 500);
      }
      return json(req, { ok: true, recovered: true, alreadyProviderCancelled: true });
    }
    if (action !== "cancel_paid" || providerAmount === null) {
      return json(req, { error: "provider_payment_state_unsupported" }, 409);
    }

    const cancellation = await cancelAndReconcile({
      admin,
      operationControl: "cancel_payment",
      apiBase: PORTONE_API_BASE,
      apiSecret: PORTONE_API_SECRET,
      storeId: PORTONE_STORE_ID,
      paymentId: order.payment_key,
      orderNo,
      refundAmount: providerAmount,
      intentCode: "administrator_provider_verified_refund",
      reason,
    });
    if (!cancellation.tracked) {
      return json(req, {
        error: "refund_recovery_not_recorded",
        providerRefunded: cancellation.providerRefunded,
      }, 500);
    }
    if (cancellation.state === "failed") {
      return json(req, { error: "provider_cancel_failed", recoveryTracked: true }, 502);
    }
    if (cancellation.state === "requested") {
      return json(req, {
        ok: true,
        pending: true,
        cancellation: { id: cancellation.cancellationId, status: "REQUESTED" },
      });
    }
    if (!cancellation.dbFinalized) {
      return json(req, { error: "refund_finalize_failed", providerRefunded: true }, 500);
    }
    return json(req, {
      ok: true,
      recovered: cancellation.recovered,
      cancellation: { id: cancellation.cancellationId, status: "SUCCEEDED" },
    });
  } catch (error) {
    console.error("cancel-payment", error instanceof Error ? error.message : String(error));
    return json(req, { error: "server_error" }, 500);
  }
});
