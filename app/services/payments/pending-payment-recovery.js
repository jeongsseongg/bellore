const STORAGE_KEY = 'bellore_pending_order_v2';
const MAX_RECHECKS = 8;
const RETRY_WINDOW_MS = 10 * 60 * 1000;
const MIN_RECHECK_INTERVAL_MS = 3000;
const CALLBACK_KEYS = ['pay', 'paymentId', 'code', 'message', 'txId'];

function safePending(value, timestamp) {
  if (!value || typeof value !== 'object') return null;
  const orderNo = String(value.orderNo || '').trim();
  const checkoutToken = String(value.checkoutToken || '').trim().toLowerCase();
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(orderNo) || !/^[0-9a-f]{64}$/.test(checkoutToken)) return null;
  return {
    orderNo,
    checkoutToken,
    amount: Number(value.amount) || 0,
    listingId: value.listingId || null,
    attribution: value.attribution || null,
    createdAt: Number(value.createdAt) || timestamp,
    lastCheckedAt: Number(value.lastCheckedAt) || 0,
    retryCount: Math.max(0, Number(value.retryCount) || 0),
  };
}

export function createPendingPaymentRecovery({ location, history, getStorage, now = () => Date.now() }) {
  function read() {
    try {
      return safePending(JSON.parse(getStorage().getItem(STORAGE_KEY) || 'null'), now());
    } catch (_error) {
      return null;
    }
  }

  function write(pending) {
    try {
      getStorage().setItem(STORAGE_KEY, JSON.stringify(pending));
      return read();
    } catch (_error) {
      return null;
    }
  }

  function capture(order, attribution = null) {
    const amount = Number(order?.amount);
    if (!Number.isSafeInteger(amount) || amount < 100 || !order?.listingId) return null;
    const timestamp = now();
    const pending = safePending({
      orderNo: order.orderNo, checkoutToken: order.checkoutToken, amount,
      listingId: order.listingId, attribution, createdAt: timestamp,
      lastCheckedAt: 0, retryCount: 0,
    }, timestamp);
    if (!pending) return null;
    const saved = write(pending);
    return saved && saved.orderNo === pending.orderNo && saved.checkoutToken === pending.checkoutToken &&
      saved.amount === pending.amount && saved.listingId === pending.listingId ? saved : null;
  }

  function cleanCallbackQuery(params) {
    CALLBACK_KEYS.forEach((key) => params.delete(key));
    const query = params.toString();
    try {
      history.replaceState({}, '', location.pathname + (query ? `?${query}` : '') + location.hash);
    } catch (_error) {
      // URL 정리는 보조 기능이다. 실패해도 같은 주문의 서버 재확인을 계속한다.
    }
  }

  function handle({ verify, showResult, customerMessage }) {
    const params = new URLSearchParams(location.search);
    const callbackPaymentId = String(params.get('paymentId') || '').trim();
    const callback = params.get('pay') === 'portone' || Boolean(callbackPaymentId) || params.has('code');
    const pending = read();
    if (!callback && !pending) return { handled: false, reason: 'nothing_pending' };

    if (callback && pending && callbackPaymentId && callbackPaymentId !== pending.orderNo) {
      cleanCallbackQuery(params);
      showResult(false, '결제 확인 필요', '결제 정보가 일치하지 않습니다. 다시 결제하지 말고 고객센터로 문의해 주세요.');
      return { handled: true, reason: 'payment_id_mismatch' };
    }

    const paymentId = callbackPaymentId || pending?.orderNo || '';
    const code = String(params.get('code') || '').trim();
    if (callback) cleanCallbackQuery(params);
    if (!paymentId && !pending && /^(FAILURE_TYPE_USER|PAY_PROCESS_CANCEL)$/i.test(code)) {
      showResult(false, '결제가 취소되었습니다', '결제는 진행되지 않았습니다.');
      return { handled: true, reason: 'explicit_cancel' };
    }
    if (!paymentId) {
      showResult(false, '결제 확인 필요', customerMessage({ code, message: params.get('message') || '' }));
      return { handled: true, reason: 'payment_id_missing' };
    }

    if (!callback && pending) {
      const timestamp = now();
      const windowExpired = timestamp - pending.createdAt >= RETRY_WINDOW_MS;
      if (!windowExpired && timestamp - pending.lastCheckedAt < MIN_RECHECK_INTERVAL_MS) {
        return { handled: false, reason: 'retry_throttled' };
      }
      if (!windowExpired && pending.retryCount >= MAX_RECHECKS) {
        showResult(false, '결제 확인 필요', `주문번호 ${pending.orderNo}\n다시 결제하지 말고 고객센터로 문의해 주세요.`);
        return { handled: true, reason: 'retry_limit' };
      }
      const saved = write({
        ...pending,
        createdAt: windowExpired ? timestamp : pending.createdAt,
        lastCheckedAt: timestamp,
        retryCount: windowExpired ? 1 : pending.retryCount + 1,
      });
      if (!saved) {
        showResult(false, '결제 확인 필요', '결제 확인 정보를 안전하게 보관하지 못했습니다. 다시 결제하지 말고 고객센터로 문의해 주세요.');
        return { handled: true, reason: 'pending_write_failed' };
      }
    }

    if (code && !pending) {
      const explicitCancel = /^(FAILURE_TYPE_USER|PAY_PROCESS_CANCEL)$/i.test(code);
      showResult(false, explicitCancel ? '결제가 취소되었습니다' : '결제 확인 필요', customerMessage({ code, message: params.get('message') || '' }));
      return { handled: true, reason: 'callback_without_capability' };
    }

    verify(
      paymentId,
      pending?.attribution || null,
      pending?.listingId || null,
      pending?.checkoutToken || null,
      Boolean(code) || (!callback && Boolean(pending)),
    );
    return { handled: true, reason: callback ? 'callback_verified' : 'pending_rechecked' };
  }

  return Object.freeze({ capture, handle, read });
}
