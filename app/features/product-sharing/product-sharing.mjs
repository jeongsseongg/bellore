import {
  SITE_ORIGIN,
  publicMarketUrl,
} from '../../core/market-product-url.mjs';

function canonicalOrigin(value) {
  return new URL(value || SITE_ORIGIN).origin;
}

export function productShareUrl(product, origin = SITE_ORIGIN) {
  const listingId = String(product?.listingId ?? product?.id ?? '').trim();
  const productNumber = product?.productNo ?? product?.product_no ?? '';
  try {
    const marketUrl = publicMarketUrl({ id: listingId, product_no: productNumber }, origin);
    if (marketUrl) return marketUrl;
  } catch {
    // 공개 URL 요건을 충족하지 않는 항목은 기존 앱 딥링크를 유지한다.
  }
  const base = canonicalOrigin(origin);
  return listingId ? `${base}/#p=${encodeURIComponent(listingId)}` : `${base}/`;
}

export function initProductSharing({
  document: doc,
  navigator: nav,
  getCurrentProduct,
  notify = () => {},
  origin = SITE_ORIGIN,
}) {
  const buttons = ['pmShareTop', 'pmShare']
    .map((id) => doc.getElementById(id))
    .filter(Boolean);

  function shareCurrentProduct() {
    const product = getCurrentProduct?.() || {};
    const title = [product.brand, product.model].filter(Boolean).join(' ') || '벨로르 시계';
    const url = productShareUrl(product, origin);
    const data = {
      title: `${title} · 벨로르`,
      text: `${title} — 벨로르에서 확인해 보세요.`,
      url,
    };

    if (typeof nav?.share === 'function') {
      Promise.resolve(nav.share(data)).catch(() => {});
      return;
    }
    if (typeof nav?.clipboard?.writeText === 'function') {
      Promise.resolve(nav.clipboard.writeText(url))
        .then(() => notify('상품 링크를 복사했습니다.'), () => {});
      return;
    }
    notify(url);
  }

  buttons.forEach((button) => button.addEventListener('click', shareCurrentProduct));
  return {
    destroy() {
      buttons.forEach((button) => button.removeEventListener('click', shareCurrentProduct));
    },
  };
}

export function initProductDetailRoute({
  document: doc,
  window: win,
}) {
  const productStateKey = 'belloreProduct';

  function routeTarget(product) {
    const url = new URL(productShareUrl(product, win.location.origin));
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function applyProductRoute(product) {
    const target = routeTarget(product);
    const state = { ...(win.history.state || {}), ov: 1, [productStateKey]: 1 };

    if (/^#p=/.test(win.location.hash || '') && !win.history.state?.[productStateKey]) {
      win.history.replaceState(win.history.state, '', '/');
    }
    if (win.history.state?.ov) {
      win.history.replaceState(state, '', target);
      return;
    }
    win.history.pushState(state, '', target);
  }

  function onProductOpen(event) {
    const product = event.detail?.product || {};
    Promise.resolve().then(() => applyProductRoute(product));
  }

  function onProductClose(event) {
    const afterRestore = event.detail?.afterRestore;
    if (!win.history.state?.[productStateKey]) {
      if (typeof afterRestore === 'function') afterRestore();
      return;
    }
    if (typeof afterRestore === 'function') {
      win.addEventListener('popstate', afterRestore, { once: true });
    }
    win.history.back();
  }

  doc.addEventListener('bellore:product-open', onProductOpen);
  doc.addEventListener('bellore:product-close', onProductClose);
  return {
    destroy() {
      doc.removeEventListener('bellore:product-open', onProductOpen);
      doc.removeEventListener('bellore:product-close', onProductClose);
    },
  };
}
