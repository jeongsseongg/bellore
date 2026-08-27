const dependencies = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  '/ui-dialog.js?v=20260826-member-verification-live-v2',
  '/supabase-config.js?v=20260826-naverpay-live-v2',
  '/analytics-core.js?v=20260810-analytics-v3',
  '/analytics-client.js?v=20260826-ai-consent-v1',
  '/brands.js',
  '/supabase.js?v=20260827-signup-identity-v1',
  '/bellore-features.js?v=20260827-mypage-contracts-v1',
  '/cq-demo.js?v=20260826-member-verification-live-v2',
  '/script.js?v=20260827-mypage-contracts-v1',
  '/app/legacy/recommendation-engine.js?v=20260826-member-verification-live-v2',
  '/wishlist.js?v=20260826-member-verification-live-v2',
  '/alerts.js?v=20260820-tabs-alerts-v1',
  '/auction.js?v=20260826-member-verification-live-v2',
  '/search.js?v=20260826-member-verification-live-v2',
  '/ai-advisor.js?v=20260826-member-verification-live-v2',
  '/ai-advisor-admin.js?v=20260826-member-verification-live-v2',
  '/payments.js?v=20260826-member-verification-live-v2',
  '/naverpay.js?v=20260826-naverpay-live-v1',
  '/app/legacy/page-runtime.js?v=20260826-naverpay-live-v1'
];

const mypageSupportIds = [
  'bizInfoModal', 'termsModal', 'privacyModal', 'refundModal', 'guideModal',
  'partnerModal', 'adminPanel', 'notiPage', 'profilePage', 'settingsPage', 'postModal'
];

async function hydrateMypageSupport() {
  if (document.body?.dataset.belloreStandalonePage !== 'mypage') return;
  const response = await fetch('/index.html');
  if (!response.ok) throw new Error(`standalone_shell_failed:${response.status}`);
  const source = new DOMParser().parseFromString(await response.text(), 'text/html');
  const missing = [];
  for (const id of mypageSupportIds) {
    if (document.getElementById(id)) continue;
    const node = source.getElementById(id);
    if (!node) {
      missing.push(id);
      continue;
    }
    document.body.append(node.cloneNode(true));
  }
  if (missing.length) throw new Error(`standalone_shell_contract_missing:${missing.join(',')}`);
}

function loadClassicScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`standalone_dependency_failed:${src}`));
    document.head.append(script);
  });
}

await hydrateMypageSupport();
for (const dependency of dependencies) await loadClassicScript(dependency);
await import('/app/bootstrap.js?v=20260827-mypage-contracts-v1');

async function waitForLegacyOpen(name, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const candidate = globalThis[name];
    if (typeof candidate === 'function') return candidate;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`standalone_legacy_ready_timeout:${name}`);
}

async function openStandalonePage() {
  const page = document.body?.dataset.belloreStandalonePage;
  if (page === 'mypage') {
    const openMyPage = await waitForLegacyOpen('BELLORE_openMyPage');
    openMyPage();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => void openStandalonePage(), { once: true });
} else {
  await openStandalonePage();
}
