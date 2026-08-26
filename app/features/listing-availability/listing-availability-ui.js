import { listingAvailability } from '../../core/listing-display.js?v=20260826-payment-final-v3';

function safeClass(value) {
  const normalized = String(value || '').toLowerCase();
  return /^[a-z0-9_-]+$/.test(normalized) ? normalized : 'unavailable';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VIEWED_STORAGE_KEY = 'bellore_recent_items';

export function createListingAvailabilityUi({ document: doc, window: win }) {
  let viewedRefresh = null;
  function state(value) { return listingAvailability(value); }

  function canPurchase(value) {
    const current = state(value);
    if (current.purchasable) return true;
    win.alert(current.message);
    return false;
  }

  function cardMarkup(row) {
    const current = state(row?.status);
    return current.visible
      ? `<span class="listing-sale-state is-${safeClass(current.status)}">${current.label}</span>`
      : '';
  }

  function decorateCard(card, row) {
    const current = state(row?.status);
    card.dataset.status = current.status;
    card.classList.toggle('is-listing-reserved', current.status === 'reserved');
    card.classList.toggle('is-listing-sold', current.status === 'sold');
    card.classList.toggle('is-listing-unavailable', !current.purchasable && !['reserved', 'sold'].includes(current.status));
  }

  function paintDetail(value) {
    const current = state(value);
    const badge = doc.getElementById('pmSaleState');
    const button = doc.getElementById('pmBuy');
    if (badge) {
      badge.hidden = !current.visible;
      badge.className = `pp-sale-state is-${safeClass(current.status)}`;
      badge.textContent = current.visible ? current.label : '';
    }
    if (button) {
      button.disabled = !current.purchasable;
      button.textContent = current.purchasable ? '구매하기' : current.label;
      button.setAttribute('aria-disabled', String(!current.purchasable));
      button.title = current.purchasable ? '' : current.message;
    }
  }

  function renderNaver(current) {
    if (typeof win.BELLORE_NPAY_RENDER !== 'function') return;
    win.BELLORE_NPAY_RENDER(current && state(current.status).purchasable ? current : null);
  }

  function updateCurrent(status) {
    const current = win.BELLORE_currentProduct;
    if (!current) return;
    current.status = state(status).status;
    paintDetail(current.status);
    renderNaver(current);
  }

  function mergeLiveListing(item, row, preferSalePrice) {
    if (!row) return { ...item, status: 'unavailable' };
    const merged = {
      ...item,
      product_no: row.product_no || item.product_no || '',
      brand: row.brand || item.brand,
      model: row.model || item.model,
      img: row.photos?.[0] || item.img || '',
      status: row.status || 'unavailable',
    };
    if (preferSalePrice) merged.price = Number(row.sale_price || row.price) || item.price || 0;
    else {
      merged.price = Number(row.price) || item.price || 0;
      merged.sale_price = Number(row.sale_price) || 0;
    }
    return merged;
  }

  async function hydrateCollections(backend, collections, { preferSalePrice = false } = {}) {
    if (typeof backend?.getListingsByIds !== 'function') return collections;
    const ids = [...new Set(collections.flatMap((items) => (items || []).map((item) => String(item?.id || '')).filter((id) => UUID_RE.test(id))))];
    if (!ids.length) return collections;
    const rows = await backend.getListingsByIds(ids);
    const byId = new Map((rows || []).map((row) => [String(row.id), row]));
    return collections.map((items) => (items || []).map((item) => {
      const id = String(item?.id || '');
      return UUID_RE.test(id) ? mergeLiveListing(item, byId.get(id), preferSalePrice) : item;
    }));
  }

  function refreshViewedStatuses(backend) {
    if (viewedRefresh) return viewedRefresh;
    let viewed;
    try { viewed = JSON.parse(win.localStorage.getItem(VIEWED_STORAGE_KEY) || '[]'); } catch { viewed = []; }
    if (typeof backend?.getListingsByIds !== 'function' || !viewed.some((item) => UUID_RE.test(String(item?.id || '')))) {
      return Promise.resolve(viewed);
    }
    viewedRefresh = hydrateCollections(backend, [viewed]).then(([fresh]) => {
      try { win.localStorage.setItem(VIEWED_STORAGE_KEY, JSON.stringify(fresh)); } catch {}
      return fresh;
    }).finally(() => { viewedRefresh = null; });
    return viewedRefresh;
  }

  return Object.freeze({ canPurchase, cardMarkup, decorateCard, hydrateCollections, paintDetail, refreshViewedStatuses, renderNaver, state, updateCurrent });
}
