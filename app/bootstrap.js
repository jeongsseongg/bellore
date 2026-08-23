import { initLegalModals } from './features/legal/legal-modals.js';
import { initSiteHeader } from './ui/site-header.js';
import { initHomeBanners } from './features/home-banners/home-banners.js';
import { createLegacyCollection } from './legacy/legacy-collection.js';

function bootstrap() {
  initSiteHeader({ document, window });
  initLegalModals({ document, window });
  initHomeBanners({
    document,
    window,
    collection: createLegacyCollection({ document, window }),
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
