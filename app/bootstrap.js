import { initInsightFilter } from './features/insights/insight-filter.js';
import { initInsightReader } from './features/insights/insight-reader.js';
import { initLegalModals } from './features/legal/legal-modals.js';
import { initHeroParallax } from './ui/hero-parallax.js';
import { initSiteHeader } from './ui/site-header.js';
import { initHomeBanners } from './features/home-banners/home-banners.js?v=20260826-copy-cleanup-v1';
import { initHomeRows } from './features/home-rows/home-rows.js?v=20260826-card-trust-clean-v2';
import { createListingCatalog } from './services/listings/listing-catalog-service.js';
import { createLegacyCollection } from './legacy/legacy-collection.js?v=20260826-hero-collections-v3';

function bootstrap() {
  initSiteHeader({ document, window });
  initHeroParallax({ document, window });
  initLegalModals({ document, window });

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
