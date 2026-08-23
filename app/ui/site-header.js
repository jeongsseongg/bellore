export function initSiteHeader({ document, window: browserWindow }) {
  const header = document.getElementById('header');
  if (!header) return { destroy() {} };

  function syncHeight() {
    const height = header.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--header-real-h', `${height}px`);
  }

  function syncScroll() {
    header.classList.toggle('scrolled', browserWindow.scrollY > 30);
  }

  syncHeight();

  const resizeObserver = browserWindow.ResizeObserver
    ? new browserWindow.ResizeObserver(syncHeight)
    : null;
  resizeObserver?.observe(header);
  browserWindow.addEventListener('scroll', syncScroll, { passive: true });

  return {
    destroy() {
      resizeObserver?.disconnect();
      browserWindow.removeEventListener('scroll', syncScroll);
    }
  };
}
