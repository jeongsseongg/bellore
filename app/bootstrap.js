import { initInsightFilter } from './features/insights/insight-filter.js';
import { initInsightReader } from './features/insights/insight-reader.js';
import { initLegalModals } from './features/legal/legal-modals.js';
import { initHeroParallax } from './ui/hero-parallax.js';
import { initRevealEffects } from './ui/reveal-effects.js';
import { initSiteHeader } from './ui/site-header.js';
import { initNavigationHistory } from './ui/navigation-history.js';
import { initWidthPreference } from './ui/width-preference.js';
import { initConditionGuide } from './features/condition-guide/condition-guide.js?v=20260826-hero-layout-v10';
import { initHomeBanners } from './features/home-banners/home-banners.js?v=20260826-hero-layout-v10';
import { initHomeRows } from './features/home-rows/home-rows.js?v=20260826-hero-layout-v10';
import { initProductDetailRoute, initProductSharing } from './features/product-sharing/product-sharing.mjs';
import { createListingCatalog } from './services/listings/listing-catalog-service.js';
import { createPaymentAccessToken } from './services/payments/payment-auth.js';
import { createLegacyCollection } from './legacy/legacy-collection.js?v=20260826-hero-layout-v10';
import { installLegacyPaymentAuth } from './legacy/payment-auth.js';
import { installLegacyReveal } from './legacy/legacy-reveal.js';

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

  createListingCatalog({ window }).subscribe((listings) => {
    featured.update(listings);
    rows.update(listings);
  });
  initInsightFilter({ document });
  initInsightReader({ document });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
