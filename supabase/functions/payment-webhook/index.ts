import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  hasRefundablePaymentStatus,
  hasSettledPaymentStatus,
} from "../_shared/order-payment-states.ts";
import { cancelAndReconcile } from "../_shared/portone-cancellation.ts";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_API_BASE = Deno.env.get("PORTONE_API_BASE") ?? "https://api.portone.io";
const PORTONE_STORE_ID = Deno.env.get("PORTONE_STORE_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const POINT_EARN_BPS = Number(Deno.env.get("POINT_EARN_BPS") ?? "0");
const ALLOW_TEST_PAYMENTS = Deno.env.get("ALLOW_TEST_PAYMENTS") === "true";

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!PORTONE_API_SECRET || !PORTONE_STORE_ID || !SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "server_not_configured" }, 503);
  }
  if (!Number.isInteger(POINT_EARN_BPS) || POINT_EARN_BPS < 0 || POINT_EARN_BPS > 10000) {
    return json({ error: "point_policy_invalid" }, 503);
  }

  try {
    // The webhook body is a notification, not proof. Every state transition below
    // is based on a fresh PortOne API lookup authenticated with the server secret.
    const webhook = await req.json() as JsonRecord;
    const eventType = safeText(webhook.type, 80);
    const data = webhook.data && typeof webhook.data === "object"
      ? webhook.data as JsonRecord
      : {};
    const paymentId = safeText(data.paymentId, 160);
    const notifiedStoreId = safeText(data.storeId, 160);
    if (!eventType?.startsWith("Transaction.") || !paymentId) {
      return json({ ok: true, ignored: true });
    }
    if (notifiedStoreId !== PORTONE_STORE_ID) {
      return json({ error: "webhook_identity_invalid" }, 400);
    }

    const providerResponse = await fetch(
      `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` } },
    );
    let payment: JsonRecord;
    try {
      payment = await providerResponse.json() as JsonRecord;
    } catch {
      return json({ error: "provider_response_invalid" }, 502);
    }
    if (!providerResponse.ok) return json({ error: "provider_lookup_failed" }, 502);
    if (payment.storeId !== PORTONE_STORE_ID || payment.currency !== "KRW") {
      return json({ error: "provider_identity_mismatch" }, 409);
    }
    const channel = payment.channel && typeof payment.channel === "object"
      ? payment.channel as JsonRecord
      : null;
    const channelType = safeText(channel?.type, 20);
    if (!ALLOW_TEST_PAYMENTS && channelType !== "LIVE") {
      return json({ error: "provider_channel_not_live" }, 409);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,order_no,amount,status")
      .eq("order_no", paymentId)
      .single();
    if (orderError || !order) return json({ error: "order_not_found" }, 404);

    const cancellationId = safeText(data.cancellationId, 160);
    if (payment.status === "CANCELLED") {
      if (order.status === "refunded") return json({ ok: true, alreadyRefunded: true });
      if (!hasRefundablePaymentStatus(order.status)) {
        return json({ error: "refund_state_invalid", status: order.status }, 409);
      }
      const { data: refunded, error: refundError } = await admin.rpc("finalize_order_refund_v2", {
        p_order_no: paymentId,
        p_refund_amount: Number(order.amount),
        p_reason: "portone_cancelled_webhook",
        p_provider_cancellation_id: cancellationId,
      });
      if (refundError || !refunded?.ok) {
        const { data: marked, error: markError } = await admin.rpc("mark_order_refund_pending", {
          p_order_no: paymentId,
          p_reason: `cancelled_webhook_finalize_failed:${refundError?.message ?? "unknown"}`,
        });
        if (markError || marked !== true) {
          return json({ error: "refund_recovery_not_recorded" }, 500);
        }
        return json({ error: "refund_finalize_failed" }, 500);
      }
      return json({ ok: true, alreadyRefunded: Boolean(refunded.alreadyRefunded) });
    }
    if (eventType === "Transaction.CancelPending") {
      const { data: marked, error: markError } = await admin.rpc("mark_order_refund_pending", {
        p_order_no: paymentId,
        p_reason: `cancel_pending:${cancellationId ?? "provider"}`,
      });
      if (markError || marked !== true) return json({ error: "refund_pending_record_failed" }, 500);
      return json({ ok: true, pending: true, status: eventType });
    }
    if (eventType === "Transaction.PartialCancelled" || payment.status === "PARTIAL_CANCELLED") {
      const { data: marked, error: markError } = await admin.rpc("mark_order_payment_review", {
        p_order_no: paymentId,
        p_reason: `partial_cancel_review:${cancellationId ?? "provider"}`,
      });
      if (markError || marked !== true) return json({ error: "payment_review_record_failed" }, 500);
      return json({ ok: true, reviewRequired: true, status: eventType });
    }
    if (payment.status !== "PAID") {
      return json({ ok: true, ignored: true, status: payment.status });
    }
    if (hasSettledPaymentStatus(order.status)) return json({ ok: true, alreadyPaid: true });

    const paidAmount = Number(
      payment.amount && typeof payment.amount === "object"
        ? (payment.amount as JsonRecord).total
        : payment.amount,
    );
    if (!Number.isSafeInteger(paidAmount) || paidAmount !== Number(order.amount)) {
      const cancellation = await cancelAndReconcile({
        admin,
        apiBase: PORTONE_API_BASE,
        apiSecret: PORTONE_API_SECRET,
        storeId: PORTONE_STORE_ID,
        paymentId,
        orderNo: paymentId,
        orderAmount: Number(order.amount),
        reason: "webhook_amount_mismatch_auto_cancel",
      });
      const retry = !cancellation.tracked ||
        (cancellation.providerRefunded && !cancellation.dbFinalized) ||
        cancellation.state === "failed";
      return json({
        ok: !retry,
        rejected: "amount_mismatch",
        cancellationState: cancellation.state,
        providerRefunded: cancellation.providerRefunded,
      }, retry ? 500 : 200);
    }

    const method = payment.method && typeof payment.method === "object"
      ? safeText((payment.method as JsonRecord).type ?? (payment.method as JsonRecord).provider, 80)
      : null;
    const { data: finalized, error: finalizeError } = await admin.rpc("finalize_paid_order_v2", {
      p_order_no: paymentId,
      p_paid_amount: paidAmount,
      p_method: method,
      p_payment_key: paymentId,
      p_provider_transaction_id: safeText(payment.transactionId, 160),
      p_receipt_url: safeText(payment.receiptUrl, 500),
      p_attribution: null,
      p_point_earn_bps: POINT_EARN_BPS,
    });
    if (finalizeError || !finalized?.order) {
      const cancellation = await cancelAndReconcile({
        admin,
        apiBase: PORTONE_API_BASE,
        apiSecret: PORTONE_API_SECRET,
        storeId: PORTONE_STORE_ID,
        paymentId,
        orderNo: paymentId,
        orderAmount: Number(order.amount),
        reason: "webhook_finalize_failed_auto_cancel",
      });
      const retry = !cancellation.tracked ||
        (cancellation.providerRefunded && !cancellation.dbFinalized) ||
        cancellation.state === "failed";
      return json({
        ok: !retry,
        rejected: "order_finalize_failed",
        cancellationState: cancellation.state,
        providerRefunded: cancellation.providerRefunded,
        detail: finalizeError?.message ? "database_finalize_failed" : "database_result_invalid",
      }, retry ? 500 : 200);
    }
    return json({ ok: true, alreadyPaid: Boolean(finalized.alreadyPaid) });
  } catch (error) {
    console.error("payment-webhook", error instanceof Error ? error.message : String(error));
    return json({ error: "server_error" }, 500);
  }
});
