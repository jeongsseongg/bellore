import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import { hasConfirmedPaymentStatus, hasRefundablePaymentStatus } from "../_shared/order-payment-states.ts";
import { guardPaymentOperation, readPaymentOperationControl } from "../_shared/payment-operation-guard.ts";
import { safeEqual } from "../_shared/payment-edge-utils.ts";
import { cancelAndReconcile } from "../_shared/portone-cancellation.ts";
import { finalizePaidOrderFromProvider, lookupPortOnePayment, markPaymentReviewIfUnsettled,
  paymentRef, readMatchingConfirmedOrder, safeText } from "../_shared/payment-recovery.ts";
import { confirmedPaymentReconciliationAction, paidFinalizationRecoveryAction, paidRecoveryAction,
  providerPaidAmount, providerStatusKind, reconciliationSummaryOk,
  shouldEscalatePendingOrder, shouldReleaseNotFoundOrder } from "../_shared/payment-recovery-policy.mjs";
import { loadReconciliationOrders, MAX_ORDERS_PER_RECONCILIATION_GROUP, RECONCILIATION_CONCURRENCY,
  type ReconciliationOrderRow as OrderRow } from "../_shared/reconciliation-orders.ts";
import { addReconciliationCounters, emptyReconciliationCounters, markNonActionablePaymentReview,
  preserveRefundPendingForReview, recordCancellationOutcome,
  type ReconciliationCounters as Counters } from "../_shared/reconciliation-outcomes.ts";
import { cancelUnsettledCheckout, reconcileProviderCancelledCheckout } from
  "../_shared/unsettled-checkout-cancellation.ts";
const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_API_BASE = Deno.env.get("PORTONE_API_BASE") ?? "https://api.portone.io";
const PORTONE_STORE_ID = Deno.env.get("PORTONE_STORE_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RECONCILE_TOKEN = Deno.env.get("PAYMENT_RECONCILE_TOKEN") ?? "";
const RECONCILE_ENABLED = Deno.env.get("PAYMENT_RECONCILE_ENABLED") === "true";
const POINT_EARN_BPS = Number(Deno.env.get("POINT_EARN_BPS") ?? "0");
const ALLOW_TEST_PAYMENTS = Deno.env.get("ALLOW_TEST_PAYMENTS") === "true";
const STALE_PENDING_AGE_MS = 60_000;
const PROVIDER_INTEGRITY_ERRORS = new Set([
  "provider_payment_id_missing", "provider_payment_id_mismatch", "provider_store_mismatch",
  "provider_currency_mismatch", "provider_channel_not_live", "provider_response_invalid",
]);
const createAdminClient = () => createClient(SUPABASE_URL, SERVICE_ROLE,
  { auth: { persistSession: false, autoRefreshToken: false } });
type SupabaseAdmin = ReturnType<typeof createAdminClient>;
class PaymentOperationGuardUnavailable extends Error {}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}
function secretByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
function shouldReviewPending(order: OrderRow): boolean {
  return shouldEscalatePendingOrder(order.status, order.created_at, Date.now());
}

async function escalatePendingOrder(
  admin: SupabaseAdmin,
  order: OrderRow,
  reason: string,
  counters: Counters,
): Promise<void> {
  const marked = await markPaymentReviewIfUnsettled(admin, order.order_no, reason);
  if (marked) counters.reviewRequired += 1;
  else counters.errors += 1;
}

