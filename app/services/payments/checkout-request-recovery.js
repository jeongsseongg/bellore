const STORAGE_KEY = 'bellore_checkout_request_v2';
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_64_RE = /^[0-9a-f]{64}$/;
const SAFE_REJECTION_CODES = new Set([
  'checkout_temporarily_unavailable', 'server_not_configured',
  'client_address_unavailable', 'request_too_large', 'invalid_json',
  'origin_forbidden', 'method_not_allowed',
  'payment_session_expired', 'payment_auth_not_ready',
  'checkout_request_invalid', 'checkout_token_invalid', 'listing_required',
  'checkout_amount_invalid', 'checkout_shipping_required', 'session_invalid',
  'unauthorized', 'checkout_rate_limited', 'listing_reserved',
  'listing_unavailable', 'listing_not_found', 'coupon_invalid',
  'coupon_reserved', 'guest_coupon_not_allowed', 'checkout_amount_changed',
  'checkout_amount_too_small', 'listing_price_invalid', 'attribution_invalid',
]);
const SAFE_PRE_REQUEST_CODES = new Set(['payment_session_expired', 'payment_auth_not_ready']);
const SAFE_503_CODES = new Set(['checkout_temporarily_unavailable', 'server_not_configured']);

function checkoutError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function uuidV4(cryptoApi) {
  if (typeof cryptoApi.randomUUID === 'function') {
    const value = cryptoApi.randomUUID().toLowerCase();
    if (UUID_V4_RE.test(value)) return value;
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = hex(bytes);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function sha256Hex(cryptoApi, value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await cryptoApi.subtle.digest('SHA-256', encoded);
  return hex(new Uint8Array(digest));
}

function fingerprintInput(payload) {
  return JSON.stringify({
    listingId: payload.listingId ?? null,
    couponUserId: payload.couponUserId ?? null,
    expectedAmount: payload.expectedAmount ?? null,
    fulfillmentMethod: payload.fulfillmentMethod ?? 'delivery',
    buyerName: payload.buyerName ?? null,
    buyerPhone: payload.buyerPhone ?? null,
    shipRecipient: payload.shipRecipient ?? null,
    shipPhone: payload.shipPhone ?? null,
    shipPostcode: payload.shipPostcode ?? null,
    shipAddr1: payload.shipAddr1 ?? null,
    shipAddr2: payload.shipAddr2 ?? null,
    shipRequest: payload.shipRequest ?? null,
  });
}

function validRecord(record) {
  return record && record.version === 2 && UUID_V4_RE.test(record.requestKey || '') &&
    HEX_64_RE.test(record.checkoutToken || '') && HEX_64_RE.test(record.payloadHash || '');
}

export function createCheckoutRequestRecovery({ cryptoApi, getStorage }) {
  function current() {
    try {
      const stored = JSON.parse(getStorage()?.getItem(STORAGE_KEY) || 'null');
      return validRecord(stored)
        ? Object.freeze({ requestKey: stored.requestKey, checkoutToken: stored.checkoutToken })
        : null;
    } catch (_error) {
      return null;
    }
  }

  async function prepare(payload) {
    if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== 'function') {
      throw checkoutError('checkout_recovery_unavailable');
    }
    let storage;
    try {
      storage = getStorage();
      if (!storage) throw new Error('storage unavailable');
    } catch (_error) {
      throw checkoutError('checkout_recovery_unavailable');
    }

    const payloadHash = await sha256Hex(cryptoApi, fingerprintInput(payload));
    let stored = null;
    try {
      stored = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    } catch (_error) {
      stored = null;
    }
    if (validRecord(stored) && stored.payloadHash === payloadHash) {
      return Object.freeze({
        requestKey: stored.requestKey,
        checkoutToken: stored.checkoutToken,
      });
    }
    if (validRecord(stored)) throw checkoutError('checkout_request_changed');

    const record = {
      version: 2,
      requestKey: uuidV4(cryptoApi),
      checkoutToken: hex(cryptoApi.getRandomValues(new Uint8Array(32))),
      payloadHash,
    };
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(record));
      const verified = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
      if (!validRecord(verified) || verified.requestKey !== record.requestKey ||
          verified.checkoutToken !== record.checkoutToken || verified.payloadHash !== payloadHash) {
        throw new Error('storage verification failed');
      }
    } catch (_error) {
      throw checkoutError('checkout_recovery_unavailable');
    }
    return Object.freeze({ requestKey: record.requestKey, checkoutToken: record.checkoutToken });
  }

  function clear(requestKey) {
    try {
      const storage = getStorage();
      const stored = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
      if (!stored || stored.requestKey === requestKey) storage?.removeItem(STORAGE_KEY);
    } catch (_error) {
      // A completed checkout must not fail merely because storage cleanup failed.
    }
  }

  function discardIfSafe(requestKey, code, status) {
    const normalized = String(code || '').toLowerCase();
    const httpStatus = Number(status);
    const safeStatus = (httpStatus >= 400 && httpStatus < 500) ||
      (httpStatus === 503 && SAFE_503_CODES.has(normalized)) ||
      (!Number.isFinite(httpStatus) && SAFE_PRE_REQUEST_CODES.has(normalized));
    if (!SAFE_REJECTION_CODES.has(normalized) || !safeStatus) return false;
    clear(requestKey);
    return true;
  }

  return Object.freeze({ prepare, current, complete: clear, discardIfSafe });
}

export const checkoutRecoveryStorageKey = STORAGE_KEY;
