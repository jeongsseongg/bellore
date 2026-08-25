import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import { hasRefundablePaymentStatus } from "../_shared/order-payment-states.ts";
import { cancelAndReconcile } from "../_shared/portone-cancellation.ts";
import {
  finalizePaidOrderFromProvider,
  lookupPortOnePayment,
  markPaymentReviewIfUnsettled,
  paymentRef,
  readMatchingConfirmedOrder,
  safeText,
} from "../_shared/payment-recovery.ts";
import {
  fairReconciliationBatch,
  paidRecoveryAction,
  providerStatusKind,
  providerTotalAmount,
  reconciliationSummaryOk,
  rotatingPendingWindowOffset,
  shouldExpirePendingOrder,
} from "../_shared/payment-recovery-policy.mjs";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_API_BASE = Deno.env.get("PORTONE_API_BASE") ?? "https://api.portone.io";
const PORTONE_STORE_ID = Deno.env.get("PORTONE_STORE_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RECONCILE_TOKEN = Deno.env.get("PAYMENT_RECONCILE_TOKEN") ?? "";
const POINT_EARN_BPS = Number(Deno.env.get("POINT_EARN_BPS") ?? "0");
const ALLOW_TEST_PAYMENTS = Deno.env.get("ALLOW_TEST_PAYMENTS") === "true";
const STALE_PENDING_AGE_MS = 60_000;
const MAX_ORDERS_PER_GROUP = 20;
const RECONCILE_CONCURRENCY = 5;

type SupabaseAdmin = ReturnType<typeof createClient>;
type OrderRow = {
  id: string;
  order_no: string;
  amount: unknown;
  status: string;
  payment_key: string | null;
  created_at: string;
};
type Counters = {
  scanned: number;
  confirmed: number;
  refunded: number;
  pending: number;
  failed: number;
  reviewRequired: number;
  errors: number;
};

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

function emptyCounters(): Counters {
  return {
    scanned: 0,
    confirmed: 0,
    refunded: 0,
    pending: 0,
    failed: 0,
    reviewRequired: 0,
    errors: 0,
  };
}

function addCounters(target: Counters, source: Counters): void {
  for (const key of Object.keys(target) as Array<keyof Counters>) {
    target[key] += source[key];
  }
}

function isExpiredPending(order: OrderRow): boolean {
  return shouldExpirePendingOrder(order.status, order.created_at, Date.now());
}

async function expirePendingOrder(
  admin: SupabaseAdmin,
  order: OrderRow,
  reason: string,
  counters: Counters,
): Promise<void> {
  const { data: marked, error: markError } = await admin.rpc("fail_unsettled_order", {
    p_order_no: order.order_no,
    p_reason: reason,
  });
  if (!markError && marked === true) counters.failed += 1;
  else counters.errors += 1;
}

function recordCancellation(
  counters: Counters,
  cancellation: {
    state: "succeeded" | "requested" | "failed";
    dbFinalized: boolean;
    tracked: boolean;
    providerRefunded: boolean;
  },
): void {
  if (!cancellation.tracked) {
    counters.errors += 1;
  } else if (cancellation.dbFinalized) {
    counters.refunded += 1;
  } else if (cancellation.state === "requested" || cancellation.providerRefunded) {
    counters.pending += 1;
  } else {
    counters.reviewRequired += 1;
  }
}

async function reconcileOrder(admin: SupabaseAdmin, order: OrderRow): Promise<Counters> {
  const counters = emptyCounters();
  counters.scanned = 1;
  const paymentId = safeText(order.payment_key, 160) ?? safeText(order.order_no, 160);
  if (!paymentId) {
    counters.errors += 1;
    return counters;
  }

  const lookup = await lookupPortOnePayment({
    apiBase: PORTONE_API_BASE,
    apiSecret: PORTONE_API_SECRET,
    storeId: PORTONE_STORE_ID,
    paymentId,
    allowTestPayments: ALLOW_TEST_PAYMENTS,
    timeoutMs: 5000,
    notFoundResult: "not_found",
  });
  if (lookup.result === "not_found" && order.status === "pending") {
    if (isExpiredPending(order)) {
      await expirePendingOrder(admin, order, "provider_payment_not_found_expired", counters);
    } else {
      counters.pending += 1;
    }
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
  if (statusKind === "paid") {
    const paidAmount = providerTotalAmount(payment);
    const action = paidRecoveryAction(
      order.status,
      paidAmount !== null && paidAmount === Number(order.amount),
    );
    if (action === "review_amount_mismatch") {
      const reviewRecorded = await markPaymentReviewIfUnsettled(
        admin,
        order.id,
        "provider_paid_amount_mismatch",
        true,
      );
      console.error("reconcile-payments amount mismatch requires review", JSON.stringify({
        paymentRef: paymentRef(paymentId),
        reviewRecorded,
      }));
      if (!reviewRecorded) counters.errors += 1;
      counters.reviewRequired += 1;
      return counters;
    }
    if (action === "continue_cancellation") {
      const cancellation = await cancelAndReconcile({
        admin,
        apiBase: PORTONE_API_BASE,
        apiSecret: PORTONE_API_SECRET,
        storeId: PORTONE_STORE_ID,
        paymentId,
        orderNo: order.order_no,
        orderAmount: Number(order.amount),
        reason: "scheduled_refund_pending_recovery",
      });
      recordCancellation(counters, cancellation);
      return counters;
    }
    if (action !== "finalize" || paidAmount === null) {
      counters.reviewRequired += 1;
      return counters;
    }

    const finalized = await finalizePaidOrderFromProvider({
      admin,
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

    const dbCode = finalized.errorCode ?? "invalid_result";
    const reviewRecorded = await markPaymentReviewIfUnsettled(
      admin,
      order.id,
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
    const { data: finalized, error: finalizeError } = await admin.rpc("finalize_order_refund_v2", {
      p_order_no: order.order_no,
      p_refund_amount: Number(order.amount),
      p_reason: "scheduled_cancel_reconciliation",
      p_provider_cancellation_id: null,
    });
    if (!finalizeError && finalized?.ok) {
      counters.refunded += 1;
      return counters;
    }
    const { data: marked, error: markError } = await admin.rpc("mark_order_refund_pending", {
      p_order_no: order.order_no,
      p_reason: "scheduled_cancel_finalize_retry",
    });
    if (!markError && marked === true) counters.pending += 1;
    else counters.errors += 1;
    return counters;
  }

  if (statusKind === "partial_cancelled") {
    const { data: marked, error: markError } = await admin.rpc("mark_order_payment_review", {
      p_order_no: order.order_no,
      p_reason: "partial_cancel_requires_manual_review",
    });
    if (markError || marked !== true) counters.errors += 1;
    counters.reviewRequired += 1;
    return counters;
  }

  if (statusKind === "failed") {
    const { data: marked, error: markError } = await admin.rpc("fail_unsettled_order", {
      p_order_no: order.order_no,
      p_reason: "provider_payment_failed",
    });
    if (!markError && marked === true) counters.failed += 1;
    else counters.errors += 1;
    return counters;
  }

  if (statusKind === "pending") {
    if (isExpiredPending(order)) {
      await expirePendingOrder(admin, order, "provider_payment_pending_expired", counters);
    } else {
      counters.pending += 1;
    }
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
  if (!PORTONE_API_SECRET || !PORTONE_STORE_ID || !SUPABASE_URL || !SERVICE_ROLE || !RECONCILE_TOKEN) {
    return json({ error: "server_not_configured" }, 503);
  }
  if (!Number.isInteger(POINT_EARN_BPS) || POINT_EARN_BPS < 0 || POINT_EARN_BPS > 10000) {
    return json({ error: "point_policy_invalid" }, 503);
  }
  if (!safeEqual(req.headers.get("x-reconcile-token") ?? "", RECONCILE_TOKEN)) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const nowMs = Date.now();
  const staleBefore = new Date(nowMs - STALE_PENDING_AGE_MS).toISOString();
  // 각 상태가 독립 quota를 갖게 한다. payment_review의 오래된 20건이
  // refund_pending을, 또는 추적 상태가 pending 복구를 가로막으면 안 된다.
  const [paymentReviewResult, refundPendingResult, pendingCountResult] = await Promise.all([
    admin
      .from("orders")
      .select("id,order_no,amount,status,payment_key,created_at")
      .eq("status", "payment_review")
      .order("created_at", { ascending: true })
      .limit(MAX_ORDERS_PER_GROUP),
    admin
      .from("orders")
      .select("id,order_no,amount,status,payment_key,created_at")
      .eq("status", "refund_pending")
      .order("created_at", { ascending: true })
      .limit(MAX_ORDERS_PER_GROUP),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("created_at", staleBefore),
  ]);
  if ([paymentReviewResult, refundPendingResult, pendingCountResult].some((result) => result.error) ||
    pendingCountResult.count === null) {
    return json({ error: "orders_lookup_failed" }, 500);
  }
  const pendingOffset = rotatingPendingWindowOffset(
    pendingCountResult.count,
    MAX_ORDERS_PER_GROUP,
    nowMs,
  );
  // READY/404는 행을 갱신하지 않으므로 5분마다 안정 정렬된 다음 window를 조회한다.
  const pendingResult = await admin
    .from("orders")
    .select("id,order_no,amount,status,payment_key,created_at")
    .eq("status", "pending")
    .lt("created_at", staleBefore)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(pendingOffset, pendingOffset + MAX_ORDERS_PER_GROUP - 1);
  if (pendingResult.error) return json({ error: "orders_lookup_failed" }, 500);

  // 별도 query 사이에 상태가 바뀌어 중복 관측되면 취소 의도가 결제확정보다 우선한다.
  const groupResults = [refundPendingResult, paymentReviewResult, pendingResult];
  const orders = fairReconciliationBatch(
    groupResults.map((result) => result.data ?? []),
    MAX_ORDERS_PER_GROUP,
  ) as OrderRow[];
  const summary = emptyCounters();
  for (let index = 0; index < orders.length; index += RECONCILE_CONCURRENCY) {
    const batch = orders.slice(index, index + RECONCILE_CONCURRENCY);
    const results = await Promise.all(batch.map((order) => reconcileOrder(admin, order)));
    for (const result of results) addCounters(summary, result);
  }

  return json({
    ok: reconciliationSummaryOk(summary),
    ...summary,
  });
});
