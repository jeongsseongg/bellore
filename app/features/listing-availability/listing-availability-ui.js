import { listingAvailability } from '../../core/listing-display.js?v=20260826-payment-recovery-v1';

function safeClass(value) {
  const normalized = String(value || '').toLowerCase();
  return /^[a-z0-9_-]+$/.test(normalized) ? normalized : 'unavailable';
}

export function createListingAvailabilityUi({ document: doc, window: win }) {
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

  return Object.freeze({ canPurchase, cardMarkup, decorateCard, paintDetail, renderNaver, state, updateCurrent });
}
