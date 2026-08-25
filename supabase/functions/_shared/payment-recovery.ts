import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import { hasConfirmedPaymentStatus } from "./order-payment-states.ts";
import { providerStatusKind } from "./payment-recovery-policy.mjs";

export type JsonRecord = Record<string, unknown>;

export type ProviderLookup = {
  payment: JsonRecord | null;
  result: "found" | "not_found" | "pending" | "error";
  error: string | null;
  errorStatus: number;
};

export type FinalizePaidResult = {
  order: JsonRecord | null;
  alreadyPaid: boolean;
  earnedPoints: number;
  method: string | null;
  transactionId: string | null;
  receiptUrl: string | null;
  errorCode: string | null;
};

export function safeText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

export function paymentRef(paymentId: string): string {
  return paymentId.slice(-8);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readJson(response: Response): Promise<JsonRecord | null> {
  try {
    const value = await response.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as JsonRecord
      : null;
  } catch {
    return null;
  }
}

function providerIdentityError(input: {
  payment: JsonRecord;
  paymentId: string;
  storeId: string;
  allowTestPayments: boolean;
}): string | null {
  const providerPaymentId = safeText(input.payment.id ?? input.payment.paymentId, 160);
  if (!providerPaymentId) return "provider_payment_id_missing";
  if (providerPaymentId !== input.paymentId) {
    return "provider_payment_id_mismatch";
  }
  if (input.payment.storeId !== input.storeId) return "provider_store_mismatch";
  if (input.payment.currency !== "KRW") return "provider_currency_mismatch";
  const channel = input.payment.channel && typeof input.payment.channel === "object"
    ? input.payment.channel as JsonRecord
    : null;
  const channelType = safeText(channel?.type, 20);
  if ((!input.allowTestPayments && channelType !== "LIVE") ||
    (!channelType && !input.allowTestPayments)) {
    return "provider_channel_not_live";
  }
  return null;
}

export async function lookupPortOnePayment(input: {
  apiBase: string;
  apiSecret: string;
  storeId: string;
  paymentId: string;
  allowTestPayments: boolean;
  timeoutMs: number;
  retryDelaysMs?: readonly number[];
  retryPendingStatus?: boolean;
  notFoundResult?: "not_found" | "pending" | "error";
}): Promise<ProviderLookup> {
  const retryDelays = input.retryDelaysMs ?? [];
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(
        `${input.apiBase}/payments/${encodeURIComponent(input.paymentId)}`,
        {
          headers: { Authorization: `PortOne ${input.apiSecret}` },
          signal: AbortSignal.timeout(input.timeoutMs),
        },
      );
    } catch {
      if (attempt < retryDelays.length) {
        await wait(retryDelays[attempt]);
        continue;
      }
      return { payment: null, result: "error", error: "provider_lookup_failed", errorStatus: 502 };
    }

    if (response.status === 404) {
      if (attempt < retryDelays.length) {
        await wait(retryDelays[attempt]);
        continue;
      }
      const notFoundResult = input.notFoundResult ?? "error";
      if (notFoundResult === "pending") {
        return {
          payment: null,
          result: "pending",
          error: "payment_confirmation_pending",
          errorStatus: 202,
        };
      }
      return {
        payment: null,
        result: notFoundResult,
        error: notFoundResult === "not_found" ? null : "provider_lookup_failed",
        errorStatus: notFoundResult === "not_found" ? 404 : 502,
      };
    }

    const retriable = response.status === 429 || response.status >= 500;
    if (retriable && attempt < retryDelays.length) {
      await wait(retryDelays[attempt]);
      continue;
    }
    if (!response.ok) {
      return { payment: null, result: "error", error: "provider_lookup_failed", errorStatus: 502 };
    }

    const payment = await readJson(response);
    if (!payment) {
      return { payment: null, result: "error", error: "provider_response_invalid", errorStatus: 502 };
    }
    const identityError = providerIdentityError({ ...input, payment });
    if (identityError) {
      return { payment: null, result: "error", error: identityError, errorStatus: 409 };
    }
    if (input.retryPendingStatus && providerStatusKind(payment.status) === "pending" &&
      attempt < retryDelays.length) {
      await wait(retryDelays[attempt]);
      continue;
    }
    return { payment, result: "found", error: null, errorStatus: 200 };
  }
  return { payment: null, result: "error", error: "provider_lookup_failed", errorStatus: 502 };
}

export async function readMatchingConfirmedOrder(
  admin: SupabaseClient,
  orderNo: string,
  paymentId: string,
  paidAmount: number,
): Promise<JsonRecord | null> {
  const { data, error } = await admin
    .from("orders")
    .select("id,order_no,listing_id,amount,status,payment_key,paid_at,receipt_url")
    .eq("order_no", orderNo)
    .single();
  if (error || !data) return null;
  return hasConfirmedPaymentStatus(data.status) &&
      data.payment_key === paymentId &&
      Number(data.amount) === paidAmount
    ? data as JsonRecord
    : null;
}

export async function markPaymentReviewIfUnsettled(
  admin: SupabaseClient,
  orderId: string,
  reason: string,
): Promise<boolean> {
  const statuses = ["pending", "failed", "canceled", "payment_review"];
  const { data, error } = await admin
    .from("orders")
    .update({ status: "payment_review", admin_memo: reason.slice(0, 1000) })
    .eq("id", orderId)
    .in("status", statuses)
    .select("id");
  return !error && Array.isArray(data) && data.length === 1;
}

export async function finalizePaidOrderFromProvider(input: {
  admin: SupabaseClient;
  orderNo: string;
  paymentId: string;
  paidAmount: number;
  payment: JsonRecord;
  attribution: JsonRecord | null;
  pointEarnBps: number;
}): Promise<FinalizePaidResult> {
  const method = input.payment.method && typeof input.payment.method === "object"
    ? safeText(
      (input.payment.method as JsonRecord).type ?? (input.payment.method as JsonRecord).provider,
      80,
    )
    : null;
  const transactionId = safeText(input.payment.transactionId, 160);
  const receiptUrl = safeText(input.payment.receiptUrl, 500);
  const { data, error } = await input.admin.rpc("finalize_paid_order_v2", {
    p_order_no: input.orderNo,
    p_paid_amount: input.paidAmount,
    p_method: method,
    p_payment_key: input.paymentId,
    p_provider_transaction_id: transactionId,
    p_receipt_url: receiptUrl,
    p_attribution: input.attribution,
    p_point_earn_bps: input.pointEarnBps,
  });
  const payload = data && typeof data === "object" && !Array.isArray(data)
    ? data as JsonRecord
    : null;
  const order = payload?.order && typeof payload.order === "object" && !Array.isArray(payload.order)
    ? payload.order as JsonRecord
    : null;
  return {
    order,
    alreadyPaid: Boolean(payload?.alreadyPaid),
    earnedPoints: Number(payload?.earnedPoints) || 0,
    method,
    transactionId,
    receiptUrl,
    errorCode: error ? safeText(error.code, 80) ?? "database_error" : order ? null : "invalid_result",
  };
}
