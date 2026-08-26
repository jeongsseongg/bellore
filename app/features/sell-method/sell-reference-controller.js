function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
}

export function createSellReferenceController({ backend, elements, selected, makePreview, syncDetail }) {
  let brandListings = [];
  let approvedListings = [];
  let catalog = [];

  function rebuild() {
    const unique = new Map();
    [...brandListings, ...approvedListings].forEach((item) => {
      const ref = String(item?.reference_no || item?.referenceNumber || item?.ref || '').trim();
      if (!ref) return;
      const key = normalize(ref);
      if (!unique.has(key)) unique.set(key, { ref, brand: String(item.brand || ''), model: String(item.model || '') });
    });
    catalog = [...unique.values()];
    if (!elements.details.hidden) render(elements.input.value);
  }

  function choose(value) {
    syncDetail(elements.field, elements.input, value);
    render(value);
  }

  function render(query) {
    const raw = String(query || '').trim();
    const q = normalize(raw);
    const brand = selected.brand();
    const model = selected.model();
    const brandTerms = [brand?.name, brand?.eng].map(normalize).filter(Boolean);
    const modelTerm = normalize(model);
    const matches = catalog.filter((item) => {
      const itemBrand = normalize(item.brand);
      const itemModel = normalize(item.model);
      const brandMatches = !brandTerms.length || brandTerms.some((term) => itemBrand.includes(term) || term.includes(itemBrand));
      const modelMatches = !modelTerm || itemModel.includes(modelTerm) || modelTerm.includes(itemModel);
      return brandMatches && modelMatches && (!q || normalize(item.ref + item.model).includes(q));
    });
    elements.list.replaceChildren();
    matches.forEach((item) => elements.list.append(makePreview({
      title: item.ref,
      subtitle: [item.brand, item.model].filter(Boolean).join(' · ') || '선택한 시계의 레퍼런스',
      selected: elements.input.value === item.ref,
      hideLogo: true,
      onClick: () => choose(item.ref)
    })));
    if (!matches.length) elements.list.append(makePreview({
      title: raw ? '일치하는 레퍼런스가 없어요' : '등록된 레퍼런스를 찾지 못했어요',
      subtitle: '직접 입력하거나 아래의 잘 모름을 선택해주세요',
      hideLogo: true,
      onClick: () => elements.input.focus({ preventScroll: true })
    }));
    elements.list.append(makePreview({
      title: '레퍼런스를 잘 모르겠어요',
      subtitle: '전문 검수 후 확인해드려요',
      selected: elements.input.value === '잘 모름',
      hideLogo: true,
      onClick: () => choose('잘 모름')
    }));
  }

  function connect() {
    if (backend?.subscribeProducts) backend.subscribeProducts((rows) => {
      brandListings = Array.isArray(rows) ? rows : [];
      rebuild();
    });
    if (backend?.subscribeApproved) backend.subscribeApproved((rows) => {
      approvedListings = Array.isArray(rows) ? rows : [];
      rebuild();
    });
  }

  return { connect, render };
}
