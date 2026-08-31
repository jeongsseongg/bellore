const TRADE = {
  visit: { label: '방문거래', copy: '벨로르 종로지점에서 안전하게 거래해요.', image: 'assets/sell/trade/방문거래.png' },
  delivery: { label: '택배거래', copy: '담당자가 포장과 안심수거를 안내해요.', image: 'assets/sell/trade/택배거래.png' },
  quick: { label: '퀵거래', copy: '서울·경기 지역에서 빠르게 전달해요.', image: 'assets/sell/trade/퀵거래.png' },
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function money(value) {
  const amount = Number(value || 0);
  return amount > 0 ? amount.toLocaleString('ko-KR') + '원' : '금액 확인 중';
}

function tag(detail, key) {
  const match = String(detail || '').match(new RegExp(`\\[${key}\\]\\s*([^\\n]+)`));
  return match ? match[1].trim() : '';
}

export function parseSellRequestDetails(record = {}) {
  const detail = record.memo || record.item_detail || '';
  const rawMethod = record.tradeMethod || tag(detail, '거래방법');
  const tradeMethod = Object.keys(TRADE).find((key) => TRADE[key].label === rawMethod) || rawMethod;
  return {
    tradeMethod,
    tradeLabel: TRADE[tradeMethod]?.label || rawMethod || '담당자 확인 중',
    contactPhone: record.contactPhone || tag(detail, '연락전화'),
    location: record.tradeRequest?.location || tag(detail, '예약장소'),
    schedule: record.tradeRequest?.schedule || tag(detail, '예약일시'),
  };
}

export function renderSellRequestReceipt(record) {
  const request = { ...parseSellRequestDetails(record), ...(record.tradeRequest || {}) };
  const selectedBid = (record.bids || []).find((bid) => String(bid.id) === String(record.selectedBidId || record.awarded_bid));
  const selectedAmount = record.selectedAmount || selectedBid?.amount || record.offerAmount || record.finalAmount;
  const watch = [record.brand, record.model].filter(Boolean).join(' ') || '등록한 시계';
  return `<article class="sell-service-page sell-request-receipt" data-service-page="request-receipt">
    <header class="sell-request-receipt__hero">
      <span class="sell-request-receipt__check" aria-hidden="true">✓</span>
      <small>판매 요청 접수 완료</small>
      <h2>담당자가 확인 후<br>연락드릴게요</h2>
      <p>선택한 조건을 확인해 전담 매니저가 순서대로 연락드립니다.</p>
    </header>
    <section class="sell-request-receipt__amount">
      <span>${escapeHtml(watch)}</span>
      <strong>${money(selectedAmount)}</strong>
      <small>선택 견적 · 실물 검수 후 최종 확정</small>
    </section>
    <section class="sell-request-receipt__summary" aria-label="판매 요청 내용">
      <div><span>거래 방법</span><strong>${escapeHtml(request.tradeLabel)}</strong></div>
      <div><span>${request.tradeMethod === 'visit' ? '방문 지점' : '수거 장소'}</span><strong>${escapeHtml(request.location || '담당자와 협의')}</strong></div>
      <div><span>희망 일정</span><strong>${escapeHtml(request.schedule || '담당자와 협의')}</strong></div>
      <div><span>연락처</span><strong>${escapeHtml(request.contactPhone || '회원 연락처')}</strong></div>
    </section>
    <section class="sell-request-receipt__next">
      <strong>이제 이렇게 진행돼요</strong>
      <ol>
        <li class="is-active"><i>1</i><span>판매요청<br>접수</span></li>
        <li><i>2</i><span>담당자<br>연락</span></li>
        <li><i>3</i><span>방문·수거<br>진행</span></li>
        <li><i>4</i><span>입고·실물<br>검수</span></li>
        <li><i>5</i><span>최종금액<br>정산</span></li>
      </ol>
    </section>
    <p class="sell-request-receipt__notice"><b>연락 대기 중</b> 접수 내용이 벨로르 담당자에게 전달되었습니다. 변경이 필요하면 고객센터로 알려주세요.</p>
  </article>`;
}

function tomorrow() {
  const date = new Date(Date.now() + 86400000);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function detailFields(method) {
  const date = tomorrow();
  const timeOptions = '<option value="">시간 선택</option><option>오전 10:00 - 12:00</option><option>오후 12:00 - 15:00</option><option>오후 15:00 - 18:00</option>';
  if (method === 'visit') {
    return `<div class="sell-request-form__field"><label for="sellRequestLocation">방문 지점</label><select id="sellRequestLocation" required><option value="벨로르 종로지점">벨로르 종로지점</option></select></div>
      <div class="sell-request-form__row"><div class="sell-request-form__field"><label for="sellRequestDate">희망 날짜</label><input id="sellRequestDate" type="date" min="${date}" value="${date}" required></div><div class="sell-request-form__field"><label for="sellRequestTime">희망 시간</label><select id="sellRequestTime" required>${timeOptions}</select></div></div>`;
  }
  const guide = method === 'delivery' ? '담당자가 포장 방법과 안심수거 일정을 연락드려요.' : '정확한 배차 가능 여부와 비용을 담당자가 먼저 확인해요.';
  return `<p class="sell-request-form__guide">${guide}</p><div class="sell-request-form__field"><label for="sellRequestLocation">수거 주소</label><input id="sellRequestLocation" type="text" autocomplete="street-address" placeholder="예: 서울 강남구 도산대로 00" required></div>
    <div class="sell-request-form__row"><div class="sell-request-form__field"><label for="sellRequestDate">희망 날짜</label><input id="sellRequestDate" type="date" min="${date}" value="${date}" required></div><div class="sell-request-form__field"><label for="sellRequestTime">희망 시간</label><select id="sellRequestTime" required>${timeOptions}</select></div></div>`;
}

function selectedAmount(context) {
  const { record, selectedBid } = context;
  return record.method === 'compare' ? selectedBid?.amount : (record.method === 'consignment' ? record.offerAmount : record.finalAmount);
}

export function createSellServiceRequest({ document, window, root, backend, preview, getContext, onComplete }) {
  root.insertAdjacentHTML('beforeend', `<div class="sell-service-action" id="sellServiceAction" hidden><section class="sell-service-action__panel" role="dialog" aria-modal="true" aria-labelledby="sellServiceActionTitle">
    <div class="sell-service-action__heading"><span>판매 요청</span><button type="button" data-sell-request-close aria-label="닫기">×</button></div>
    <h2 id="sellServiceActionTitle">시계를 어떻게 전달할까요?</h2><p class="sell-service-action__amount" data-sell-request-amount></p>
    <div class="sell-service-action__methods">${Object.entries(TRADE).map(([key, item]) => `<button type="button" data-sell-request-method="${key}"><img src="${item.image}" alt=""><span>${item.label}</span><small>${item.copy}</small></button>`).join('')}</div>
    <form class="sell-request-form" data-sell-request-form hidden><div data-sell-request-fields></div><div class="sell-request-form__field"><label for="sellRequestPhone">연락받을 전화번호</label><input id="sellRequestPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="010-0000-0000" required></div><label class="sell-request-form__consent"><input type="checkbox" required><span>거래 일정 확인을 위한 연락에 동의합니다.</span></label></form>
    <div class="sell-service-action__buttons"><button type="button" data-sell-request-close>이전</button><button type="button" data-sell-request-confirm disabled>판매 요청 접수</button></div>
  </section></div>`);
  const action = document.getElementById('sellServiceAction');
  const form = action.querySelector('[data-sell-request-form]');
  const confirm = action.querySelector('[data-sell-request-confirm]');
  let method = '';

  function open() {
    const context = getContext();
    if (!context.record) return;
    method = '';
    action.querySelector('[data-sell-request-amount]').textContent = `선택 금액 ${money(selectedAmount(context))}`;
    action.querySelectorAll('[data-sell-request-method]').forEach((button) => button.classList.remove('is-selected'));
    form.hidden = true;
    confirm.disabled = true;
    confirm.textContent = '판매 요청 접수';
    action.hidden = false;
  }

  function close() {
    action.hidden = true;
    method = '';
  }

  function choose(button) {
    method = button.dataset.sellRequestMethod;
    action.querySelectorAll('[data-sell-request-method]').forEach((item) => item.classList.toggle('is-selected', item === button));
    action.querySelector('[data-sell-request-fields]').innerHTML = detailFields(method);
    const user = backend?.currentUser?.() || {};
    action.querySelector('#sellRequestPhone').value = user.phone || '';
    form.hidden = false;
    confirm.disabled = false;
  }

  function readRequest() {
    const date = action.querySelector('#sellRequestDate')?.value || '';
    const time = action.querySelector('#sellRequestTime')?.value || '';
    return {
      tradeMethod: method,
      tradeLabel: TRADE[method]?.label || '',
      contactPhone: action.querySelector('#sellRequestPhone')?.value.trim() || '',
      location: action.querySelector('#sellRequestLocation')?.value.trim() || '',
      schedule: [date, time].filter(Boolean).join(' '),
    };
  }

  async function submit() {
    const context = getContext();
    if (!method || !context.record || !form.reportValidity()) return;
    const request = readRequest();
    confirm.disabled = true;
    confirm.textContent = '접수 중…';
    try {
      if (!preview && context.record.method === 'compare' && backend?.awardBid && context.selectedBid) {
        await backend.awardBid(context.record.id, context.selectedBid.id, context.selectedBid.vendor_id, method, request);
      }
      close();
      onComplete({ ...request, selectedAmount: selectedAmount(context), selectedBidId: context.selectedBid?.id || '' });
    } catch (error) {
      console.error('[Bellore] 판매 요청 접수 실패', error);
      confirm.disabled = false;
      confirm.textContent = '다시 접수하기';
      window.alert('판매 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  function handleClick(event) {
    const closeButton = event.target.closest('[data-sell-request-close]');
    if (closeButton) { close(); return true; }
    const methodButton = event.target.closest('[data-sell-request-method]');
    if (methodButton) { choose(methodButton); return true; }
    if (event.target.closest('[data-sell-request-confirm]')) { submit(); return true; }
    return false;
  }

  return {
    action,
    close,
    handleClick,
    open,
    selector: '[data-sell-request-close], [data-sell-request-method], [data-sell-request-confirm]',
  };
}
