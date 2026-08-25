import { effectiveListingStatus, listingAvailability } from '../../core/listing-display.js?v=20260826-payment-recovery-hero-v1';

function diagnosticCode(value) {
  const raw = value && typeof value === 'object'
    ? (value.code || value.error || value.message)
    : value;
  const text = String(raw || '').trim();
  return /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(text) ? text.toLowerCase() : 'unknown_error';
}

function httpStatus(value) {
  const raw = value && typeof value === 'object'
    ? (value.httpStatus || value.status || value.statusCode)
    : 0;
  const status = Number(raw);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
}

function paymentError(code, status) {
  const error = new Error(code);
  error.code = code;
  if (status) error.status = status;
  return error;
}

function effectivePrice(win, listing) {
  const price = Number(listing?.price) || 0;
  const salePrice = Number(listing?.sale_price) || 0;
  const active = typeof win.belloreSaleActive === 'function' && win.belloreSaleActive(listing);
  return active && salePrice > 0 && salePrice < price ? salePrice : price;
}

export function createPaymentFlow({ window: win, notify = (message) => win.alert(message) }) {
  function customerMessage(value, context, provider) {
    const feedback = win.BELLORE_CUSTOMER_FEEDBACK;
    if (provider && feedback?.paymentProviderFeedback) return feedback.paymentProviderFeedback(value);
    if (feedback?.message) return feedback.message(value, context);
    return context === 'confirmation' || provider
      ? '결제 결과를 확인하지 못했습니다. 다시 결제하지 말고 고객센터로 문의해 주세요.'
      : '결제를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  function log(stage, value) {
    if (!win.console || typeof win.console.warn !== 'function') return;
    win.console.warn('[BELLORE_PAYMENT]', {
      stage: String(stage || 'unknown'),
      code: diagnosticCode(value),
      httpStatus: httpStatus(value),
    });
  }

  function state(value) {
    return listingAvailability(typeof value === 'object' ? effectiveListingStatus(value) : value);
  }

  function canOpen(value) {
    const current = state(value);
    if (current.purchasable) return true;
    notify(current.message);
    return false;
  }

  function preflight(product) {
    if (!product?.listingId) return Promise.reject(paymentError('listing_not_found'));
    const backend = win.NWBackend;
    if (!(backend?.enabled && backend.getListing)) {
      return Promise.reject(paymentError('listing_refresh_unavailable'));
    }
    return backend.getListing(product.listingId).then((latest) => {
      if (!latest?.id) throw paymentError('listing_not_found');
      const current = state(latest);
      product.status = current.status;
      win.BELLORE_LISTING_UI?.updateCurrent(current.status);
      if (!current.purchasable) {
        throw paymentError(current.status === 'reserved' ? 'listing_reserved' : 'listing_unavailable');
      }
      const latestPrice = effectivePrice(win, latest);
      if (!Number.isSafeInteger(latestPrice) || latestPrice <= 0 || latestPrice !== Number(product.price)) {
        throw paymentError('listing_price_invalid');
      }
      return latest;
    });
  }

  function resetButton(button) {
    if (!button) return;
    button.disabled = false;
    button.textContent = '결제하기';
  }

  function startFailure(error, button) {
    log('payment_start', error);
    resetButton(button);
    if (error?.message === 'CHECKOUT_AMOUNT_CHANGED') {
      notify('결제 직전 상품가 또는 할인이 변경되었습니다. 화면을 새로고침한 뒤 다시 확인해 주세요.');
      return;
    }
    if (error?.code === 'PAYMENT_SESSION_EXPIRED' || error?.message === 'PAYMENT_SESSION_EXPIRED') {
      notify('로그인 정보가 만료되었습니다. 로그아웃 후 다시 로그인한 뒤 결제를 진행해 주세요.');
      return;
    }
    if (/CANCEL/i.test(String(error?.code || ''))) return;
    notify(customerMessage(error, 'payment_start', false));
  }

  function guard(product, button) {
    if (button) {
      button.disabled = true;
      button.textContent = '상품 상태 확인 중...';
    }
    return preflight(product).then(() => {
      resetButton(button);
      return true;
    }).catch((error) => {
      const current = state(product);
      if (!current.purchasable) {
        log('listing_unavailable', error);
        if (button) { button.disabled = true; button.textContent = current.label || '구매불가'; }
        notify(current.message);
      } else startFailure(error, button);
      win.NWBackend?.refreshListings?.();
      return false;
    });
  }

  function readResponse(response) {
    return response.json().catch(() => ({ ok: false, error: 'payment_confirmation_response_invalid' }))
      .then((value) => {
        const payload = value && typeof value === 'object' && !Array.isArray(value)
          ? value
          : { ok: false, error: 'payment_confirmation_response_invalid' };
        return { ...payload, httpStatus: response.status };
      });
  }

  function confirm(params, rechecksLeft = 3) {
    return win.NWBackend.confirmOrder(params).then((result) => {
      const pending = !!(result && (result.pending === true || Number(result.httpStatus) === 202));
      if (!pending) return result;
      log('confirmation_pending', result);
      if (rechecksLeft <= 0) return result;
      const retryAfterMs = Math.max(500, Math.min(5000, Number(result.retryAfterMs) || 2000));
      return new Promise((resolve) => win.setTimeout(resolve, retryAfterMs))
        .then(() => confirm(params, rechecksLeft - 1));
    });
  }

  return Object.freeze({ canOpen, confirm, customerMessage, guard, log, preflight, readResponse, resetButton, startFailure, state });
}
