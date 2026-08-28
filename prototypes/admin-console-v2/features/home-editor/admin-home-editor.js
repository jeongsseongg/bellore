export function resolveHomeLayoutModuleUrl(relativePath, moduleUrl = import.meta.url) {
  const sourceTree = new URL(moduleUrl).pathname.includes('/prototypes/admin-console-v2/');
  const appPrefix = sourceTree ? '../../../../app/' : '../../../app/';
  return new URL(appPrefix + relativePath, moduleUrl).href;
}

const [layoutConfigModule, layoutRuntimeModule] = await Promise.all([
  import(resolveHomeLayoutModuleUrl('features/home-layout/home-layout-config.js?v=20260827-home-block-editor-v1')),
  import(resolveHomeLayoutModuleUrl('features/home-layout/home-layout.js?v=20260827-home-block-editor-v1'))
]);
const { HOME_BLOCKS, cloneHomeLayoutDefaults, normalizeHomeLayout } = layoutConfigModule;
const { applyHomeLayoutConfig } = layoutRuntimeModule;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function pageMarkup() {
  return `
    <div class="workspace-page home-layout-editor-page" data-page="homeSettings">
      <div class="page-heading">
        <div>
          <div class="heading-meta"><span class="eyebrow">화면 관리</span><span class="coverage-chip is-current">운영 홈 연결</span></div>
          <h1>홈 화면 관리</h1>
          <p>왼쪽이나 실제 홈에서 블록을 끌어 순서를 바꾸고, 문구는 실제 화면에서 두 번 눌러 바로 수정합니다.</p>
        </div>
        <div class="page-actions"><button class="secondary-button" type="button" data-home-action="reset">기본값 복원</button><button class="primary-button" type="button" data-home-action="save">변경사항 저장</button></div>
      </div>
      <div class="home-layout-editor-guide"><span><b>1</b> 블록 선택</span><span><b>2</b> 끌어서 순서 변경</span><span><b>3</b> 문구 두 번 눌러 수정</span><small>배너 이미지와 연결 상품은 기존 배너·상품 관리에서 수정합니다.</small></div>
      <section class="home-layout-editor-shell">
        <aside class="home-layout-blocks" aria-label="홈 화면 블록"><div class="home-layout-panel-head"><b>화면 블록</b><small>끌어서 이동</small></div><div data-home-block-list></div></aside>
        <div class="home-layout-preview"><div class="home-layout-panel-head"><b>실제 고객 홈</b><small>문구를 두 번 눌러 수정</small></div><div class="home-layout-frame-wrap"><iframe data-home-frame src="../../index.html?home-editor-preview=1#home" title="실제 벨로르 홈 화면"></iframe></div></div>
        <aside class="home-layout-inspector" aria-label="선택 블록 설정"><div data-home-inspector></div></aside>
      </section>
      <p class="home-layout-save-state" data-home-state aria-live="polite">저장된 운영 설정을 불러오는 중입니다.</p>
    </div>`;
}

function definition(id) { return HOME_BLOCKS.find((item) => item.id === id); }

function listMarkup(config, selectedId) {
  return config.order.map((id, index) => {
    const block = definition(id);
    const visible = config.blocks[id]?.visible !== false;
    return `<button class="home-layout-block${selectedId === id ? ' is-selected' : ''}${visible ? '' : ' is-hidden'}" type="button" draggable="true" data-home-block="${id}"><span class="home-layout-drag" aria-hidden="true">⋮⋮</span><i>${index + 1}</i><span><b>${escapeHtml(block.label)}</b><small>${visible ? '화면에 표시' : '숨김'}</small></span></button>`;
  }).join('');
}

