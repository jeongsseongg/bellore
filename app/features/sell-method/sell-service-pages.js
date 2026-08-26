import { createSellGuestAccess } from './sell-guest-access.js?v=20260826-sell-guest-access-v1';
const STORAGE_KEY = 'bellore-sell-service-records-v1';
const METHOD_LABEL = { compare: '비교견적', consignment: '위탁판매', instant: '즉시매입' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function money(value) {
  const amount = Number(value || 0);
  return amount > 0 ? amount.toLocaleString('ko-KR') + '원' : '금액 검토 중';
}

function previewRecords(now) {
  return [
    {
      id: 'preview-compare', method: 'compare', status: 'open', brand: 'ROLEX', model: '서브마리너', ref: '126610LN', year: '2023년',
      parts: '보증서 · 정품 박스 · 설명서', photo: 'assets/cq-guide/front.jpg', expiresAt: now + 54 * 3600000 + 59 * 60000 + 22 * 1000,
      bids: [
        { id: 'quote-1', amount: 18700000, message: '실물 검수 후 당일 정산 가능합니다.' },
        { id: 'quote-2', amount: 18200000, message: '검수 완료 후 최종금액을 안내드립니다.' },
        { id: 'quote-3', amount: 17950000, message: '방문·택배·퀵 거래를 선택할 수 있습니다.' }
      ]
    },
    {
      id: 'preview-consignment', method: 'consignment', status: 'offer', brand: 'CARTIER', model: '산토스 드 까르띠에', ref: 'WSSA0018', year: '2022년',
      parts: '보증서 · 정품 박스 · 추가 링크', photo: 'assets/cq-guide/front.jpg', offerAmount: 20000000
    },
    {
      id: 'preview-instant', method: 'instant', status: 'offer', brand: 'OMEGA', model: '씨마스터 다이버 300M', ref: '210.30.42.20.03.001', year: '2021년',
      parts: '정품 박스 · 설명서', photo: 'assets/cq-guide/front.jpg', estimatedAmount: 15800000, finalAmount: 15000000,
      deductions: [
        { label: '케이스·브레이슬릿 사용감', amount: 500000 },
        { label: '보증서 정보와 등록 연식 차이', amount: 300000 }
      ]
    }
  ];
}

function remaining(record) {
  if (record.method !== 'compare' || record.status !== 'open') return '';
  const value = Math.max(0, Number(record.expiresAt || 0) - Date.now());
  if (!value) return '입찰 시간이 종료되었습니다';
  const hours = Math.floor(value / 3600000);
  const minutes = Math.floor((value % 3600000) / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  return `남은 시간 ${hours}시간 ${minutes}분 ${seconds}초`;
}

function watchCard(record) {
  return `<section class="sell-service__watch">
    <div class="sell-service__photo">${record.photo ? `<img src="${escapeHtml(record.photo)}" alt="등록한 시계 사진">` : '<span>등록 사진<br>확인 중</span>'}</div>
    <div class="sell-service__watch-info">
      <p>${escapeHtml(record.brand || '브랜드 확인 중')}</p>
      <h2>${escapeHtml(record.model || '모델 확인 중')}</h2>
      <dl>
        <div><dt>레퍼런스</dt><dd>${escapeHtml(record.ref || '확인 중')}</dd></div>
        <div><dt>스탬핑/연식</dt><dd>${escapeHtml(record.year || '확인 중')}</dd></div>
        <div><dt>구성품</dt><dd>${escapeHtml(record.parts || '등록 정보 확인 중')}</dd></div>
      </dl>
    </div>
  </section>`;
}

function progress(items, activeIndex) {
  return `<ol class="sell-service__progress" aria-label="진행 현황">${items.map((item, index) => `<li class="${index <= activeIndex ? 'is-active' : ''}"><i>${index < activeIndex ? '✓' : index + 1}</i><span>${escapeHtml(item)}</span></li>`).join('')}</ol>`;
}

function comparePage(record, selectedBidId) {
  const bids = Array.isArray(record.bids) ? record.bids : [];
  const highest = bids.reduce((max, bid) => Math.max(max, Number(bid.amount || 0)), 0);
  const bidRows = bids.length ? bids.map((bid, index) => `<button type="button" class="sell-service__bid ${String(selectedBidId) === String(bid.id) ? 'is-selected' : ''}" data-sell-service-bid="${escapeHtml(bid.id)}">
    <span><small>견적 ${index + 1}</small><strong>${money(bid.amount)}</strong></span><em>${escapeHtml(bid.message || '실물 검수 후 상세 거래 일정을 안내드립니다.')}</em><b aria-hidden="true">→</b>
  </button>`).join('') : '<div class="sell-service__empty"><strong>견적을 기다리고 있어요</strong><span>입찰이 들어오면 금액순으로 이곳에 표시됩니다.</span></div>';
  return `<article class="sell-service-page" data-service-page="compare">
    <header class="sell-service__status sell-service__status--blue"><span class="sell-service__live"><i></i> 비교견적 진행 중</span><strong>${highest ? `최고 ${money(highest)}` : '견적을 기다리고 있어요'}</strong><small data-sell-countdown>${remaining(record)}</small></header>
    ${watchCard(record)}
    <section class="sell-service__section"><div class="sell-service__section-head"><h3>들어온 견적</h3><span>${bids.length}개</span></div><div class="sell-service__bids">${bidRows}</div></section>
    ${selectedBidId ? '<button type="button" class="sell-service__primary" data-sell-service-accept>선택한 견적으로 판매 요청</button><p class="sell-service__footnote">업체명은 공개되지 않으며 선택 후 벨로르가 거래를 연결합니다.</p>' : ''}
  </article>`;
}

function consignmentPage(record) {
  const offer = Number(record.offerAmount || 0);
  const fee = Math.round(offer * 0.07);
  const proceeds = Math.max(0, offer - fee);
  const hasOffer = offer > 0;
  return `<article class="sell-service-page" data-service-page="consignment">
    <header class="sell-service__status sell-service__status--blue"><span>위탁판매 현황</span><strong>${hasOffer ? '판매금액 안내가 도착했어요' : '판매금액을 검토하고 있어요'}</strong><small>${hasOffer ? '금액과 수수료를 확인한 뒤 진행 여부를 선택해주세요.' : '전문 검수팀이 등록 정보를 확인하고 있습니다.'}</small></header>
    ${watchCard(record)}
    <section class="sell-service__section"><div class="sell-service__section-head"><h3>벨로르 판매금액 안내</h3></div>
      <div class="sell-service__money-card"><div><span>안내 판매금액</span><strong>${money(offer)}</strong></div><dl><div><dt>판매 수수료</dt><dd>${hasOffer ? '- ' + money(fee) + ' (7%)' : '-'}</dd></div><div class="is-total"><dt>예상 정산금액</dt><dd>${money(proceeds)}</dd></div></dl></div>
      <p class="sell-service__notice">판매가 완료되면 안내 판매금액의 7%가 수수료로 정산됩니다. 실물 검수 결과가 등록 정보와 다르면 판매 조건을 다시 안내합니다.</p>
    </section>
    ${progress(['판매금액 안내', '시계 전달', '실물 검수', '판매 개시', '판매 완료'], record.status === 'handoff' ? 1 : 0)}
    ${hasOffer ? '<button type="button" class="sell-service__primary" data-sell-service-accept>금액 확인하고 위탁 진행</button>' : ''}
  </article>`;
}

function instantPage(record) {
  const estimate = Number(record.estimatedAmount || 0);
  const finalAmount = Number(record.finalAmount || 0);
  const deductions = Array.isArray(record.deductions) ? record.deductions : [];
  const deductionRows = deductions.length ? deductions.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>- ${money(item.amount)}</dd></div>`).join('') : '<div><dt>감가 사유</dt><dd>실물 검수 후 안내</dd></div>';
  return `<article class="sell-service-page" data-service-page="instant">
    <header class="sell-service__status sell-service__status--blue"><span>즉시매입 현황</span><strong>${finalAmount ? '최종 매입금액을 확인해주세요' : '매입 가능금액을 검토하고 있어요'}</strong><small>${finalAmount ? '감가 사유까지 확인한 뒤 판매 여부를 선택할 수 있습니다.' : '사진과 등록 정보를 기준으로 가능금액을 확인 중입니다.'}</small></header>
    ${watchCard(record)}
    <section class="sell-service__section"><div class="sell-service__section-head"><h3>즉시매입 금액 안내</h3></div>
      <div class="sell-service__money-card sell-service__money-card--instant"><div><span>사진·정보 기준 예상금액</span><strong>${money(estimate)}</strong></div><dl>${deductionRows}<div class="is-total"><dt>최종 매입금액</dt><dd>${money(finalAmount)}</dd></div></dl></div>
      <p class="sell-service__notice sell-service__notice--warn">실물 상태가 사진·작성 정보와 다르면 감가가 발생할 수 있습니다. 벨로르는 검수 결과와 감가 사유, 변경된 최종금액을 항목별로 다시 안내합니다.</p>
    </section>
    ${progress(['정보·사진 접수', '가능금액 안내', '실물 검수', '감가 사유·최종금액', '매입 완료'], record.status === 'handoff' ? 2 : (finalAmount ? 3 : 1))}
    ${finalAmount ? '<button type="button" class="sell-service__primary" data-sell-service-accept>최종금액 확인하고 판매</button>' : ''}
  </article>`;
}

export function initSellServicePages({ document, window, backend }) {
  const root = document.getElementById('sellMethodSheet');
  const sheet = root?.querySelector('.sell-method__sheet');
  const chooser = root?.querySelector('[data-sell-view="chooser"]');
  if (!root || !sheet || !chooser) return null;
  const header = chooser.querySelector('.sell-method__header');
  header.insertAdjacentHTML('beforeend', '<div class="sell-method__header-actions"><button type="button" class="sell-method__notice-toggle" id="sellServiceNoticeToggle" aria-label="판매 알림 보기" aria-controls="sellServiceNoticePanel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg><b class="sell-method__notice-badge" id="sellServiceNoticeBadge" hidden>0</b></button></div>');
  header.insertAdjacentHTML('afterend', '<aside class="sell-service-notice" id="sellServiceNoticePanel" hidden><strong>판매 알림</strong><div class="sell-service-notice__list" id="sellServiceNoticeList"></div></aside>');
  const leaveView = root.querySelector('[data-sell-view="leave"]');
  leaveView.insertAdjacentHTML('beforebegin', '<div class="sell-service-view" data-sell-view="service" hidden><div class="sell-method__form-toolbar"><button type="button" data-sell-service-back aria-label="판매방식 선택으로 돌아가기">←</button><span><strong id="sellServiceTitle">판매 현황</strong><small id="sellServiceSubtitle">신청 내용과 현재 진행상태</small></span></div><div class="sell-service" id="sellServiceContent" aria-live="polite"></div></div>');
  root.insertAdjacentHTML('beforeend', '<div class="sell-service-action" id="sellServiceAction" hidden><section class="sell-service-action__panel" role="dialog" aria-modal="true" aria-labelledby="sellServiceActionTitle"><h2 id="sellServiceActionTitle" data-sell-action-title>거래 방법을 선택해주세요</h2><p class="sell-service-action__amount" data-sell-action-amount></p><div class="sell-service-action__methods"><button type="button" data-sell-trade="visit"><img src="assets/sell/trade/방문거래.png" alt=""><span>방문거래</span></button><button type="button" data-sell-trade="delivery"><img src="assets/sell/trade/택배거래.png" alt=""><span>택배거래</span></button><button type="button" data-sell-trade="quick"><img src="assets/sell/trade/퀵거래.png" alt=""><span>퀵거래</span></button></div><div class="sell-service-action__buttons"><button type="button" data-sell-action-close>취소</button><button type="button" data-sell-action-confirm disabled>이 방법으로 진행</button></div></section></div>');
  function showView(name) {
    root.querySelectorAll('[data-sell-view]').forEach((node) => { node.hidden = node.dataset.sellView !== name; });
    sheet.scrollTop = 0;
  }
  const bell = document.getElementById('sellServiceNoticeToggle');
  const badge = document.getElementById('sellServiceNoticeBadge');
  const panel = document.getElementById('sellServiceNoticePanel');
  const list = document.getElementById('sellServiceNoticeList');
  const draftResume = document.getElementById('sellMethodResume');
  const title = document.getElementById('sellServiceTitle');
  const subtitle = document.getElementById('sellServiceSubtitle');
  const content = document.getElementById('sellServiceContent');
  const action = document.getElementById('sellServiceAction');
  const myPageSection = document.getElementById('myItemsSection');
  const preview = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && new URLSearchParams(window.location.search).get('preview') === 'sell-services-v2';
  let records = [];
  let activeMethod = 'compare';
  let activeId = '';
  let selectedBidId = '';
  let selectedTrade = '';
  let unsubscribe = null;
  let myPageLinks = document.getElementById('sellServiceMyPageLinks');
  let guestAccess;

  // saved drafts live only in the top-right notification menu
  // 저장 중인 양식은 판매방식 본문에 노출하지 않고 우측 상단 알림함에서만 연다.
  if (draftResume) list.before(draftResume);

  if (!myPageLinks && myPageSection) {
    myPageLinks = document.createElement('section');
    myPageLinks.id = 'sellServiceMyPageLinks';
    myPageLinks.className = 'sell-service-mypage';
    myPageSection.insertBefore(myPageLinks, document.getElementById('myPageListings'));
  }

  function readLocal() {
    try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (error) { console.warn('[Bellore] 판매 현황 저장본을 읽지 못했습니다.', error); return []; }
  }

  function writeLocal() {
    if (preview) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.filter((item) => !String(item.source || '').includes('backend')))); }
    catch (error) { console.warn('[Bellore] 판매 현황 저장에 실패했습니다.', error); }
  }

  function current(method = activeMethod, id = activeId) {
    return records.find((item) => String(item.id) === String(id)) || records.find((item) => item.method === method) || null;
  }

  function statusCopy(record) {
    if (record.method === 'compare') {
      const bids = record.bids || [];
      const highest = bids.reduce((max, bid) => Math.max(max, Number(bid.amount || 0)), 0);
      return { label: '비교견적 진행 중', strong: highest ? `최고 ${money(highest)} · ${bids.length}개 견적` : '견적을 기다리고 있어요', small: remaining(record) };
    }
    if (record.method === 'consignment') return { label: '위탁판매', strong: record.offerAmount ? '판매금액 안내 도착' : '판매금액 검토 중', small: record.offerAmount ? money(record.offerAmount) + ' · 수수료 7%' : '벨로르가 판매금액을 확인하고 있습니다.' };
    return { label: '즉시매입', strong: record.finalAmount ? '최종 매입금액 안내 도착' : '매입 가능금액 검토 중', small: record.finalAmount ? money(record.finalAmount) + ' · 감가 사유 확인' : '사진과 정보를 확인하고 있습니다.' };
  }

  function renderNotice() {
    const visible = records.filter((item) => ['compare', 'consignment', 'instant'].includes(item.method));
    const draftCount = draftResume && !draftResume.hidden ? 1 : 0;
    const noticeCount = visible.length + draftCount;
    badge.hidden = !noticeCount;
    badge.textContent = String(noticeCount);
    list.innerHTML = visible.length ? visible.map((record) => {
      const copy = statusCopy(record);
      return `<button type="button" class="sell-service-notice__item sell-service-notice__item--${record.method}" data-sell-service-open="${record.method}" data-sell-service-id="${escapeHtml(record.id)}"><span><small>${copy.label}</small><strong>${copy.strong}</strong><em>${copy.small}</em></span><b aria-hidden="true">→</b></button>`;
    }).join('') : (draftCount ? '' : '<p class="sell-service-notice__empty">진행 중인 판매 내역이 없습니다.</p>');
    if (myPageLinks) {
      myPageLinks.innerHTML = visible.length ? `<div class="sell-service-mypage__head"><strong>내 시계판매 현황</strong><span>${visible.length}건</span></div>${visible.map((record) => {
        const copy = statusCopy(record);
        return `<button type="button" data-sell-service-open="${record.method}" data-sell-service-id="${escapeHtml(record.id)}"><span><small>${copy.label}</small><strong>${copy.strong}</strong></span><b aria-hidden="true">→</b></button>`;
      }).join('')}` : '';
      myPageLinks.hidden = !visible.length;
    }
  }

  function renderPage() {
    const record = current();
    title.textContent = METHOD_LABEL[activeMethod] + ' 현황';
    subtitle.textContent = record ? '신청 내용과 현재 진행상태' : '신청 내역 없음';
    if (!record) {
      content.innerHTML = `<div class="sell-service__empty"><strong>진행 중인 ${METHOD_LABEL[activeMethod]}이 없습니다.</strong><span>판매방식 선택에서 새 신청을 시작할 수 있습니다.</span></div>`;
      return;
    }
    if (activeMethod === 'compare') content.innerHTML = comparePage(record, selectedBidId);
    else if (activeMethod === 'consignment') content.innerHTML = consignmentPage(record);
    else content.innerHTML = instantPage(record);
  }

  function open(trigger, method, id) {
    activeMethod = METHOD_LABEL[method] ? method : 'compare';
    activeId = id || current(activeMethod)?.id || '';
    selectedBidId = '';
    panel.hidden = true;
    root.hidden = false;
    document.body.classList.add('sell-method-open');
    showView('service');
    renderPage();
    window.requestAnimationFrame(() => { root.classList.add('is-open'); sheet.focus({ preventScroll: true }); });
  }

  function openAction() {
    const record = current();
    if (!record) return;
    selectedTrade = '';
    const selectedBid = (record.bids || []).find((bid) => String(bid.id) === String(selectedBidId));
    const amount = record.method === 'compare' ? selectedBid?.amount : (record.method === 'consignment' ? record.offerAmount : record.finalAmount);
    action.querySelector('[data-sell-action-title]').textContent = record.method === 'compare' ? '판매 요청 방법을 선택해주세요' : '시계를 전달할 방법을 선택해주세요';
    action.querySelector('[data-sell-action-amount]').textContent = money(amount);
    action.querySelectorAll('[data-sell-trade]').forEach((button) => button.classList.remove('is-selected'));
    action.querySelector('[data-sell-action-confirm]').disabled = true;
    action.hidden = false;
  }
  function closeAction() {
    action.hidden = true;
    selectedTrade = '';
  }
  function serverRecord(record, source) {
    return { ...record, source: source || 'backend', photo: record.photos?.[0] || record.photo || '',
      expiresAt: record.method === 'compare' ? Date.parse(record.createdAt || Date.now()) + 72 * 3600 * 1000 : null };
  }
  function openGuestRecord(record, source) {
    const mapped = serverRecord(record, source || 'guest-backend');
    records = [mapped, ...records.filter((item) => String(item.id) !== String(mapped.id))];
    renderNotice();
    open(guestAccess?.toggle, mapped.method, mapped.id);
  }
  guestAccess = createSellGuestAccess({ document, window, backend, root, header, leaveView, showView, openRecord: openGuestRecord });
  async function connectBackend() {
    if (preview) {
      records = previewRecords(Date.now());
      renderNotice();
      return;
    }
    records = readLocal();
    renderNotice();
    if (!backend?.currentUser?.()) return;
    if (backend.listMySellRequests) {
      backend.listMySellRequests().then((memberRows) => {
        const nonCompare = (memberRows || []).filter((row) => row.method !== 'compare').map((row) => serverRecord(row, 'backend'));
        records = [...nonCompare, ...records.filter((item) => item.method === 'compare' || item.source !== 'backend')];
        renderNotice(); }).catch((error) => console.warn('[Bellore] 회원별 판매 신청을 불러오지 못했습니다.', error));
    }
    if (!backend.subscribeMyListings) return;
    if (unsubscribe) unsubscribe();
    unsubscribe = backend.subscribeMyListings((rows) => {
      const other = records.filter((item) => item.method !== 'compare' || item.source !== 'backend');
      const compare = (rows || []).map((row) => ({ ...row, method: 'compare', source: 'backend', photo: row.photos?.[0] || row.photo || '', expiresAt: row.expiresMs || row.expiresAt }));
      records = [...compare, ...other];
      renderNotice();
      if (activeMethod === 'compare') renderPage();
    });
  }
  function addSubmitted(detail) {
    const method = METHOD_LABEL[detail?.saleMethod] ? detail.saleMethod : 'compare';
    if (detail?.serverRecord) {
      const source = detail.submissionMode === 'member' ? 'backend' : 'guest-backend';
      const mapped = serverRecord(detail.serverRecord, source);
      records = [mapped, ...records.filter((item) => String(item.id) !== String(mapped.id))];
      if (detail.submissionMode === 'guest' && detail.receiptNo) window.localStorage.setItem('bellore-last-guest-sell-receipt', detail.receiptNo);
      renderNotice(); return;
    }
    if (method === 'compare' && detail?.submissionMode === 'member') return;
    const record = {
      id: 'local-' + Date.now(), method, status: 'reviewing', brand: detail?.brand || '', model: detail?.model || '', ref: detail?.ref || '', year: detail?.year || '',
      parts: Array.isArray(detail?.parts) ? detail.parts.join(' · ') : '', photo: detail?.photos?.[0] || ''
    };
    records = [record, ...records.filter((item) => item.method !== method || item.source === 'backend')];
    writeLocal();
    renderNotice();
  }

  async function handleClick(event) {
    if (guestAccess.handleClick(event)) { panel.hidden = true; return true; }
    if (event.target.closest('#sellServiceNoticeToggle')) {
      panel.hidden = !panel.hidden;
      return true;
    }
    const openButton = event.target.closest('[data-sell-service-open]');
    if (openButton) {
      open(openButton, openButton.dataset.sellServiceOpen, openButton.dataset.sellServiceId);
      return true;
    }
    if (event.target.closest('[data-sell-service-back]')) {
      closeAction();
      showView('chooser');
      renderNotice();
      return true;
    }
    const bid = event.target.closest('[data-sell-service-bid]');
    if (bid) {
      selectedBidId = bid.dataset.sellServiceBid;
      renderPage();
      return true;
    }
    if (event.target.closest('[data-sell-service-accept]')) {
      openAction();
      return true;
    }
    if (event.target.closest('[data-sell-action-close]')) {
      closeAction();
      return true;
    }
    const trade = event.target.closest('[data-sell-trade]');
    if (trade) {
      selectedTrade = trade.dataset.sellTrade;
      action.querySelectorAll('[data-sell-trade]').forEach((button) => button.classList.toggle('is-selected', button === trade));
      action.querySelector('[data-sell-action-confirm]').disabled = false;
      return true;
    }
    if (event.target.closest('[data-sell-action-confirm]')) {
      const record = current();
      if (!record || !selectedTrade) return true;
      const confirm = action.querySelector('[data-sell-action-confirm]');
      if (record.method === 'compare' && backend?.awardBid && selectedBidId) {
        const selectedBid = (record.bids || []).find((bid) => String(bid.id) === String(selectedBidId));
        confirm.disabled = true;
        confirm.textContent = '판매 요청 중…';
        try {
          await backend.awardBid(record.id, selectedBidId, selectedBid?.vendor_id, selectedTrade);
        } catch (error) {
          console.error('[Bellore] 비교견적 판매 요청 실패', error);
          confirm.disabled = false;
          confirm.textContent = '다시 진행하기';
          window.alert('판매 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
          return true;
        }
      }
      record.tradeMethod = selectedTrade;
      record.status = 'handoff';
      writeLocal();
      closeAction();
      renderPage();
      return true;
    }
    return false;
  }

  function connect() {
    if (draftResume && typeof MutationObserver === 'function') {
      new MutationObserver(renderNotice).observe(draftResume, { attributes: true, attributeFilter: ['hidden'] });
    }
    document.addEventListener('click', (event) => {
      const control = event.target.closest('#sellServiceNoticeToggle, ' + guestAccess.selector + ', [data-sell-service-back], [data-sell-service-open], [data-sell-service-bid], [data-sell-service-accept], [data-sell-action-close], [data-sell-trade], [data-sell-action-confirm]');
      if (control) {
        event.preventDefault();
        event.stopPropagation();
        handleClick(event);
        return;
      }
      if (!panel.hidden && !event.target.closest('#sellServiceNoticePanel')) panel.hidden = true;
    }, true);
    window.addEventListener('bellore:sell-submitted', (event) => addSubmitted(event.detail || {}));
    connectBackend();
    window.setInterval(() => {
      renderNotice();
      const countdown = content.querySelector('[data-sell-countdown]');
      const record = current();
      if (countdown && record) countdown.textContent = remaining(record);
    }, 1000);
    guestAccess.restoreLink();
    if (preview) {
      const method = new URLSearchParams(window.location.search).get('servicePage');
      if (METHOD_LABEL[method]) window.setTimeout(() => open(null, method), 80);
    }
  }

  connect();
  return { open, refresh: renderNotice };
}
