import { displayDetailValue, displayFieldLabel, displayText } from './admin-display-text.js?v=20260826-catalog-ledger-v3';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function inputValue(value, type) {
  if (type === 'datetime-local' && value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
  }
  return value ?? '';
}

function fieldMarkup(definition, item) {
  const value = item?.[definition.name];
  const disabled = definition.disabled ? ' disabled' : '';
  const required = definition.required ? ' required' : '';
  if (definition.type === 'textarea') {
    return `<label class="operation-field is-wide"><span>${escapeHtml(definition.label)}</span><textarea name="${escapeHtml(definition.name)}" rows="4"${required}${disabled}>${escapeHtml(value)}</textarea></label>`;
  }
  if (definition.type === 'select') {
    return `<label class="operation-field"><span>${escapeHtml(definition.label)}</span><select name="${escapeHtml(definition.name)}"${required}${disabled}>${(definition.options || []).map((option) => `<option value="${escapeHtml(option)}"${String(value ?? '') === String(option) ? ' selected' : ''}>${escapeHtml(option === '' ? '선택 안 함' : displayText(option))}</option>`).join('')}</select></label>`;
  }
  if (definition.type === 'checkbox') {
    const checked = value === true || (!item && definition.checked === true);
    return `<label class="operation-check"><input type="checkbox" name="${escapeHtml(definition.name)}"${checked ? ' checked' : ''}${disabled}><span>${escapeHtml(definition.label)}</span></label>`;
  }
  if (definition.type === 'file') {
    return `<label class="operation-field is-wide"><span>${escapeHtml(definition.label)}</span><input type="file" name="${escapeHtml(definition.name)}" accept="image/*"${definition.multiple ? ' multiple' : ''}${disabled}></label>`;
  }
  const step = definition.step ? ` step="${escapeHtml(definition.step)}"` : '';
  const min = definition.min !== undefined ? ` min="${escapeHtml(definition.min)}"` : '';
  const max = definition.max !== undefined ? ` max="${escapeHtml(definition.max)}"` : '';
  return `<label class="operation-field"><span>${escapeHtml(definition.label)}</span><input type="${escapeHtml(definition.type || 'text')}" name="${escapeHtml(definition.name)}" value="${escapeHtml(inputValue(value, definition.type))}"${step}${min}${max}${required}${disabled}></label>`;
}

function groupedFields(config, fields, item) {
  const groups = config.fieldGroups || [];
  if (!groups.length) return `<div class="operation-fields">${fields.map((definition) => fieldMarkup(definition, item)).join('')}</div>`;
  return groups.map((group) => {
    const owned = fields.filter((definition) => definition.group === group);
    return owned.length ? `<section class="operation-field-group"><header><h4>${escapeHtml(group)}</h4><span>${owned.length}개 항목</span></header><div class="operation-fields">${owned.map((definition) => fieldMarkup(definition, item)).join('')}</div></section>` : '';
  }).join('');
}

function rawDetails(item) {
  const blocked = new Set(['image_urls', 'photo_urls', 'photos', 'payload', 'messages', 'bids', 'verificationEvents', 'verificationEventsLoaded']);
  const rows = Object.entries(item || {}).filter(([key, value]) => !blocked.has(key) && displayFieldLabel(key) && value !== null && typeof value !== 'object').slice(0, 18)
    .map(([key, value]) => `<dl><dt>${escapeHtml(displayFieldLabel(key))}</dt><dd>${escapeHtml(displayDetailValue(key, value))}</dd></dl>`).join('');
  return rows || '<p class="operation-empty-detail">추가로 표시할 정보가 없습니다.</p>';
}

function verificationHistory(item) {
  if (!item?.verificationEventsLoaded) return '';
  const events = item.verificationEvents || [];
  const content = events.length ? events.map((event) => {
    const reason = event.metadata?.reason || event.reason_code || '사유 기록 없음';
    return `<div class="operation-audit-item"><div><b>${escapeHtml(displayText(event.method))}</b><span>${escapeHtml(displayText(event.status))}</span></div><p>${escapeHtml(reason)}</p><small>${escapeHtml(displayDetailValue('created_at', event.created_at))}</small></div>`;
  }).join('') : '<p class="operation-empty-detail">저장된 인증 처리 이력이 없습니다.</p>';
  return `<section class="drawer-section"><div class="drawer-section-head"><h3>인증 처리 이력</h3><span>최근 ${events.length}건</span></div><div class="operation-audit-list">${content}</div></section>`;
}

