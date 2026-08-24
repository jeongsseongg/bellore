import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import { cancelAndReconcile } from "../_shared/portone-cancellation.ts";
import { hasRefundablePaymentStatus } from "../_shared/order-payment-states.ts";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_API_BASE = Deno.env.get("PORTONE_API_BASE") ?? "https://api.portone.io";
const PORTONE_STORE_ID = Deno.env.get("PORTONE_STORE_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RECONCILE_TOKEN = Deno.env.get("PAYMENT_RECONCILE_TOKEN") ?? "";
const ALLOW_TEST_PAYMENTS = Deno.env.get("ALLOW_TEST_PAYMENTS") === "true";

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

async function providerPayment(paymentId: string): Promise<JsonRecord | null> {
  const response = await fetch(
    `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
    { headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` } },
  );
  if (!response.ok) return null;
  try {
    return await response.json() as JsonRecord;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!PORTONE_API_SECRET || !PORTONE_STORE_ID || !SUPABASE_URL || !SERVICE_ROLE || !RECONCILE_TOKEN) {
    return json({ error: "server_not_configured" }, 503);
  }
  if (!safeEqual(req.headers.get("x-reconcile-token") ?? "", RECONCILE_TOKEN)) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: orders, error } = await admin
    .from("orders")
    .select("order_no,amount,status,payment_key")
    .in("status", ["payment_review", "refund_pending"])
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return json({ error: "orders_lookup_failed" }, 500);

  const summary = { scanned: 0, refunded: 0, pending: 0, failed: 0, reviewRequired: 0, errors: 0 };
  for (const order of orders ?? []) {
    summary.scanned += 1;
    const paymentId = order.payment_key || order.order_no;
    const payment = await providerPayment(paymentId);
    if (!payment || payment.storeId !== PORTONE_STORE_ID || payment.currency !== "KRW") {
      summary.errors += 1;
      continue;
    }
    const channel = payment.channel && typeof payment.channel === "object"
      ? payment.channel as JsonRecord
      : null;
    if (!ALLOW_TEST_PAYMENTS && channel?.type !== "LIVE") {
      summary.errors += 1;
      continue;
    }

    if (payment.status === "CANCELLED" && hasRefundablePaymentStatus(order.status)) {
      const { data: finalized, error: finalizeError } = await admin.rpc("finalize_order_refund_v2", {
        p_order_no: order.order_no,
        p_refund_amount: Number(order.amount),
        p_reason: "scheduled_cancel_reconciliation",
        p_provider_cancellation_id: null,
      });
      if (!finalizeError && finalized?.ok) summary.refunded += 1;
      else summary.errors += 1;
      continue;
    }
    if (payment.status === "PARTIAL_CANCELLED") {
      await admin.rpc("mark_order_payment_review", {
        p_order_no: order.order_no,
        p_reason: "partial_cancel_requires_manual_review",
      });
      summary.reviewRequired += 1;
      continue;
    }
    if (payment.status === "PAID") {
      const cancellation = await cancelAndReconcile({
        admin,
        apiBase: PORTONE_API_BASE,
        apiSecret: PORTONE_API_SECRET,
        storeId: PORTONE_STORE_ID,
        paymentId,
        orderNo: order.order_no,
        orderAmount: Number(order.amount),
        reason: "scheduled_payment_reconciliation",
      });
      if (!cancellation.tracked) summary.errors += 1;
      else if (cancellation.dbFinalized) summary.refunded += 1;
      else if (cancellation.state === "requested") summary.pending += 1;
      else summary.failed += 1;
      continue;
    }
    if (payment.status === "FAILED") {
      const { data: marked, error: markError } = await admin.rpc("fail_unsettled_order", {
        p_order_no: order.order_no,
        p_reason: "provider_payment_failed",
      });
      if (!markError && marked === true) summary.failed += 1;
      else summary.errors += 1;
      continue;
    }
    summary.reviewRequired += 1;
  }
  return json({ ok: summary.errors === 0 && summary.reviewRequired === 0, ...summary });
});
