import { createSignupVerification } from '../../app/features/member-verification/signup-verification.js';
import { createMemberVerificationService } from '../../app/services/auth/member-verification-service.js';

const resultNode = document.getElementById('result');
const calls = { invoke: [], portOne: [] };

function responseFor(name) {
  if (name === 'verify-identity') {
    return { ok: true, phone: '01012345678', name: '홍길동', signupTicket: 'kg-ticket-runtime' };
  }
  return { ok: true };
}

const service = createMemberVerificationService({
  getClient: () => ({
    functions: {
      invoke: async (name, options) => {
        calls.invoke.push({ name, body: options.body });
        return { data: responseFor(name), error: null };
      },
    },
  }),
  getPortOne: () => ({
    requestIdentityVerification: async (request) => {
      calls.portOne.push(request);
      return { identityVerificationId: 'idv_provider_runtime' };
    },
  }),
  getVerifyConfig: () => ({ phone: { enabled: true, smsEnabled: false, channelKey: 'channel-runtime' } }),
  getPaymentConfig: () => ({ storeId: 'store-runtime' }),
});

const backend = {
  ...service,
  currentUser: () => null,
  verifyIdentityPortone: service.verifyIdentity,
};

function countInvoke(name) {
  return calls.invoke.filter((call) => call.name === name).length;
}

async function waitFor(predicate, label) {
  const deadline = performance.now() + 3000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error(`timeout:${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function requireValue(condition, label) {
  if (!condition) throw new Error(`assertion:${label}`);
}

try {
  createSignupVerification({
    document,
    form: document.getElementById('verificationFixture'),
    backend,
    config: {
      phone: { enabled: true, smsEnabled: false, channelKey: 'channel-runtime' },
      email: { enabled: false }, business: { enabled: false }, account: { enabled: false },
    },
  });

  document.querySelector('[data-vsend="phone"]').click();
  await waitFor(() => calls.portOne.length === 1 && countInvoke('verify-identity') === 1, 'easy-auth-complete');
  requireValue(countInvoke('send-phone-otp') === 0, 'solapi-send-must-not-run');
  requireValue(countInvoke('verify-phone-otp') === 0, 'solapi-verify-must-not-run');

  const payload = calls.portOne[0];
  requireValue(payload.customer === undefined, 'provider-popup-is-identity-source');
  requireValue(payload.bypass.inicisUnified.flgFixedUser === 'N', 'kg-popup-user');
  requireValue(payload.bypass.inicisUnified.directAgency === undefined, 'easy-auth-no-direct-agency');
  requireValue(document.getElementById('suName').value === '홍길동', 'verified-name-autofill');
  requireValue(document.getElementById('suPhone').value === '010-1234-5678', 'verified-phone-autofill');
  requireValue(document.querySelector('[data-phone-sms]').hidden === true, 'uncontracted-sms-hidden');

  resultNode.textContent = JSON.stringify({
    solapiSend: countInvoke('send-phone-otp'),
    solapiVerify: countInvoke('verify-phone-otp'),
    portOne: calls.portOne.length,
    identityVerify: countInvoke('verify-identity'),
    customer: payload.customer,
    fixedUser: payload.bypass.inicisUnified.flgFixedUser,
    verifiedName: document.getElementById('suName').value,
    verifiedPhone: document.getElementById('suPhone').value,
    smsHidden: document.querySelector('[data-phone-sms]').hidden,
    easyAgency: payload.bypass.inicisUnified.directAgency || null,
  });
  document.body.dataset.status = 'passed';
} catch (error) {
  resultNode.textContent = JSON.stringify({
    error: String(error?.message || error),
    invokes: calls.invoke,
    portOne: calls.portOne.length,
  });
  document.body.dataset.status = 'failed';
}
