import { createSignupVerification } from '../../app/features/member-verification/signup-verification.js';
import { createMemberVerificationService } from '../../app/services/auth/member-verification-service.js';

const resultNode = document.getElementById('result');
const calls = { invoke: [], portOne: [] };

function responseFor(name) {
  if (name === 'send-phone-otp') return { ok: true, challenge: 'challenge-runtime' };
  if (name === 'verify-phone-otp') {
    return { ok: true, phone: '01012345678', signupTicket: 'sms-ticket-runtime' };
  }
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

  document.querySelector('[data-vsend="phoneOtp"]').click();
  await waitFor(() => countInvoke('send-phone-otp') === 1 && !document.querySelector('.vrow-code').hidden, 'sms-send');
  requireValue(calls.portOne.length === 0, 'sms-must-not-call-portone');

  document.querySelector('[data-vconfirm="phoneOtp"]').click();
  await waitFor(() => countInvoke('verify-phone-otp') === 1, 'sms-verify');

  document.querySelector('[data-vsend="phone"]').click();
  await waitFor(() => calls.portOne.length === 1 && countInvoke('verify-identity') === 1, 'kg-complete');
  requireValue(countInvoke('send-phone-otp') === 1, 'kg-must-not-send-another-sms');

  const payload = calls.portOne[0];
  requireValue(payload.customer.fullName === '홍길동', 'kg-full-name');
  requireValue(payload.customer.phoneNumber === '01012345678', 'kg-phone');
  requireValue(payload.customer.birthYear === '1990', 'kg-birth-year');
  requireValue(payload.customer.birthMonth === '01', 'kg-birth-month');
  requireValue(payload.customer.birthDay === '02', 'kg-birth-day');
  requireValue(payload.bypass.inicisUnified.flgFixedUser === 'Y', 'kg-fixed-user');

  resultNode.textContent = JSON.stringify({
    smsSend: countInvoke('send-phone-otp'),
    smsVerify: countInvoke('verify-phone-otp'),
    portOne: calls.portOne.length,
    identityVerify: countInvoke('verify-identity'),
    customer: payload.customer,
    fixedUser: payload.bypass.inicisUnified.flgFixedUser,
  });
  document.body.dataset.status = 'passed';
} catch (error) {
  resultNode.textContent = JSON.stringify({
    error: String(error?.message || error),
    invokes: calls.invoke,
    portOne: calls.portOne.length,
    code: document.getElementById('suPhoneCode')?.value || '',
  });
  document.body.dataset.status = 'failed';
}
