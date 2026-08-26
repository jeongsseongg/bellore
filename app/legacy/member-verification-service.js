import { createMemberVerificationService } from '../services/auth/member-verification-service.js';

export function installLegacyMemberVerificationService({ window }) {
  Object.defineProperty(window, 'BelloreMemberVerificationService', {
    configurable: true,
    value: createMemberVerificationService({
      getClient: () => window.sbClient,
      getPortOne: () => window.PortOne,
      getVerifyConfig: () => window.BELLORE_VERIFY,
      getPaymentConfig: () => window.BELLORE_PAYMENTS,
    }),
  });
}