function catalogHistory(item) {
  if (!item?.operationEventsLoaded) return '';
  const events = item.operationEvents || [];
  const prices = item.priceVersions || [];
  const movements = item.inventoryMovements || [];
  const assignments = item.displayAssignments || [];
  const actor = (value) => value ? `처리자 ${String(value).slice(0, 8)}` : '서버 자동 처리';
  const eventRows = events.length ? events.map((event) => `<div class="operation-audit-item"><div><b>${escapeHtml(event.action)}</b><span>${escapeHtml(displayDetailValue('created_at', event.created_at))}</span></div><p>${escapeHtml(event.reason || '자동 기록')} · ${escapeHtml(actor(event.actor_user_id))}</p></div>`).join('') : '<p class="operation-empty-detail">저장된 변경 이력이 없습니다.</p>';
  const priceRows = prices.map((version) => `<div class="operation-audit-item"><div><b>${Number(version.sale_price || version.price || 0).toLocaleString('ko-KR')}원</b><span>${escapeHtml(displayDetailValue('created_at', version.effective_from))}</span></div><p>정상가 ${Number(version.price || 0).toLocaleString('ko-KR')}원 · 수수료 ${(Number(version.commission_rate || 0) * 100).toLocaleString('ko-KR')}% · 예상정산 ${Number(version.expected_settlement || 0).toLocaleString('ko-KR')}원</p><small>${escapeHtml(version.reason || '가격 변경')} · ${escapeHtml(actor(version.actor_user_id))}${version.effective_until ? ` · 종료 ${escapeHtml(displayDetailValue('created_at', version.effective_until))}` : ''}</small></div>`).join('');
  const movementRows = movements.map((movement) => `<div class="operation-audit-item"><div><b>${escapeHtml(displayText(movement.from_status || 'expected'))} → ${escapeHtml(displayText(movement.to_status))}</b><span>${escapeHtml(displayDetailValue('created_at', movement.created_at))}</span></div><p>${escapeHtml(movement.from_location || '위치 미기록')} → ${escapeHtml(movement.to_location || '위치 미기록')}</p><small>${escapeHtml(movement.reason || '재고 이동')} · ${escapeHtml(actor(movement.actor_user_id))}</small></div>`).join('');
  const assignmentRows = assignments.map((assignment) => `<div class="operation-audit-item"><div><b>${escapeHtml(assignment.channel || '판매시계')}</b><span>순서 ${Number(assignment.sort_order || 0)}</span></div><p>${escapeHtml(assignment.section_key || '일반 목록')} · ${assignment.active === false ? '중지' : '사용중'}</p><small>${assignment.starts_at ? escapeHtml(displayDetailValue('created_at', assignment.starts_at)) : '즉시'} ~ ${assignment.ends_at ? escapeHtml(displayDetailValue('created_at', assignment.ends_at)) : '종료 없음'} · ${escapeHtml(actor(assignment.actor_user_id))}</small></div>`).join('');
  return `<section class="drawer-section"><div class="drawer-section-head"><h3>상품 운영 이력</h3><span>변경 ${events.length}건 · 가격 ${prices.length}건 · 재고 ${movements.length}건 · 전시 ${assignments.length}건</span></div><div class="operation-history-columns"><div><h4>전체 변경</h4>${eventRows}</div><div><h4>가격 이력</h4>${priceRows || '<p class="operation-empty-detail">가격 이력이 없습니다.</p>'}</div><div><h4>재고 이동</h4>${movementRows || '<p class="operation-empty-detail">재고 이동 이력이 없습니다.</p>'}</div><div><h4>전시 배치</h4>${assignmentRows || '<p class="operation-empty-detail">전시 배치가 없습니다.</p>'}</div></div></section>`;
}

export function renderOperationPage(config, state) {
  return `<div class="workspace-page module-page operation-page" data-page="${escapeHtml(state.viewId)}">
    <div class="page-heading"><div><div class="heading-meta"><span class="eyebrow">운영 데이터</span><span class="coverage-chip is-current">실제 연결</span></div><h1>${escapeHtml(config.title)}</h1><p>${escapeHtml(config.description)}</p></div>
      <div class="page-actions"><button class="secondary-button" type="button" data-operation-refresh>새로고침</button>${config.primaryAction ? `<button class="primary-button" type="button" data-operation-create>${escapeHtml(config.primaryAction)}</button>` : ''}</div>
    </div>
    <section class="records-panel operation-records">
      <div class="module-toolbar"><label class="operation-search"><span>목록 검색</span><input type="search" data-operation-search placeholder="번호·이름·상태 검색" value="${escapeHtml(state.query || '')}"></label><span class="operation-connection">운영 데이터 연결</span></div>
      ${(config.filters || []).length ? `<div class="operation-filter-bar">${config.filters.map((filter) => `<label><span>${escapeHtml(filter.label)}</span><select name="${escapeHtml(filter.name)}" data-operation-filter><option value="">전체</option>${filter.options.map((option) => `<option value="${escapeHtml(option)}"${String(state.filters?.[filter.name] || '') === String(option) ? ' selected' : ''}>${escapeHtml(displayText(option))}</option>`).join('')}</select></label>`).join('')}</div>` : ''}
      <div class="records-summary"><span><b>${state.filteredRows.length}</b>건 표시</span><span>${state.loading ? '불러오는 중' : (state.error ? '연결 오류' : `전체 ${state.rows.length}건`)}</span></div>
      ${state.loading ? '<div class="operation-state"><b>운영 데이터를 불러오는 중입니다.</b><span>권한과 저장소 응답을 확인하고 있습니다.</span></div>' : ''}
      ${state.error ? `<div class="operation-state is-error"><b>운영 데이터를 불러오지 못했습니다.</b><span>${escapeHtml(state.error)}</span><button type="button" data-operation-refresh>다시 시도</button></div>` : ''}
      ${!state.loading && !state.error ? `<div class="records-table operation-table is-columns-${config.columns.length}"><div class="record-head"><span>${escapeHtml(config.columns[0] || '항목')}</span>${config.columns.slice(1).map((column) => `<span>${escapeHtml(column)}</span>`).join('')}<span>상태</span></div><div class="record-body">${state.filteredRows.length ? state.filteredRows.map((row) => renderOperationRow(row, config)).join('') : '<div class="operation-state"><b>표시할 운영 데이터가 없습니다.</b><span>검색 조건을 바꾸거나 새 항목을 등록해 주세요.</span></div>'}</div></div>` : ''}
    </section>
  </div>`;
}

