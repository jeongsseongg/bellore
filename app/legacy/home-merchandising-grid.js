/* 레거시 홈 카드 마크업은 그대로 두고, 엔진이 준 ID 순서만 DOM에 반영한다. */

export function initLegacyHomeMerchandisingGrid({ document: doc, window: win }) {
  const grid = doc.querySelector('#homeOnSale .home-sale-grid');
  let rankedIds = [];
  let algorithmVersion = 'pending';
  let scheduled = false;

  function apply() {
    scheduled = false;
    if (!grid || !rankedIds.length) return;
    const cards = Array.from(grid.querySelectorAll(':scope > .hcard-dynamic'));
    if (!cards.length) return;
    const byId = new Map(cards.map((card) => [String(card.dataset.pid || ''), card]));
    const ordered = rankedIds.map((id) => byId.get(String(id))).filter(Boolean);
    const used = new Set(ordered);
    cards.forEach((card) => { if (!used.has(card)) ordered.push(card); });
    if (ordered.some((card, index) => cards[index] !== card)) {
      const fragment = doc.createDocumentFragment();
      ordered.forEach((card) => fragment.appendChild(card));
      grid.appendChild(fragment);
    }
    grid.dataset.algorithmVersion = algorithmVersion;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    if (typeof win.queueMicrotask === 'function') win.queueMicrotask(apply);
    else win.setTimeout(apply, 0);
  }

  if (grid && typeof win.MutationObserver === 'function') {
    new win.MutationObserver(schedule).observe(grid, { childList: true });
  }

  return {
    update(items, audit) {
      rankedIds = (items || []).map((item) => String(item.id));
      algorithmVersion = audit && audit.algorithm_version || 'fallback-latest';
      schedule();
    },
  };
}
