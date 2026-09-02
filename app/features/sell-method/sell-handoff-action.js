const METHOD_LABEL = { visit: '방문거래', delivery: '택배거래', quick: '퀵거래' };

function localIso(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return '';
  const value = new Date(`${date}T${time}:00+09:00`);
  return Number.isNaN(value.getTime()) ? '' : value.toISOString();
}

function dateValue(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function createSellHandoffAction({ document, window, root, backend, current, selectedBid, awardBid, amountText, onCompleted, tradeAssets }) {
  root.insertAdjacentHTML('beforeend', `<div class="sell-service-action" id="sellServiceAction" hidden><section class="sell-service-action__panel" role="dialog" aria-modal="true" aria-labelledby="sellServiceActionTitle">
    <h2 id="sellServiceActionTitle" data-sell-action-title>거래 방법을 선택해주세요</h2><p class="sell-service-action__amount" data-sell-action-amount></p>
    <div class="sell-service-action__methods"><button type="button" data-sell-trade="visit"><img src="${tradeAssets.visit}" alt=""><span>방문거래</span></button><button type="button" data-sell-trade="delivery"><img src="${tradeAssets.delivery}" alt=""><span>택배거래</span></button><button type="button" data-sell-trade="quick"><img src="${tradeAssets.quick}" alt=""><span>퀵거래</span></button></div>
    <div class="sell-service-action__visit" data-sell-visit hidden><strong>방문 희망 지점과 시간을 선택해주세요</strong><div class="sell-service-action__branches"><button type="button" data-sell-branch="jongno">벨로르 종로점</button><button type="button" data-sell-branch="cheongdam">벨로르 청담점</button></div><div class="sell-service-action__schedule"><label><span>희망 날짜</span><input type="date" data-sell-date></label><label><span>희망 시간</span><select data-sell-time><option value="">시간 선택</option>${Array.from({ length: 16 }, (_, i) => { const minutes = 11 * 60 + i * 30; return `<option value="${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}">${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}</option>`; }).join('')}</select></label></div><p>영업시간 11:00–19:00 · 접수 후 스케줄을 확인해 예약 확정 여부를 안내드립니다.</p></div>
    <p class="sell-service-action__guide" data-sell-action-guide hidden></p>
    <div class="sell-service-action__buttons"><button type="button" data-sell-action-close>취소</button><button type="button" data-sell-action-confirm disabled>이 방법으로 진행</button></div>
  </section></div>`);
  const action = document.getElementById('sellServiceAction');
  const visit = action.querySelector('[data-sell-visit]');
  const guide = action.querySelector('[data-sell-action-guide]');
  const confirm = action.querySelector('[data-sell-action-confirm]');
  const date = action.querySelector('[data-sell-date]');
  const time = action.querySelector('[data-sell-time]');
  let tradeMethod = '';
  let branch = '';

  function valid() {
    confirm.disabled = !tradeMethod || (tradeMethod === 'visit' && (!branch || !date.value || !time.value));
  }
  function open() {
    const record = current();
    if (!record) return;
    tradeMethod = ''; branch = '';
    action.querySelector('[data-sell-action-title]').textContent = record.method === 'compare' ? '판매 요청 방법을 선택해주세요' : '시계를 전달할 방법을 선택해주세요';
    action.querySelector('[data-sell-action-amount]').textContent = amountText(record, selectedBid());
    action.querySelectorAll('[data-sell-trade],[data-sell-branch]').forEach((button) => button.classList.remove('is-selected'));
    date.min = dateValue(); date.value = ''; time.value = ''; visit.hidden = true; guide.hidden = true;
    confirm.textContent = '이 방법으로 진행'; valid(); action.hidden = false;
  }
  function close() { action.hidden = true; tradeMethod = ''; branch = ''; }
  async function handleClick(event) {
    if (event.target.closest('[data-sell-action-close]')) { close(); return true; }
    const method = event.target.closest('[data-sell-trade]');
    if (method) {
      tradeMethod = method.dataset.sellTrade;
      action.querySelectorAll('[data-sell-trade]').forEach((button) => button.classList.toggle('is-selected', button === method));
      visit.hidden = tradeMethod !== 'visit';
      guide.hidden = tradeMethod === 'visit';
      guide.textContent = tradeMethod === 'delivery'
        ? '택배 접수와 안전 포장 방법은 담당자가 연락드려 안내합니다.'
        : tradeMethod === 'quick' ? '퀵 배차와 인수 시간은 담당자가 연락드려 안내합니다.' : '';
      valid(); return true;
    }
    const branchButton = event.target.closest('[data-sell-branch]');
    if (branchButton) {
      branch = branchButton.dataset.sellBranch;
      action.querySelectorAll('[data-sell-branch]').forEach((button) => button.classList.toggle('is-selected', button === branchButton));
      valid(); return true;
    }
    if (event.target.matches('[data-sell-date],[data-sell-time]')) { valid(); return true; }
    if (!event.target.closest('[data-sell-action-confirm]')) return false;
    const record = current();
    if (!record || confirm.disabled) return true;
    confirm.disabled = true; confirm.textContent = '판매 요청 중…';
    try {
      let updated = record;
      if (record.method === 'compare') {
        await awardBid(record, tradeMethod);
        updated = { ...record, status: 'handoff', tradeMethod };
      } else {
        updated = await backend.requestSellHandoff(record, {
          tradeMethod, visitBranch: branch, requestedVisitAt: tradeMethod === 'visit' ? localIso(date.value, time.value) : '',
        });
      }
      close(); onCompleted(updated);
      window.alert(tradeMethod === 'visit'
        ? '방문 희망 일정이 접수되었습니다. 스케줄 확인 후 예약 확정 여부를 안내드리겠습니다.'
        : `${METHOD_LABEL[tradeMethod]} 요청이 접수되었습니다. 담당자가 연락드리겠습니다.`);
    } catch (error) {
      console.error('[Bellore] 판매 거래방법 요청 실패', error);
      confirm.disabled = false; confirm.textContent = '다시 진행하기';
      window.alert('판매 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
    return true;
  }
  action.addEventListener('change', handleClick);
  return { open, close, handleClick, selector: '[data-sell-action-close],[data-sell-trade],[data-sell-branch],[data-sell-action-confirm]' };
}
