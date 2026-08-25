import {
  effectiveListingStatus,
  listingAvailability,
} from '../../core/listing-display.js?v=20260826-payment-recovery-v1';

const SELECT_FIELDS = 'id,status,reserved_order_id,reserved_until';
const ID_PATTERN = /^[0-9a-z-]{1,80}$/i;

function safeClass(value) {
  const normalized = String(value || '').toLowerCase();
  return /^[a-z0-9_-]+$/.test(normalized) ? normalized : 'unavailable';
}

function paint(node, row) {
  const status = effectiveListingStatus(row);
  const current = listingAvailability(status);
  const showOnSale = node.dataset.showOnSale === 'true';
  const visible = current.visible || (showOnSale && current.status === 'on_sale');
  const label = current.status === 'on_sale' ? '판매중' : current.label;
  const baseClass = node.dataset.baseClass || 'product-card__status';
  node.hidden = !visible;
  node.textContent = visible ? label : '';
  node.className = `${baseClass} is-${safeClass(current.status)}`;
  node.dataset.status = current.status;
  const card = node.closest('[data-market-listing-card]');
  if (card) card.dataset.status = current.status;
}

async function fetchRows(config, ids, fetchImpl) {
  const url = new URL('/rest/v1/listings', config.url);
  url.searchParams.set('select', SELECT_FIELDS);
  url.searchParams.set('id', `in.(${ids.join(',')})`);
  const response = await fetchImpl(url, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`listing_status_${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

export async function refreshMarketListingStatuses({
  document: doc = document,
  config = window.BELLORE_SUPABASE,
  fetchImpl = fetch,
} = {}) {
  const nodes = [...doc.querySelectorAll('[data-market-listing-status]')];
  if (!nodes.length || !config?.url || !config?.anonKey) return { checked: 0, updated: 0 };
  const byId = new Map();
  for (const node of nodes) {
    const id = String(node.dataset.listingId || '');
    if (!ID_PATTERN.test(id)) continue;
    const group = byId.get(id) || [];
    group.push(node);
    byId.set(id, group);
  }
  const ids = [...byId.keys()];
  let updated = 0;
  for (let offset = 0; offset < ids.length; offset += 50) {
    const rows = await fetchRows(config, ids.slice(offset, offset + 50), fetchImpl);
    for (const row of rows) {
      const targets = byId.get(String(row?.id || '')) || [];
      for (const node of targets) {
        paint(node, row);
        updated += 1;
      }
    }
  }
  return { checked: ids.length, updated };
}

refreshMarketListingStatuses().catch((error) => {
  console.warn('[BELLORE_MARKET_STATUS]', {
    event: 'refresh_failed',
    reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
  });
});
