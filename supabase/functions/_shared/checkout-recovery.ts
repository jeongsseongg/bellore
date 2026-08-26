type JsonRecord = Record<string, unknown>;

const ORDER_NO_RE = /^BLR[0-9A-F]{24}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_RECOVERY_STATUSES = new Set([
  "pending", "payment_review", "paid", "failed", "canceled", "inspecting",
  "preparing", "shipping", "shipped", "delivered", "confirmed", "cancel_req",
  "cancel_requested", "refund_pending", "refunded", "return_req", "exchange_req",
  "returning", "done",
]);

export type PublicCheckoutRecovery = {
  exists: true;
  orderNo: string;
  amount: number;
  status: string;
  listingId: string;
};

function normalizedUuid(value: unknown): string | null {
  if (typeof value !== "string" || !UUID_RE.test(value)) return null;
  return value.toLowerCase();
}

export function publicCheckoutRecovery(
  value: unknown,
  callerId: string | null,
): PublicCheckoutRecovery | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as JsonRecord;
  const rowCustomerId = row.customer_id === null ? null : normalizedUuid(row.customer_id);
  const normalizedCallerId = callerId === null ? null : normalizedUuid(callerId);
  if (rowCustomerId !== normalizedCallerId) return null;
  if (Number(row.payment_contract_version) !== 2) return null;

  const orderNo = typeof row.order_no === "string" ? row.order_no.trim().toUpperCase() : "";
  const listingId = normalizedUuid(row.listing_id);
  const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
  const amount = Number(row.amount);
  if (!ORDER_NO_RE.test(orderNo) || !listingId || !PUBLIC_RECOVERY_STATUSES.has(status) ||
    !Number.isSafeInteger(amount) || amount < 100) {
    return null;
  }
  return { exists: true, orderNo, amount, status, listingId };
}
