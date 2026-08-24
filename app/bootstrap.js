import { initInsightFilter } from './features/insights/insight-filter.js';
import { initInsightReader } from './features/insights/insight-reader.js';
import { initLegalModals } from './features/legal/legal-modals.js';
import { initHeroParallax } from './ui/hero-parallax.js';
import { initRevealEffects } from './ui/reveal-effects.js';
import { initSiteHeader } from './ui/site-header.js';
import { initHomeBanners } from './features/home-banners/home-banners.js';
import { initHomeRows } from './features/home-rows/home-rows.js';
import { initProductDetailRoute, initProductSharing } from './features/product-sharing/product-sharing.mjs';
import { createListingCatalog } from './services/listings/listing-catalog-service.js';
import { createLegacyCollection } from './legacy/legacy-collection.js';
import { installLegacyReveal } from './legacy/legacy-reveal.js';

function bootstrap() {
  initSiteHeader({ document, window });
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
  const rows = initHomeRows({ document, collection });

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
