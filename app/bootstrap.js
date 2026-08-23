import { initLegalModals } from './features/legal/legal-modals.js';
import { initSiteHeader } from './ui/site-header.js';

function bootstrap() {
  initSiteHeader({ document, window });
  initLegalModals({ document, window });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
