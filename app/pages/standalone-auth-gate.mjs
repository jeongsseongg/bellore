export const STANDALONE_AUTH_POLICY = Object.freeze({
  mypage: 'required',
  orders: 'required',
  saved: 'required',
  recent: 'required',
  support: 'required',
  inquiry: 'public',
});

export function standaloneAuthPolicyFor(page) {
  return STANDALONE_AUTH_POLICY[page] || '';
}

export function standaloneReturnTo(locationObject) {
  return `${locationObject.pathname || '/'}${locationObject.search || ''}${locationObject.hash || ''}`;
}

export function standaloneLoginUrl(locationObject) {
  return `/login.html?returnTo=${encodeURIComponent(standaloneReturnTo(locationObject))}`;
}

function rejectAccess(locationObject, reason) {
  locationObject.replace(standaloneLoginUrl(locationObject));
  return { allowed: false, reason };
}

export async function enforceStandaloneAuth({ page, backend, client, locationObject }) {
  const policy = standaloneAuthPolicyFor(page);
  if (policy === 'public') return { allowed: true, policy };
  if (policy !== 'required') throw new Error(`standalone_auth_policy_missing:${page}`);

  try {
    await backend?.ready;
    if (!backend?.configured || !client?.auth?.getUser) {
      return rejectAccess(locationObject, 'auth_unavailable');
    }
    const result = await client.auth.getUser();
    if (result?.error || !result?.data?.user) {
      return rejectAccess(locationObject, 'signed_out');
    }
    return { allowed: true, policy, user: result.data.user };
  } catch (_) {
    return rejectAccess(locationObject, 'auth_check_failed');
  }
}
