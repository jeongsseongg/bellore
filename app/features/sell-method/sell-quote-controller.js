function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function previewQuote(now) {
  return {
    id: 'preview-quote', brand: 'ROLEX', model: '서브마리너', ref: '126610LN', year: '2023년', parts: '보증서 · 정품 박스 · 설명서', status: 'open',
    photos: ['assets/cq-guide/front.jpg'], bidAmount: 18700000, createdAtMs: now - 17 * 3600000, expiresMs: now + 55 * 3600000,
    bids: [
      { id: 'preview-bid-1', vendor_id: 'preview-vendor-1', amount: 18700000, message: '방문 검수 후 당일 정산 가능합니다.' },
      { id: 'preview-bid-2', vendor_id: 'preview-vendor-2', amount: 18200000, message: '택배 수령 후 검수 결과를 바로 안내드립니다.' }
    ]
  };
}

export function createSellQuoteController({ document, window, backend, root, sheet, chooser, showView, activeView, openedBy }) {
  chooser.insertAdjacentHTML('beforeend', '<button type="button" class="sell-method__quote-status" id="sellMethodQuoteStatus" hidden><span class="sell-method__quote-online"><i aria-hidden="true"></i> 비교견적 진행 중</span><span class="sell-method__quote-summary"><strong id="sellMethodQuoteSummary">견적을 기다리고 있어요</strong><small id="sellMethodQuoteTime"></small></span><span class="sell-method__quote-arrow" aria-hidden="true">→</span></button>');
  sheet.insertAdjacentHTML('beforeend', '<div class="sell-method__quotes-view" data-sell-view="quotes" hidden><div class="sell-method__form-toolbar"><button type="button" data-sell-quotes-back aria-label="판매방식 선택으로 돌아가기">←</button><span><strong>내 비교견적</strong><small id="sellQuoteDetailStatus">현재 견적 현황</small></span></div><div class="sell-quotes" id="sellQuotesContent" aria-live="polite"></div></div>');
  const status = document.getElementById('sellMethodQuoteStatus');
  const summary = document.getElementById('sellMethodQuoteSummary');
  const time = document.getElementById('sellMethodQuoteTime');
  const detailStatus = document.getElementById('sellQuoteDetailStatus');
  const content = document.getElementById('sellQuotesContent');
  const preview = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && new URLSearchParams(window.location.search).get('preview') === 'sell-quotes-v1';
  let quotes = [];
  let quoteId = '';
  let bidId = '';
  let tradeMethod = '';
  let unsubscribe = null;

  function current() {
    return quotes.find((quote) => quote.status === 'open') || quotes.find((quote) => quote.status === 'pending') || null;
  }

  function remaining(quote) {
    if (!quote || quote.status === 'pending') return '검수 승인 후 72시간 입찰이 시작됩니다';
    const value = Math.max(0, Number(quote.expiresMs || 0) - Date.now());
    if (!value) return '입찰 시간이 종료되었습니다';
    const hours = Math.floor(value / 3600000);
    const minutes = Math.floor((value % 3600000) / 60000);
    const seconds = Math.floor((value % 60000) / 1000);
    return `남은 시간 ${hours}시간 ${minutes}분 ${seconds}초`;
  }

  function renderStatus() {
    const quote = current();
    status.hidden = !quote;
    if (!quote) return;
    const count = Array.isArray(quote.bids) ? quote.bids.length : 0;
    summary.textContent = count ? `최고 ${Number(quote.bidAmount || 0).toLocaleString('ko-KR')}원 · ${count}개 견적` : '견적을 기다리고 있어요';
    time.textContent = remaining(quote);
  }

  function render(id) {
    const quote = quotes.find((item) => String(item.id) === String(id)) || current() || quotes[0];
    quoteId = quote ? String(quote.id) : '';
    bidId = '';
    tradeMethod = '';
    if (!quote) {
      detailStatus.textContent = '신청한 비교견적 없음';
      content.innerHTML = '<div class="sell-quotes__empty"><strong>진행 중인 비교견적이 없어요</strong><span>비교견적을 신청하면 입찰 현황이 이곳에 표시됩니다.</span></div>';
      return;
    }
    const photo = quote.photos?.[0] ? `<img src="${escapeHtml(quote.photos[0])}" alt="내가 등록한 시계 사진">` : '<span>등록 사진 없음</span>';
    const bids = Array.isArray(quote.bids) ? quote.bids : [];
    detailStatus.textContent = remaining(quote);
    const bidHtml = bids.length ? bids.map((bid, index) => `<button type="button" class="sell-quotes__bid" data-sell-bid="${escapeHtml(bid.id)}" aria-label="${index + 1}번 견적 ${Number(bid.amount || 0).toLocaleString('ko-KR')}원 선택"><b>${Number(bid.amount || 0).toLocaleString('ko-KR')}원</b><small>${escapeHtml(bid.message || '시계 확인 후 상세 거래 일정을 안내드립니다.')}</small></button>`).join('') : '<div class="sell-quotes__waiting">아직 들어온 견적이 없습니다.<br>벨로르 제휴사의 입찰을 기다리고 있어요.</div>';
    content.innerHTML = `<section class="sell-quotes__overview"><div class="sell-quotes__photo">${photo}</div><div class="sell-quotes__info"><p class="sell-quotes__online"><i aria-hidden="true"></i>${quote.status === 'pending' ? '검수 중' : '비교견적 진행 중'}</p><h2>${escapeHtml(quote.brand || '브랜드 미입력')}<br>${escapeHtml(quote.model || '모델 미입력')}</h2><dl class="sell-quotes__spec"><dt>레퍼런스</dt><dd>${escapeHtml(quote.ref || '확인 중')}</dd><dt>연식</dt><dd>${escapeHtml(quote.year || quote.stamping || '확인 중')}</dd><dt>구성품</dt><dd>${escapeHtml(quote.parts || '등록 정보 확인 중')}</dd><dt>최고 견적</dt><dd>${quote.bidAmount ? Number(quote.bidAmount).toLocaleString('ko-KR') + '원' : '대기 중'}</dd></dl></div></section><h3 class="sell-quotes__headline">들어온 견적 ${bids.length}개</h3><section class="sell-quotes__bids">${bidHtml}</section>${bids.length ? '<section class="sell-quotes__trade" hidden><h3>거래 방법을 선택해주세요</h3><div class="sell-quotes__trade-options"><button type="button" data-sell-trade="visit">방문거래</button><button type="button" data-sell-trade="delivery">택배거래</button><button type="button" data-sell-trade="quick">퀵거래</button></div><button type="button" class="sell-quotes__request" data-sell-award disabled>이 견적으로 판매 요청</button><p class="sell-quotes__notice">선택한 제휴사에 판매 요청과 거래 방법이 함께 전달됩니다.</p></section>' : ''}`;
  }

  function setQuotes(rows) {
    quotes = Array.isArray(rows) ? rows : [];
    renderStatus();
    if (activeView() === 'quotes') render(quoteId);
  }

  function subscribe(user) {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    if (preview) return setQuotes([previewQuote(Date.now())]);
    if (!user || !backend?.subscribeMyListings) return setQuotes([]);
    unsubscribe = backend.subscribeMyListings(setQuotes);
  }

  function open(trigger, id) {
    openedBy(trigger);
    root.hidden = false;
    document.body.classList.add('sell-method-open');
    showView('quotes');
    render(id);
    window.requestAnimationFrame(() => { root.classList.add('is-open'); sheet.focus({ preventScroll: true }); });
  }

  async function handleClick(event) {
    if (event.target.closest('#sellMethodQuoteStatus')) { open(event.target.closest('#sellMethodQuoteStatus'), current()?.id); return true; }
    if (event.target.closest('[data-sell-quotes-back]')) { showView('chooser'); renderStatus(); return true; }
    const bid = event.target.closest('[data-sell-bid]');
    if (bid) {
      bidId = bid.dataset.sellBid;
      content.querySelectorAll('[data-sell-bid]').forEach((node) => node.classList.toggle('is-selected', node === bid));
      const trade = content.querySelector('.sell-quotes__trade');
      if (trade) trade.hidden = false;
      return true;
    }
    const method = event.target.closest('[data-sell-trade]');
    if (method) {
      tradeMethod = method.dataset.sellTrade;
      content.querySelectorAll('[data-sell-trade]').forEach((node) => node.classList.toggle('is-selected', node === method));
      const award = content.querySelector('[data-sell-award]');
      if (award) award.disabled = !bidId || !tradeMethod;
      return true;
    }
    const award = event.target.closest('[data-sell-award]');
    if (!award || !quoteId || !bidId || !tradeMethod) return false;
    const selectedBid = quotes.find((item) => String(item.id) === quoteId)?.bids?.find((item) => String(item.id) === bidId);
    award.disabled = true;
    award.textContent = '판매 요청 중…';
    try {
      await backend.awardBid(quoteId, bidId, selectedBid?.vendor_id, tradeMethod);
      award.textContent = '판매 요청 완료';
    } catch (error) {
      console.error('[Bellore] 비교견적 판매 요청 실패', error);
      award.disabled = false;
      award.textContent = '다시 판매 요청하기';
      window.alert('판매 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
    return true;
  }

  function connect() {
    if (backend?.onAuthChange) backend.onAuthChange(subscribe);
    if (preview) window.setTimeout(() => open(null, 'preview-quote'), 80);
    const clock = window.setInterval(() => {
      renderStatus();
      const quote = quotes.find((item) => String(item.id) === quoteId) || current();
      if (activeView() === 'quotes' && quote) detailStatus.textContent = remaining(quote);
    }, 1000);
    window.addEventListener('pagehide', () => window.clearInterval(clock), { once: true });
  }

  return { connect, handleClick, open };
}
