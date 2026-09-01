function message(error) {
  return error?.message || String(error || '알 수 없는 오류');
}

function initEmptySaleCarousel(document, window) {
  const banner = document.querySelector('#mpSaleEmpty');
  const track = banner?.querySelector('.mp-sale-banner__track');
  const slides = [...(banner?.querySelectorAll('.mp-sale-banner__slide') || [])];
  const dots = [...(banner?.querySelectorAll('.mp-sale-banner__dots i') || [])];
  if (!banner || !track || slides.length < 2) return;
  let index = 0;
  let startX = 0;
  let suppressClick = false;
  let timer;
  const show = (next) => {
    index = (next + slides.length) % slides.length;
    track.style.transform = `translateX(-${index * 100}%)`;
    slides.forEach((slide, slideIndex) => slide.setAttribute('aria-hidden', slideIndex === index ? 'false' : 'true'));
    dots.forEach((dot, dotIndex) => dot.classList.toggle('is-active', dotIndex === index));
  };
  const restart = () => {
    window.clearInterval(timer);
    timer = window.setInterval(() => {
      if (!banner.hidden && !document.hidden) show(index + 1);
    }, 5000);
  };
  banner.addEventListener('pointerdown', (event) => { startX = event.clientX; });
  banner.addEventListener('pointerup', (event) => {
    const distance = event.clientX - startX;
    if (Math.abs(distance) < 32) return;
    suppressClick = true;
    show(index + (distance < 0 ? 1 : -1));
    restart();
  });
  banner.addEventListener('click', (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);
  show(0);
  restart();
}

export function initMypageRequestedActions({ document, window, backend }) {
  initEmptySaleCarousel(document, window);
  const modal = document.querySelector('#myPageModal');
  modal?.addEventListener('click', (event) => {
    const orderButton = event.target.closest('#mpOrderCancel');
    if (orderButton) {
      const orderNo = orderButton.dataset.orderNo;
      if (!orderNo || !backend?.requestCancel) return;
      window.bellPrompt('주문을 취소합니다. 사유를 입력해 주세요.', '단순 변심').then((reason) => {
        if (reason === null) return;
        orderButton.disabled = true;
        backend.requestCancel(orderNo, reason).then((status) => {
          window.alert(status === 'canceled' ? '주문이 취소되었습니다.' : '주문취소 요청이 접수되었습니다.');
          document.dispatchEvent(new CustomEvent('bellore:mypage-order-refresh'));
        }).catch((error) => window.alert(`주문취소 실패: ${message(error)}`))
          .finally(() => { orderButton.disabled = false; });
      });
      return;
    }

    const quoteButton = event.target.closest('#mpQuoteCancel');
    const quoteId = quoteButton?.dataset.quoteId;
    if (!quoteButton || !quoteId || !backend?.cancelMyQuote) return;
    window.bellConfirm('진행 중인 비교견적을 취소할까요? 취소하면 업체의 추가 견적을 더 이상 받을 수 없습니다.').then((ok) => {
      if (!ok) return;
      quoteButton.disabled = true;
      backend.cancelMyQuote(quoteId)
        .then(() => window.alert('비교견적이 취소되었습니다. 이후 추가 견적은 접수되지 않습니다.'))
        .catch((error) => window.alert(`견적취소 실패: ${message(error)}`))
        .finally(() => { quoteButton.disabled = false; });
    });
  });

  document.querySelector('#pfFindAddress')?.addEventListener('click', () => {
    if (!window.daum?.Postcode) { window.alert('주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
    new window.daum.Postcode({ oncomplete(data) {
      const postcode = document.querySelector('#pfPostcode');
      const address = document.querySelector('#pfAddr1');
      const detail = document.querySelector('#pfAddr2');
      if (postcode) postcode.value = data.zonecode || '';
      if (address) address.value = data.roadAddress || data.jibunAddress || '';
      detail?.focus();
    } }).open();
  });

  const settings = document.querySelector('#settingsPage');
  document.addEventListener('bellore:settings-legal', (event) => {
    const kind = event.detail?.kind;
    if (!['terms', 'privacy'].includes(kind)) return;
    const source = document.querySelector(`#${kind === 'terms' ? 'termsModal' : 'privacyModal'} .legal-body`);
    const target = document.querySelector(`#${kind === 'terms' ? 'settingsTermsBody' : 'settingsPrivacyBody'}`);
    if (source && target) target.replaceChildren(source.cloneNode(true));
    settings.querySelectorAll('.set-step').forEach((step) => { step.hidden = step.dataset.sstep !== kind; });
    settings.dataset.cur = kind;
    const title = settings.querySelector('#setTitle');
    if (title) title.textContent = kind === 'terms' ? '이용약관' : '개인정보 처리방침';
    settings.querySelector('.pp-scroll')?.scrollTo(0, 0);
  });

  settings?.querySelectorAll('.mp-local-notify').forEach((button) => {
    const key = button.closest('[data-notify-key]')?.dataset.notifyKey || '';
    try { button.setAttribute('aria-checked', window.localStorage.getItem(`bellore_notify_${key}`) === 'false' ? 'false' : 'true'); } catch {}
    button.addEventListener('click', () => {
      const enabled = button.getAttribute('aria-checked') !== 'true';
      button.setAttribute('aria-checked', enabled ? 'true' : 'false');
      try { window.localStorage.setItem(`bellore_notify_${key}`, enabled ? 'true' : 'false'); } catch {}
    });
  });
}
