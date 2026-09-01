export function isExpiredCompare(record, now = Date.now()) {
  return record?.method === 'compare' && ['pending', 'open'].includes(record.status || 'pending') &&
    Number(record.expiresAt || 0) > 0 && Number(record.expiresAt) <= now;
}

export function isActiveSellRecord(record, now = Date.now()) {
  if (!record || !['compare', 'consignment', 'instant'].includes(record.method)) return false;
  if (isExpiredCompare(record, now)) return false;
  return !['closed', 'cancelled', 'canceled', 'rejected', 'completed', 'settled'].includes(record.status);
}
