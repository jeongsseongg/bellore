export function createMemberVerificationService({ getClient, getPortOne, getVerifyConfig, getPaymentConfig }) {
  function client() {
    const value = getClient();
    if (!value) throw new Error('NOT_CONFIGURED');
    return value;
  }

  async function invoke(name, body) {
    const response = await client().functions.invoke(name, { body });
    if (response.error) {
      let payload = response.data;
      if (!payload && response.error.context?.clone) {
        try { payload = await response.error.context.clone().json(); } catch { /* use SDK error */ }
      }
      const code = payload?.code || response.error.code || response.error.message || 'VERIFICATION_FAILED';
      const error = new Error(code);
      error.code = code;
      throw error;
    }
    if (!response.data?.ok) throw new Error(response.data?.code || 'VERIFICATION_FAILED');
    return response.data;
  }

  async function completeOtpSignup({ data, metadata, signupEmail }) {
    const auth = client().auth;
    const current = await auth.getUser();
    const user = current.data?.user;
    if (!user?.email || !signupEmail || user.email.toLowerCase() !== signupEmail.toLowerCase()) return null;
    const updated = await auth.updateUser({ password: data.password, data: metadata });
    if (updated.error) throw updated.error;
    await invoke('complete-otp-signup', {
      username: data.username, displayName: data.name || '', role: data.role,
      companyName: data.company || null, bizName: data.bizName || null,
      phone: data.phone || null, phoneVerificationTicket: data.phoneVerificationTicket || null,
      postcode: data.postcode || null,
      addr1: data.addr1 || null, addr2: data.addr2 || null,
      businessNo: data.businessNo || null, ceoName: data.ceoName || null,
      bizOpenDate: data.bizOpenDate || null, bankName: data.bank || null,
      bankAccount: data.account || null, bankHolder: data.holder || null,
    });
    return updated.data?.user || user;
  }

  async function sendEmailOtp(email, options) {
    const address = String(email || '').trim();
    if (!address) throw new Error('NO_EMAIL');
    const response = await client().auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: !!options?.shouldCreateUser },
    });
    if (response.error) throw response.error;
    return true;
  }

  async function verifyEmailOtp(email, token) {
    const response = await client().auth.verifyOtp({
      email: String(email || '').trim(),
      token: String(token || '').trim(),
      type: 'email',
    });
    if (response.error) throw response.error;
    const verification = await invoke('sync-email-verification', {});
    return { verification, user: response.data?.user || null };
  }

  function identityReturnUrl() {
    if (!globalThis.location) return undefined;
    const url = new URL(globalThis.location.href);
    url.searchParams.set('belloreIdentityReturn', '1');
    url.searchParams.delete('identityVerificationId');
    url.searchParams.delete('code');
    url.searchParams.delete('message');
    return url.toString();
  }

  async function completeIdentityVerification(identityVerificationId) {
    const value = String(identityVerificationId || '').trim();
    if (!value) throw new Error('BAD_IDENTITY_ID');
    const result = await invoke('verify-identity', { identityVerificationId: value });
    if (result?.signupTicket) {
      try { globalThis.sessionStorage?.setItem('belloreSignupPhoneTicket', result.signupTicket); } catch { /* storage unavailable */ }
    }
    return result;
  }

  async function verifyIdentity(options) {
    const verify = getVerifyConfig()?.phone || {};
    const payment = getPaymentConfig() || {};
    const portOne = getPortOne();
    if (!portOne || !payment.storeId || !verify.channelKey) throw new Error('NOT_CONFIGURED');
    const randomId = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    const identityVerificationId = `idv_${randomId}`;
    try { globalThis.sessionStorage?.setItem('belloreIdentityVerificationId', identityVerificationId); } catch { /* storage unavailable */ }
    const agency = options?.agency === 'SMS' ? 'SMS' : null;
    const response = await portOne.requestIdentityVerification({
      storeId: payment.storeId,
      identityVerificationId,
      channelKey: verify.channelKey,
      redirectUrl: identityReturnUrl(),
      bypass: { inicisUnified: { flgFixedUser: 'N', ...(agency ? { directAgency: agency } : {}) } },
    });
    if (response?.code != null) {
      const error = new Error(response.message || 'IDENTITY_FAILED');
      error.code = response.code || 'IDENTITY_FAILED';
      throw error;
    }
    const result = await completeIdentityVerification(response?.identityVerificationId || identityVerificationId);
    try { globalThis.sessionStorage?.removeItem('belloreIdentityVerificationId'); } catch { /* storage unavailable */ }
    return result;
  }

  async function verifyAccount(data) {
    return invoke('verify-account', {
      bank: String(data?.bank || '').trim(),
      account: String(data?.account || '').replace(/\D/g, ''),
      holder: String(data?.holder || '').trim(),
    });
  }

  async function verifyBusiness(data) {
    return invoke('verify-business', {
      b_no: String(data?.businessNo || '').replace(/\D/g, ''),
      start_dt: String(data?.bizOpenDate || '').replace(/\D/g, ''),
      p_nm: String(data?.ceoName || '').trim(),
    });
  }

  function setAdminStatus(targetUserId, method, verified, reason) {
    return invoke('admin-manage-verification', {
      action: 'set_status', targetUserId, method, verified: !!verified, reason,
    });
  }

  return {
    completeOtpSignup,
    sendEmailOtp,
    verifyEmailOtp,
    verifyIdentity,
    completeIdentityVerification,
    verifyAccount,
    verifyBusiness,
    setAdminStatus,
  };
}
