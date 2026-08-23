const HASH_TO_MODAL = Object.freeze({
  '#privacy-policy': 'privacy'
});

export function legalKeyFromHash(hash) {
  return HASH_TO_MODAL[String(hash || '')] || null;
}

export function initLegalModals({ document: doc, window: browserWindow }) {
  if (!doc || !browserWindow) throw new Error('legal modals require document and window');

  const modals = {
    biz: doc.getElementById('bizInfoModal'),
    terms: doc.getElementById('termsModal'),
    privacy: doc.getElementById('privacyModal'),
    refund: doc.getElementById('refundModal'),
    guide: doc.getElementById('guideModal')
  };
  const legacyOpen = doc.getElementById('bizInfoOpen');

  function show(key) {
    const modal = modals[key];
    if (!modal) return;
    modal.hidden = false;
    doc.body.style.overflow = 'hidden';
  }

  function hideAll() {
    Object.values(modals).forEach((modal) => {
      if (modal) modal.hidden = true;
    });
    doc.body.style.overflow = '';
  }

  function showFromHash() {
    const key = legalKeyFromHash(browserWindow.location.hash);
    if (key) show(key);
  }

  function onLegacyOpen() {
    show('biz');
  }

  function onDocumentClick(event) {
    const target = event.target;
    const opener = target?.closest?.('[data-legal-open]');
    if (opener) {
      show(opener.getAttribute('data-legal-open'));
      return;
    }
    if (target?.hasAttribute?.('data-bizclose')) hideAll();
  }

  function onDocumentKeydown(event) {
    if (event.key === 'Escape') hideAll();
  }

  legacyOpen?.addEventListener('click', onLegacyOpen);
  doc.addEventListener('click', onDocumentClick);
  doc.addEventListener('keydown', onDocumentKeydown);
  browserWindow.addEventListener('hashchange', showFromHash);
  showFromHash();

  return Object.freeze({
    show,
    hideAll,
    showFromHash,
    destroy() {
      legacyOpen?.removeEventListener('click', onLegacyOpen);
      doc.removeEventListener('click', onDocumentClick);
      doc.removeEventListener('keydown', onDocumentKeydown);
      browserWindow.removeEventListener('hashchange', showFromHash);
    }
  });
}
