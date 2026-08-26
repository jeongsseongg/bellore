/* 홈 가로 상품 섹션의 관리자 전용 제목·설명 편집기.
   권한 표시는 auth info, 저장 권한은 Backend와 site_content RLS가 각각 검증한다. */

function paintRowHeading(row, content) {
  const title = String(content?.title || row.config.defaultTitle).trim();
  const description = content && typeof content.subtitle === 'string'
    ? content.subtitle.trim()
    : row.config.defaultDescription;
  row.config.title = title;
  row.config.description = description;
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
    '<header><div><small>HOME SECTION</small><h2 id="hrowSettingsTitle">상품 섹션 설정</h2></div>' +
    '<button type="button" data-close-settings aria-label="닫기">×</button></header>' +
    '<form><label><span>섹션 제목</span><input name="title" maxlength="30" required></label>' +
    '<label><span>짧은 설명</span><input name="description" maxlength="60" ' +
    'placeholder="예: 지금만 만나는 한정 혜택"></label>' +
    '<p>상품 카드 설명은 브랜드 · 상태 · 구성품 순서로 자동 표시됩니다.</p>' +
    '<footer><button type="button" data-close-settings>취소</button>' +
    '<button type="submit" class="is-primary">저장</button></footer></form></section>';
  doc.body.appendChild(modal);
  return modal;
}

export function initHomeRowAdmin({ document: doc, window: win, rows }) {
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

  function ensureModal() {
    if (modal) return modal;
    modal = createSettingsModal(doc);
    modal.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-settings]')) closeModal();
    });
    modal.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!isAdmin || !activeRow || !backend || typeof backend.saveSiteContent !== 'function') return;
      const form = event.currentTarget;
      const save = form.querySelector('[type="submit"]');
      const title = form.elements.title.value.trim();
      const description = form.elements.description.value.trim();
      if (!title) return;
      save.disabled = true;
      save.textContent = '저장 중…';
      backend.saveSiteContent(activeRow.config.key, {
        title, subtitle: description, body: '', images: [],
      }).then((content) => {
        paintRowHeading(activeRow, content);
        closeModal();
        notify('홈 상품 섹션을 저장했습니다.');
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
    form.elements.title.value = row.config.title;
    form.elements.description.value = row.config.description;
    editor.hidden = false;
    doc.body.classList.add('hrow-settings-open');
    form.elements.title.focus();
  }

  rows.forEach((row) => row.settingsButton.addEventListener('click', () => openModal(row)));
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
  });

  function loadSettings() {
    if (!backend || typeof backend.getSiteContent !== 'function') return Promise.resolve();
    return Promise.all(rows.map((row) => backend.getSiteContent(row.config.key)
      .then((content) => paintRowHeading(row, content))
      .catch(() => paintRowHeading(row, null))));
  }

  if (backend && typeof backend.onAuthChange === 'function') {
    backend.onAuthChange((user, info) => syncAdmin(info));
  }
  if (backend?.ready && typeof backend.ready.then === 'function') backend.ready.then(loadSettings, () => {});
  else loadSettings();
}
