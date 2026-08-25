type JsonRecord = Record<string, unknown>;

type RpcError = { message?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
};

export type ProviderCancellation = {
  state: "succeeded" | "requested" | "failed";
  cancellationId: string | null;
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
  reason: string;
}): Promise<ProviderCancellation> {
  const endpoint = `${input.apiBase}/payments/${encodeURIComponent(input.paymentId)}`;
  const idempotencyKeyRaw = `bellore-cancel-${input.paymentId}`.slice(0, 254);
  const idempotencyKey = `\"${idempotencyKeyRaw}\"`;
  const response = await fetch(`${endpoint}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `PortOne ${input.apiSecret}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ storeId: input.storeId, reason: input.reason }),
    signal: AbortSignal.timeout(10000),
  });
  const payload = await readJson(response);
  const cancellation = payload?.cancellation && typeof payload.cancellation === "object"
    ? payload.cancellation as JsonRecord
    : null;
  const cancellationId = safeText(cancellation?.id, 160);
  const status = safeText(cancellation?.status, 40)?.toUpperCase();

  if (response.ok && status === "SUCCEEDED") {
    return { state: "succeeded", cancellationId, recovered: false };
  }
  if (response.ok && status === "REQUESTED") {
    return { state: "requested", cancellationId, recovered: false };
  }

  const lookup = await fetch(endpoint, {
    headers: { Authorization: `PortOne ${input.apiSecret}` },
    signal: AbortSignal.timeout(10000),
  });
  const payment = await readJson(lookup);
  if (lookup.ok && payment?.storeId === input.storeId && payment.status === "CANCELLED") {
    return { state: "succeeded", cancellationId, recovered: true };
  }
  return { state: "failed", cancellationId, recovered: false };
}

export async function cancelAndReconcile(input: {
  admin: RpcClient;
  apiBase: string;
  apiSecret: string;
  storeId: string;
  paymentId: string;
  orderNo: string;
  orderAmount: number;
  reason: string;
}): Promise<CancellationReconciliation> {
  const cancellation = await cancelPortOnePayment(input);
  if (cancellation.state === "succeeded") {
    const finalized = await input.admin.rpc("finalize_order_refund_v2", {
      p_order_no: input.orderNo,
      p_refund_amount: input.orderAmount,
      p_reason: input.reason,
      p_provider_cancellation_id: cancellation.cancellationId,
    });
    if (!finalized.error && Boolean((finalized.data as JsonRecord | null)?.ok)) {
      return { ...cancellation, dbFinalized: true, tracked: true, providerRefunded: true };
    }
    const pending = await input.admin.rpc("mark_order_refund_pending", {
      p_order_no: input.orderNo,
      p_reason: `provider_refunded_db_finalize_failed:${finalized.error?.message ?? "unknown"}`,
    });
    return {
      ...cancellation,
      dbFinalized: false,
      tracked: !pending.error && pending.data === true,
      providerRefunded: true,
    };
  }

  const marker = cancellation.state === "requested"
    ? await input.admin.rpc("mark_order_refund_pending", {
      p_order_no: input.orderNo,
      p_reason: `provider_cancel_requested:${cancellation.cancellationId ?? "pending"}`,
    })
    : await input.admin.rpc("mark_order_refund_pending", {
      p_order_no: input.orderNo,
      p_reason: "provider_cancel_failed",
    });
  return {
    ...cancellation,
    dbFinalized: false,
    tracked: !marker.error && marker.data === true,
    providerRefunded: false,
  };
}
