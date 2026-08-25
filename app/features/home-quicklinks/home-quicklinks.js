const CONTENT_KEY = 'home_quick_categories';
const PREVIOUS_TIME_SALE_IMAGE = 'assets/home-quicklinks/time-sale.png';
const PREVIOUS_UNDER_300_IMAGE = 'assets/home-quicklinks/under-300.png';

const ACTIONS = [
  { value: 'timesale', label: '하단 검색 · TIME SALE 상품' },
  { value: 'search', label: '하단 검색 화면' },
  { value: 'vintage', label: '빈티지 상품' },
  { value: 'under300', label: '300만원 이하 상품' },
  { value: 'sell', label: '시계판매 페이지' },
  { value: 'repair', label: '수리 / 진단 페이지' },
];

const DEFAULTS = [
  { label: 'TIME SALE', action: 'timesale', image: 'assets/home-quicklinks/under-300.png' },
  { label: '브랜드', action: 'search', image: 'assets/home-quicklinks/brand-search.png' },
  { label: '빈티지', action: 'vintage', image: 'assets/home-quicklinks/vintage.png' },
  { label: '300만원 ↓', action: 'under300', image: 'assets/home-quicklinks/time-sale.png' },
  { label: '시계판매', action: 'sell', image: 'assets/home-quicklinks/sell-watch.png' },
  { label: '수리/진단', action: 'repair', image: 'assets/home-quicklinks/repair-diagnosis.png' },
];