function renderOperationRow(row, config) {
  return `<button class="record-row operation-row" type="button" data-operation-id="${escapeHtml(row.id)}">
    <div class="record-primary">${row.image ? `<img src="${escapeHtml(row.image)}" alt="">` : '<span class="operation-record-mark"></span>'}<span><b>${escapeHtml(row.id)}</b><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.sub)}</small></span></div>
    ${(row.cells || []).map((cell, index) => `<div class="record-cell" data-label="${escapeHtml(config.columns[index + 1] || '')}">${escapeHtml(displayText(cell))}</div>`).join('')}
    <div class="record-status" data-label="상태"><span class="status-chip is-${escapeHtml(row.status)}">${escapeHtml(displayText(row.statusLabel))}</span></div>
  </button>`;
}

export function renderOperationDrawer(config, row, creating = false) {
  const item = row?.raw || null;
  const fields = config.fields?.(item) || [];
  const actions = (config.actions || []).filter((action) => !creating && (!action.when || action.when(item)));
  const bids = item?.bids || [];
  return `<div class="drawer-header"><div><span class="eyebrow">${creating ? '새 항목' : '운영 상세'}</span><h2>${escapeHtml(creating ? config.primaryAction : row.id)}</h2></div><button class="icon-button" type="button" data-operation-close aria-label="닫기">×</button></div>
    <form class="operation-form" data-operation-form>
      <div class="drawer-scroll">
        ${row ? `<div class="generic-case-hero">${row.image ? `<img src="${escapeHtml(row.image)}" alt="">` : '<span class="operation-record-mark is-large"></span>'}<div><span class="status-chip is-${escapeHtml(row.status)}">${escapeHtml(displayText(row.statusLabel))}</span><h3>${escapeHtml(row.title)}</h3><p>${escapeHtml(row.sub)}</p></div></div>` : ''}
        ${config.readOnly ? `<section class="drawer-section"><div class="drawer-section-head"><h3>운영 응답</h3></div><div class="case-id-grid is-single">${rawDetails(item)}</div></section>` : `<section class="drawer-section"><div class="drawer-section-head"><h3>수정 항목</h3><span>저장 즉시 운영 반영</span></div>${groupedFields(config, fields, item)}</section>`}
        ${bids.length ? `<section class="drawer-section"><div class="drawer-section-head"><h3>등록 제안</h3><span>${bids.length}건</span></div><div class="operation-bids">${bids.map((bid) => `<div><b>${escapeHtml(bid.vendor_name || '등록 업체')}</b><strong>${Number(bid.amount || 0).toLocaleString('ko-KR')}원</strong><small>${escapeHtml(bid.vendor_phone || bid.message || '')}</small></div>`).join('')}</div></section>` : ''}
        ${item?.messages?.length ? `<section class="drawer-section"><div class="drawer-section-head"><h3>상담 대화</h3><span>${item.messages.length}건</span></div><div class="operation-messages">${item.messages.slice().reverse().map((message) => `<div class="is-${escapeHtml(message.sender_role || 'customer')}"><b>${escapeHtml(displayText(message.sender_role || 'customer'))}</b><p>${escapeHtml(message.body)}</p><small>${escapeHtml(message.created_at || '')}</small></div>`).join('')}</div></section>` : ''}
        ${verificationHistory(item)}
        ${catalogHistory(item)}
        ${item && !config.readOnly ? `<section class="drawer-section"><div class="drawer-section-head"><h3>추가 정보</h3></div><div class="case-id-grid is-single">${rawDetails(item)}</div></section>` : ''}
      </div>
      <div class="drawer-actions operation-actions"><button class="secondary-button" type="button" data-operation-close>닫기</button>${actions.map((action) => `<button class="secondary-button${action.danger ? ' is-danger' : ''}" type="button" data-operation-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`).join('')}${config.readOnly ? '' : `<button class="primary-button" type="submit">${creating ? '등록' : '변경 저장'}</button>`}</div>
    </form>`;
}
