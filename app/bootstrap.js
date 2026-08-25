import './vendor/recommendation-engine.js';
import { initInsightFilter } from './features/insights/insight-filter.js';
import { initInsightReader } from './features/insights/insight-reader.js';
import { initLegalModals } from './features/legal/legal-modals.js';
import { initHeroParallax } from './ui/hero-parallax.js?v=20260825-banner-contract-v2';
import { initRevealEffects } from './ui/reveal-effects.js';
import { initSiteHeader } from './ui/site-header.js';
import { initNavigationHistory } from './ui/navigation-history.js';
import { initWidthPreference } from './ui/width-preference.js';
import { initHomeBanners } from './features/home-banners/home-banners.js';
import { initHomeQuicklinks } from './features/home-quicklinks/home-quicklinks.js';
import { createHomeMerchandising } from './features/home-merchandising/home-merchandising.js';
import { initHomeRows } from './features/home-rows/home-rows.js';
import { initProductDetailRoute, initProductSharing } from './features/product-sharing/product-sharing.mjs';
import { createListingCatalog } from './services/listings/listing-catalog-service.js';
import { createPaymentAccessToken } from './services/payments/payment-auth.js';
import { createLegacyCollection } from './legacy/legacy-collection.js';
import { initLegacyHomeMerchandisingGrid } from './legacy/home-merchandising-grid.js';
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
  initHomeQuicklinks({ document, window, collection });
  const featured = initHomeBanners({ document, window, collection });
  const rows = initHomeRows({ document, window, collection });
  const merchandising = createHomeMerchandising({ window });
  const homeGrid = initLegacyHomeMerchandisingGrid({ document, window });

  createListingCatalog({ window }).subscribe((listings) => {
    const ranked = merchandising.update(listings);
    const recommended = ranked.recommended.items;
    homeGrid.update(recommended, ranked.recommended.audit);
    featured.update(recommended);
    rows.update(listings, { weeklySpecial: ranked.weeklySpecial.items });
  });
  initInsightFilter({ document });
  initInsightReader({ document });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
