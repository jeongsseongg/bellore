const TERMINAL_STATUSES = new Set(['failed', 'canceled', 'cancelled', 'refunded']);
const RECOVERABLE_STATUSES = new Set([
  'pending', 'payment_review', 'paid', 'inspecting', 'preparing', 'shipping', 'shipped',
  'delivered', 'confirmed', 'cancel_req', 'cancel_requested', 'return_req', 'exchange_req',
  'returning', 'done', 'refund_pending',
]);

function checkoutError(code, status = 0) {
  const error = new Error(code);
  error.code = code;
  if (status) error.status = status;
  return error;
}

async function responsePayload(response) {
  const value = await response.json().catch(() => ({ error: 'checkout_response_invalid' }));
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { error: 'checkout_response_invalid' };
}

function checkoutBody(data, profile) {
  return {
    listingId: data.listingId || null,
    couponUserId: data.couponUserId || null,
    buyerName: data.buyerName || profile?.display_name || null,
    buyerPhone: data.buyerPhone || profile?.phone || null,
    shipRecipient: data.shipRecipient || data.buyerName || null,
    shipPhone: data.shipPhone || data.buyerPhone || null,
    shipPostcode: data.shipPostcode || null,
    shipAddr1: data.shipAddr1 || null,
    shipAddr2: data.shipAddr2 || null,
    shipRequest: data.shipRequest || null,
    expectedAmount: data.amount,
    attribution: data.attribution || null,
  };
}

export function createCheckoutClient() {
  async function statusLookup({ checkoutUrl, anonKey, recovery, getAccessToken, request }) {
    const previous = recovery.current();
    if (!previous) throw checkoutError('checkout_previous_order_unverified');
    const token = await getAccessToken();
    const response = await request(checkoutUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'recover',
        checkoutRequestKey: previous.requestKey,
        checkoutToken: previous.checkoutToken,
      }),
    }, 15_000);
    const payload = await responsePayload(response);
    if (!response.ok || payload.checkoutRequestKey !== previous.requestKey ||
        payload.checkoutToken !== previous.checkoutToken) {
      throw checkoutError(payload.error || 'checkout_previous_order_unverified', response.status);
    }
    if (payload.exists === false || TERMINAL_STATUSES.has(String(payload.status || '').toLowerCase())) {
      recovery.complete(previous.requestKey);
      return null;
    }
    const status = String(payload.status || '').toLowerCase();
    const amount = Number(payload.amount);
    if (payload.exists !== true || !RECOVERABLE_STATUSES.has(status) ||
        !payload.orderNo || !Number.isSafeInteger(amount) || amount < 100 || !payload.listingId) {
      throw checkoutError('checkout_previous_order_unverified');
    }
    return {
      recoveryOnly: true,
      orderNo: payload.orderNo,
      amount,
      listingId: payload.listingId,
      status,
      checkoutRequestKey: previous.requestKey,
      checkoutToken: previous.checkoutToken,
    };
  }

  async function create({ data, profile, paymentConfig, anonKey, recovery, getAccessToken, request }) {
    if (!recovery?.prepare || !recovery?.current) throw checkoutError('checkout_recovery_unavailable');
    const body = checkoutBody(data, profile);
    let attempt;
    try {
      attempt = await recovery.prepare(body);
    } catch (error) {
      if (error?.code !== 'checkout_request_changed') throw error;
      const recovered = await statusLookup({
        checkoutUrl: paymentConfig.checkoutUrl, anonKey, recovery, getAccessToken, request,
      });
      if (recovered) return recovered;
      attempt = await recovery.prepare(body);
    }
    async function sendCreate(currentAttempt) {
      let token;
      try {
        token = await getAccessToken();
      } catch (error) {
        recovery.discardIfSafe(currentAttempt.requestKey, error?.code || error?.message);
        throw error;
      }
      const requestBody = {
        ...body,
        checkoutRequestKey: currentAttempt.requestKey,
        checkoutToken: currentAttempt.checkoutToken,
      };
      const response = await request(paymentConfig.checkoutUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
        body: JSON.stringify(requestBody),
      }, 30_000);
      return { response, payload: await responsePayload(response), attempt: currentAttempt };
    }

    function accepted(result) {
      return result.response.ok && result.payload.orderNo &&
        result.payload.checkoutRequestKey === result.attempt.requestKey &&
        result.payload.checkoutToken === result.attempt.checkoutToken;
    }

    let result = await sendCreate(attempt);
    if (accepted(result)) return result.payload;
    const firstCode = String(result.payload.error || '').toLowerCase();
    if (result.response.status === 409 && firstCode === 'checkout_request_conflict') {
      const recovered = await statusLookup({
        checkoutUrl: paymentConfig.checkoutUrl, anonKey, recovery, getAccessToken, request,
      });
      if (recovered) return recovered;
      attempt = await recovery.prepare(body);
      result = await sendCreate(attempt);
      if (accepted(result)) return result.payload;
    }
    const code = result.payload.error || 'CHECKOUT_CREATE_FAILED';
    recovery.discardIfSafe(result.attempt.requestKey, code, result.response.status);
    throw checkoutError(code, result.response.status);
  }

  return Object.freeze({ create });
}
