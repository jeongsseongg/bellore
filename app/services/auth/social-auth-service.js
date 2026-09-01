import { createMemberVerificationService } from './member-verification-service.js?v=20260831-identity-provider-source-v1';
import {
  loadSocialProfileState,
  saveSocialProfile,
  socialProviderLabels,
} from '../../features/auth-social-completion/social-profile-data.mjs?v=20260902-social-profile-v1';

export function createSocialAuthService(windowObject = globalThis) {
  function client() {
    const value = windowObject.sbClient;
    if (!value) throw new Error('NOT_CONFIGURED');
    return value;
  }

  const verification = createMemberVerificationService({
    getClient: client,
    getPortOne: () => windowObject.PortOne,
    getVerifyConfig: () => windowObject.BELLORE_VERIFY,
    getPaymentConfig: () => windowObject.BELLORE_PAYMENTS,
  });

  async function getUser() {
    const result = await client().auth.getUser();
    if (result.error) throw result.error;
    return result.data?.user || null;
  }

  return Object.freeze({
    ready: () => Promise.resolve(windowObject.NWBackend?.ready),
    async loadSocialProfileState() {
      const user = await getUser();
      return user ? { user, state: await loadSocialProfileState({ client: client(), user }) } : null;
    },
    loadState: (user) => loadSocialProfileState({ client: client(), user }),
    saveSocialProfile: ({ user, state, values }) => saveSocialProfile({ client: client(), user, state, values }),
    socialProviderLabels: (user) => socialProviderLabels(user),
    getUser,
    verifyIdentity: () => verification.verifyIdentity(),
    completeIdentityVerification: (identityId) => verification.completeIdentityVerification(identityId),
    signOut: () => client().auth.signOut(),
  });
}
