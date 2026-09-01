const PREFERENCE_KEY = 'bellore_notification_preferences_v1';

function notificationCategory(type) {
  if (/^(order|payment|refund)/.test(type || '')) return 'order';
  if (/^(shipping|delivery|tracking)/.test(type || '')) return 'delivery';
  if (['quote_open', 'quote_new', 'bid_new', 'awarded', 'sale_offer', 'sale_final', 'settlement'].includes(type)) return 'quote';
  if (type === 'support_new' || type === 'support_reply') return 'support';
  if (type === 'restock' || type === 'price_drop' || type === 'listing') return 'watch';
  if (type === 'coupon' || type === 'benefit' || type === 'grade') return 'benefit';
  return 'order';
}

function notificationTarget(type) {
  if (['quote_open', 'quote_new', 'bid_new', 'awarded', 'sale_offer', 'sale_final'].includes(type)) return 'cq';
  if (/^(order|payment|refund|shipping|delivery|tracking)/.test(type || '')) return 'orders';
  if (type === 'support_reply') return 'support';
  if (type === 'support_new') return 'cq';
  if (type === 'listing' || type === 'restock' || type === 'price_drop') return 'collection';
  if (type === 'settlement') return 'settlement';
  if (type === 'account' || type === 'business' || type === 'approved') return 'profile';
  return 'mypage';
}

export function createAccountHubRuntime({ windowObject, documentObject }) {
  function readPreferences() {
    try { return JSON.parse(windowObject.localStorage.getItem(PREFERENCE_KEY) || '{}'); } catch (_error) { return {}; }
  }

  function writePreferences(value) {
    try { windowObject.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(value || {})); } catch (_error) {}
  }

  function syncNotificationSwitches(settingsPage) {
    const preferences = readPreferences();
    settingsPage.querySelectorAll('[data-notification-category]').forEach((row) => {
      const control = row.querySelector('.switch');
      if (control) control.setAttribute('aria-checked', preferences[row.dataset.notificationCategory] === false ? 'false' : 'true');
    });
  }

  function handlePreferenceClick(event, settingsPage) {
    const row = event.target.closest('[data-notification-category]');
    if (!row || !settingsPage.contains(row)) return false;
    const control = event.target.closest('.switch');
    if (!control) return true;
    const preferences = readPreferences();
    const category = row.dataset.notificationCategory;
    preferences[category] = control.getAttribute('aria-checked') !== 'true';
    writePreferences(preferences);
    control.setAttribute('aria-checked', preferences[category] ? 'true' : 'false');
    return true;
  }

  function openLegalPage(kind, settingsPage, target, setStep) {
    const source = documentObject.querySelector(kind === 'privacy' ? '#privacyModal .legal-sheet' : '#termsModal .legal-sheet');
    settingsPage.dataset.legalTitle = kind === 'privacy' ? '개인정보 처리방침' : '이용약관';
    if (target) {
      target.innerHTML = source ? source.innerHTML : '<p>내용을 불러오지 못했습니다.</p>';
      target.querySelector('.bizinfo-close')?.remove();
    }
    setStep('legal');
  }

  function normalizeQuotes(rows) {
    return (rows || []).map((item) => {
      const status = item?.status || 'pending';
      const expired = Number(item?.expiresMs || 0) > 0 && Number(item.expiresMs) <= Date.now();
      return expired && (status === 'pending' || status === 'open') ? { ...item, status: 'closed' } : item;
    });
  }

  function bindQuoteCancellation({ backend, confirmAction, getListings, renderListings, notify }) {
    documentObject.addEventListener('click', (event) => {
      const button = event.target.closest('[data-quote-cancel]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const quoteId = button.getAttribute('data-quote-cancel');
      if (!quoteId || !backend.cancelMyQuote) { notify('현재 견적 취소를 사용할 수 없습니다.'); return; }
      confirmAction('이 비교견적을 취소할까요?\n등록 기록은 보존되고 업체 입찰은 종료됩니다.').then((ok) => {
        if (!ok) return;
        button.disabled = true;
        backend.cancelMyQuote(quoteId).then(() => {
          renderListings(getListings().map((item) => String(item.id) === String(quoteId) ? { ...item, status: 'closed' } : item));
        }).catch((error) => notify(`견적 취소 실패: ${error?.message || error}`))
          .then(() => { button.disabled = false; });
      });
    });
  }

  function formatPhone(value) {
    const number = String(value || '').replace(/[^0-9]/g, '');
    return number.length === 11 ? `${number.slice(0, 3)}-${number.slice(3, 7)}-${number.slice(7)}` : (value || '미등록');
  }

  function bindNotificationKeyboard() {
    documentObject.addEventListener('keydown', (event) => {
      const item = event.target.closest?.('#notiList .noti-item');
      if (!item || (event.key !== 'Enter' && event.key !== ' ') || event.target.closest('button')) return;
      event.preventDefault();
      item.click();
    });
  }

  return Object.freeze({
    bindNotificationKeyboard,
    bindQuoteCancellation,
    formatPhone,
    handlePreferenceClick,
    normalizeQuotes,
    notificationEnabled: (type) => readPreferences()[notificationCategory(type)] !== false,
    notificationTarget,
    openLegalPage,
    syncNotificationSwitches,
  });
}
