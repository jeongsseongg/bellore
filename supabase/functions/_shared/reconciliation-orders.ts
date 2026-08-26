import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import {
  fairReconciliationBatch,
  rotatingReconciliationWindowOffset,
} from "./payment-recovery-policy.mjs";

export type ReconciliationOrderRow = {
  id: string;
  order_no: string;
  amount: unknown;
  status: string;
  payment_key: string | null;
  paid_at: string | null;
  payment_terminal_at: string | null;
  created_at: string;
};

export const RECENT_TERMINAL_RECONCILIATION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const RECONCILIATION_GROUP_COUNT = 5;
export const MAX_ORDERS_PER_RECONCILIATION_GROUP = 1;
export const RECONCILIATION_CONCURRENCY = 5;
export const PROVIDER_CANCELLATION_MAX_MS = 120_000;
export const SUPABASE_REQUEST_IDLE_TIMEOUT_MS = 150_000;

export function reconciliationExecutionBudget() {
  const maxOrders = RECONCILIATION_GROUP_COUNT * MAX_ORDERS_PER_RECONCILIATION_GROUP;
  const waves = Math.ceil(maxOrders / RECONCILIATION_CONCURRENCY);
  const providerWorstCaseMs = waves * PROVIDER_CANCELLATION_MAX_MS;
  return {
    maxOrders,
    waves,
    providerWorstCaseMs,
    withinIdleTimeout: providerWorstCaseMs < SUPABASE_REQUEST_IDLE_TIMEOUT_MS,
  };
}

export const CONFIRMED_RECONCILIATION_STATUSES = [
  "paid", "inspecting", "preparing", "shipping", "shipped", "delivered",
  "confirmed", "cancel_req", "cancel_requested", "return_req", "exchange_req",
  "returning", "done",
] as const;

export async function loadReconciliationOrders(input: {
  admin: SupabaseClient;
  staleBefore: string;
  nowMs: number;
  limit: number;
}): Promise<{ orders: ReconciliationOrderRow[] | null }> {
  const { admin, staleBefore, nowMs, limit } = input;
  const recentTerminalAfter = new Date(
    nowMs - RECENT_TERMINAL_RECONCILIATION_AGE_MS,
  ).toISOString();
  // Each status has its own rotating window so a busy group cannot starve the
  // others. Contract v2 excludes every legacy order from automated recovery.
  const [paymentReviewCountResult, refundPendingCountResult, pendingCountResult,
    recentTerminalCountResult, confirmedCountResult] = await Promise.all([
    admin.from("payment_reconciliation_orders_edge_v1").select("id", { count: "exact", head: true })
      .eq("payment_contract_version", 2).eq("status", "payment_review"),
    admin.from("payment_reconciliation_orders_edge_v1").select("id", { count: "exact", head: true })
      .eq("payment_contract_version", 2).eq("status", "refund_pending"),
    admin.from("payment_reconciliation_orders_edge_v1").select("id", { count: "exact", head: true })
      .eq("payment_contract_version", 2).eq("status", "pending").lt("created_at", staleBefore),
    admin.from("payment_reconciliation_orders_edge_v1").select("id", { count: "exact", head: true })
      .eq("payment_contract_version", 2).in("status", ["failed", "canceled"])
      .gte("payment_terminal_at", recentTerminalAfter),
    admin.from("payment_reconciliation_orders_edge_v1").select("id", { count: "exact", head: true })
      .eq("payment_contract_version", 2).in("status", CONFIRMED_RECONCILIATION_STATUSES),
  ]);
  const countResults = [
    paymentReviewCountResult, refundPendingCountResult, pendingCountResult,
    recentTerminalCountResult, confirmedCountResult,
  ];
  if (countResults.some((result) => result.error || result.count === null)) return { orders: null };
  const [paymentReviewOffset, refundPendingOffset, pendingOffset, recentTerminalOffset,
    confirmedOffset] =
    countResults.map((result) => rotatingReconciliationWindowOffset(result.count, limit, nowMs));

  const selection = "id,order_no,amount,status,payment_key,paid_at,payment_terminal_at,created_at";
  const [paymentReviewResult, refundPendingResult, pendingResult, recentTerminalResult,
    confirmedResult] = await Promise.all([
    admin.from("payment_reconciliation_orders_edge_v1").select(selection).eq("payment_contract_version", 2)
      .eq("status", "payment_review").order("created_at", { ascending: true })
      .order("id", { ascending: true }).range(paymentReviewOffset, paymentReviewOffset + limit - 1),
    admin.from("payment_reconciliation_orders_edge_v1").select(selection).eq("payment_contract_version", 2)
      .eq("status", "refund_pending").order("created_at", { ascending: true })
      .order("id", { ascending: true }).range(refundPendingOffset, refundPendingOffset + limit - 1),
    admin.from("payment_reconciliation_orders_edge_v1").select(selection).eq("payment_contract_version", 2)
      .eq("status", "pending").lt("created_at", staleBefore)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(pendingOffset, pendingOffset + limit - 1),
    admin.from("payment_reconciliation_orders_edge_v1").select(selection).eq("payment_contract_version", 2)
      .in("status", ["failed", "canceled"]).gte("payment_terminal_at", recentTerminalAfter)
      .order("payment_terminal_at", { ascending: true }).order("id", { ascending: true })
      .range(recentTerminalOffset, recentTerminalOffset + limit - 1),
    admin.from("payment_reconciliation_orders_edge_v1").select(selection).eq("payment_contract_version", 2)
      .in("status", CONFIRMED_RECONCILIATION_STATUSES)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(confirmedOffset, confirmedOffset + limit - 1),
  ]);
  if ([paymentReviewResult, refundPendingResult, pendingResult, recentTerminalResult, confirmedResult]
    .some((result) => result.error)) {
    return { orders: null };
  }
  // If snapshots overlap during a transition, refund intent or a terminal
  // local state wins over an older pending snapshot.
  const groupResults = [
    refundPendingResult, recentTerminalResult, confirmedResult, paymentReviewResult, pendingResult,
  ];
  const orders = fairReconciliationBatch(
    groupResults.map((result) => result.data ?? []),
    limit,
  ) as ReconciliationOrderRow[];
  return { orders };
}
