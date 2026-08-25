const OVERLAYS = '#productModal, #listingPage, #checkoutModal, #ordersModal, #myPageModal, #loginModal, #notiModal, #pwaInstallModal, #postModal, #partnerModal, #inquiryModal';
const CLOSE_CONTROL = '.pp-back, [data-pclose], [data-lpclose], .co-back, [data-myclose], [data-mclose], [data-noticlose], [data-pwa-close], [data-close], .login-close';

export function initNavigationHistory({ document, window }) {
  const back = document.getElementById('headerBack');
  const visibleOverlay = () => [...document.querySelectorAll(OVERLAYS)].find((element) => !element.hidden) || null;
  const closeOverlay = (overlay) => {
    const control = overlay.querySelector(CLOSE_CONTROL);
    if (control) control.click();
    else {
      overlay.hidden = true;
      document.body.style.overflow = '';
    }
  };
  const onHome = () => window.location.pathname === '/' &&
    (!window.location.hash || window.location.hash === '#home');
  const update = () => { if (back) back.hidden = onHome() && !visibleOverlay(); };

  back?.addEventListener('click', () => {
    const overlay = visibleOverlay();
    if (overlay) {
      closeOverlay(overlay);
      window.setTimeout(update, 30);
    } else {
      window.history.back();
    }
  });

  let pushed = false;
  try {
    const observer = new window.MutationObserver(() => {
      const overlay = visibleOverlay();
      if (overlay && !pushed) {
        pushed = true;
        window.history.pushState({ overlay: true }, '');
      }
      if (!overlay) pushed = false;
      update();
    });
    document.querySelectorAll(OVERLAYS).forEach((element) => {
      observer.observe(element, { attributes: true, attributeFilter: ['hidden'] });
    });
  } catch {
    // Navigation remains usable even when MutationObserver is unavailable.
  }

  window.addEventListener('popstate', () => {
    const overlay = visibleOverlay();
    if (overlay) {
      pushed = false;
      closeOverlay(overlay);
    }
    window.setTimeout(update, 30);
  });
  window.addEventListener('hashchange', update);
  update();
}
