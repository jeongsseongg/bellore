const SETTLED_PAYMENT_STATES = new Set([
  "paid", "inspecting", "preparing", "shipping", "shipped", "delivered",
  "confirmed", "cancel_req", "cancel_requested", "return_req", "exchange_req",
  "returning", "done", "refund_pending", "refunded",
]);

const CONFIRMED_PAYMENT_STATES = new Set([
  "paid", "inspecting", "preparing", "shipping", "shipped", "delivered",
  "confirmed", "cancel_req", "cancel_requested", "return_req", "exchange_req",
  "returning", "done",
]);

const REFUNDABLE_PAYMENT_STATES = new Set([
  "pending", "payment_review", "failed", "canceled", "paid", "inspecting",
  "preparing", "shipping", "shipped", "delivered", "confirmed", "cancel_req",
  "cancel_requested", "return_req", "exchange_req", "returning", "done",
  "refund_pending",
]);

export function hasSettledPaymentStatus(status: unknown): boolean {
  return typeof status === "string" && SETTLED_PAYMENT_STATES.has(status);
}

export function hasConfirmedPaymentStatus(status: unknown): boolean {
  return typeof status === "string" && CONFIRMED_PAYMENT_STATES.has(status);
}

export function hasRefundablePaymentStatus(status: unknown): boolean {
  return typeof status === "string" && REFUNDABLE_PAYMENT_STATES.has(status);
}
