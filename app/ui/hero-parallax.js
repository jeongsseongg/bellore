export function initHeroParallax({ document, window: browserWindow }) {
  const heroImage = document.querySelector('.hero-image');
  if (!heroImage) return { destroy() {} };
  if (heroImage.closest?.('.hero-default')) {
    heroImage.style.transform = 'none';
    return { destroy() {} };
  }

  function syncScroll() {
    const scrollY = browserWindow.scrollY;
    if (scrollY < browserWindow.innerHeight) {
      heroImage.style.transform = `translateY(${scrollY * 0.3}px) scale(1.05)`;
    }
  }

  browserWindow.addEventListener('scroll', syncScroll, { passive: true });

  return {
    destroy() {
      browserWindow.removeEventListener('scroll', syncScroll);
    }
  };
}