function escapeText(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function normalizedItems(content) {
  if (!content || !content.body) return DEFAULTS.map((item) => ({ ...item }));
  try {
    const saved = JSON.parse(content.body);
    if (!Array.isArray(saved) || saved.length !== DEFAULTS.length) throw new Error('invalid category count');
    return saved.map((item, index) => {
      let image = content.images && content.images[item.imageIndex] || DEFAULTS[index].image;
      let label = String(item.label || DEFAULTS[index].label).slice(0, 16);
      if (index === 0 && image === PREVIOUS_TIME_SALE_IMAGE) image = DEFAULTS[0].image;
      if (index === 3 && image === PREVIOUS_UNDER_300_IMAGE) image = DEFAULTS[3].image;
      if (index === 3 && ['300만원 미만', '300만원 이하'].includes(label)) label = '300만원 ↓';
      return {
        label,
        action: ACTIONS.some((action) => action.value === item.action) ? item.action : DEFAULTS[index].action,
        image,
      };
    });
  } catch (error) {
    return DEFAULTS.map((item) => ({ ...item }));
  }
}

function navigate(doc, win, target) {
  const link = doc.querySelector(`[data-nav="${target}"]`);
  if (link) link.click();
  else win.location.hash = `#${target}`;
}

function runAction({ action, doc, win, collection }) {
  if (action === 'timesale') return collection.filter({ saleOnly: true });
  if (action === 'search') return collection.filter({});
  if (action === 'vintage') return collection.filter({ vintage: true });
  if (action === 'under300') return collection.filter({ maxInclusive: 3000000 });
  if (action === 'sell') return navigate(doc, win, 'compare');
  if (action === 'repair') return navigate(doc, win, 'repair');
}

function createModal(doc) {
  const modal = doc.createElement('div');
  modal.className = 'hq-settings-modal';
  modal.hidden = true;
  modal.innerHTML =
    '<div class="hq-settings-backdrop" data-hq-close></div>' +
    '<section class="hq-settings-sheet" role="dialog" aria-modal="true" aria-labelledby="hqSettingsTitle">' +
    '<header><div><small>HOME CATEGORY</small><h2 id="hqSettingsTitle">원형 카테고리 설정</h2></div>' +
    '<button type="button" data-hq-close aria-label="닫기">×</button></header>' +
    '<form><div class="hq-settings-list"></div>' +
    '<footer><button type="button" data-hq-close>취소</button>' +
    '<button type="submit" class="is-primary">저장</button></footer></form></section>';
  doc.body.appendChild(modal);
  return modal;
}

function settingsRow(item, index) {
  return `<fieldset class="hq-settings-row" data-hq-index="${index}">` +
    `<legend>${index + 1}</legend>` +
    `<span class="hq-settings-preview"><img src="${escapeText(item.image)}" alt=""></span>` +
    '<div class="hq-settings-fields">' +
    `<label><span>이름</span><input name="label-${index}" maxlength="16" required value="${escapeText(item.label)}"></label>` +
    `<label><span>이동</span><select name="action-${index}">` +
    ACTIONS.map((action) => `<option value="${action.value}"${action.value === item.action ? ' selected' : ''}>${action.label}</option>`).join('') +
    '</select></label>' +
    `<label class="hq-file"><span>이미지 변경</span><input type="file" name="image-${index}" accept="image/*"></label>` +
    '</div></fieldset>';
}

function fileDataUrl(file) {
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

export function initHomeQuicklinks({ document: doc, window: win, collection }) {
  const mount = doc.getElementById('homeQuickCategories');
  if (!mount) return;
  const backend = win.NWBackend;
  const settingsButton = mount.querySelector('.hq-settings');
  const rail = mount.querySelector('.hq-rail');
  const scrollbar = mount.querySelector('.hq-scrollbar');
  const scrollThumb = scrollbar && scrollbar.querySelector('.hq-scrollbar-thumb');
  let items = DEFAULTS.map((item) => ({ ...item }));
  let modal = null;
  let isAdmin = false;

  function paint() {
    rail.innerHTML = items.map((item, index) =>
      `<button type="button" class="hq-item" data-hq-index="${index}" data-hq-action="${escapeText(item.action)}">` +
      `<span class="hq-image"><img src="${escapeText(item.image)}" alt="" loading="${index < 3 ? 'eager' : 'lazy'}"></span>` +
      `<span class="hq-label">${escapeText(item.label)}</span></button>`
    ).join('');
    if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(syncScrollbar);
    else win.setTimeout(syncScrollbar, 0);
  }

  function syncScrollbar() {
    if (!scrollbar || !scrollThumb) return;
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    if (maxScroll <= 1) {
      scrollbar.hidden = true;
      scrollThumb.style.width = '';
      scrollThumb.style.transform = 'translate3d(0,0,0)';
      return;
    }
    scrollbar.hidden = false;
    const trackWidth = scrollbar.clientWidth;
    const thumbWidth = Math.max(36, trackWidth * rail.clientWidth / rail.scrollWidth);
    const left = (trackWidth - thumbWidth) * Math.min(1, Math.max(0, rail.scrollLeft / maxScroll));
    scrollThumb.style.width = `${thumbWidth}px`;
    scrollThumb.style.transform = `translate3d(${left}px,0,0)`;
  }

  function notify(message) {
    if (typeof win.belloreAlert === 'function') win.belloreAlert(message);
    else win.alert(message);
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    doc.body.classList.remove('hq-settings-open');
  }

  function ensureModal() {
    if (modal) return modal;
    modal = createModal(doc);
    modal.addEventListener('click', (event) => {
      if (event.target.closest('[data-hq-close]')) closeModal();
    });
    modal.addEventListener('change', (event) => {
      const input = event.target.closest('input[type="file"]');
      if (!input || !input.files[0]) return;
      const row = input.closest('.hq-settings-row');
      fileDataUrl(input.files[0]).then((url) => {
        row.querySelector('.hq-settings-preview img').src = url;
        row.dataset.pendingImage = url;
      }).catch((error) => notify(error.message));
    });
    modal.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!isAdmin || !backend || typeof backend.saveSiteContent !== 'function') return;
      const form = event.currentTarget;
      const next = items.map((item, index) => {
        const row = form.querySelector(`[data-hq-index="${index}"]`);
        return {
          label: form.elements[`label-${index}`].value.trim(),
          action: form.elements[`action-${index}`].value,
          image: row.dataset.pendingImage || item.image,
        };
      });
      const payload = next.map((item, index) => ({ label: item.label, action: item.action, imageIndex: index }));
      const save = form.querySelector('[type="submit"]');
      save.disabled = true;
      save.textContent = '저장 중…';
      backend.saveSiteContent(CONTENT_KEY, {
        title: '홈 원형 카테고리', subtitle: '', body: JSON.stringify(payload), images: next.map((item) => item.image),
      }).then((content) => {
        items = payload.map((item, index) => ({
          label: item.label, action: item.action, image: content.images[index] || next[index].image,
        }));
        paint();
        closeModal();
        notify('원형 카테고리를 저장했습니다.');
      }).catch((error) => notify(`저장 실패: ${error?.message || error}`))
        .finally(() => { save.disabled = false; save.textContent = '저장'; });
    });
    return modal;
  }

  function openSettings() {
    if (!isAdmin) return;
    const editor = ensureModal();
    editor.querySelector('.hq-settings-list').innerHTML = items.map(settingsRow).join('');
    editor.hidden = false;
    doc.body.classList.add('hq-settings-open');
  }

  rail.addEventListener('click', (event) => {
    const button = event.target.closest('.hq-item');
    if (!button) return;
    const item = items[Number(button.dataset.hqIndex)];
    if (item) runAction({ action: item.action, doc, win, collection });
  });
  rail.addEventListener('scroll', syncScrollbar, { passive: true });
  win.addEventListener('resize', syncScrollbar, { passive: true });
  settingsButton.addEventListener('click', openSettings);
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
  });

  function syncAdmin(info) {
    isAdmin = !!(info && info.isAdmin);
    settingsButton.hidden = !isAdmin;
    if (!isAdmin) closeModal();
  }

  function load() {
    if (!backend || typeof backend.getSiteContent !== 'function') return Promise.resolve();
    return backend.getSiteContent(CONTENT_KEY).then((content) => {
      items = normalizedItems(content);
      paint();
    }).catch(() => paint());
  }

  paint();
  if (backend && typeof backend.onAuthChange === 'function') backend.onAuthChange((user, info) => syncAdmin(info));
  if (backend?.ready && typeof backend.ready.then === 'function') backend.ready.then(load, () => {});
  else load();
}
