import { initInsightFilter } from './features/insights/insight-filter.js';
import { initInsightReader } from './features/insights/insight-reader.js';
import { initLegalModals } from './features/legal/legal-modals.js';
import { initHeroParallax } from './ui/hero-parallax.js';
import { initRevealEffects } from './ui/reveal-effects.js';
import { initSiteHeader } from './ui/site-header.js';
import { initNavigationHistory } from './ui/navigation-history.js';
import { initWidthPreference } from './ui/width-preference.js';
import { initConditionGuide } from './features/condition-guide/condition-guide.js?v=20260826-hero-layout-v10';
import { initSellServicePages } from './features/sell-method/sell-service-pages.js?v=20260826-sell-services-blue-v1';
import { initHomeBanners } from './features/home-banners/home-banners.js?v=20260826-hero-layout-v10';
import { createHomeMerchandising } from './features/home-merchandising/home-merchandising.js?v=20260826-admin-live-v4';
import { initHomeRows } from './features/home-rows/home-rows.js?v=20260826-hero-layout-v10';
import { initProductDetailRoute, initProductSharing } from './features/product-sharing/product-sharing.mjs';
import { createListingCatalog } from './services/listings/listing-catalog-service.js?v=20260826-admin-live-v4';
import { createPaymentAccessToken } from './services/payments/payment-auth.js';
import { createLegacyCollection } from './legacy/legacy-collection.js?v=20260826-hero-layout-v10';
import { initLegacyHomeMerchandisingGrid } from './legacy/home-merchandising-grid.js?v=20260826-admin-live-v4';
import { installLegacyPaymentAuth } from './legacy/payment-auth.js';
import { installLegacyReveal } from './legacy/legacy-reveal.js';
import { createLegacyMypageSettingsAdapter } from './legacy/mypage-settings-adapter.js?v=20260826-mypage-live-v1';
import { initMypageSettings } from './features/mypage-settings/mypage-settings.js?v=20260826-mypage-live-v1';
import { installLegacyMemberVerificationUi } from './legacy/member-verification-ui.js';
import { installLegacyMemberVerificationService } from './legacy/member-verification-service.js';

installLegacyMemberVerificationUi({ window, document });
installLegacyMemberVerificationService({ window });

function bootstrap() {
  installLegacyPaymentAuth({
    window,
    tokenProvider: createPaymentAccessToken({
      getAuth: () => window.sbClient?.auth,
      getAnonKey: () => window.BELLORE_SUPABASE?.anonKey,
    }),
  });
  initSiteHeader({ document, window });
  initNavigationHistory({ document, window });
  initWidthPreference({ document, getStorage: () => window.localStorage });
  initConditionGuide({ document, window });
  initSellServicePages({ document, window, backend: window.NWBackend });
  initHeroParallax({ document, window });
  initLegalModals({ document, window });
  initProductSharing({
    document,
    navigator: window.navigator,
    getCurrentProduct: () => window.BELLORE_currentProduct,
    notify: (message) => window.alert(message),
  });
  initProductDetailRoute({ document, window });
  const reveal = initRevealEffects({ document, window });
  installLegacyReveal({ window, reveal });

  const collection = createLegacyCollection({ document, window });
  const featured = initHomeBanners({ document, window, collection });
  const rows = initHomeRows({ document, window, collection });
  const merchandising = createHomeMerchandising({ window });
  const homeGrid = initLegacyHomeMerchandisingGrid({ document, window });
  let latestListings = [];

  function refreshHomeMerchandising() {
    if (!latestListings.length) return;
    const ranked = merchandising.update(latestListings, {
      weeklySpecialIds: rows.weeklySpecialIds(),
    });
    const recommended = ranked.recommended.items;
    homeGrid.update(recommended, ranked.recommended.audit);
    featured.update(recommended);
    rows.update(latestListings, { weeklySpecial: ranked.weeklySpecial.items });
  }

  rows.onSettingsChange(refreshHomeMerchandising);
  createListingCatalog({ window }).subscribe((listings) => {
    latestListings = listings;
    refreshHomeMerchandising();
  });
  initInsightFilter({ document });
  initInsightReader({ document });
  initMypageSettings({
    document,
    service: createLegacyMypageSettingsAdapter({ window })
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
