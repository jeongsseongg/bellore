import assert from 'node:assert/strict';
import { createMemberVerificationService } from '../app/services/auth/member-verification-service.js';

const calls = [];
const user = { id: 'user-1', email: 'partner@example.com' };
const client = {
  auth: {
    getUser: async () => ({ data: { user } }),
    updateUser: async () => ({ data: { user }, error: null }),
  },
  functions: {
    invoke: async (name, options) => {
      calls.push({ kind: 'edge', name, body: options.body });
      return { data: { ok: true }, error: null };
    },
  },
  rpc: async (name, body) => {
    calls.push({ kind: 'rpc', name, body });
    return { data: { submitted: true, approved: false, verificationDeferred: false }, error: null };
  },
};
const service = createMemberVerificationService({
  getClient: () => client,
  getPortOne: () => null,
  getVerifyConfig: () => ({}),
  getPaymentConfig: () => ({}),
});

await service.completeOtpSignup({
  data: { role: 'partner', username: 'partner1', name: '파트너', password: 'password1' },
  metadata: { role: 'partner' },
  signupEmail: user.email,
});

assert.deepEqual(calls.map(({ kind, name }) => `${kind}:${name}`), [
  'edge:complete-otp-signup',
  'rpc:submit_member_onboarding',
]);
assert.deepEqual(calls[1].body, { p_defer_verification: false });

calls.length = 0;
await service.completeOtpSignup({
  data: { role: 'customer', username: 'customer1', name: '고객', password: 'password1' },
  metadata: { role: 'customer' },
  signupEmail: user.email,
});
assert.deepEqual(calls.map(({ kind, name }) => `${kind}:${name}`), ['edge:complete-otp-signup']);

console.log('member onboarding submit contract: partner=edge+rpc customer=edge passed');
