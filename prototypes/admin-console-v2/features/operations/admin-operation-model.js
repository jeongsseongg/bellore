export function money(value) {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString('ko-KR')}원`;
}

export function dateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

export function tone(status) {
  const value = String(status || '').toLowerCase();
  if (['paid', 'delivered', 'done', 'approved', 'awarded', 'active', 'on_sale', 'open', 'shipping'].includes(value)) return 'success';
  if (['pending', 'requested', 'preparing', 'inspecting', 'scheduled', 'collecting'].includes(value)) return 'attention';
  if (['rejected', 'canceled', 'cancelled', 'closed', 'suspended', 'cancel_req', 'failed'].includes(value)) return 'danger';
  return 'normal';
}

export function firstImage(row) {
  return row.product_image || row.image_url || row.photo_url || row.image_urls?.[0] || row.photo_urls?.[0] || '';
}

export function field(name, label, type = 'text', options = {}) {
  return { name, label, type, ...options };
}

export function bool(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

export function numberOrNull(value) {
  return value === '' || value === null || value === undefined ? null : Number(value);
}

export function stringArray(value) {
  if (Array.isArray(value)) return value;
  return String(value || '').split('\n').map((item) => item.trim()).filter(Boolean);
}
