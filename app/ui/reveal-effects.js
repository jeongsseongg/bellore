const DEFAULT_SELECTOR = '.section-title, .eyebrow, .recent-card, .option-card, .product-card, .insight-row, .brand-card, .promise-card, .brand-prev, .two-col-img, .two-col-text, .store-card, .contact-quick-card, .repair-card, .partner-stat, .ach-card, .method-row';

export function initRevealEffects({ document: doc, window: win, selector = DEFAULT_SELECTOR } = {}) {
  if (!doc?.querySelectorAll || !win) throw new TypeError('initRevealEffects requires document and window');

  const Observer = win.IntersectionObserver;
  if (typeof Observer !== 'function') {
    return { refresh() {}, destroy() {} };
  }

  const tracked = new Set();
  const scheduled = new Set();
  const timers = new Set();
  let destroyed = false;

  const observer = new Observer((entries) => {
    if (destroyed) return;
    entries.forEach((entry, index) => {
      if (!entry.isIntersecting || scheduled.has(entry.target)) return;

      observer.unobserve(entry.target);
      scheduled.add(entry.target);
      const timer = win.setTimeout(() => {
        timers.delete(timer);
        scheduled.delete(entry.target);
        tracked.delete(entry.target);
        if (!destroyed) entry.target.classList.add('in');
      }, index * 35);
      timers.add(timer);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

  function refresh() {
    if (destroyed) return;
    doc.querySelectorAll(selector).forEach((element) => {
      if (!element.classList.contains('reveal')) element.classList.add('reveal');
      if (!element.classList.contains('in') && !scheduled.has(element)) {
        tracked.add(element);
        observer.observe(element);
      }
    });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    observer.disconnect();
    timers.forEach((timer) => win.clearTimeout(timer));
    timers.clear();
    scheduled.clear();
    tracked.forEach((element) => element.classList.add('in'));
    tracked.clear();
  }

  refresh();
  return { refresh, destroy };
}
