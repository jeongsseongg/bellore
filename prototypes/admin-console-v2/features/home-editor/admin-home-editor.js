import { icon } from '../../ui/icons.js';

const placementLabels = {
  header: '공통 헤더',
  home: '홈',
  collection: '판매시계 컬렉션'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function stateBadge(section) {
  return `<em class="editor-state is-${escapeHtml(section.tone)}">${escapeHtml(section.state)}</em>`;
}

function previewSection(section, index) {
  return `
    <button class="home-preview-section" type="button" data-home-section="${escapeHtml(section.id)}">
      <span class="home-preview-order">${String(index + 1).padStart(2, '0')}</span>
      <span class="home-preview-copy">
        <small>${escapeHtml(placementLabels[section.placement] || section.placement)}</small>
        <b>${escapeHtml(section.label)}</b>
        <span>${escapeHtml(section.summary)}</span>
      </span>
      ${stateBadge(section)}
      ${icon('chevron')}
    </button>`;
}

function fieldMarkup(field) {
  if (field.type === 'toggle') {
    return `
      <label class="editor-toggle-row">
        <span><b>${escapeHtml(field.label)}</b><small>운영 저장 항목 예시 · 이 시안에서는 변경되지 않습니다.</small></span>
        <input type="checkbox" ${field.value ? 'checked' : ''} disabled><i aria-hidden="true"></i>
      </label>`;
  }
  if (field.type === 'select') {
    return `
      <label class="editor-field"><span>${escapeHtml(field.label)}</span>
        <select disabled aria-label="${escapeHtml(field.label)}">
          ${field.options.map((option) => `<option${option === field.value ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}
        </select>
      </label>`;
  }
  return `
    <label class="editor-field"><span>${escapeHtml(field.label)}</span>
      <input type="${field.type === 'number' ? 'text' : 'text'}" value="${escapeHtml(field.value)}" readonly aria-readonly="true">
    </label>`;
}

function factsMarkup(section) {
  if (!section.facts?.length) return '';
  return `
    <section class="editor-detail-block">
      <div class="editor-detail-title"><span>현재 운영 규칙</span><small>${escapeHtml(section.source)}</small></div>
      <dl class="editor-facts">
        ${section.facts.map((fact) => `<div><dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd></div>`).join('')}
      </dl>
    </section>`;
}

function fieldsMarkup(section) {
  if (!section.fields?.length) return '';
  return `
    <section class="editor-detail-block">
      <div class="editor-detail-title"><span>운영 배너 항목</span><small>읽기 전용 저장 구조 미리보기</small></div>
      <div class="editor-fields">${section.fields.map(fieldMarkup).join('')}</div>
    </section>`;
}

function imagesMarkup(section) {
  if (!section.images?.length) return '';
  return `
    <section class="editor-detail-block">
      <div class="editor-detail-title"><span>이미지 항목</span><small>업로드는 운영에 연결하지 않음</small></div>
      <div class="editor-image-grid">
        ${section.images.map((image) => `
          <article class="editor-image-card">
            <span class="editor-image-icon">${icon('banner')}</span>
            <div><b>${escapeHtml(image.label)}</b><p>${escapeHtml(image.spec)}</p><code>${escapeHtml(image.column)}</code></div>
            <div class="editor-image-actions">
              <em class="${image.required ? 'is-required' : ''}">${image.required ? '필수' : '선택'}</em>
              <button type="button" disabled>이미지 업로드 미연결</button>
            </div>
          </article>`).join('')}
      </div>
    </section>`;
}

function itemsMarkup(section) {
  if (!section.items?.length) return '';
  return `
    <section class="editor-detail-block">
      <div class="editor-detail-title"><span>전체 항목</span><small>${escapeHtml(section.itemCount)}</small></div>
      <div class="editor-item-list">
        ${section.items.map((item, index) => `<span><i>${index + 1}</i>${escapeHtml(item)}</span>`).join('')}
      </div>
    </section>`;
}

function driversMarkup(section) {
  if (!section.drivers?.length) return '';
  return `
    <section class="editor-detail-block">
      <div class="editor-detail-title"><span>상품 편집으로 간접 제어</span><small>홈 영역 자체에는 저장하지 않음</small></div>
      <div class="editor-driver-list">
        ${section.drivers.map((driver) => `<span>${icon('watch')}<b>${escapeHtml(driver)}</b></span>`).join('')}
      </div>
    </section>`;
}

function inclusionMarkup(section) {
  if (!section.inclusion?.length) return '';
  return `
    <section class="editor-detail-block inclusion-preview">
      <div class="editor-detail-title"><span>왜 이 영역에 포함되는지</span><small>운영 상품이 아닌 규칙 판정 미리보기</small></div>
      <div class="inclusion-list">
        ${section.inclusion.map((rule) => `
          <div><i aria-hidden="true">${rule.pass ? '✓' : '–'}</i><b>${escapeHtml(rule.label)}</b><span>${escapeHtml(rule.value)}</span></div>`).join('')}
      </div>
    </section>`;
}

function notesMarkup(section) {
  if (!section.notes?.length) return '';
  return `
    <div class="editor-notes">
      ${section.notes.map((note) => `<p>${icon('audit')}<span>${escapeHtml(note)}</span></p>`).join('')}
    </div>`;
}

function actionMarkup(section) {
  const isCodeOnly = section.mode === 'code';
  const helper = isCodeOnly
    ? '현재는 코드 자산입니다. 데이터 저장과 화면 연결 규칙을 먼저 설계해야 합니다.'
    : '이 버튼은 관련 시안 화면으로만 이동하며 운영 데이터를 저장하지 않습니다.';
  const button = section.action
    ? `<button class="editor-cta" type="button" data-editor-action="navigate" data-editor-target="${escapeHtml(section.action.target)}">${escapeHtml(section.action.label)} ${icon('arrow')}</button>`
    : '<button class="editor-cta is-disabled" type="button" disabled>새 저장 계약 필요</button>';
  return `
    <div class="editor-actionbar">
      <div><b>운영 저장 없음</b><span>${escapeHtml(helper)}</span></div>
      ${button}
    </div>`;
}

function settingsMarkup(section) {
  return `
    <div class="editor-form-heading">
      <div>
        <span>${escapeHtml(placementLabels[section.placement] || section.placement)} · ${escapeHtml(section.itemCount)}</span>
        <h2>${escapeHtml(section.label)}</h2>
        <p>${escapeHtml(section.summary)}</p>
      </div>
      ${stateBadge(section)}
    </div>
    <div class="editor-source"><span>운영 원본</span><code>${escapeHtml(section.source)}</code></div>
    ${fieldsMarkup(section)}
    ${factsMarkup(section)}
    ${inclusionMarkup(section)}
    ${driversMarkup(section)}
    ${imagesMarkup(section)}
    ${itemsMarkup(section)}
    ${notesMarkup(section)}
    ${actionMarkup(section)}`;
}

function inventoryCard(section) {
  return `
    <article class="home-inventory-card">
      <div class="home-inventory-meta"><span>${escapeHtml(placementLabels[section.placement] || section.placement)}</span><em>${escapeHtml(section.itemCount)}</em></div>
      ${stateBadge(section)}
      <h3>${escapeHtml(section.label)}</h3>
      <p>${escapeHtml(section.summary)}</p>
      <ul>${section.controls.map((control) => `<li>${escapeHtml(control)}</li>`).join('')}</ul>
      <button type="button" data-home-section="${escapeHtml(section.id)}">운영 구조 보기 ${icon('arrow')}</button>
    </article>`;
}

function summaryMarkup(data) {
  const derived = data.sections.filter((section) => section.mode === 'derived').length;
  const persisted = data.sections.filter((section) => section.mode === 'persisted').length;
  const newContract = data.sections.filter((section) => section.mode === 'code' || section.mode === 'hybrid').length;
  return `
    <div class="editor-summary-strip">
      <span>${icon('home')}<b>${data.sections.length}개 관리 항목</b><small>헤더·홈·컬렉션 포함</small></span>
      <span>${icon('watch')}<b>${derived}개 자동 상품 영역</b><small>상품 편집 · 왜 포함되는지 미리보기</small></span>
      <span>${icon('banner')}<b>${persisted}개 기존 저장 구조</b><small>홈·마이페이지 배너</small></span>
      <span>${icon('audit')}<b>${newContract}개 계약 필요</b><small>코드고정·혼합 설정</small></span>
    </div>`;
}

function pageMarkup(data) {
  const current = data.sections.find((section) => section.id === 'dbBanners') || data.sections[0];
  const visibleOrder = data.sections.filter((section) => section.placement !== 'collection');
  const collectionSections = data.sections.filter((section) => section.placement === 'collection');
  return `
    <div class="workspace-page home-editor-page" data-page="homeSettings">
      <div class="page-heading">
        <div>
          <div class="heading-meta"><span class="eyebrow">홈 구성 전체 목록</span><span class="coverage-chip is-current">운영 코드 전수감사 기준</span></div>
          <h1>홈 화면 관리</h1>
          <p>자동 파생 영역, 이미 존재하는 운영 배너 저장 구조, 새 저장 계약이 필요한 코드고정 항목을 섞지 않고 구분합니다.</p>
        </div>
        <div class="page-actions">
          <button class="secondary-button" type="button" data-editor-action="preview">고객 화면 구조 확인</button>
          <button class="primary-button" type="button" disabled>운영 저장 미연결</button>
        </div>
      </div>

      <div class="home-editor-warning">${icon('audit')}<div><b>화면 시안 · 운영 저장 0건</b><p>${escapeHtml(data.prototypeNotice)}</p></div></div>
      ${summaryMarkup(data)}

      <div class="home-editor-layout">
        <section class="home-preview-panel">
          <div class="panel-heading"><div><span class="eyebrow">노출 순서</span><h2>노출 위치별 구조</h2><p>카드를 누르면 오른쪽에서 실제 규칙과 저장 계약을 확인합니다.</p></div><span class="data-note">순서 저장 없음</span></div>
          <div class="home-preview-canvas">
            <div class="home-preview-brand"><span>bellore.co.kr</span><b>운영 화면 전체 목록</b></div>
            ${visibleOrder.map(previewSection).join('')}
          </div>
          ${collectionSections.length ? `
            <div class="home-related-heading"><span>연관 화면</span><b>판매시계 컬렉션</b></div>
            <div class="home-preview-related">${collectionSections.map((section, index) => previewSection(section, index)).join('')}</div>` : ''}
        </section>
        <section class="home-control-panel" id="homeEditorSettings">${settingsMarkup(current)}</section>
      </div>

      <section class="section-block home-inventory">
        <div class="section-heading">
          <div><span class="eyebrow">전체 관리 항목</span><h2>운영 원본별 전체 항목</h2><p>‘편집 가능’과 ‘코드에 존재’를 같은 상태로 표시하지 않습니다.</p></div>
          <span class="review-chip">기존 홈 삭제 없음</span>
        </div>
        <div class="home-inventory-grid">${data.sections.map(inventoryCard).join('')}</div>
      </section>
    </div>`;
}

export function createAdminHomeEditor({ data, onToast, onNavigate }) {
  function select(root, sectionId) {
    const section = data.sections.find((item) => item.id === sectionId);
    if (!section) return;
    root.querySelectorAll('[data-home-section]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.homeSection === sectionId);
    });
    const settings = root.querySelector('#homeEditorSettings');
    if (settings) settings.innerHTML = settingsMarkup(section);
    if (window.matchMedia('(max-width: 960px)').matches) settings?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function mount(root) {
    const page = root.querySelector('.home-editor-page');
    if (!page) return;
    select(root, 'dbBanners');
    page.addEventListener('click', (event) => {
      const sectionButton = event.target.closest('[data-home-section]');
      if (sectionButton) {
        select(root, sectionButton.dataset.homeSection);
        return;
      }
      const action = event.target.closest('[data-editor-action]');
      if (!action) return;
      if (action.dataset.editorAction === 'navigate') {
        const target = action.dataset.editorTarget;
        if (typeof onNavigate === 'function') onNavigate(target);
        else onToast('관련 관리 화면으로 이동하는 화면 시안입니다. 운영 저장은 실행하지 않습니다.');
        return;
      }
      if (action.dataset.editorAction === 'preview') {
        onToast('운영 코드의 노출 구조를 읽기 전용으로 정리한 시안입니다. 실제 고객 홈이나 운영 데이터는 변경하지 않습니다.');
      }
    });
  }

  return { render: () => pageMarkup(data), mount };
}
