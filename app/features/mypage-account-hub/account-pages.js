function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function productId(item) {
  return String(item?.id ?? item?.listingId ?? item?.productId ?? '');
}

function productImage(item) {
  return item?.image || item?.imageUrl || item?.image_url || item?.productImage || item?.photo || item?.photos?.[0] || '/assets/images.jpg';
}

function productName(item) {
  return item?.name || item?.title || item?.productName || [item?.brand, item?.model].filter(Boolean).join(' ') || '시계';
}

function productMeta(item) {
  const price = Number(item?.price || item?.amount || 0);
  return [item?.ref ? `Ref. ${item.ref}` : '', price ? `${price.toLocaleString('ko-KR')}원` : ''].filter(Boolean).join(' · ');
}

function card(item) {
  const id = productId(item);
  const href = id ? `/?product=${encodeURIComponent(id)}` : '/#collection';
  return `<a class="account-product-card" href="${href}">
    <img src="${escapeHtml(productImage(item))}" alt="" loading="lazy">
    <span><strong>${escapeHtml(productName(item))}</strong><small>${escapeHtml(productMeta(item))}</small></span>
    <span aria-hidden="true">›</span>
  </a>`;
}

function waitForWishlist(windowObject, attempts = 30) {
  if (windowObject.BELLOREWishlist) return Promise.resolve(windowObject.BELLOREWishlist);
  if (attempts <= 0) return Promise.resolve(null);
  return new Promise((resolve) => windowObject.setTimeout(resolve, 100))
    .then(() => waitForWishlist(windowObject, attempts - 1));
}

async function renderCollectionPage(documentObject, windowObject, page) {
  const root = documentObject.getElementById('accountProductList');
  if (!root) return;
  const store = await waitForWishlist(windowObject);
  const items = page === 'saved' ? (store?.getWish?.() || []) : (store?.getRecent?.() || []);
  root.innerHTML = items.length ? items.map(card).join('') :
    `<div class="account-empty">${page === 'saved' ? '보관한 시계가 없습니다.' : '최근 본 시계가 없습니다.'}</div>`;
}

function openStandaloneSupport(documentObject, windowObject) {
  const mount = documentObject.getElementById('supportPageMount');
  if (!mount || !windowObject.CQDemo?.open) return;
  windowObject.CQDemo.open({ screen: 'c-chat' });
  const overlay = documentObject.getElementById('cqdOverlay');
  if (!overlay) return;
  overlay.classList.add('cqd-standalone');
  mount.appendChild(overlay);
  overlay.hidden = false;
  documentObject.body.style.overflow = '';
}

export function initAccountStandalonePage({ documentObject = document, windowObject = window } = {}) {
  const page = documentObject.body?.dataset.belloreStandalonePage || '';
  if (page === 'saved' || page === 'recent') return renderCollectionPage(documentObject, windowObject, page);
  if (page === 'support') openStandaloneSupport(documentObject, windowObject);
  return null;
}

initAccountStandalonePage();
