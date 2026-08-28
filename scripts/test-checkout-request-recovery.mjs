import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  checkoutRecoveryStorageKey,
  createCheckoutRequestRecovery,
} from '../app/services/payments/checkout-request-recovery.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const payload = {
  listingId: '123e4567-e89b-42d3-a456-426614174000',
  couponUserId: null,
  expectedAmount: 1300,
  fulfillmentMethod: 'delivery',
  buyerName: '테스트 구매자',
  buyerPhone: '01012345678',
  shipRecipient: '테스트 수령인',
  shipPhone: '01012345678',
  shipPostcode: '04570',
  shipAddr1: '서울 중구 다산로 258',
  shipAddr2: '1716',
  shipRequest: null,
  attribution: { event_id: 'first-event' },
};

const storage = new MemoryStorage();
const recovery = createCheckoutRequestRecovery({ cryptoApi: webcrypto, getStorage: () => storage });
const [first, concurrentRetry] = await Promise.all([
  recovery.prepare(payload),
  recovery.prepare(payload),
]);
assert.deepEqual(concurrentRetry, first, 'same-tab concurrent preparation must reuse one request identity');
assert.match(first.requestKey, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.match(first.checkoutToken, /^[0-9a-f]{64}$/);

const storedText = storage.getItem(checkoutRecoveryStorageKey);
assert(storedText, 'request identity must be stored before the network request');
assert(storedText.includes(first.checkoutToken));
assert(!storedText.includes(payload.buyerName) && !storedText.includes(payload.shipAddr1),
  'browser recovery storage must contain only hashes and random credentials, not checkout PII');

const afterReload = createCheckoutRequestRecovery({ cryptoApi: webcrypto, getStorage: () => storage });
assert.deepEqual(await afterReload.prepare({
  ...payload,
  attribution: { event_id: 'analytics-may-rotate-without-changing-the-order' },
}), first, 'a browser-session retry must recover the same request and capability');

await assert.rejects(
  afterReload.prepare({ ...payload, expectedAmount: 1400 }),
  { code: 'checkout_request_changed' },
  'changed input must not overwrite a possibly committed unresolved order capability',
);
await assert.rejects(
  afterReload.prepare({ ...payload, fulfillmentMethod: 'pickup' }),
  { code: 'checkout_request_changed' },
  'changed fulfillment must not reuse a delivery checkout identity',
);
assert.equal(JSON.parse(storage.getItem(checkoutRecoveryStorageKey)).requestKey, first.requestKey);
assert.equal(afterReload.discardIfSafe(first.requestKey, 'checkout_request_conflict', 409), false,
  'a DB conflict proves the request exists and must retain its capability');
assert.equal(storage.getItem(checkoutRecoveryStorageKey) !== null, true);
for (const [ambiguous, status] of [['checkout_failed', 500], ['checkout_response_invalid', 502], ['network_error', undefined]]) {
  assert.equal(afterReload.discardIfSafe(first.requestKey, ambiguous, status), false,
    `${ambiguous} must preserve a possibly committed request capability`);
}
assert.equal(afterReload.discardIfSafe(first.requestKey, 'listing_unavailable', 500), false,
  'a known code on an ambiguous 5xx response must not release the attempt');
assert.equal(afterReload.discardIfSafe(first.requestKey, 'listing_unavailable', 409), true,
  'an explicit pre-commit domain rejection may release the browser attempt');
assert.equal(storage.getItem(checkoutRecoveryStorageKey), null);

const authAttempt = await afterReload.prepare(payload);
assert.equal(afterReload.discardIfSafe(authAttempt.requestKey, 'PAYMENT_SESSION_EXPIRED'), true,
  'a browser authentication failure before checkout fetch may release the attempt');
const configAttempt = await afterReload.prepare(payload);
assert.equal(afterReload.discardIfSafe(configAttempt.requestKey, 'server_not_configured', 503), true,
  'an explicit pre-commit 503 configuration rejection may release the attempt');

const unavailable = createCheckoutRequestRecovery({
  cryptoApi: webcrypto,
  getStorage() { throw new Error('blocked'); },
});
await assert.rejects(unavailable.prepare(payload), { code: 'checkout_recovery_unavailable' });

console.log('checkout request response-loss browser recovery: ok');
