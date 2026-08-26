import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import type { CancellationReconciliation } from "./portone-cancellation.ts";

export type ReconciliationCounters = {
  scanned: number;
  confirmed: number;
  refunded: number;
  pending: number;
  failed: number;
  reviewRequired: number;
  errors: number;
};

export function emptyReconciliationCounters(): ReconciliationCounters {
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

export function addReconciliationCounters(
  target: ReconciliationCounters,
  source: ReconciliationCounters,
): void {
  for (const key of Object.keys(target) as Array<keyof ReconciliationCounters>) {
    target[key] += source[key];
  }
}

export function recordCancellationOutcome(
  counters: ReconciliationCounters,
  cancellation: CancellationReconciliation,
): void {
  if (!cancellation.tracked) counters.errors += 1;
  else if (cancellation.dbFinalized) counters.refunded += 1;
  else if (cancellation.state === "requested" || cancellation.providerRefunded) counters.pending += 1;
  else counters.reviewRequired += 1;
}

export async function preserveRefundPendingForReview(
  admin: SupabaseClient,
  orderNo: string,
  reason: string,
  counters: ReconciliationCounters,
): Promise<void> {
  const { data: marked, error: markError } = await admin.rpc("mark_order_refund_pending", {
    p_order_no: orderNo,
    p_reason: reason,
  });
  if (markError || marked !== true) counters.errors += 1;
  counters.reviewRequired += 1;
}

export async function markNonActionablePaymentReview(
  admin: SupabaseClient,
  orderNo: string,
  reason: string,
  counters: ReconciliationCounters,
): Promise<void> {
  const { data: marked, error: markError } = await admin.rpc("mark_order_payment_review", {
    p_order_no: orderNo,
    p_reason: reason,
  });
  if (markError || marked !== true) counters.errors += 1;
  counters.reviewRequired += 1;
}
