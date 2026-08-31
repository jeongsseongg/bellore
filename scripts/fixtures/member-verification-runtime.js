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
  getVerifyConfig: () => ({ phone: { enabled: true, smsEnabled: true, channelKey: 'channel-runtime' } }),
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
      phone: { enabled: true, smsEnabled: true, channelKey: 'channel-runtime' },
      email: { enabled: false }, business: { enabled: false }, account: { enabled: false },
    },
  });

  document.querySelector('[data-vsend="phoneSms"]').click();
  await waitFor(() => calls.portOne.length === 1 && countInvoke('verify-identity') === 1, 'carrier-sms-complete');

  document.querySelector('[data-vsend="phone"]').click();
  await waitFor(() => calls.portOne.length === 2 && countInvoke('verify-identity') === 2, 'easy-auth-complete');
  requireValue(countInvoke('send-phone-otp') === 0, 'solapi-send-must-not-run');
  requireValue(countInvoke('verify-phone-otp') === 0, 'solapi-verify-must-not-run');

  const payload = calls.portOne[0];
  requireValue(payload.customer.fullName === '홍길동', 'kg-full-name');
  requireValue(payload.customer.phoneNumber === '01012345678', 'kg-phone');
  requireValue(payload.customer.birthYear === '1990', 'kg-birth-year');
  requireValue(payload.customer.birthMonth === '01', 'kg-birth-month');
  requireValue(payload.customer.birthDay === '02', 'kg-birth-day');
  requireValue(payload.bypass.inicisUnified.flgFixedUser === 'Y', 'kg-fixed-user');
  requireValue(payload.bypass.inicisUnified.directAgency === 'SMS', 'carrier-sms-agency');
  requireValue(calls.portOne[1].bypass.inicisUnified.directAgency === undefined, 'easy-auth-no-direct-agency');

  resultNode.textContent = JSON.stringify({
    solapiSend: countInvoke('send-phone-otp'),
    solapiVerify: countInvoke('verify-phone-otp'),
    portOne: calls.portOne.length,
    identityVerify: countInvoke('verify-identity'),
    customer: payload.customer,
    fixedUser: payload.bypass.inicisUnified.flgFixedUser,
    carrierAgency: payload.bypass.inicisUnified.directAgency,
    easyAgency: calls.portOne[1].bypass.inicisUnified.directAgency || null,
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
