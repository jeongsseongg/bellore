function paymentSessionError() {
  const error = new Error('PAYMENT_SESSION_EXPIRED');
  error.code = 'PAYMENT_SESSION_EXPIRED';
  return error;
}

function verifyToken(auth, token) {
  return auth.getUser(token).then((result) => {
    const user = result?.data?.user;
    if (!result || result.error || !user?.id) throw paymentSessionError();
    return token;
  });
}

export function createPaymentAccessToken({ getAuth, getAnonKey }) {
  return function paymentAccessToken(options = {}) {
    const auth = getAuth();
    const capabilityFallback = () => {
      const anonKey = options.confirmationCapability ? getAnonKey() : null;
      if (!anonKey) throw paymentSessionError();
      return anonKey;
    };
    if (!auth) return options.confirmationCapability
      ? Promise.resolve().then(capabilityFallback)
      : Promise.reject(new Error('PAYMENT_AUTH_NOT_READY'));
    return auth.getSession().then((sessionResult) => {
      if (sessionResult?.error) throw paymentSessionError();
      const session = sessionResult?.data?.session;
      if (!session?.access_token) return getAnonKey();

      // getSession reads browser storage. Verify it with Auth before a money path,
      // then refresh once so a stale or malformed cached token never reaches Edge.
      return verifyToken(auth, session.access_token).catch(() => {
        return auth.refreshSession().then((refreshResult) => {
          const refreshed = refreshResult?.data?.session;
          if (refreshResult?.error || !refreshed?.access_token) throw paymentSessionError();
          return verifyToken(auth, refreshed.access_token);
        });
      });
    }).catch((error) => options.confirmationCapability ? capabilityFallback() : Promise.reject(error));
  };
}
