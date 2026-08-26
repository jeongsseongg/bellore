import {
  effectiveListingStatus,
  listingAvailability,
} from '../../core/listing-display.js?v=20260826-payment-final-v3';

const SELECT_FIELDS = 'id,status,reserved_order_id,reserved_until';
const ID_PATTERN = /^[0-9a-z-]{1,80}$/i;
const refreshGenerations = new WeakMap();

function nextRefreshGeneration(doc) {
  const generation = (refreshGenerations.get(doc) || 0) + 1;
  refreshGenerations.set(doc, generation);
  return generation;
}

function isLatestRefresh(doc, generation) {
  return refreshGenerations.get(doc) === generation;
}

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
  const generation = nextRefreshGeneration(doc);
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
    const batchIds = ids.slice(offset, offset + 50);
    const rows = await fetchRows(config, batchIds, fetchImpl);
    if (!isLatestRefresh(doc, generation)) return { checked: ids.length, updated: 0, stale: true };
    const rowsById = new Map(rows.map((row) => [String(row?.id || ''), row]));
    for (const id of batchIds) {
      // 정상 응답에서 사라진 상품은 예전 판매중 상태를 남기지 않고 구매불가로 닫는다.
      const row = rowsById.get(id) || { id, status: 'unavailable' };
      const targets = byId.get(id) || [];
      for (const node of targets) {
        paint(node, row);
        updated += 1;
      }
    }
  }
  return { checked: ids.length, updated };
}

function logRefreshFailure(error) {
  console.warn('[BELLORE_MARKET_STATUS]', {
    event: 'refresh_failed',
    reason: error instanceof Error ? error.message.slice(0, 80) : 'unknown',
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  let lastResumeRefreshAt = 0;
  const refresh = () => refreshMarketListingStatuses().catch(logRefreshFailure);
  const refreshAfterResume = () => {
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastResumeRefreshAt < 1000) return;
    lastResumeRefreshAt = now;
    refresh();
  };
  refresh();
  window.addEventListener('focus', refreshAfterResume);
  document.addEventListener('visibilitychange', refreshAfterResume);
}
