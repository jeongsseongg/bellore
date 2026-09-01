import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import type { PaymentOperationControl } from "./payment-operation-guard.ts";
import { finalizeKnownProviderCancellation } from "./portone-cancellation.ts";
import { markPaymentReviewIfUnsettled } from "./payment-recovery.ts";
import { pendingCheckoutAbandonmentAction, providerCancelledAmount, providerPaidAmount } from
  "./payment-recovery-policy.mjs";

type ProviderPayment = Record<string, unknown>;
export type UnsettledCancellationOutcome = "canceled" | "refunded" | "review" | "pending";
export type AbandonedPendingOutcome = "not_applicable" | "closed" | "pending";

export async function cancelUnsettledCheckout(
  admin: SupabaseClient,
  orderNo: string,
  reason: string,
): Promise<boolean> {
  const result = await admin.rpc("cancel_unsettled_checkout_v1", {
    p_order_no: orderNo,
    p_reason: reason,
  });
  return !result.error && result.data === true;
}

export async function closeAbandonedPendingCheckout(input: {
  admin: SupabaseClient;
  orderNo: string;
  providerStatus: unknown;
  checkoutAbandoned: boolean;
}): Promise<AbandonedPendingOutcome> {
  if (pendingCheckoutAbandonmentAction(
    input.providerStatus, input.checkoutAbandoned,
  ) !== "close_unsettled") return "not_applicable";
  const result = await input.admin.rpc("fail_unsettled_order", {
    p_order_no: input.orderNo,
    p_reason: "provider_unpaid_pending_after_checkout_abandonment",
  });
  return !result.error && result.data === true ? "closed" : "pending";
}

export async function reconcileProviderCancelledCheckout(input: {
  admin: SupabaseClient;
  operationControl: PaymentOperationControl;
  orderNo: string;
  orderStatus: string;
  expectedOrderAmount: number;
  payment: ProviderPayment;
}): Promise<UnsettledCancellationOutcome> {
  const cancelledAmount = providerCancelledAmount(input.payment);
  const paidAmount = providerPaidAmount(input.payment);

  if (cancelledAmount === null) {
    if ((input.orderStatus === "pending" || input.orderStatus === "payment_review") &&
        paidAmount === null) {
      return await cancelUnsettledCheckout(
        input.admin, input.orderNo, "provider_payment_canceled",
      ) ? "canceled" : "pending";
    }
    const marked = await markPaymentReviewIfUnsettled(
      input.admin, input.orderNo, "provider_cancelled_amount_missing",
    );
    return marked ? "review" : "pending";
  }

  const reconciliation = await finalizeKnownProviderCancellation({
    admin: input.admin,
    operationControl: input.operationControl,
    orderNo: input.orderNo,
    refundAmount: cancelledAmount,
    expectedOrderAmount: input.expectedOrderAmount,
    reason: "provider_cancel_reconciliation",
  });
  if (!reconciliation.tracked) return "pending";
  return reconciliation.dbFinalized ? "refunded" : "review";
}
