import { tradeConfigs } from './admin-trade-config.js?v=20260826-admin-crud-v1';
import { catalogConfigs } from './admin-catalog-config.js?v=20260826-catalog-ledger-v3';
import { accountConfigs } from './admin-account-config.js?v=20260826-admin-crud-v1';
import { renderOperationDrawer, renderOperationPage } from './admin-operation-view.js?v=20260826-catalog-ledger-v3';
import { renderLiveOverview } from './admin-live-overview.js?v=20260826-admin-crud-v1';
import { displayText } from './admin-display-text.js?v=20260826-catalog-ledger-v3';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function operationErrorMessage(error, fallback) {
  const raw = String(error?.message || error || '');
  const known = [
    [/schema cache|Could not find the table|relation .* does not exist/i, '운영 데이터 구조가 아직 적용되지 않았습니다. 데이터베이스 적용 후 다시 시도해 주세요.'],
    [/JWT|not authenticated|로그인|session/i, '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.'],
    [/permission denied|row-level security|RLS|forbidden|42501/i, '이 작업을 수행할 관리자 권한이 없습니다.'],
    [/Failed to fetch|NetworkError|network request/i, '서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.'],
    [/timeout|timed out/i, '요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.']
  ].find(([pattern]) => pattern.test(raw));
  if (known) return known[1];
  if (raw && /[가-힣]/.test(raw) && !/[A-Za-z]{3,}/.test(raw)) return raw;
  console.error('관리자 운영 요청 실패', error);
  return fallback;
}

function formValues(form) {
  const data = new FormData(form);
  const values = {};
  const files = {};
  form.querySelectorAll('input[type="checkbox"]').forEach((input) => { values[input.name] = input.checked; });
  for (const [name, value] of data.entries()) {
    if (value instanceof File) {
      if (!value.size) continue;
      (files[name] ||= []).push(value);
    } else {
      values[name] = value;
    }
  }
  return { values, files };
}

