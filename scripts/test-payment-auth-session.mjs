import assert from 'node:assert/strict';
import { createPaymentAccessToken } from '../app/services/payments/payment-auth.js';

function provider(auth, anonKey = 'anon-public-key') {
  return createPaymentAccessToken({ getAuth: () => auth, getAnonKey: () => anonKey });
}

let getUserCalls = 0;
let refreshCalls = 0;
const guestToken = await provider({
  getSession: async () => ({ data: { session: null }, error: null })
})();
assert.equal(guestToken, 'anon-public-key');

const validToken = await provider({
  getSession: async () => ({ data: { session: { access_token: 'user-token' } }, error: null }),
  getUser: async () => {
    getUserCalls += 1;
    return { data: { user: { id: 'user-id' } }, error: null };
  },
  refreshSession: async () => {
    refreshCalls += 1;
    throw new Error('refresh must not run for a valid token');
  }
})();
assert.equal(validToken, 'user-token');
assert.equal(getUserCalls, 1);
assert.equal(refreshCalls, 0);

getUserCalls = 0;
refreshCalls = 0;
const recoveredToken = await provider({
  getSession: async () => ({ data: { session: { access_token: 'stale-token' } }, error: null }),
  getUser: async (token) => {
    getUserCalls += 1;
    return token === 'fresh-token'
      ? { data: { user: { id: 'user-id' } }, error: null }
      : { data: { user: null }, error: { code: 'bad_jwt' } };
  },
  refreshSession: async () => {
    refreshCalls += 1;
    return { data: { session: { access_token: 'fresh-token' } }, error: null };
  }
})();
assert.equal(recoveredToken, 'fresh-token');
assert.equal(getUserCalls, 2);
assert.equal(refreshCalls, 1);

await assert.rejects(provider({
  getSession: async () => ({ data: { session: { access_token: 'broken-token' } }, error: null }),
  getUser: async () => ({ data: { user: null }, error: { code: 'bad_jwt' } }),
  refreshSession: async () => ({ data: { session: null }, error: { code: 'refresh_failed' } })
})(), (error) => error.code === 'PAYMENT_SESSION_EXPIRED');

const capabilityFallbackToken = await provider({
  getSession: async () => ({ data: { session: { access_token: 'expired-token' } }, error: null }),
  getUser: async () => ({ data: { user: null }, error: { code: 'bad_jwt' } }),
  refreshSession: async () => ({ data: { session: null }, error: { code: 'refresh_failed' } }),
})({ confirmationCapability: 'server-issued-checkout-token' });
assert.equal(capabilityFallbackToken, 'anon-public-key',
  'an expired login must not prevent verification of the same capability-bound order');

console.log('payment auth session recovery: ok');