function inspectorMarkup(config, selectedId) {
  const block = definition(selectedId);
  const values = config.blocks[selectedId] || {};
  if (!block) return '';
  const fields = [block.titleSelector && ['title', '제목'], block.subtitleSelector && ['subtitle', '설명'], block.moreSelector && ['moreText', '더보기 문구']].filter(Boolean);
  return `<div class="home-layout-inspector-head"><span>선택한 블록</span><h2>${escapeHtml(block.label)}</h2><p>${fields.length ? '입력창이나 실제 홈의 문구를 수정할 수 있습니다.' : '이 블록의 내용은 연결된 관리 화면에서 수정합니다.'}</p></div>
    <label class="home-layout-visible"><span><b>화면 표시</b><small>고객 홈에서 이 블록을 표시합니다.</small></span><input type="checkbox" data-home-visible ${values.visible !== false ? 'checked' : ''}></label>
    <div class="home-layout-fields">${fields.map(([key, label]) => `<label><span>${label}</span><input data-home-field="${key}" value="${escapeHtml(values[key] || '')}"></label>`).join('')}</div>
    <p class="home-layout-tip">${fields.length ? '실제 홈의 강조된 문구를 두 번 눌러도 같은 값이 수정됩니다.' : '이미지·링크·상품 구성은 배너 관리 또는 상품 관리에서 수정하세요.'}</p>`;
}

function selectAll(doc, node) {
  const range = doc.createRange();
  range.selectNodeContents(node);
  const selection = doc.getSelection();
  selection.removeAllRanges(); selection.addRange(range);
}

function fieldEntries(block) {
  return [block.titleSelector && ['title', block.titleSelector], block.subtitleSelector && ['subtitle', block.subtitleSelector], block.moreSelector && ['moreText', block.moreSelector]].filter(Boolean);
}