export function createAdminOperationController({ root, drawer, drawerContent, drawerScrim, service, operatorId, onToast }) {
  const configs = { ...tradeConfigs(service.trade, operatorId), ...catalogConfigs(service.catalog), ...accountConfigs(service.accounts) };
  const states = new Map();
  const overviewState = { loading: true, error: '', data: null };
  let currentView = '';
  let activeRow = null;
  let creating = false;
  let searchEpoch = 0;
  let drawerEpoch = 0;

  function owns(viewId) {
    return viewId === 'overview' || !!configs[viewId];
  }

  function stateFor(viewId) {
    if (!states.has(viewId)) states.set(viewId, { viewId, rows: [], filteredRows: [], loading: true, error: '', query: '', filters: {} });
    return states.get(viewId);
  }

  function drawPage(viewId) {
    const state = stateFor(viewId);
    root.innerHTML = renderOperationPage(configs[viewId], state);
  }

  async function load(viewId, { force = false } = {}) {
    if (viewId === 'overview') return loadOverview();
    const state = stateFor(viewId);
    if (!force && !state.loading && state.rows.length) return;
    state.loading = true;
    state.error = '';
    drawPage(viewId);
    try {
      const records = await configs[viewId].load();
      state.rows = (records || []).map(configs[viewId].row);
      filter(viewId, state.query, false);
      state.loading = false;
    } catch (error) {
      state.loading = false;
      state.error = operationErrorMessage(error, '운영 데이터 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      state.filteredRows = [];
    }
    if (currentView === viewId) drawPage(viewId);
  }

  function render(viewId) {
    currentView = viewId;
    if (viewId === 'overview') {
      overviewState.loading = true;
      overviewState.error = '';
      return renderLiveOverview(overviewState);
    }
    const state = stateFor(viewId);
    state.loading = true;
    state.error = '';
    return renderOperationPage(configs[viewId], state);
  }

  function mount(viewId) {
    currentView = viewId;
    if (viewId === 'overview') loadOverview();
    else load(viewId, { force: true });
  }

  async function loadOverview() {
    overviewState.loading = true;
    overviewState.error = '';
    if (currentView === 'overview') root.innerHTML = renderLiveOverview(overviewState);
    try {
      overviewState.data = await service.loadOverview();
    } catch (error) {
      overviewState.data = null;
      overviewState.error = operationErrorMessage(error, '운영 현황 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
    overviewState.loading = false;
    if (currentView === 'overview') root.innerHTML = renderLiveOverview(overviewState);
  }

  function filter(viewId, query, redraw = true) {
    const state = stateFor(viewId);
    state.query = String(query || '');
    const keyword = state.query.trim().toLowerCase();
    const searched = keyword ? state.rows.filter((row) => [row.id, row.title, row.sub, ...(row.cells || []), row.statusLabel]
      .flatMap((value) => [value, displayText(value)]).join(' ').toLowerCase().includes(keyword)) : state.rows.slice();
    const config = configs[viewId];
    state.filteredRows = config.filter ? searched.filter((row) => config.filter(row.raw, state.filters)) : searched;
    if (redraw && currentView === viewId) drawPage(viewId);
  }

  function openDrawer(row = null) {
    const epoch = ++drawerEpoch;
    activeRow = row;
    creating = !row;
    drawerContent.innerHTML = renderOperationDrawer(configs[currentView], row, creating);
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    drawerScrim.hidden = false;
    document.body.classList.add('drawer-open');
    drawer.querySelector('input, select, textarea, button')?.focus();
    if (row && configs[currentView].loadDetail) {
      configs[currentView].loadDetail(row.raw).then((detail) => {
        if (epoch !== drawerEpoch || activeRow !== row) return;
        row.raw = { ...row.raw, ...detail };
        drawerContent.innerHTML = renderOperationDrawer(configs[currentView], row, false);
      }).catch((error) => {
        if (epoch === drawerEpoch) onToast(operationErrorMessage(error, '상세 이력을 불러오지 못했습니다.'));
      });
    }
  }

  function closeDrawer() {
    drawerEpoch += 1;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawerScrim.hidden = true;
    document.body.classList.remove('drawer-open');
    activeRow = null;
    creating = false;
  }

  async function runMutation(work, successMessage) {
    const form = drawer.querySelector('[data-operation-form]');
    const buttons = form ? [...form.querySelectorAll('button')] : [];
    buttons.forEach((button) => { button.disabled = true; });
    try {
      await work();
      onToast(successMessage);
      closeDrawer();
      await load(currentView, { force: true });
    } catch (error) {
      onToast(operationErrorMessage(error, '운영 작업을 완료하지 못했습니다.'));
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  function handleRootClick(event) {
    if (!owns(currentView)) return false;
    const refresh = event.target.closest('[data-operation-refresh]');
    if (refresh) { currentView === 'overview' ? loadOverview() : load(currentView, { force: true }); return true; }
    const create = event.target.closest('[data-operation-create]');
    if (create) { openDrawer(); return true; }
    const rowButton = event.target.closest('[data-operation-id]');
    if (rowButton) {
      const row = stateFor(currentView).rows.find((item) => String(item.id) === rowButton.dataset.operationId);
      if (row) openDrawer(row);
      return true;
    }
    return !!event.target.closest('[data-operation-search]');
  }

  function handleRootInput(event) {
    if (currentView === 'overview') return false;
    const search = event.target.closest('[data-operation-search]');
    if (search && owns(currentView)) {
      filter(currentView, search.value);
      root.querySelector('[data-operation-search]')?.focus();
      return true;
    }
    const filterInput = event.target.closest('[data-operation-filter]');
    if (!filterInput || !owns(currentView)) return false;
    const state = stateFor(currentView);
    state.filters[filterInput.name] = filterInput.value;
    filter(currentView, state.query);
    root.querySelector(`[data-operation-filter][name="${filterInput.name}"]`)?.focus();
    return true;
  }

  function handleDrawerClick(event) {
    if (!owns(currentView) || currentView === 'overview') return false;
    if (event.target.closest('[data-operation-close]')) { closeDrawer(); return true; }
    const button = event.target.closest('[data-operation-action]');
    if (!button || !activeRow) return false;
    const action = (configs[currentView].actions || []).find((item) => item.id === button.dataset.operationAction);
    if (!action) return true;
    if (action.confirm && !window.confirm(action.confirm)) return true;
    if (action.promptText) {
      const entered = window.prompt(`계속하려면 '${action.promptText}'를 입력해 주세요.`);
      if (entered !== action.promptText) return true;
    }
    const { values } = formValues(drawer.querySelector('[data-operation-form]'));
    const actionInput = { ...values };
    if (action.reasonPrompt) {
      const reason = String(window.prompt(action.reasonPrompt) || '').trim();
      if (reason.length < 5) {
        window.alert('처리 사유를 5자 이상 입력해 주세요.');
        return true;
      }
      actionInput.reason = reason;
    }
    runMutation(() => action.run(activeRow.raw, actionInput), `${action.label} 작업을 완료했습니다.`);
    return true;
  }

  function handleDrawerSubmit(event) {
    const form = event.target.closest('[data-operation-form]');
    if (!form || !owns(currentView) || currentView === 'overview') return false;
    event.preventDefault();
    const { values, files } = formValues(form);
    runMutation(() => configs[currentView].save(activeRow?.raw || null, values, files), creating ? '새 항목을 등록했습니다.' : '변경 내용을 운영 데이터에 저장했습니다.');
    return true;
  }

  function searchRows(query) {
    const keyword = String(query || '').trim().toLowerCase();
    if (!keyword) return [];
    return [...states.entries()].flatMap(([viewId, state]) => state.rows.filter((row) => [row.id, row.title, row.sub, ...(row.cells || []), row.statusLabel]
      .flatMap((value) => [value, displayText(value)]).join(' ').toLowerCase().includes(keyword)).map((row) => ({ viewId, row })));
  }

  function search(query) {
    const keyword = String(query || '').trim();
    if (!keyword) return false;
    const epoch = ++searchEpoch;
    currentView = 'search';
    root.innerHTML = `<div class="workspace-page module-page" data-page="search"><div class="page-heading"><div><div class="heading-meta"><span class="eyebrow">통합 검색</span><span class="coverage-chip is-current">운영 데이터</span></div><h1>‘${escapeHtml(keyword)}’ 검색 결과</h1><p>주문·견적·판매시계·회원·업체를 운영 데이터에서 검색합니다.</p></div></div><div class="operation-state"><b>운영 데이터를 검색하고 있습니다.</b></div></div>`;
    const targets = ['orders', 'quotes', 'listings', 'customers', 'vendors', 'partners'];
    Promise.all(targets.map(async (viewId) => {
      const records = await configs[viewId].load();
      const state = stateFor(viewId);
      state.rows = (records || []).map(configs[viewId].row);
      state.filteredRows = state.rows.slice();
      state.loading = false;
    })).then(() => {
      if (epoch !== searchEpoch || currentView !== 'search') return;
      const hits = searchRows(keyword).filter((hit) => targets.includes(hit.viewId)).slice(0, 100);
      root.innerHTML = `<div class="workspace-page module-page" data-page="search"><div class="page-heading"><div><div class="heading-meta"><span class="eyebrow">통합 검색</span><span class="coverage-chip is-current">운영 데이터</span></div><h1>‘${escapeHtml(keyword)}’ 검색 결과</h1><p>주문·견적·판매시계·회원·업체를 운영 데이터에서 검색했습니다.</p></div></div><section class="search-results"><div class="records-summary"><span><b>${hits.length}</b>건 찾음</span><span>관리자 권한 범위</span></div>${hits.length ? hits.map(({ viewId, row }) => `<button class="search-result" type="button" data-view-target="${viewId}"><span class="operation-record-mark"></span><div><small>${escapeHtml(configs[viewId].title)}</small><b>${escapeHtml(row.id)} · ${escapeHtml(row.title)}</b><p>${escapeHtml(row.sub)}</p></div><em class="status-chip is-${escapeHtml(row.status)}">${escapeHtml(displayText(row.statusLabel))}</em><span>›</span></button>`).join('') : '<div class="empty-state"><span>검색 결과가 없습니다.</span><p>번호, 상품명, 고객명 또는 업체명을 다시 확인해 주세요.</p></div>'}</section></div>`;
    }).catch((error) => {
      if (epoch !== searchEpoch || currentView !== 'search') return;
      root.innerHTML = `<div class="workspace-page module-page" data-page="search"><div class="operation-state is-error"><b>운영 데이터 검색에 실패했습니다.</b><span>${escapeHtml(operationErrorMessage(error, '잠시 후 다시 시도해 주세요.'))}</span></div></div>`;
    });
    return true;
  }

  return { owns, render, mount, handleRootClick, handleRootInput, handleDrawerClick, handleDrawerSubmit, closeDrawer, searchRows, search };
}
