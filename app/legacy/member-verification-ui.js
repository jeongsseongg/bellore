import { createSignupVerification } from '../features/member-verification/signup-verification.js';

export function installLegacyMemberVerificationUi({ window, document }) {
  Object.defineProperty(window, 'BelloreMemberVerificationUi', {
    configurable: true,
    value: {
      create({ form, backend, config }) {
        return createSignupVerification({ document, form, backend, config });
      },
    },
  });
}