export function createAdminHomeLayoutEditor({ settingsService, onToast } = {}) {
  let config = cloneHomeLayoutDefaults();
  let selectedId = config.order[0];
  let dirty = false;
  let draggedId = '';

  function mount(root) {
    const page = root.querySelector('.home-layout-editor-page');
    if (!page || page.dataset.mounted) return;
    page.dataset.mounted = 'true';
    const list = page.querySelector('[data-home-block-list]');
    const inspector = page.querySelector('[data-home-inspector]');
    const frame = page.querySelector('[data-home-frame]');
    const state = page.querySelector('[data-home-state]');
    const editorWindow = page.ownerDocument.defaultView || window;
    const setState = (message) => { state.textContent = message; };
    const markDirty = () => { dirty = true; setState('저장하지 않은 변경사항이 있습니다.'); };
    const renderControls = () => { list.innerHTML = listMarkup(config, selectedId); inspector.innerHTML = inspectorMarkup(config, selectedId); };
    const previewDoc = () => { try { return frame.contentDocument; } catch { return null; } };

    function applyPreview() {
      const doc = previewDoc();
      if (!doc?.querySelector('#home')) return;
      applyHomeLayoutConfig(doc, config); decoratePreview(doc);
    }
    function select(id) {
      if (!definition(id)) return;
      selectedId = id; renderControls();
      previewDoc()?.querySelectorAll('[data-home-layout-block]').forEach((node) => node.classList.toggle('home-editor-selected', node.dataset.homeLayoutBlock === id));
    }
    function reorder(sourceId, targetId) {
      if (!sourceId || !targetId || sourceId === targetId) return;
      const order = [...config.order];
      const from = order.indexOf(sourceId); const to = order.indexOf(targetId);
      if (from < 0 || to < 0) return;
      order.splice(to, 0, order.splice(from, 1)[0]);
      config.order = order; selectedId = sourceId; markDirty(); renderControls(); applyPreview();
    }
    function decoratePreview(doc) {
      if (!doc.getElementById('homeLayoutEditorStyle')) {
        const editorStyle = doc.createElement('style'); editorStyle.id = 'homeLayoutEditorStyle';
        editorStyle.textContent = '[data-home-layout-block]{position:relative;cursor:grab;outline:1px dashed transparent;outline-offset:-2px}[data-home-layout-block]:hover{outline-color:#43836a}[data-home-layout-block].home-editor-selected{outline:3px solid #126b4f;outline-offset:-3px}[data-home-inline-field]{cursor:text}[data-home-inline-field]:hover{background:#e5f2ec}[data-home-inline-field][contenteditable=true]{outline:2px solid #126b4f;background:#fff}';
        doc.head.append(editorStyle);
      }
      HOME_BLOCKS.forEach((block) => {
        const node = doc.querySelector(block.selector); if (!node) return;
        node.draggable = true; node.classList.toggle('home-editor-selected', block.id === selectedId);
        fieldEntries(block).forEach(([key, selector]) => {
          const field = node.querySelector(selector);
          if (field) { field.dataset.homeInlineField = key; field.dataset.homeInlineBlock = block.id; field.title = '두 번 눌러 문구 수정'; }
        });
      });
    }

    list.addEventListener('click', (event) => select(event.target.closest('[data-home-block]')?.dataset.homeBlock));
    list.addEventListener('dragstart', (event) => { draggedId = event.target.closest('[data-home-block]')?.dataset.homeBlock || ''; });
    list.addEventListener('dragover', (event) => { if (event.target.closest('[data-home-block]')) event.preventDefault(); });
    list.addEventListener('drop', (event) => { event.preventDefault(); reorder(draggedId, event.target.closest('[data-home-block]')?.dataset.homeBlock); draggedId = ''; });
    inspector.addEventListener('input', (event) => {
      if (event.target.matches('[data-home-visible]')) {
        config.blocks[selectedId].visible = event.target.checked;
        markDirty(); renderControls(); applyPreview();
      } else if (event.target.matches('[data-home-field]')) {
        config.blocks[selectedId][event.target.dataset.homeField] = event.target.value;
        markDirty(); applyPreview();
      }
    });
    frame.addEventListener('load', () => {
      const doc = previewDoc(); if (!doc) return; applyPreview();
      doc.addEventListener('click', (event) => { const node = event.target.closest('[data-home-layout-block]'); if (node) { event.preventDefault(); select(node.dataset.homeLayoutBlock); } }, true);
      doc.addEventListener('dblclick', (event) => {
        const field = event.target.closest('[data-home-inline-field]'); if (!field) return;
        event.preventDefault(); event.stopPropagation(); select(field.dataset.homeInlineBlock); field.contentEditable = 'true'; field.focus(); selectAll(doc, field);
      }, true);
      doc.addEventListener('focusout', (event) => {
        const field = event.target.closest('[data-home-inline-field][contenteditable="true"]'); if (!field) return;
        const value = field.textContent.trim(); if (value) config.blocks[field.dataset.homeInlineBlock][field.dataset.homeInlineField] = value;
        field.contentEditable = 'false'; markDirty(); renderControls(); applyPreview();
      }, true);
      doc.addEventListener('keydown', (event) => { if (event.target.matches('[data-home-inline-field][contenteditable="true"]') && event.key === 'Enter') { event.preventDefault(); event.target.blur(); } });
      doc.addEventListener('dragstart', (event) => { draggedId = event.target.closest('[data-home-layout-block]')?.dataset.homeLayoutBlock || ''; });
      doc.addEventListener('dragover', (event) => { if (event.target.closest('[data-home-layout-block]')) event.preventDefault(); });
      doc.addEventListener('drop', (event) => { event.preventDefault(); reorder(draggedId, event.target.closest('[data-home-layout-block]')?.dataset.homeLayoutBlock); draggedId = ''; });
    });
    page.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-home-action]')?.dataset.homeAction; if (!action) return;
      try {
        if (action === 'reset') {
          if (!editorWindow.confirm('홈 화면을 기본값으로 되돌릴까요? 저장 버튼을 누르기 전까지 운영 화면에는 반영되지 않습니다.')) return;
          config = cloneHomeLayoutDefaults(); selectedId = config.order[0]; dirty = true;
          renderControls(); applyPreview(); setState('기본값을 미리보기에 적용했습니다. 운영 반영은 변경사항 저장을 눌러 주세요.'); onToast?.(state.textContent);
          return;
        }
        await settingsService.saveHomePageConfig(config);
        dirty = false; renderControls(); applyPreview(); setState('운영 홈 화면 설정을 저장했습니다.'); onToast?.(state.textContent);
      } catch (error) { console.error(error); setState('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); onToast?.(state.textContent); }
    });

    renderControls();
    settingsService.loadHomePageConfig().then((saved) => { config = normalizeHomeLayout(saved); selectedId = config.order[0]; dirty = false; renderControls(); applyPreview(); setState('운영 설정을 불러왔습니다.'); })
      .catch((error) => { console.error(error); setState('운영 설정을 불러오지 못해 기본값을 표시합니다.'); });
    window.addEventListener('beforeunload', (event) => { if (dirty) event.preventDefault(); });
  }

  return { render: pageMarkup, mount };
}
