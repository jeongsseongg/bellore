import { createMemberVerificationService } from './member-verification-service.js';

export function getAuthSignupBackend(windowObject) {
  const verification = createMemberVerificationService({
    getClient: () => windowObject.sbClient,
    getPortOne: () => windowObject.PortOne,
    getVerifyConfig: () => windowObject.BELLORE_VERIFY,
    getPaymentConfig: () => windowObject.BELLORE_PAYMENTS,
  });
  Object.defineProperty(windowObject, 'BelloreMemberVerificationService', { configurable: true, value: verification });
  return { backend: windowObject.NWBackend, verification };
}
