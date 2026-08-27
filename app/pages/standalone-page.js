import {
  enforceStandaloneAuth,
  standaloneAuthPolicyFor,
} from './standalone-auth-gate.mjs?v=20260828-standalone-auth-v1';

const authDependencies = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  '/supabase-config.js?v=20260828-phone-auth-paths-v1',
  '/supabase.js?v=20260828-phone-auth-paths-v1',
];

const pageDependencies = [
  '/ui-dialog.js?v=20260826-member-verification-live-v2',
  '/analytics-core.js?v=20260810-analytics-v3',
  '/analytics-client.js?v=20260826-ai-consent-v1',
  '/brands.js',
  '/bellore-features.js?v=20260828-phone-auth-paths-v1',
  '/cq-demo.js?v=20260826-member-verification-live-v2',
  '/script.js?v=20260828-complete-site-v1',
  '/app/legacy/recommendation-engine.js?v=20260826-member-verification-live-v2',
  '/wishlist.js?v=20260826-member-verification-live-v2',
  '/alerts.js?v=20260820-tabs-alerts-v1',
  '/auction.js?v=20260826-member-verification-live-v2',
  '/search.js?v=20260826-member-verification-live-v2',
  '/ai-advisor.js?v=20260826-member-verification-live-v2',
  '/ai-advisor-admin.js?v=20260826-member-verification-live-v2',
  '/payments.js?v=20260828-complete-site-v1',
  '/naverpay.js?v=20260826-naverpay-live-v1',
  '/app/legacy/page-runtime.js?v=20260826-naverpay-live-v1'
];

function loadClassicScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`standalone_dependency_failed:${src}`));
    document.head.append(script);
  });
}

const page = document.body?.dataset.belloreStandalonePage || '';
const declaredPolicy = document.body?.dataset.standaloneAuth || '';
const expectedPolicy = standaloneAuthPolicyFor(page);
if (!expectedPolicy || declaredPolicy !== expectedPolicy) {
  throw new Error(`standalone_auth_policy_mismatch:${page}`);
}

for (const dependency of authDependencies) await loadClassicScript(dependency);

const authResult = await enforceStandaloneAuth({
  page,
  backend: window.NWBackend,
  client: window.sbClient,
  locationObject: window.location,
});

if (authResult.allowed && page === 'mypage') {
  window.location.replace('/?view=mypage');
} else if (authResult.allowed) {
  document.body.dataset.standaloneAuthReady = 'true';
  for (const dependency of pageDependencies) await loadClassicScript(dependency);
  await import('/app/bootstrap.js?v=20260828-complete-site-v1');
}
