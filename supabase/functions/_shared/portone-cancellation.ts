type JsonRecord = Record<string, unknown>;
const PROVIDER_CANCELLATION_REASON = "벨로르 결제 취소";

type RpcError = { message?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
};

export type ProviderCancellation = {
  state: "succeeded" | "requested" | "failed";
  cancellationId: string | null;
  cancelledAmount: number | null;
  recovered: boolean;
};

export type CancellationReconciliation = ProviderCancellation & {
  dbFinalized: boolean;
  tracked: boolean;
  providerRefunded: boolean;
};

function safeText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function positiveInteger(value: unknown): number | null {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function providerCancelledAmount(payment: JsonRecord | null): number | null {
  const amount = payment?.amount && typeof payment.amount === "object" && !Array.isArray(payment.amount)
    ? payment.amount as JsonRecord
    : null;
  return positiveInteger(amount?.cancelled);
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

export async function cancelPortOnePayment(input: {
  apiBase: string;
  apiSecret: string;
  storeId: string;
  paymentId: string;
  refundAmount: number;
  reason: string;
}): Promise<ProviderCancellation> {
  const endpoint = `${input.apiBase}/payments/${encodeURIComponent(input.paymentId)}`;
  const idempotencyKeyRaw = `bellore-cancel-${input.paymentId}`.slice(0, 254);
  const idempotencyKey = `\"${idempotencyKeyRaw}\"`;
  let response: Response | null = null;
  try {
    response = await fetch(`${endpoint}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `PortOne ${input.apiSecret}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        storeId: input.storeId,
        reason: PROVIDER_CANCELLATION_REASON,
        amount: input.refundAmount,
        currentCancellableAmount: input.refundAmount,
      }),
      // PortOne documents that PG cancellation can take longer than ordinary
      // API calls. Keep the request alive for the recommended minimum window.
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    // The provider may have accepted the idempotent cancellation even when
    // our connection ended. The authoritative payment lookup below decides.
  }
  const payload = response ? await readJson(response) : null;
  const cancellation = payload?.cancellation && typeof payload.cancellation === "object"
    ? payload.cancellation as JsonRecord
    : null;
  const cancellationId = safeText(cancellation?.id, 160);
  const status = safeText(cancellation?.status, 40)?.toUpperCase();
  const cancelledAmount = positiveInteger(cancellation?.totalAmount);

  if (response?.ok && status === "SUCCEEDED") {
    return { state: "succeeded", cancellationId, cancelledAmount, recovered: false };
  }
  if (response?.ok && status === "REQUESTED") {
    return { state: "requested", cancellationId, cancelledAmount: null, recovered: false };
  }

  const lookup = await fetch(endpoint, {
    headers: { Authorization: `PortOne ${input.apiSecret}` },
    signal: AbortSignal.timeout(60000),
  });
  const payment = await readJson(lookup);
  if (lookup.ok && payment?.storeId === input.storeId && payment.status === "CANCELLED") {
    return {
      state: "succeeded",
      cancellationId,
      cancelledAmount: providerCancelledAmount(payment),
      recovered: true,
    };
  }
  return { state: "failed", cancellationId, cancelledAmount: null, recovered: false };
}

export async function cancelAndReconcile(input: {
  admin: RpcClient;
  apiBase: string;
  apiSecret: string;
  storeId: string;
  paymentId: string;
  orderNo: string;
  refundAmount: number;
  intentCode: string;
  reason: string;
}): Promise<CancellationReconciliation> {
  // Persist the cancellation intent before touching the provider. If the
  // provider accepts the POST but the response is lost, reconciliation still
  // has a durable state to retry from.
  const intentMarker = await input.admin.rpc("mark_order_refund_pending", {
    p_order_no: input.orderNo,
    p_reason: `cancellation_intent:${input.intentCode}`,
  });
  if (intentMarker.error || intentMarker.data !== true) {
    return {
      state: "failed",
      cancellationId: null,
      recovered: false,
      dbFinalized: false,
      tracked: false,
      providerRefunded: false,
    };
  }

  let cancellation: ProviderCancellation;
  try {
    cancellation = await cancelPortOnePayment(input);
  } catch (error) {
    console.error(
      "portone-cancellation provider request failed",
      error instanceof Error ? error.message : String(error),
    );
    return {
      state: "failed",
      cancellationId: null,
      recovered: false,
      dbFinalized: false,
      tracked: true,
      providerRefunded: false,
    };
  }
  if (cancellation.state === "succeeded") {
    if (cancellation.cancelledAmount === null || cancellation.cancelledAmount !== input.refundAmount) {
      await input.admin.rpc("mark_order_refund_pending", {
        p_order_no: input.orderNo,
        p_reason: cancellation.cancelledAmount === null
          ? `cancellation_intent:${input.intentCode}|provider_refunded_amount_missing`
          : `cancellation_intent:${input.intentCode}|provider_refunded_amount_mismatch`,
      });
      return {
        ...cancellation,
        dbFinalized: false,
        tracked: true,
        providerRefunded: true,
      };
    }
    const finalized = await input.admin.rpc("finalize_order_refund_v2", {
      p_order_no: input.orderNo,
      p_refund_amount: cancellation.cancelledAmount,
      p_reason: input.reason,
      p_provider_cancellation_id: cancellation.cancellationId,
    });
    if (!finalized.error && Boolean((finalized.data as JsonRecord | null)?.ok)) {
      return { ...cancellation, dbFinalized: true, tracked: true, providerRefunded: true };
    }
    await input.admin.rpc("mark_order_refund_pending", {
      p_order_no: input.orderNo,
      p_reason: `cancellation_intent:${input.intentCode}|provider_refunded_db_finalize_failed:${finalized.error?.message ?? "unknown"}`,
    });
    return {
      ...cancellation,
      dbFinalized: false,
      tracked: true,
      providerRefunded: true,
    };
  }

  if (cancellation.state === "requested") {
    await input.admin.rpc("mark_order_refund_pending", {
      p_order_no: input.orderNo,
      p_reason: `cancellation_intent:${input.intentCode}|provider_cancel_requested:${cancellation.cancellationId ?? "pending"}`,
    });
  } else {
    await input.admin.rpc("mark_order_refund_pending", {
      p_order_no: input.orderNo,
      p_reason: `cancellation_intent:${input.intentCode}|provider_cancel_failed`,
    });
  }
  return {
    ...cancellation,
    dbFinalized: false,
    tracked: true,
    providerRefunded: false,
  };
}

export async function queueCancellationIntent(
  admin: RpcClient,
  orderNo: string,
  intentCode: string,
): Promise<boolean> {
  const marker = await admin.rpc("mark_order_refund_pending", {
    p_order_no: orderNo,
    p_reason: `cancellation_intent:${intentCode}`,
  });
  return !marker.error && marker.data === true;
}

export async function finalizeKnownProviderCancellation(input: {
  admin: RpcClient;
  orderNo: string;
  refundAmount: number;
  expectedOrderAmount: number;
  reason: string;
}): Promise<CancellationReconciliation> {
  const cancelledAmount = Number.isSafeInteger(input.refundAmount) && input.refundAmount > 0
    ? input.refundAmount
    : null;
  const expectedOrderAmount = Number.isSafeInteger(input.expectedOrderAmount) && input.expectedOrderAmount > 0
    ? input.expectedOrderAmount
    : null;
  if (cancelledAmount === null || expectedOrderAmount === null) {
    const reviewCode = cancelledAmount === null
      ? "provider_cancelled_amount_invalid"
      : "order_amount_invalid";
    const marker = await input.admin.rpc("mark_order_payment_review", {
      p_order_no: input.orderNo,
      p_reason: `provider_cancelled_recovery_review:${reviewCode}`,
    });
    return {
      state: "succeeded", cancellationId: null, cancelledAmount, recovered: true,
      dbFinalized: false, tracked: !marker.error && marker.data === true, providerRefunded: true,
    };
  }
  // Let the locked DB finalizer decide amount safety. It accepts a mismatch
  // only when an earlier, durable auto-cancellation intent already exists.
  // Calling it before writing a generic marker avoids turning an unexplained
  // partial cancellation into an actionable refund_pending state.
  const finalized = await input.admin.rpc("finalize_order_refund_v2", {
    p_order_no: input.orderNo,
    p_refund_amount: cancelledAmount,
    p_reason: input.reason,
    p_provider_cancellation_id: null,
  });
  if (!finalized.error && Boolean((finalized.data as JsonRecord | null)?.ok)) {
    return {
      state: "succeeded", cancellationId: null, cancelledAmount, recovered: true,
      dbFinalized: true, tracked: true, providerRefunded: true,
    };
  }
  const marker = await input.admin.rpc("mark_order_payment_review", {
    p_order_no: input.orderNo,
    p_reason: `provider_cancelled_recovery_review:${finalized.error?.message ?? "unknown"}`,
  });
  return {
    state: "succeeded", cancellationId: null, cancelledAmount, recovered: true,
    dbFinalized: false, tracked: !marker.error && marker.data === true, providerRefunded: true,
  };
}
