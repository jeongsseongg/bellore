/* 레거시(script.js · index.html 인라인)가 가진 컬렉션 동작을 한 곳으로 격리하는 어댑터.
   기능 모듈은 window.BELLORE_* 를 직접 부르지 않고 이 어댑터만 사용한다.
   컬렉션이 기능 모듈로 옮겨지면 이 파일부터 제거한다. */

export function createLegacyCollection({ document: doc, window: win }) {
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
  };
}

function setValue(doc, id, amount) {
  const field = doc.getElementById(id);
  if (!field) return;
  field.value = amount ? Number(amount).toLocaleString('ko-KR') : '';
}
