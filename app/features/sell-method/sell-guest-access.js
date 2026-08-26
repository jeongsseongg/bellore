export function createSellGuestAccess({ document, window, backend, root, header, leaveView, showView, openRecord }) {
  const actions = header.querySelector('.sell-method__header-actions');
  actions.insertAdjacentHTML('afterbegin', '<button type="button" class="sell-method__guest-toggle" id="sellGuestAccessToggle" aria-label="비회원 신청 조회"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3.1-7 7-7s7 3 7 7"/></svg><small>비회원</small></button>');
  leaveView.insertAdjacentHTML('beforebegin', '<div class="sell-guest-view" data-sell-view="guest" hidden><div class="sell-method__form-toolbar"><button type="button" data-sell-guest-back aria-label="판매방식 선택으로 돌아가기">←</button><span><strong>비회원 신청 조회</strong><small>접수번호와 휴대폰 본인인증으로 확인</small></span></div><form class="sell-guest-access" id="sellGuestAccessForm"><div class="sell-guest-access__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3.1-7 7-7s7 3 7 7"/></svg></div><h2>비회원으로 신청하셨나요?</h2><p>접수 완료 화면에서 안내된 접수번호를 입력하고 신청 때 작성한 휴대폰으로 본인인증해주세요.</p><label><span>접수번호</span><input type="text" id="sellGuestReceiptInput" placeholder="BLR-XXXXXXXXXX" autocomplete="off" maxlength="14"></label><p class="sell-guest-access__status" id="sellGuestAccessStatus" aria-live="polite"></p><button type="submit">휴대폰 인증 후 확인</button></form></div>');
  const toggle = document.getElementById('sellGuestAccessToggle');
  const form = document.getElementById('sellGuestAccessForm');
  const receipt = document.getElementById('sellGuestReceiptInput');
  const status = document.getElementById('sellGuestAccessStatus');

  function open() {
    showView('guest');
    status.textContent = '';
    receipt.value = window.localStorage.getItem('bellore-last-guest-sell-receipt') || '';
    window.setTimeout(() => receipt.focus(), 50);
  }
  async function submit() {
    const receiptNo = String(receipt.value || '').trim().toUpperCase();
    if (!/^BLR-[A-F0-9]{10}$/.test(receiptNo)) { status.textContent = '접수번호 형식을 확인해주세요.'; return; }
    status.textContent = '휴대폰 본인인증을 시작합니다…';
    try {
      const result = await backend.verifyGuestSellRequest(receiptNo);
      window.localStorage.setItem('bellore-last-guest-sell-receipt', receiptNo);
      status.textContent = '인증되었습니다.';
      openRecord(result.record, 'guest-backend');
    } catch (error) {
      console.error('[Bellore] 비회원 신청 조회 실패', error);
      status.textContent = '신청 정보와 휴대폰 인증이 일치하지 않습니다.';
    }
  }
  function handleClick(event) {
    if (event.target.closest('#sellGuestAccessToggle')) { open(); return true; }
    if (event.target.closest('[data-sell-guest-back]')) { showView('chooser'); return true; }
    return false;
  }
  function restoreLink() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('sellToken');
    const receiptNo = params.get('sellGuest');
    if (!token || !receiptNo || !backend?.exchangeGuestSellLink) return;
    backend.exchangeGuestSellLink(token).then((result) => {
      window.localStorage.setItem('bellore-last-guest-sell-receipt', receiptNo);
      params.delete('sellToken'); params.delete('sellGuest');
      const query = params.toString();
      window.history.replaceState(window.history.state, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
      openRecord(result.record, 'guest-backend');
    }).catch((error) => console.warn('[Bellore] 비회원 보안 링크를 열지 못했습니다.', error));
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); submit(); });
  return { toggle, handleClick, restoreLink, selector: '#sellGuestAccessToggle, [data-sell-guest-back]' };
}
