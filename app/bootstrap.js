import './vendor/recommendation-engine.js?v=20260826-member-verification-live-v2';
import { initInsightFilter } from './features/insights/insight-filter.js';
import { initInsightReader } from './features/insights/insight-reader.js';
import { initLegalModals } from './features/legal/legal-modals.js';
import { initHeroParallax } from './ui/hero-parallax.js?v=20260825-home-typography-admin-layout-v8';
import { initRevealEffects } from './ui/reveal-effects.js';
import { initSiteHeader } from './ui/site-header.js';
import { initNavigationHistory } from './ui/navigation-history.js';
import { initWidthPreference } from './ui/width-preference.js';
import { initConditionGuide } from './features/condition-guide/condition-guide.js?v=20260826-member-verification-live-v2';
import { initHomeBanners } from './features/home-banners/home-banners.js?v=20260826-hero-layout-v7';
import { initHomeQuicklinks } from './features/home-quicklinks/home-quicklinks.js?v=20260826-hero-layout-v8';
import { createHomeMerchandising } from './features/home-merchandising/home-merchandising.js?v=20260826-member-verification-live-v2';
import { initHomeRows } from './features/home-rows/home-rows.js?v=20260826-home-row-hotfix-v1';
import { createListingAvailabilityUi } from './features/listing-availability/listing-availability-ui.js?v=20260826-member-verification-live-v2';
import { initProductDetailRoute, initProductSharing } from './features/product-sharing/product-sharing.mjs';
import { createListingCatalog } from './services/listings/listing-catalog-service.js?v=20260826-member-verification-live-v2';
import { effectiveListingStatus, listingAvailability, listingIsPurchasable, normalizeListingStatus } from './core/listing-display.js?v=20260826-member-verification-live-v2';
import { createPaymentAccessToken } from './services/payments/payment-auth.js?v=20260826-member-verification-live-v2';
import { createCheckoutRequestRecovery } from './services/payments/checkout-request-recovery.js?v=20260826-member-verification-live-v2';
import { createCheckoutClient } from './services/payments/checkout-client.js?v=20260826-member-verification-live-v2';
import { createPaymentNetwork } from './services/payments/payment-network.js?v=20260826-member-verification-live-v2';
import { createPendingPaymentRecovery } from './services/payments/pending-payment-recovery.js?v=20260826-member-verification-live-v2';
import { createLegacyCollection } from './legacy/legacy-collection.js?v=20260826-member-verification-live-v2';
import { initLegacyHomeMerchandisingGrid } from './legacy/home-merchandising-grid.js';
import { initHomeLayout } from './features/home-layout/home-layout.js?v=20260827-home-block-editor-v1';
import { createLegacyHomeLayoutAdapter } from './legacy/home-layout-adapter.js?v=20260827-home-block-editor-v1';
import { installLegacyPaymentAuth } from './legacy/payment-auth.js';
import { installLegacyReveal } from './legacy/legacy-reveal.js';
import { initCheckoutAddresses } from './features/checkout/checkout-addresses.mjs?v=20260826-shipping-address-popup-v2';
import { createPaymentFlow } from './features/checkout/payment-flow.js?v=20260826-member-verification-live-v2';
import { installCustomerFeedback } from './legacy/customer-feedback.js?v=20260826-member-verification-live-v2';
import { installLegacyCheckoutCoupon } from './legacy/checkout-coupon.js';
import { createLegacyMypageSettingsAdapter } from './legacy/mypage-settings-adapter.js?v=20260831-mypage-admin-contract-v1';
import { initMypageSettings } from './features/mypage-settings/mypage-settings.js?v=20260831-mypage-admin-contract-v1';
import { initSellServicePages } from './features/sell-method/sell-service-pages.js?v=20260826-sell-guest-access-v1';
import { installSellRequestAccess } from './services/sell/sell-request-access.js?v=20260826-sell-guest-access-v1';
import { installLegacyMemberVerificationUi } from './legacy/member-verification-ui.js?v=20260826-member-verification-live-v2';
import { installLegacyMemberVerificationService } from './legacy/member-verification-service.js?v=20260831-kg-sms-identity-v1';

installLegacyMemberVerificationUi({ window, document });
installLegacyMemberVerificationService({ window });
installSellRequestAccess({
  backend: window.NWBackend,
  getClient: () => window.sbClient,
  window,
});

// 레거시 상품 카드가 DOMContentLoaded에서 그려지기 전에 동일한 판매 상태 규칙을 노출한다.
Object.defineProperty(window, 'BELLORE_LISTING_AVAILABILITY', { configurable: true, value: Object.freeze({
  effective: effectiveListingStatus, get: listingAvailability, isPurchasable: listingIsPurchasable, normalize: normalizeListingStatus,
}) });
Object.defineProperty(window, 'BELLORE_LISTING_UI', { configurable: true, value: createListingAvailabilityUi({ document, window }) });
Object.defineProperty(window, 'BELLORE_PAYMENT_FLOW', { configurable: true, value: createPaymentFlow({ window }) });
Object.defineProperty(window, 'BELLORE_CHECKOUT_REQUEST_RECOVERY', { configurable: true, value: createCheckoutRequestRecovery({
  cryptoApi: window.crypto,
  getStorage: () => window.sessionStorage,
}) });
Object.defineProperty(window, 'BELLORE_CHECKOUT_CLIENT', { configurable: true, value: createCheckoutClient() });
Object.defineProperty(window, 'BELLORE_PAYMENT_NETWORK', { configurable: true, value: createPaymentNetwork({
  fetchImpl: window.fetch.bind(window), AbortControllerImpl: window.AbortController,
  setTimer: window.setTimeout.bind(window), clearTimer: window.clearTimeout.bind(window),
}) });
Object.defineProperty(window, 'BELLORE_PENDING_PAYMENT_RECOVERY', { configurable: true, value: createPendingPaymentRecovery({
  location: window.location, history: window.history, getStorage: () => window.sessionStorage,
}) });

function bootstrap() {
  installCustomerFeedback({ windowObject: window, logger: window.console });
  installLegacyCheckoutCoupon({ windowObject: window, documentObject: document });
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
  initHeroParallax({ document, window });
  initLegalModals({ document, window });
  initSellServicePages({ document, window, backend: window.NWBackend });
  initCheckoutAddresses({ document, window, getClient: () => window.sbClient, getUser: () => window.NWBackend?.currentUser?.() });
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
  initHomeQuicklinks({ document, window, collection });
  const featured = initHomeBanners({ document, window, collection });
  const rows = initHomeRows({ document, window, collection });
  initHomeLayout({
    document,
    window,
    service: createLegacyHomeLayoutAdapter({ window })
  });
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
  try {
    const pendingWishlistTab = window.sessionStorage.getItem('bellore_pending_wishlist_tab');
    if (['wish', 'cart', 'recent'].includes(pendingWishlistTab)) {
      window.sessionStorage.removeItem('bellore_pending_wishlist_tab');
      window.setTimeout(() => document.querySelector(`.wish-tab[data-wishtab="${pendingWishlistTab}"]`)?.click(), 0);
    }
  } catch { /* storage unavailable */ }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
