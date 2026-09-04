export function signupNotificationContext(analytics) {
  const consent = analytics?.consent?.() || {};
  const state = (value) => ['granted', 'denied', 'pending'].includes(value) ? value : 'unknown';
  const result = { analytics: state(consent.analytics), ads: state(consent.ads) };
  if (result.analytics !== 'granted') return result;
  const acquisition = analytics?.conversionContext?.() || {};
  const pick = (touch) => Object.fromEntries(
    ['channel', 'utm_source', 'utm_medium', 'utm_campaign', 'referrer_host']
      .filter((key) => typeof touch?.[key] === 'string')
      .map((key) => [key, touch[key].replace(/[\r\n\t]/g, ' ').slice(0, 100)]),
  );
  return { ...result, first: pick(acquisition.first_touch), session: pick(acquisition.session_touch) };
}

export function installSignupNotificationContext(windowObject = globalThis) {
  let lastKey = '';
  let inFlight = false;
  let resync = false;
  async function sync() {
    if (inFlight) { resync = true; return; }
    const client = windowObject.sbClient;
    if (!client?.auth) return;
    inFlight = true;
    try {
      const session = await client.auth.getSession();
      const user = session.data?.session?.user;
      if (!user) { lastKey = ''; return; }
      const context = signupNotificationContext(windowObject.BelloreAnalytics);
      const key = `${user.id}:${JSON.stringify(context)}`;
      if (key === lastKey) return;
      const result = await client.rpc('record_signup_notice_context', { p_context: context });
      if (result.error) throw new Error('SIGNUP_NOTICE_CONTEXT_FAILED');
      lastKey = key;
    } catch {
      windowObject.console?.warn('signup_notice_context_failed');
    } finally {
      inFlight = false;
      if (resync) { resync = false; await sync(); }
    }
  }
  windowObject.document.addEventListener('bellore:auth', sync);
  windowObject.document.addEventListener('bellore:analytics-consent', sync);
  windowObject.addEventListener('online', sync);
  Promise.resolve(windowObject.NWBackend?.ready).then(sync);
  return { sync };
}
