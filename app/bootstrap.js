import { initLegalModals } from './features/legal/legal-modals.js';

function bootstrap() {
  initLegalModals({ document, window });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
