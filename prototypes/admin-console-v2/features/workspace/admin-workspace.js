import { icon } from '../../ui/icons.js';

const statusText = {
  current: '현재 기능',
  planned: '확장 설계'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function pageHeading({ eyebrow, title, description, current, planned, primaryAction }) {
  return `
    <div class="page-heading">
      <div>
        <div class="heading-meta">
          <span class="eyebrow">${eyebrow}</span>
          <span class="coverage-chip ${planned ? 'is-planned' : 'is-current'}">${planned ? statusText.planned : statusText.current}</span>
        </div>
        <h1>${title}</h1>
        <p>${description}</p>
      </div>
      <div class="page-actions">
        <button class="secondary-button" type="button" data-action="export">내보내기</button>
        ${primaryAction ? `<button class="primary-button" type="button" data-action="primary">${icon('plus')} ${primaryAction}</button>` : ''}
      </div>
    </div>`;
}

function metricCard(metric) {
  return `
    <button class="metric-card tone-${metric.tone}" type="button" data-view-target="${metric.target}">
      <span class="metric-icon">${icon(metric.icon)}</span>
      <span class="metric-main"><b>${metric.value}<small>${metric.unit}</small></b><em>${metric.label}</em></span>
      <span class="metric-delta">${metric.delta}</span>
      <span class="metric-arrow">${icon('chevron')}</span>
    </button>`;
}

function taskItem(item) {
  return `
    <button class="task-row level-${item.level}" type="button" data-view-target="${item.target}">
      <span class="task-icon">${icon(item.icon)}</span>
      <span class="task-copy"><b>${item.label}</b><small>${item.meta}</small></span>
      <strong>${item.count}</strong>
      ${icon('chevron', 'task-chevron')}
    </button>`;
}

function pipelineCard(pipeline) {
  const max = Math.max(...pipeline.steps.map((step) => step.value), 1);
  return `
    <button class="pipeline-card" type="button" data-view-target="${pipeline.target}">
      <div class="pipeline-head">
        <span class="pipeline-name"><i>${icon(pipeline.icon)}</i><b>${pipeline.title}</b>${pipeline.planned ? '<em>확장</em>' : ''}</span>
        <span class="pipeline-total">${pipeline.total}<small>건</small> ${icon('chevron')}</span>
      </div>
      <div class="pipeline-bars">
        ${pipeline.steps.map((step) => `
          <span class="pipeline-step">
            <i style="--bar:${Math.max(12, Math.round((step.value / max) * 100))}%"></i>
            <b>${step.value}</b><small>${step.label}</small>
          </span>`).join('')}
      </div>
    </button>`;
}

function roleCard(role) {
  return `
    <article class="role-contract tone-${role.tone}">
      <div class="role-card-head">
        <span class="role-state">${role.state}</span>
      </div>
      <h3>${role.label}</h3>
      <p>${role.summary}</p>
      <dl>
        <div><dt>진입</dt><dd>${role.entry}</dd></div>
        <div><dt>경계</dt><dd>${role.boundary}</dd></div>
      </dl>
    </article>`;
}

function renderOverviewPage(data, roles) {
  return `
    <div class="workspace-page overview-page" data-page="overview">
      <div class="overview-hero">
        <div>
          <span class="eyebrow">운영 홈</span>
          <p class="today-label">${data.dateLabel}</p>
          <h1>안녕하세요, 정성호님.</h1>
          <p class="operator-message">${data.operatorMessage}</p>
        </div>
        <div class="hero-actions">
          <button class="secondary-button" type="button" data-action="role-contract">역할 구분 보기</button>
          <button class="primary-button" type="button" data-view-target="quotes">${icon('quote')} 견적 승인하기</button>
        </div>
      </div>

      <section class="metric-grid" aria-label="오늘 핵심 현황">
        ${data.metrics.map(metricCard).join('')}
      </section>

      <div class="overview-columns">
        <section class="panel task-panel">
          <div class="panel-heading">
            <div><span class="eyebrow">처리 대기</span><h2>오늘 처리할 일</h2></div>
            <span class="live-label"><i></i> 실시간</span>
          </div>
          <div class="task-columns">
            ${data.taskGroups.map((group) => `
              <div class="task-group">
                <h3>${group.title}</h3>
                <div>${group.items.map(taskItem).join('')}</div>
              </div>`).join('')}
          </div>
        </section>

        <section class="panel signal-panel">
          <div class="panel-heading">
            <div><span class="eyebrow">운영 상태</span><h2>운영 신호</h2></div>
          </div>
          <div class="signal-body">
            <div class="signal-score"><strong>92</strong><span>운영 안정도</span></div>
            <div class="signal-list">
              <div><span>결제·주문</span><b class="ok">정상</b></div>
              <div><span>견적 72시간</span><b class="ok">정상</b></div>
              <div><span>카카오 알림</span><b class="warn">1건 확인</b></div>
              <div><span>운영 데이터</span><b class="muted">시안 미연결</b></div>
            </div>
          </div>
          <button class="signal-link" type="button" data-view-target="notifications">발송 상태 자세히 보기 ${icon('arrow')}</button>
        </section>
      </div>

      <section class="section-block">
        <div class="section-heading">
          <div><span class="eyebrow">거래 흐름</span><h2>거래 흐름</h2><p>각 숫자를 누르면 해당 업무 목록으로 이동합니다.</p></div>
          <span class="data-note">화면 시안 데이터</span>
        </div>
        <div class="pipeline-grid">${data.pipelines.map(pipelineCard).join('')}</div>
      </section>

      <div class="overview-columns lower-columns">
        <section class="panel activity-panel">
          <div class="panel-heading">
            <div><span class="eyebrow">최근 운영 기록</span><h2>최근 운영 기록</h2></div>
            <button class="text-button" type="button" data-view-target="audit">전체보기 ${icon('arrow')}</button>
          </div>
          <div class="activity-list">
            ${data.recentActivity.map((activity) => `
              <button class="activity-row" type="button" data-view-target="${activity.target}">
                <time>${activity.time}</time>
                <span><b>${activity.actor}</b><small>${activity.action}</small></span>
                <em>${activity.type}</em>
              </button>`).join('')}
          </div>
        </section>

        <section class="panel architecture-panel">
          <div class="panel-heading">
            <div><span class="eyebrow">역할별 화면 구조</span><h2>역할 분리 구조</h2></div>
          </div>
          <div class="portal-map">
            <div class="portal-core"><span>BELLORE</span><b>공통 인증 · 데이터 기준</b></div>
            <div class="portal-lines"></div>
            <div class="portal-nodes">
              <span>고객</span><span>업체</span><span class="is-planned">파트너스</span><span class="is-current">관리자</span>
            </div>
          </div>
          <p>화면과 메뉴는 분리하고, 공통 데이터 기준만 공유합니다. 역할 전환 버튼은 관리자 시안 검증용이며 실제 고객 화면에는 노출하지 않습니다.</p>
          <button class="signal-link" type="button" data-action="partner-preview">파트너스 준비 화면 보기 ${icon('arrow')}</button>
        </section>
      </div>

      <section class="section-block role-section" id="roleContracts">
        <div class="section-heading">
          <div><span class="eyebrow">역할 구분</span><h2>현재 시스템 역할 구분</h2><p>실제 저장소의 역할 계약을 기준으로 구분했습니다.</p></div>
          <span class="review-chip">공급협력사 입찰 권한 재확인</span>
        </div>
        <div class="role-grid">${roles.map(roleCard).join('')}</div>
      </section>
    </div>`;
}

function filterBar(filters) {
  return `
    <div class="module-toolbar">
      <div class="filter-tabs" role="tablist">
        ${filters.map((filter, index) => `<button class="filter-tab${index === 0 ? ' is-active' : ''}" type="button" role="tab" aria-selected="${index === 0}" data-filter="${escapeHtml(filter)}">${filter}</button>`).join('')}
      </div>
      <div class="toolbar-actions">
        <button class="toolbar-button" type="button" data-action="filter">${icon('filter')} 필터</button>
        <button class="toolbar-button" type="button" data-action="columns">열 설정</button>
      </div>
    </div>`;
}

function moduleRow(row, columns) {
  const firstCell = `
    <div class="record-primary">
      ${row.image ? `<img src="${row.image}" alt="">` : `<span class="record-placeholder">${icon('watch')}</span>`}
      <span><b>${escapeHtml(row.id)}</b><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.sub)}</small></span>
    </div>`;
  const dataCells = row.cells.map((cell, index) => `<div class="record-cell" data-label="${escapeHtml(columns[index + 2] || '')}">${escapeHtml(cell)}</div>`).join('');
  return `
    <button class="record-row" type="button" data-case-id="${escapeHtml(row.id)}" data-case-type="${escapeHtml(row.caseType || '')}">
      ${firstCell}
      ${dataCells}
      <div class="record-status"><span class="status-chip is-${row.status}">${escapeHtml(row.statusLabel)}</span>${icon('chevron')}</div>
    </button>`;
}

function capabilitiesPanel(view, viewId) {
  if (!Array.isArray(view.capabilities) || view.capabilities.length === 0) return '';
  const headingId = `${escapeHtml(viewId)}-capabilities-title`;
  return `
    <section class="capability-panel" aria-labelledby="${headingId}">
      <div class="capability-panel__head">
        <div>
          <span class="eyebrow">관리 범위</span>
          <h2 id="${headingId}">수정 가능한 항목</h2>
          <p>화면 시안에 포함된 관리 항목입니다. 운영 데이터와 저장 기능은 아직 연결하지 않았습니다.</p>
        </div>
      </div>
      <ul class="capability-list">${view.capabilities.map((capability) => `<li>${escapeHtml(capability)}</li>`).join('')}</ul>
    </section>`;
}

function renderModulePage(viewId, view) {
  return `
    <div class="workspace-page module-page" data-page="${viewId}">
      ${pageHeading(view)}
      ${view.notice ? `<div class="module-notice ${view.planned ? 'is-planned' : ''}">${icon(view.planned ? 'building' : 'shield')}<p><b>${view.planned ? '연결 전 기능' : '현재 연결 기준'}</b><span>${view.notice}</span></p></div>` : ''}
      ${capabilitiesPanel(view, viewId)}
      <section class="records-panel">
        ${filterBar(view.filters || ['전체'])}
        <div class="records-summary">
          <span><b>${view.rows.length}</b>개 예시 항목</span>
          <span>예시 데이터 · 화면 확인용</span>
        </div>
        <div class="records-table" style="--columns:${Math.max(3, view.columns.length)}">
          <div class="record-head">
            <span>${view.columns.slice(0, 2).join(' · ')}</span>
            ${view.columns.slice(2).map((column) => `<span>${column}</span>`).join('')}
            <span>상태</span>
          </div>
          <div class="record-body">${view.rows.map((row) => moduleRow(row, view.columns)).join('')}</div>
        </div>
      </section>
    </div>`;
}

function detailTimeline(detail) {
  return detail.timeline.map((item) => `
    <li class="${item.done ? 'is-done' : ''}${item.current ? ' is-current' : ''}">
      <span class="timeline-marker"></span>
      <time>${item.time}</time>
      <div><b>${item.title}</b><p>${item.detail}</p></div>
    </li>`).join('');
}

function quoteDetailMarkup(detail) {
  return `
    <div class="drawer-header">
      <div><span class="eyebrow">시계 업무 기록</span><h2>${detail.id}</h2></div>
      <button class="icon-button" type="button" data-drawer-close aria-label="닫기">${icon('close')}</button>
    </div>
    <div class="drawer-scroll">
      <div class="case-watch">
        <img src="${detail.image}" alt="${detail.title}">
        <div><span class="status-chip is-attention">${detail.status}</span><h3>${detail.title}</h3><p>${detail.reference}</p></div>
      </div>
      <div class="case-id-grid">
        <dl><dt>신청자</dt><dd>${detail.owner}</dd></dl>
        <dl><dt>연락처</dt><dd>${detail.phone}</dd></dl>
        <dl><dt>접수일시</dt><dd>${detail.submittedAt}</dd></dl>
        <dl><dt>희망금액</dt><dd>${detail.desiredPrice}</dd></dl>
      </div>
      <section class="drawer-section">
        <div class="drawer-section-head"><h3>다음 작업</h3><span>사진 6장</span></div>
        <div class="next-action-card">
          <span>${icon('inspect')}</span>
          <div><b>사진·상품정보 승인 검토</b><p>승인 시점부터 72시간 제안이 시작됩니다.</p></div>
          ${icon('chevron')}
        </div>
      </section>
      <section class="drawer-section">
        <div class="drawer-section-head"><h3>상태 타임라인</h3><button type="button">전체 기록</button></div>
        <ol class="case-timeline">${detailTimeline(detail)}</ol>
      </section>
      <section class="drawer-section">
        <div class="drawer-section-head"><h3>권한 경계</h3></div>
        <div class="boundary-note">고객에게 업체명·연락처를 공개하지 않습니다. 승인·금액·상태 변경은 서버 권한과 감사기록 연결 후 활성화합니다.</div>
      </section>
    </div>
    <div class="drawer-actions">
      <button class="secondary-button" type="button" data-action="drawer-note">관리자 메모</button>
      <button class="primary-button" type="button" data-action="drawer-approve">승인 검토 계속</button>
    </div>`;
}

function genericDetailMarkup(row, view) {
  return `
    <div class="drawer-header">
      <div><span class="eyebrow">${view.eyebrow}</span><h2>${escapeHtml(row.id)}</h2></div>
      <button class="icon-button" type="button" data-drawer-close aria-label="닫기">${icon('close')}</button>
    </div>
    <div class="drawer-scroll">
      <div class="generic-case-hero">
        ${row.image ? `<img src="${row.image}" alt="">` : `<span>${icon(viewIdToIcon(row.caseType))}</span>`}
        <div><span class="status-chip is-${row.status}">${escapeHtml(row.statusLabel)}</span><h3>${escapeHtml(row.title)}</h3><p>${escapeHtml(row.sub)}</p></div>
      </div>
      <section class="drawer-section">
        <div class="drawer-section-head"><h3>업무 정보</h3><span>예시 데이터</span></div>
        <div class="case-id-grid is-single">
          ${row.cells.map((cell, index) => `<dl><dt>${escapeHtml(view.columns[index + 2] || `항목 ${index + 1}`)}</dt><dd>${escapeHtml(cell)}</dd></dl>`).join('')}
        </div>
      </section>
      <section class="drawer-section">
        <div class="drawer-section-head"><h3>작업 원칙</h3></div>
        <div class="boundary-note">현재 기능을 새 위치에 1:1로 옮기는 시안입니다. 실제 상태 변경과 민감정보 열람은 기존 서버 권한 검증을 통과한 뒤 연결합니다.</div>
      </section>
      <section class="drawer-section">
        <div class="drawer-section-head"><h3>최근 기록</h3></div>
        <ol class="case-timeline">
          <li class="is-done"><span class="timeline-marker"></span><time>오늘</time><div><b>업무 항목 확인</b><p>운영 목록에서 상세를 열었습니다.</p></div></li>
          <li class="is-current"><span class="timeline-marker"></span><time>현재</time><div><b>다음 작업 대기</b><p>담당자와 허용된 작업을 연결할 예정입니다.</p></div></li>
        </ol>
      </section>
    </div>
    <div class="drawer-actions">
      <button class="secondary-button" type="button" data-drawer-close>닫기</button>
      <button class="primary-button" type="button" data-action="prototype-action">상세 작업 화면</button>
    </div>`;
}

function viewIdToIcon(type) {
  const map = {
    order: 'order', quote: 'quote', consignment: 'consign', return: 'return', listing: 'watch',
    inspection: 'inspect', auction: 'auction', customer: 'customer', vendor: 'vendor', partner: 'partner',
    settlement: 'settlement', coupon: 'coupon', support: 'support', banner: 'banner', advisor: 'ai',
    analytics: 'chart', notification: 'notification', audit: 'audit', permission: 'shield'
  };
  return map[type] || 'order';
}

function partnerPreviewMarkup() {
  const sections = [
    ['home', '홈 · 할 일', '승인·배송·정산 대기'],
    ['watch', '상품 · 재고', '자기 회사 상품만'],
    ['quote', '비교견적 제안', '권한 재확인 후 연결'],
    ['order', '주문 · 배송', '자기 거래 범위만'],
    ['settlement', '정산 · 수수료', '지급내역과 증빙'],
    ['chart', '성과', '조회·판매·정산 지표'],
    ['support', '담당매니저', '문의와 운영 공지'],
    ['building', '회사 · 인증', '사업자·계좌·담당자']
  ];
  return `
    <div class="drawer-header">
      <div><span class="eyebrow">파트너스 준비</span><h2>벨로르 파트너스</h2></div>
      <button class="icon-button" type="button" data-drawer-close aria-label="닫기">${icon('close')}</button>
    </div>
    <div class="drawer-scroll partner-preview">
      <div class="partner-preview-hero"><span class="partner-mark large">${icon('partner')}</span><h3>같은 데이터, 완전히 다른 권한 화면</h3><p>관리자 화면을 숨겨 재사용하지 않고 공통 화면 틀과 데이터 기준만 공유합니다.</p></div>
      <div class="partner-preview-map">
        ${sections.map(([ico, title, desc], index) => `
          <article class="${index === 2 ? 'needs-review' : ''}"><span>${icon(ico)}</span><div><b>${title}</b><small>${desc}</small></div>${index === 2 ? '<em>재확인</em>' : ''}</article>`).join('')}
      </div>
      <div class="module-notice is-planned">${icon('shield')}<p><b>역할 구분</b><span>공급협력사 역할은 현재 데이터와 정산 기준에 존재하지만 전용 포털과 견적 입찰 권한은 아직 확정하지 않습니다.</span></p></div>
    </div>
    <div class="drawer-actions"><button class="primary-button" type="button" data-drawer-close>구조 확인 완료</button></div>`;
}

export function createAdminWorkspace({ root, drawer, drawerContent, drawerScrim, overview, roles, views, specialViews = {}, onNavigate, onToast }) {
  let currentView = 'overview';

  function render(viewId = currentView) {
    currentView = viewId;
    const specialView = specialViews[viewId];
    if (specialView?.render) {
      root.innerHTML = specialView.render();
      specialView.mount?.(root);
    } else {
      root.innerHTML = viewId === 'overview'
        ? renderOverviewPage(overview, roles)
        : renderModulePage(viewId, views[viewId]);
    }
    root.focus({ preventScroll: true });
    root.scrollTo?.({ top: 0 });
  }

  function openDrawer(markup) {
    drawerContent.innerHTML = markup;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    drawerScrim.hidden = false;
    document.body.classList.add('drawer-open');
    drawer.querySelector('[data-drawer-close]')?.focus();
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawerScrim.hidden = true;
    document.body.classList.remove('drawer-open');
  }

  function openPartnerPreview() {
    openDrawer(partnerPreviewMarkup());
  }

  function search(query) {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      render(currentView === 'search' ? 'overview' : currentView);
      return;
    }
    const hits = Object.entries(views).filter(([, view]) => Array.isArray(view.rows)).flatMap(([viewId, view]) => view.rows
      .filter((row) => [row.id, row.title, row.sub, ...row.cells].join(' ').toLowerCase().includes(keyword))
      .map((row) => ({ viewId, view, row })));
    currentView = 'search';
    root.innerHTML = `
      <div class="workspace-page module-page" data-page="search">
        <div class="page-heading"><div><div class="heading-meta"><span class="eyebrow">통합 검색</span></div><h1>‘${escapeHtml(query)}’ 검색 결과</h1><p>화면 시안의 주문·견적·상품·회원·업체 예시 데이터를 통합 검색했습니다.</p></div></div>
        <section class="search-results">
          <div class="records-summary"><span><b>${hits.length}</b>건 찾음</span><span>운영 연결 후 권한 범위 내 결과만 표시</span></div>
          ${hits.length ? hits.map(({ viewId, view, row }) => `
            <button class="search-result" type="button" data-search-target="${viewId}" data-case-id="${escapeHtml(row.id)}">
              <span>${icon(viewIdToIcon(row.caseType))}</span><div><small>${view.title}</small><b>${escapeHtml(row.id)} · ${escapeHtml(row.title)}</b><p>${escapeHtml(row.sub)}</p></div><em class="status-chip is-${row.status}">${escapeHtml(row.statusLabel)}</em>${icon('chevron')}
            </button>`).join('') : '<div class="empty-state"><span>검색 결과가 없습니다.</span><p>번호, 고객명, 상품명 또는 업체명을 다시 확인해주세요.</p></div>'}
        </section>
      </div>`;
  }

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-view-target]');
    if (target) {
      onNavigate(target.dataset.viewTarget);
      return;
    }
    const action = event.target.closest('[data-action]');
    if (action) {
      if (action.dataset.action === 'role-contract') {
        document.getElementById('roleContracts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (action.dataset.action === 'partner-preview') {
        openPartnerPreview();
      } else {
        onToast('화면 구조를 확인하는 화면 시안입니다. 운영 데이터와 실제 저장·변경 기능은 연결하지 않았습니다.');
      }
      return;
    }
    const filter = event.target.closest('[data-filter]');
    if (filter) {
      const bar = filter.closest('.filter-tabs');
      bar.querySelectorAll('[data-filter]').forEach((button) => {
        const active = button === filter;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
      });
      onToast(`${filter.dataset.filter} 보기로 전환했습니다. 화면 시안에서는 목록이 고정되어 있으며 운영 데이터와 연결되지 않았습니다.`);
      return;
    }
    const searchTarget = event.target.closest('[data-search-target]');
    if (searchTarget) {
      const viewId = searchTarget.dataset.searchTarget;
      onNavigate(viewId);
      const row = views[viewId].rows.find((item) => item.id === searchTarget.dataset.caseId);
      if (row) openDrawer(row.caseType === 'quote' && row.id === views.caseDetail.id ? quoteDetailMarkup(views.caseDetail) : genericDetailMarkup(row, views[viewId]));
      return;
    }
    const rowButton = event.target.closest('[data-case-id]');
    if (rowButton && views[currentView]) {
      const row = views[currentView].rows.find((item) => item.id === rowButton.dataset.caseId);
      if (!row) return;
      const markup = row.caseType === 'quote' && row.id === 'BQ-240826-018'
        ? quoteDetailMarkup(views.caseDetail)
        : genericDetailMarkup(row, views[currentView]);
      openDrawer(markup);
    }
  });

  drawer.addEventListener('click', (event) => {
    if (event.target.closest('[data-drawer-close]')) closeDrawer();
    const action = event.target.closest('[data-action]');
    if (action) onToast('화면 시안입니다. 운영 권한과 데이터가 연결되지 않아 이 작업을 실행하지 않습니다.');
  });
  drawerScrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
  });

  return { render, search, openPartnerPreview, closeDrawer };
}
