export type PaymentOperationControl =
  | "create_checkout"
  | "confirm_payment"
  | "cancel_payment"
  | "payment_webhook"
  | "reconcile_payments";

type RpcError = { code?: string; message?: string } | null;
type RpcResult = { data: unknown; error: RpcError };

export type PaymentOperationRpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
};

export type PaymentOperationGateResult =
  | { ok: true; enabled: true }
  | { ok: true; enabled: false }
  | { ok: false; enabled: false };

export type PaymentOperationHoldResult =
  | { ok: true; held: true; orderNoSha256: string }
  | { ok: true; held: false; orderNoSha256: string }
  | { ok: false; held: true; orderNoSha256: string };

export type PaymentOperationGuardInput = {
  admin: PaymentOperationRpcClient;
  control: PaymentOperationControl;
  orderNo: string;
};

export type PaymentOperationGuardResult =
  | { allowed: true; reason: null }
  | { allowed: false; reason: "operation_disabled" | "operation_held" | "guard_unavailable" };

export async function paymentOperationSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

// RPC results are intentionally strict. A missing function, permission error,
// null, or unexpected payload must keep financial operations closed.
export async function readPaymentOperationControl(
  admin: PaymentOperationRpcClient,
  control: PaymentOperationControl,
): Promise<PaymentOperationGateResult> {
  try {
    const { data, error } = await admin.rpc("read_payment_operation_control_v1", {
      p_control_name: control,
    });
    if (error || typeof data !== "boolean") return { ok: false, enabled: false };
    return { ok: true, enabled: data };
  } catch {
    return { ok: false, enabled: false };
  }
}

export async function readPaymentOperationHold(
  admin: PaymentOperationRpcClient,
  orderNo: string,
): Promise<PaymentOperationHoldResult> {
  const orderNoSha256 = await paymentOperationSha256(orderNo);
  try {
    const { data, error } = await admin.rpc("is_payment_operation_hash_held_v1", {
      p_order_no_sha256: orderNoSha256,
    });
    // Unknown is treated as held. This makes missing/invalid guard state fail closed.
    if (error || typeof data !== "boolean") return { ok: false, held: true, orderNoSha256 };
    return { ok: true, held: data, orderNoSha256 };
  } catch {
    return { ok: false, held: true, orderNoSha256 };
  }
}

export async function guardPaymentOperation(
  input: PaymentOperationGuardInput,
): Promise<PaymentOperationGuardResult> {
  const hold = await readPaymentOperationHold(input.admin, input.orderNo);
  if (!hold.ok) return { allowed: false, reason: "guard_unavailable" };
  if (hold.held) return { allowed: false, reason: "operation_held" };

  const gate = await readPaymentOperationControl(input.admin, input.control);
  if (!gate.ok) return { allowed: false, reason: "guard_unavailable" };
  if (!gate.enabled) return { allowed: false, reason: "operation_disabled" };
  return { allowed: true, reason: null };
}
