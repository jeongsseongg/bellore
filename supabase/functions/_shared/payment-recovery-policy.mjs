const PROVIDER_PENDING_STATUSES = new Set([
  'READY',
  'PENDING',
  'PAY_PENDING',
  'VIRTUAL_ACCOUNT_ISSUED',
]);

export const CONFIRMATION_RETRY_DELAYS_MS = Object.freeze([400, 800, 1200]);
export const PENDING_RECOVERY_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const RECONCILIATION_ROTATION_MS = 5 * 60 * 1000;

export function providerStatusKind(value) {
  const status = String(value || '').trim().toUpperCase();
  if (status === 'PAID') return 'paid';
  if (status === 'FAILED') return 'failed';
  if (PROVIDER_PENDING_STATUSES.has(status)) return 'pending';
  if (status === 'CANCELLED') return 'cancelled';
  if (status === 'PARTIAL_CANCELLED') return 'partial_cancelled';
  return 'unknown';
}

function providerAmountField(payment, field) {
  if (!payment || typeof payment !== 'object' || Array.isArray(payment)) return null;
  const amountRecord = payment.amount;
  const rawAmount = amountRecord && typeof amountRecord === 'object' && !Array.isArray(amountRecord)
    ? amountRecord[field]
    : field === 'total' ? amountRecord : null;
  if (rawAmount === null || rawAmount === undefined ||
    (typeof rawAmount === 'string' && !rawAmount.trim())) return null;
  const amount = Number(rawAmount);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

export const providerTotalAmount = (payment) => providerAmountField(payment, 'total');
export const providerPaidAmount = (payment) => {
  const amount = providerAmountField(payment, 'paid');
  return amount !== null && amount > 0 ? amount : null;
};
export const providerCancelledAmount = (payment) => {
  const amount = providerAmountField(payment, 'cancelled');
  return amount !== null && amount > 0 ? amount : null;
};

export function shouldRetryConfirmation(status, attempt) {
  return providerStatusKind(status) === 'pending' &&
    Number.isInteger(attempt) &&
    attempt >= 0 &&
    attempt < CONFIRMATION_RETRY_DELAYS_MS.length;
}

export function confirmationRetryDelayMs(attempt) {
  return CONFIRMATION_RETRY_DELAYS_MS[attempt] || 0;
}

export function shouldFinalizeDuringRecovery(orderStatus, providerStatus) {
  const status = String(orderStatus || '').trim().toLowerCase();
  return (status === 'pending' || status === 'payment_review') &&
    providerStatusKind(providerStatus) === 'paid';
}

export function paidRecoveryAction(orderStatus, amountMatches) {
  const status = String(orderStatus || '').trim().toLowerCase();
  if (status === 'refund_pending') return 'continue_cancellation';
  if (amountMatches !== true) return 'review_amount_mismatch';
  if (status === 'pending' || status === 'payment_review') return 'finalize';
  return 'none';
}

export function adminCancellationAction(providerStatus, providerAmount) {
  const statusKind = providerStatusKind(providerStatus);
  const amountKnown = Number.isSafeInteger(providerAmount) && providerAmount > 0;
  if (statusKind === 'paid') return amountKnown ? 'cancel_paid' : 'review';
  if (statusKind === 'cancelled') return amountKnown ? 'finalize_cancelled' : 'review';
  if (statusKind === 'failed') return 'close_unsettled';
  if (statusKind === 'pending') return 'wait';
  return 'review';
}

export function shouldExpirePendingOrder(orderStatus, createdAt, nowMs) {
  if (String(orderStatus || '').trim().toLowerCase() !== 'pending') return false;
  const createdAtMs = typeof createdAt === 'number' ? createdAt : Date.parse(String(createdAt || ''));
  const referenceMs = Number(nowMs);
  return Number.isFinite(createdAtMs) && Number.isFinite(referenceMs) &&
    createdAtMs <= referenceMs - PENDING_RECOVERY_EXPIRY_MS;
}

export function fairReconciliationBatch(groups, perGroupLimit) {
  if (!Array.isArray(groups)) return [];
  const limit = Number(perGroupLimit);
  if (!Number.isInteger(limit) || limit <= 0) return [];
  const normalized = groups.map((group) => Array.isArray(group) ? group : []);
  const depth = Math.min(limit, normalized.reduce((max, group) => Math.max(max, group.length), 0));
  const seen = new Set();
  const batch = [];
  for (let index = 0; index < depth; index += 1) {
    for (const group of normalized) {
      const order = group[index];
      const orderNo = String(order?.order_no || '').trim();
      if (!orderNo || seen.has(orderNo)) continue;
      seen.add(orderNo);
      batch.push(order);
    }
  }
  return batch;
}

export function rotatingReconciliationWindowOffset(totalRows, pageSize, nowMs) {
  const total = Number(totalRows);
  const size = Number(pageSize);
  const referenceMs = Number(nowMs);
  if (!Number.isSafeInteger(total) || total <= 0 ||
    !Number.isSafeInteger(size) || size <= 0 ||
    !Number.isFinite(referenceMs) || referenceMs < 0) return 0;
  const pageCount = Math.ceil(total / size);
  const timeSlot = Math.floor(referenceMs / RECONCILIATION_ROTATION_MS);
  return (timeSlot % pageCount) * size;
}

export function reconciliationSummaryOk(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return false;
  return Number(summary.errors || 0) === 0 && Number(summary.reviewRequired || 0) === 0;
}