async function reconcileOrder(admin: SupabaseAdmin, order: OrderRow): Promise<Counters> {
  const counters = emptyReconciliationCounters();
  counters.scanned = 1;
  const locallyClosed = order.status === "failed" || order.status === "canceled";
  const locallyConfirmed = hasConfirmedPaymentStatus(order.status);
  const paymentId = safeText(order.payment_key, 160) ?? safeText(order.order_no, 160);
  if (!paymentId) {
    counters.errors += 1;
    return counters;
  }

  const lookup = await lookupPortOnePayment({
    operationAdmin: admin,
    operationControl: "reconcile_payments",
    operationOrderNo: order.order_no,
    apiBase: PORTONE_API_BASE,
    apiSecret: PORTONE_API_SECRET,
    storeId: PORTONE_STORE_ID,
    paymentId,
    allowTestPayments: ALLOW_TEST_PAYMENTS,
    timeoutMs: 5000,
    notFoundResult: "not_found",
  });
  if (lookup.error === "payment_operation_held") {
    return counters;
  }
  if (lookup.error === "payment_operations_temporarily_unavailable" ||
    lookup.error === "payment_operation_guard_unavailable") {
    throw new PaymentOperationGuardUnavailable();
  }
  if (lookup.result === "not_found" && order.status === "pending") {
    if (shouldReleaseNotFoundOrder(order.status, order.created_at, Date.now())) {
      const canceled = await cancelUnsettledCheckout(
        admin, order.order_no, "provider_payment_not_found_after_grace",
      );
      if (canceled) counters.failed += 1;
      else counters.errors += 1;
    } else {
      counters.pending += 1;
    }
    return counters;
  }
  if (lookup.result === "not_found" && locallyConfirmed) {
    await markNonActionablePaymentReview(
      admin, order.order_no, "confirmed_payment_missing_at_provider", counters,
    );
    return counters;
  }
  if (lookup.result === "not_found" && locallyClosed) return counters;
  if (locallyConfirmed && lookup.error && PROVIDER_INTEGRITY_ERRORS.has(lookup.error)) {
    await markNonActionablePaymentReview(
      admin, order.order_no, `confirmed_payment_provider_integrity:${lookup.error}`, counters,
    );
    return counters;
  }
  if (!lookup.payment || lookup.result !== "found") {
    console.warn("reconcile-payments provider lookup failed", JSON.stringify({
      paymentRef: paymentRef(paymentId),
      result: lookup.result,
    }));
    counters.errors += 1;
    return counters;
  }
  const payment = lookup.payment;

  const statusKind = providerStatusKind(payment.status);
  const confirmedAction = confirmedPaymentReconciliationAction({
    locallyConfirmed,
    providerStatus: payment.status,
    paidAmount: providerPaidAmount(payment),
    expectedAmount: order.amount,
    storedPaymentKey: order.payment_key,
    lookupPaymentId: paymentId,
    paidAt: order.paid_at,
  });
  if (confirmedAction === "healthy") {
    const { data: cleared, error: clearError } = await admin.rpc(
      "clear_confirmed_payment_review_v1",
      { p_order_no: order.order_no, p_payment_key: paymentId, p_amount: Number(order.amount) },
    );
    if (clearError || cleared !== true) counters.errors += 1;
    return counters;
  }
  if (confirmedAction === "review") {
    await markNonActionablePaymentReview(
      admin, order.order_no, `confirmed_payment_provider_contradiction:${statusKind}`, counters,
    );
    return counters;
  }
  // CANCELLED can carry a refund amount that still needs DB finalization.
  if (locallyClosed && statusKind === "failed") return counters;
  if (statusKind === "paid") {
    const paidAmount = providerPaidAmount(payment);
    const action = paidRecoveryAction(
      order.status,
      paidAmount !== null && paidAmount === Number(order.amount),
      paidAmount !== null,
    );
    if (action === "review_amount_missing") {
      if (locallyClosed) {
        await preserveRefundPendingForReview(
          admin, order.order_no, "late_payment_provider_paid_amount_missing", counters,
        );
        return counters;
      }
      const reviewRecorded = await markPaymentReviewIfUnsettled(admin, order.order_no, "provider_paid_amount_missing");
      console.error("reconcile-payments paid amount missing", JSON.stringify({
        paymentRef: paymentRef(paymentId),
        reviewRecorded,
      }));
      if (!reviewRecorded) counters.errors += 1;
      counters.reviewRequired += 1;
      return counters;
    }
    if (action === "continue_cancellation") {
      if (paidAmount === null) {
        await preserveRefundPendingForReview(admin, order.order_no, "refund_pending_provider_paid_amount_missing", counters);
        return counters;
      }
      const cancellation = await cancelAndReconcile({
        admin,
        operationControl: "reconcile_payments",
        apiBase: PORTONE_API_BASE,
        apiSecret: PORTONE_API_SECRET,
        storeId: PORTONE_STORE_ID,
        paymentId,
        orderNo: order.order_no,
        refundAmount: paidAmount,
        intentCode: "refund_pending_recovery",
        reason: "scheduled_refund_pending_recovery",
      });
      recordCancellationOutcome(counters, cancellation);
      return counters;
    }
    if (action === "cancel_amount_mismatch" || action === "cancel_late_payment") {
      if (paidAmount === null) {
        counters.reviewRequired += 1;
        counters.errors += 1;
        return counters;
      }
      const cancellation = await cancelAndReconcile({
        admin,
        operationControl: "reconcile_payments",
        apiBase: PORTONE_API_BASE,
        apiSecret: PORTONE_API_SECRET,
        storeId: PORTONE_STORE_ID,
        paymentId,
        orderNo: order.order_no,
        refundAmount: paidAmount,
        intentCode: action === "cancel_amount_mismatch"
          ? "amount_mismatch_auto_cancel"
          : "paid_finalization_conflict_auto_cancel",
        reason: action === "cancel_amount_mismatch"
          ? "scheduled_amount_mismatch_auto_cancel"
          : "scheduled_late_payment_auto_cancel",
      });
      recordCancellationOutcome(counters, cancellation);
      return counters;
    }
    if (action !== "finalize" || paidAmount === null) {
      counters.reviewRequired += 1;
      return counters;
    }

    const finalized = await finalizePaidOrderFromProvider({
      admin,
      operationControl: "reconcile_payments",
      orderNo: order.order_no,
      paymentId,
      paidAmount,
      payment,
      attribution: null,
      pointEarnBps: POINT_EARN_BPS,
    });
    if (finalized.order) {
      counters.confirmed += 1;
      return counters;
    }
    if (await readMatchingConfirmedOrder(admin, order.order_no, paymentId, paidAmount)) {
      counters.confirmed += 1;
      return counters;
    }

    if (paidFinalizationRecoveryAction(finalized.failureKind) === "cancel_conflict") {
      const cancellation = await cancelAndReconcile({
        admin,
        operationControl: "reconcile_payments",
        apiBase: PORTONE_API_BASE,
        apiSecret: PORTONE_API_SECRET,
        storeId: PORTONE_STORE_ID,
        paymentId,
        orderNo: order.order_no,
        refundAmount: paidAmount,
        intentCode: "paid_finalization_conflict_auto_cancel",
        reason: `scheduled_paid_finalization_${finalized.failureKind}_auto_cancel`,
      });
      recordCancellationOutcome(counters, cancellation);
      return counters;
    }

    const dbCode = finalized.errorCode ?? "invalid_result";
    const reviewRecorded = await markPaymentReviewIfUnsettled(
      admin,
      order.order_no,
      `provider_paid_finalize_retry:${dbCode}`,
    );
    if (!reviewRecorded &&
      await readMatchingConfirmedOrder(admin, order.order_no, paymentId, paidAmount)) {
      counters.confirmed += 1;
      return counters;
    }
    console.warn("reconcile-payments paid finalization deferred", JSON.stringify({
      paymentRef: paymentRef(paymentId),
      dbCode,
      reviewRecorded,
    }));
    counters.reviewRequired += 1;
    counters.errors += 1;
    return counters;
  }

  if (statusKind === "cancelled" && hasRefundablePaymentStatus(order.status)) {
    const outcome = await reconcileProviderCancelledCheckout({
      admin, operationControl: "reconcile_payments", orderNo: order.order_no,
      orderStatus: order.status, expectedOrderAmount: Number(order.amount), payment,
    });
    if (outcome === "canceled") counters.failed += 1;
    else if (outcome === "refunded") counters.refunded += 1;
    else if (outcome === "review") counters.reviewRequired += 1;
    else counters.errors += 1;
    return counters;
  }

  if (statusKind === "partial_cancelled") {
    if (order.status === "refund_pending" || locallyClosed) {
      await preserveRefundPendingForReview(admin, order.order_no, "refund_pending_partial_cancel_requires_manual_review", counters);
      return counters;
    }
    const { data: marked, error: markError } = await admin.rpc("mark_order_payment_review", {
      p_order_no: order.order_no,
      p_reason: "partial_cancel_requires_manual_review",
    });
    if (markError || marked !== true) counters.errors += 1;
    counters.reviewRequired += 1;
    return counters;
  }

  if (statusKind === "failed") {
    if (order.status === "refund_pending") {
      await preserveRefundPendingForReview(admin, order.order_no, "refund_pending_provider_payment_failed", counters);
      return counters;
    }
    const { data: marked, error: markError } = await admin.rpc("fail_unsettled_order", {
      p_order_no: order.order_no,
      p_reason: "provider_payment_failed",
    });
    if (!markError && marked === true) counters.failed += 1;
    else counters.errors += 1;
    return counters;
  }

  if (statusKind === "pending") {
    if (shouldReviewPending(order)) {
      await escalatePendingOrder(admin, order, "provider_payment_pending_review", counters);
    } else {
      counters.pending += 1;
    }
    return counters;
  }

  if (order.status === "refund_pending" || locallyClosed) {
    await preserveRefundPendingForReview(admin, order.order_no,
      `refund_pending_unknown_provider_status:${safeText(payment.status, 80) ?? "missing"}`, counters);
    return counters;
  }
  const { data: marked, error: markError } = await admin.rpc("mark_order_payment_review", {
    p_order_no: order.order_no,
    p_reason: `unknown_provider_status:${safeText(payment.status, 80) ?? "missing"}`,
  });
  if (markError || marked !== true) counters.errors += 1;
  counters.reviewRequired += 1;
  return counters;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!RECONCILE_ENABLED) return json({ error: "payment_operations_temporarily_unavailable" }, 503);
  if (!PORTONE_API_SECRET || !PORTONE_STORE_ID || !SUPABASE_URL || !SERVICE_ROLE ||
    secretByteLength(RECONCILE_TOKEN) < 32) {
    return json({ error: "server_not_configured" }, 503);
  }
  if (!Number.isInteger(POINT_EARN_BPS) || POINT_EARN_BPS < 0 || POINT_EARN_BPS > 10000) {
    return json({ error: "point_policy_invalid" }, 503);
  }
  const admin = createAdminClient();
  const reconcileGate = await readPaymentOperationControl(admin, "reconcile_payments");
  if (!reconcileGate.ok || !reconcileGate.enabled)
    return json({ error: "payment_operations_temporarily_unavailable" }, 503);
  if (!safeEqual(req.headers.get("x-reconcile-token") ?? "", RECONCILE_TOKEN))
    return json({ error: "unauthorized" }, 401);

  try {
    const nowMs = Date.now();
    const staleBefore = new Date(nowMs - STALE_PENDING_AGE_MS).toISOString();
    const loaded = await loadReconciliationOrders(
      { admin, staleBefore, nowMs, limit: MAX_ORDERS_PER_RECONCILIATION_GROUP });
    if (!loaded.orders) return json({ error: "orders_lookup_failed" }, 500);

    // Resolve every candidate hold before starting any provider work. A single
    // guard failure aborts the whole batch, while held candidates are skipped.
    const guarded = await Promise.all(loaded.orders.map(async (order) => ({
      order,
      operation: await guardPaymentOperation(
        { admin, control: "reconcile_payments", orderNo: order.order_no }),
    })));
    if (guarded.some(({ operation }) =>
      !operation.allowed && operation.reason !== "operation_held")) {
      return json({ error: "payment_operations_temporarily_unavailable" }, 503);
    }
    const orders = guarded.filter(({ operation }) => operation.allowed).map(({ order }) => order);
    const heldSkipped = guarded.length - orders.length;
    const summary = emptyReconciliationCounters();
    for (let index = 0; index < orders.length; index += RECONCILIATION_CONCURRENCY) {
      const batch = orders.slice(index, index + RECONCILIATION_CONCURRENCY);
      const results = await Promise.all(batch.map((order) => reconcileOrder(admin, order)));
      for (const result of results) addReconciliationCounters(summary, result);
    }

    return json({ ok: reconciliationSummaryOk(summary), heldSkipped, ...summary });
  } catch (error) {
    if (error instanceof PaymentOperationGuardUnavailable)
      return json({ error: "payment_operations_temporarily_unavailable" }, 503);
    console.error("reconcile-payments", error instanceof Error ? error.name : "unknown");
    return json({ error: "reconciliation_failed" }, 500);
  }
});
