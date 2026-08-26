/* 레거시(script.js · index.html 인라인)가 가진 컬렉션 동작을 한 곳으로 격리하는 어댑터.
   기능 모듈은 window.BELLORE_* 를 직접 부르지 않고 이 어댑터만 사용한다.
   컬렉션이 기능 모듈로 옮겨지면 이 파일부터 제거한다. */

export function createLegacyCollection({ document: doc, window: win }) {
  let activePresetRun = 0;

  function openCollectionPage() {
    const link = doc.querySelector('.tab-item[data-nav="collection"]') || doc.querySelector('[data-nav="collection"]');
    if (link) link.click();
    else win.location.hash = '#collection';
  }

  return {
    open() {
      openCollectionPage();
      return true;
    },

    openProduct(productId) {
      if (!productId) return false;
      const open = win.BELLORE_openProductById;
      if (typeof open !== 'function') return false;
      open(productId);
      return true;
    },

    search(query) {
      const run = win.BELLORE_runSearch;
      if (typeof run === 'function') { run(query); return true; }
      openCollectionPage();
      return false;
    },

    filter(options) {
      openCollectionPage();
      const apply = win.BELLORE_applyColFilters;
      if (typeof apply !== 'function') return false;
      win.setTimeout(() => apply({ ...(options || {}), homeCategory: true }), 60);
      return true;
    },

    /* 컬렉션의 기존 필터 화면을 그대로 쓴다. 필터 화면은 열릴 때 배선되므로
       열기 → 금액 입력 → 적용 순서가 필요하다. 사용자에게는 보이지 않게 처리한다. */
    filterByPrice(min, max) {
      openCollectionPage();
      const open = doc.getElementById('catFilterOpen');
      const page = doc.getElementById('filterPage');
      if (!open || !page) return false;

      doc.body.classList.add('bn-filter-silent');
      win.setTimeout(() => {
        open.click();
        setValue(doc, 'cfPriceMin', min);
        setValue(doc, 'cfPriceMax', max);
        const apply = doc.getElementById('cfApply');
        if (apply) apply.click();
        doc.body.classList.remove('bn-filter-silent');
      }, 260);
      return true;
    },

    /* 홈 캠페인은 필터 체크 화면을 거치지 않고 실제 판매 카드에서 바로 선별한다.
       기존 페이지네이션을 재사용하므로 전체 수와 상품 카드 형식도 컬렉션과 동일하다. */
    openPreset(preset) {
      if (!preset || !preset.action) return false;
      const runId = ++activePresetRun;
      openCollectionPage();

      const applyPreset = (resetUi = false) => {
        if (runId !== activePresetRun) return;
        if (resetUi) resetCollectionUi(doc, win);
        const cards = Array.from(doc.querySelectorAll('#collection .col-grid-inner .hcard'));
        if (!cards.length) return;
        const matches = cards.filter((card) => matchesPreset(card, preset.action));
        const paginate = win.BELLORE_paginateSearchCards;
        if (typeof paginate === 'function') paginate(matches);
        else cards.forEach((card) => { card.style.display = matches.includes(card) ? '' : 'none'; });

        const query = doc.getElementById('catBrandQ');
        if (query) query.value = preset.label || '';
        if (matches.length) {
          if (typeof win.BELLORE_hideSearchEmpty === 'function') win.BELLORE_hideSearchEmpty();
        } else if (typeof win.BELLORE_showCollectionEmpty === 'function') {
          win.BELLORE_showCollectionEmpty('', '', preset.label || '선택한 컬렉션');
        }
        const page = doc.getElementById('collection');
        if (page) page.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };

      // 초기 상품 렌더가 원격 데이터 응답 뒤에 끝나는 경우에도 같은 프리셋을 다시 적용한다.
      // 첫 회만 기존 UI를 초기화하고, 이후 재적용은 사용자에게 보이는 깜빡임 없이 목록만 갱신한다.
      [180, 650, 1400, 2800].forEach((delay, index) => {
        win.setTimeout(() => applyPreset(index === 0), delay);
      });
      return true;
    },
  };
}

function setValue(doc, id, amount) {
  const field = doc.getElementById(id);
  if (!field) return;
  field.value = amount ? Number(amount).toLocaleString('ko-KR') : '';
}

function resetCollectionUi(doc, win) {
  const query = doc.getElementById('catBrandQ');
  if (query) {
    query.value = '';
    query.dispatchEvent(new win.Event('input', { bubbles: true }));
  }
  const allBrand = doc.querySelector('#collection .cat-brand[data-brand="all"]');
  if (allBrand) allBrand.click();
  const reset = doc.getElementById('cfReset');
  if (reset) reset.click();
}

function matchesPreset(card, action) {
  const data = card.dataset;
  const text = [data.brand, data.model, data.pack, data.setgrade, data.components,
    data.accessories, data.cond, card.textContent].join(' ').toLowerCase();
  const brand = String(data.brand || '').toLowerCase();
  const price = Number(data.price || 0);
  const size = Number.parseFloat(data.size || '');
  const year = Number.parseInt(data.stampyear || '', 10);
  const hasAny = (words) => words.some((word) => text.includes(word));

  if (action === 'fullset') {
    const score = text.match(/(\d+(?:\.\d+)?)\s*(?:점|\/\s*10)/);
    const highGrade = !score || Number(score[1]) >= 9 || /미사용|최상|상급/.test(text);
    return highGrade && /풀세트|박스.*보증|보증.*박스/.test(text);
  }
  if (action === 'wedding') {
    return ['롤렉스', 'rolex', '까르띠에', 'cartier', '불가리', 'bvlgari', '샤넬', 'chanel']
      .some((name) => brand.includes(name)) && (!Number.isFinite(size) || size <= 40);
  }
  if (action === 'vintage') {
    return (year > 0 && year <= 2005) || hasAny(['빈티지', 'vintage', '셀리니', '수동']);
  }
  if (action === 'icons') {
    return hasAny(['데이트저스트', 'datejust', '스피드마스터', 'speedmaster', '산토스', 'santos', '블랙베이', 'black bay']);
  }
  if (action === 'newest') return true;
  if (action === 'highend') return price >= 10000000;
  if (action === 'sale') return data.saleactive === '1';
  if (action === 'diver') {
    return hasAny(['서브마리너', 'submariner', '씨마스터', 'seamaster', '블랙베이', 'black bay', '펠라고스', 'pelagos', '파네라이', 'panerai', '다이버', 'diver']);
  }
  if (action === 'women') {
    return (Number.isFinite(size) && size <= 32) || hasAny(['레이디', 'lady', '탱크', 'tank', '팬더', 'panthere', '발롱', 'ballon']);
  }
  if (action === 'santos') return hasAny(['산토스', 'santos']);
  return false;
}
