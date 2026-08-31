import { createMemberVerificationService } from './member-verification-service.js?v=20260831-identity-provider-source-v1';

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
