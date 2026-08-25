import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  hasConfirmedPaymentStatus,
  hasRefundablePaymentStatus,
} from "../_shared/order-payment-states.ts";
import {
  cancelAndReconcile,
  finalizeKnownProviderCancellation,
} from "../_shared/portone-cancellation.ts";
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
  paidRecoveryAction,
  providerCancelledAmount,
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
const MAX_WEBHOOK_BYTES = 16_384;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readWebhook(req: Request): Promise<{ body: JsonRecord | null; error: string | null }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) {
    return { body: null, error: "payload_too_large" };
  }
  if (!req.body) return { body: null, error: "invalid_payload" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_WEBHOOK_BYTES) {
      await reader.cancel();
      return { body: null, error: "payload_too_large" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { body: parsed as JsonRecord, error: null }
      : { body: null, error: "invalid_payload" };
  } catch {
    return { body: null, error: "invalid_payload" };
  }
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
    const parsed = await readWebhook(req);
    if (!parsed.body) {
      return json({ error: parsed.error }, parsed.error === "payload_too_large" ? 413 : 400);
    }
    const webhook = parsed.body;
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
      console.warn("payment-webhook store mismatch ignored", JSON.stringify({
        eventType,
        notifiedStoreIdPresent: Boolean(notifiedStoreId),
      }));
      return json({ ok: true, ignored: true, reason: "store_mismatch" });
    }

    // 먼저 존재하는 주문인지 확인해 임의 결제번호로 PortOne 조회를 남발하지 못하게 한다.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,order_no,amount,status,payment_key,paid_at,receipt_url")
      .eq("order_no", paymentId)
      .single();
    if (orderError || !order) return json({ error: "order_not_found" }, 404);

    const lookup = await lookupPortOnePayment({
      apiBase: PORTONE_API_BASE,
      apiSecret: PORTONE_API_SECRET,
      storeId: PORTONE_STORE_ID,
      paymentId,
      allowTestPayments: ALLOW_TEST_PAYMENTS,
      timeoutMs: 10000,
    });
    if (!lookup.payment) {
      console.warn("payment-webhook provider rejected", JSON.stringify({
        paymentRef: paymentRef(paymentId),
        code: lookup.error ?? lookup.result,
      }));
      return json({ error: lookup.error ?? "provider_lookup_failed" }, lookup.errorStatus);
    }
    const payment = lookup.payment;

    const statusKind = providerStatusKind(payment.status);
    if (statusKind === "cancelled") {
      if (order.status === "refunded") return json({ ok: true, alreadyRefunded: true });
      if (!hasRefundablePaymentStatus(order.status)) {
        return json({ error: "refund_state_invalid", status: order.status }, 409);
      }
      const cancelledAmount = providerCancelledAmount(payment);
      if (cancelledAmount === null) {
        const { data: marked, error: markError } = await admin.rpc("mark_order_refund_pending", {
          p_order_no: paymentId,
          p_reason: "provider_cancelled_amount_missing",
        });
        if (markError || marked !== true) return json({ error: "refund_recovery_not_recorded" }, 500);
        return json({ error: "refund_amount_review", reviewRequired: true }, 500);
      }
      const reconciliation = await finalizeKnownProviderCancellation({
        admin, orderNo: paymentId, refundAmount: cancelledAmount,
        reason: "portone_cancelled_webhook",
      });
      if (!reconciliation.tracked) {
        return json({ error: "refund_recovery_not_recorded" }, 500);
      }
      if (!reconciliation.dbFinalized) {
        return json({ error: "refund_finalize_failed" }, 500);
      }
      return json({ ok: true, recovered: true });
    }
    if (eventType === "Transaction.CancelPending") {
      if (order.status === "refund_pending") {
        return json({ ok: true, pending: true, status: eventType });
      }
      return json({ ok: true, ignored: true, reason: "cancel_pending_without_local_request" });
    }
    if (statusKind === "partial_cancelled") {
      const markerName = order.status === "refund_pending"
        ? "mark_order_refund_pending"
        : "mark_order_payment_review";
      const { data: marked, error: markError } = await admin.rpc(markerName, {
        p_order_no: paymentId,
        p_reason: order.status === "refund_pending"
          ? "refund_pending_partial_cancel_review:provider"
          : "partial_cancel_review:provider",
      });
      if (markError || marked !== true) return json({ error: "payment_review_record_failed" }, 500);
      return json({
        ok: true,
        reviewRequired: true,
        refundPending: order.status === "refund_pending",
        status: eventType,
      });
    }
    if (statusKind !== "paid") {
      return json({ ok: true, ignored: true, status: payment.status });
    }

    const paidAmount = providerPaidAmount(payment);
    if (hasConfirmedPaymentStatus(order.status)) {
      if (order.payment_key === paymentId && paidAmount === Number(order.amount)) {
        return json({ ok: true, alreadyPaid: true });
      }
      console.error("payment-webhook confirmed order conflict", JSON.stringify({
        paymentRef: paymentRef(paymentId),
      }));
      return json({ error: "confirmed_order_conflict" }, 409);
    }

    const recoveryAction = paidRecoveryAction(
      order.status,
      paidAmount !== null && paidAmount === Number(order.amount),
    );
    if (recoveryAction === "review_amount_mismatch") {
      const reviewRecorded = await markPaymentReviewIfUnsettled(
        admin,
        order.id,
        "provider_paid_amount_mismatch",
      );
      console.error("payment-webhook amount mismatch requires review", JSON.stringify({
        paymentRef: paymentRef(paymentId),
        reviewRecorded,
      }));
      if (!reviewRecorded) return json({ error: "payment_recovery_not_recorded" }, 500);
      return json({ error: "amount_mismatch_review", reviewRequired: true }, 500);
    }
    if (recoveryAction === "continue_cancellation") {
      if (paidAmount === null) {
        const { data: marked, error: markError } = await admin.rpc("mark_order_refund_pending", {
          p_order_no: paymentId,
          p_reason: "refund_pending_provider_paid_amount_missing",
        });
        if (markError || marked !== true) return json({ error: "payment_recovery_not_recorded" }, 500);
        return json({ error: "refund_amount_review", reviewRequired: true, refundPending: true }, 500);
      }
      const cancellation = await cancelAndReconcile({
        admin,
        apiBase: PORTONE_API_BASE,
        apiSecret: PORTONE_API_SECRET,
        storeId: PORTONE_STORE_ID,
        paymentId,
        orderNo: paymentId,
        refundAmount: paidAmount,
        intentCode: "refund_pending_recovery",
        reason: "webhook_refund_pending_recovery",
      });
      const retry = !cancellation.tracked ||
        (cancellation.providerRefunded && !cancellation.dbFinalized) ||
        cancellation.state === "failed";
      return json({
        ok: !retry,
        refundPending: !cancellation.dbFinalized,
        cancellationState: cancellation.state,
        providerRefunded: cancellation.providerRefunded,
      }, retry ? 500 : 200);
    }
    if (recoveryAction !== "finalize") {
      const reviewRecorded = await markPaymentReviewIfUnsettled(
        admin,
        order.id,
        `provider_paid_unexpected_order_state:${String(order.status).slice(0, 80)}`,
      );
      if (!reviewRecorded) return json({ error: "payment_recovery_not_recorded" }, 500);
      return json({ error: "order_finalize_pending", retryable: true }, 500);
    }
    if (paidAmount === null) {
      console.error("payment-webhook recovery policy invariant failed", JSON.stringify({
        paymentRef: paymentRef(paymentId),
      }));
      return json({ error: "payment_recovery_policy_error" }, 500);
    }

    const finalized = await finalizePaidOrderFromProvider({
      admin,
      orderNo: paymentId,
      paymentId,
      paidAmount,
      payment,
      attribution: null,
      pointEarnBps: POINT_EARN_BPS,
    });
    if (!finalized.order) {
      const committed = await readMatchingConfirmedOrder(admin, paymentId, paymentId, paidAmount);
      if (committed) return json({ ok: true, alreadyPaid: true });

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
        if (committedAfterRace) return json({ ok: true, alreadyPaid: true });
        console.error("payment-webhook recovery state not recorded", JSON.stringify({
          paymentRef: paymentRef(paymentId),
          dbCode,
        }));
        return json({ error: "payment_recovery_not_recorded" }, 500);
      }
      console.warn("payment-webhook paid finalization deferred", JSON.stringify({
        paymentRef: paymentRef(paymentId),
        dbCode,
      }));
      return json({ error: "order_finalize_pending", retryable: true }, 500);
    }
    return json({ ok: true, alreadyPaid: Boolean(finalized.alreadyPaid) });
  } catch (error) {
    console.error("payment-webhook", error instanceof Error ? error.message : String(error));
    return json({ error: "server_error" }, 500);
  }
});
