/* 홈 가로 상품 섹션 관리자 편집기.
   제목·설명과 상품 ID를 site_content에 저장하며 실제 권한은 RLS가 검증한다. */

function escapeText(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function productIds(content) {
  try {
    const saved = JSON.parse(content?.body || '{}');
    const ids = Array.isArray(saved) ? saved : saved.productIds;
    return Array.isArray(ids) ? [...new Set(ids.map(String).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

function paintRowSettings(row, content) {
  const title = String(content?.title || row.config.defaultTitle).trim();
  const description = content && typeof content.subtitle === 'string'
    ? content.subtitle.trim()
    : row.config.defaultDescription;
  row.config.title = title;
  row.config.description = description;
  row.config.selectedIds = productIds(content).slice(0, row.config.selectionLimit);
  row.title.textContent = title;
  row.description.textContent = description;
  row.description.hidden = !description;
  const viewAll = row.rail.querySelector('.hrow-view-all');
  if (viewAll) viewAll.setAttribute('aria-label', `${title} 전체보기`);
}

function createSettingsModal(doc) {
  const modal = doc.createElement('div');
  modal.className = 'hrow-settings-modal';
  modal.hidden = true;
  modal.innerHTML =
    '<div class="hrow-settings-backdrop" data-close-settings></div>' +
    '<section class="hrow-settings-sheet" role="dialog" aria-modal="true" aria-labelledby="hrowSettingsTitle">' +
    '<header><div><small>HOME SECTION</small><h2 id="hrowSettingsTitle">가로 매물란 설정</h2></div>' +
    '<button type="button" data-close-settings aria-label="닫기">×</button></header>' +
    '<form><label><span>섹션 제목</span><input name="title" maxlength="30" required></label>' +
    '<label><span>짧은 설명</span><input name="description" maxlength="60" ' +
    'placeholder="예: 지금만 만나는 한정 혜택"></label>' +
    '<div class="hrow-product-editor"><div class="hrow-product-head">' +
    '<strong>노출 상품 직접 지정</strong><span data-selection-count></span></div>' +
    '<input class="hrow-product-search" type="search" name="productSearch" ' +
    'placeholder="브랜드 · 모델 · 상품번호 검색" autocomplete="off">' +
    '<p>선택 상품을 먼저 노출하고 빈자리는 기존 알고리즘으로 채웁니다.</p>' +
    '<div class="hrow-product-list"></div></div>' +
    '<footer><button type="button" data-close-settings>취소</button>' +
    '<button type="submit" class="is-primary">저장</button></footer></form></section>';
  doc.body.appendChild(modal);
  return modal;
}

function searchText(listing) {
  return [listing.brand, listing.model, listing.productNo, listing.referenceNumber]
    .map((value) => String(value || '').toLowerCase()).join(' ');
}

function productMarkup(listing, checked) {
  const details = [listing.brand, listing.productNo].filter(Boolean).join(' · ');
  return `<label class="hrow-product-option" data-search="${escapeText(searchText(listing))}">` +
    `<input type="checkbox" name="productId" value="${escapeText(listing.id)}"${checked ? ' checked' : ''}>` +
    `<span class="hrow-product-thumb"><img src="${escapeText(listing.image)}" alt=""></span>` +
    `<span class="hrow-product-copy"><strong>${escapeText(listing.model)}</strong>` +
    `<small>${escapeText(details)}</small></span></label>`;
}

export function initHomeRowAdmin({ document: doc, window: win, rows, getListings, onSettingsChange }) {
  const backend = win.NWBackend;
  let isAdmin = false;
  let activeRow = null;
  let modal = null;

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    activeRow = null;
    doc.body.classList.remove('hrow-settings-open');
  }

  function syncAdmin(info) {
    isAdmin = !!(info && info.isAdmin);
    rows.forEach((row) => { row.settingsButton.hidden = !isAdmin; });
    if (!isAdmin && modal && !modal.hidden) closeModal();
  }

  function notify(message) {
    if (typeof win.belloreAlert === 'function') win.belloreAlert(message);
    else win.alert(message);
  }

  function selectedInputs() {
    return [...modal.querySelectorAll('input[name="productId"]:checked')];
  }

  function syncCount() {
    if (!modal || !activeRow) return;
    modal.querySelector('[data-selection-count]').textContent =
      `${selectedInputs().length} / ${activeRow.config.selectionLimit}개`;
  }

  function filterProducts(term) {
    const query = String(term || '').trim().toLowerCase();
    modal.querySelectorAll('.hrow-product-option').forEach((option) => {
      option.hidden = !!query && !option.dataset.search.includes(query);
    });
  }

  function ensureModal() {
    if (modal) return modal;
    modal = createSettingsModal(doc);
    modal.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-settings]')) closeModal();
    });
    modal.addEventListener('input', (event) => {
      if (event.target.name === 'productSearch') filterProducts(event.target.value);
    });
    modal.addEventListener('change', (event) => {
      if (event.target.name !== 'productId') return;
      if (selectedInputs().length > activeRow.config.selectionLimit) {
        event.target.checked = false;
        notify(`최대 ${activeRow.config.selectionLimit}개까지 지정할 수 있습니다.`);
      }
      syncCount();
    });
    modal.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!isAdmin || !activeRow || !backend || typeof backend.saveSiteContent !== 'function') return;
      const form = event.currentTarget;
      const save = form.querySelector('[type="submit"]');
      const title = form.elements.title.value.trim();
      const description = form.elements.description.value.trim();
      const selectedIds = selectedInputs().map((input) => input.value);
      if (!title) return;
      save.disabled = true;
      save.textContent = '저장 중…';
      backend.saveSiteContent(activeRow.config.key, {
        title, subtitle: description, body: JSON.stringify({ productIds: selectedIds }), images: [],
      }).then((content) => {
        paintRowSettings(activeRow, content);
        onSettingsChange();
        closeModal();
        notify(`${title} 상품 설정을 저장했습니다.`);
      }).catch((error) => {
        notify(`저장 실패: ${error?.message || error}`);
      }).finally(() => {
        save.disabled = false;
        save.textContent = '저장';
      });
    });
    return modal;
  }

  function openModal(row) {
    if (!isAdmin) return;
    activeRow = row;
    const editor = ensureModal();
    const form = editor.querySelector('form');
    const selected = new Set(row.config.selectedIds || []);
    form.elements.title.value = row.config.title;
    form.elements.description.value = row.config.description;
    form.elements.productSearch.value = '';
    editor.querySelector('.hrow-product-list').innerHTML = getListings()
      .map((listing) => productMarkup(listing, selected.has(String(listing.id))))
      .join('');
    editor.hidden = false;
    doc.body.classList.add('hrow-settings-open');
    syncCount();
    form.elements.title.focus();
  }

  rows.forEach((row) => row.settingsButton.addEventListener('click', () => openModal(row)));
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
  });

  function loadSettings() {
    if (!backend || typeof backend.getSiteContent !== 'function') return Promise.resolve();
    return Promise.all(rows.map((row) => backend.getSiteContent(row.config.key)
      .then((content) => paintRowSettings(row, content))
      .catch(() => paintRowSettings(row, null))))
      .then(() => onSettingsChange());
  }

  if (backend && typeof backend.onAuthChange === 'function') {
    backend.onAuthChange((user, info) => syncAdmin(info));
  }
  if (backend?.ready && typeof backend.ready.then === 'function') backend.ready.then(loadSettings, () => {});
  else loadSettings();
}
