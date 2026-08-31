import { cloneRoleContent, EDITABLE_ROLE_ORDER, MYPAGE_ROLE_DEFAULTS, normalizeEditableRole } from './account-role-model.js?v=20260831-mypage-admin-contract-v1';
import { EDITOR_BLOCKS, renderBlockInspector, renderBlockNavigator } from './account-role-block-editor.js?v=20260827-block-editor-v1';
import { bindRoleBlockInteractions } from './account-role-direct-edit.js?v=20260827-home-block-editor-v1';

const STORAGE_PREFIX = 'bellore-mypage-editor-v1:';

function escapeHTML(value) {
  return String(value == null ? '' : value).replace(/[&<>'"]/g, function (character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
  });
}

function storageKey(role) { return STORAGE_PREFIX + role; }

function mergeSaved(defaultValue, savedValue) {
  if (Array.isArray(defaultValue)) return Array.isArray(savedValue) ? savedValue : defaultValue;
  if (!defaultValue || typeof defaultValue !== 'object') {
    return savedValue == null ? defaultValue : savedValue;
  }
  const result = {};
  Object.keys(defaultValue).forEach(function (key) {
    result[key] = mergeSaved(defaultValue[key], savedValue && savedValue[key]);
  });
  return result;
}

function loadContent(previewWindow, role, initialContent) {
  const defaults = cloneRoleContent(role);
  if (initialContent && initialContent[role]) return mergeSaved(defaults, initialContent[role]);
  try {
    const saved = JSON.parse(previewWindow.localStorage.getItem(storageKey(role)) || 'null');
    return saved ? mergeSaved(defaults, saved) : defaults;
  } catch (error) {
    console.warn('저장된 마이페이지 편집값을 불러오지 못했습니다.', error);
    return defaults;
  }
}

function setValue(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  parts.slice(0, -1).forEach(function (part) { cursor = cursor[Number.isNaN(Number(part)) ? part : Number(part)]; });
  const last = parts[parts.length - 1];
  cursor[Number.isNaN(Number(last)) ? last : Number(last)] = value;
}

function renderRoleButtons(activeRole) {
  return EDITABLE_ROLE_ORDER.map(function (role) {
    return '<button type="button" data-role-switch="' + role + '" aria-pressed="' +
      String(role === activeRole) + '">' + escapeHTML(MYPAGE_ROLE_DEFAULTS[role].label) + '</button>';
  }).join('');
}

function renderNotificationPanel() {
  return '<div class="mp-notification-panel" data-notification-panel hidden><div><strong>알림</strong>' +
    '<button type="button" data-notification-close>닫기</button></div>' +
    '<button type="button" data-demo-action="새 견적 확인"><b>새 견적이 도착했습니다</b><span>방금 전</span></button>' +
    '<button type="button" data-demo-action="배송 상태 확인"><b>상품이 배송 중입니다</b><span>20분 전</span></button></div>';
}

function inlineField(path) { return ' data-inline-field="' + escapeHTML(path) + '" title="더블클릭하여 문구 수정"'; }

function headerIcon(name) {
  if (name === 'notification') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
}

function renderHeader(content, role) {
  const count = Math.max(0, Number(content.profile.notificationCount) || 0);
  const membershipLabel = role === 'admin' ? '벨로르 운영 관리자' : (role === 'vendor' ? '벨로르 업체 회원' : '벨로르 회원');
  return '<header class="mp-head preview-editable-block" data-preview-block="header" data-block-lane="fixed"><div class="mp-head-bar"><strong' + inlineField('profile.pageTitle') + '>' +
    escapeHTML(content.profile.pageTitle) + '</strong><span class="mp-head-actions">' +
    '<button type="button" class="mp-head-icon" data-notification-toggle aria-expanded="false" aria-label="알림">' +
    headerIcon('notification') + (count ? '<i>' + count + '</i>' : '') + '</button>' +
    '<button type="button" class="mp-head-icon" data-demo-action="설정" aria-label="설정">' + headerIcon('settings') + '</button></span></div>' +
    '<p class="mp-member-kicker">' + membershipLabel + '</p><div class="mp-profile"><div class="mp-profile-copy">' +
    '<button type="button" class="mp-name-row" data-demo-action="회원정보 수정"><span class="mpa-name">' +
    escapeHTML(content.profile.name) + '님</span><span class="mp-role-chip">' + escapeHTML(content.label) + '</span>' +
    '<span class="mp-name-edit">수정</span></button><p class="mp-next-grade"' + inlineField('headerMessage') + '>' + escapeHTML(content.headerMessage) +
    '</p></div></div><div class="mp-member-stats">' +
    content.stats.map(function (stat, index) {
      return '<button type="button" data-demo-action="' + escapeHTML(stat.label) + '"><span class="mp-stat-copy"><strong>' +
        escapeHTML(stat.value) + '</strong><small' + inlineField('stats.' + index + '.label') + '>' + escapeHTML(stat.label) + '</small></span></button>';
    }).join('') + '</div>' + renderNotificationPanel() + '</header>';
}

function renderOrder(content) {
  if (!content.order.visible) return '';
  return '<section class="mp-order-preview preview-editable-block" data-preview-block="order" data-block-lane="content" draggable="true" aria-label="최근 주문">' +
    '<div class="mp-order-status"><i></i><b>' + escapeHTML(content.order.status) + '</b></div>' +
    '<div class="mp-order-surface"><div class="mp-order-main"><span class="mp-order-thumb"><img src="' +
    escapeHTML(content.order.image) + '" alt="' + escapeHTML(content.order.name) + '"></span><span class="mp-order-copy"><strong>' +
    escapeHTML(content.order.name) + '</strong><small>' + escapeHTML(content.order.orderNumber) + ' · ' +
    escapeHTML(content.order.courier) + '</small></span></div><div class="mp-order-actions">' +
    '<button type="button" data-demo-action="배송 조회"' + inlineField('order.primaryAction') + '>' + escapeHTML(content.order.primaryAction) + '</button><button type="button" data-demo-action="주문 상세"' + inlineField('order.secondaryAction') + '>' +
    escapeHTML(content.order.secondaryAction) + '</button></div></div></section>';
}

function renderBanner(content) {
  if (!content.banner.visible) return '';
  const imageStyle = content.banner.image
    ? ' style="background-image:linear-gradient(90deg,rgba(16,25,22,.88),rgba(16,25,22,.24)),url(&quot;' + escapeHTML(content.banner.image) + '&quot;)"'
    : '';
  return '<section class="mp-banner preview-editable-block" data-preview-block="banner" data-block-lane="content" draggable="true" aria-label="마이페이지 배너"><button type="button" data-demo-action="배너 상세"' + imageStyle +
    '><span><strong' + inlineField('banner.title') + '>' + escapeHTML(content.banner.title) + '</strong><small' + inlineField('banner.description') + '>' + escapeHTML(content.banner.description) +
    '</small></span><b>보기</b></button></section>';
}

function renderMenuGroup(content, group, heading) {
  function rows(labels) {
    return labels.map(function (label) {
      return '<button type="button" class="mp-menu-row" data-demo-action="' + escapeHTML(label) + '"><span class="mp-menu-label"' +
        inlineField('menuGroups.' + group + '.' + content.menuGroups[group].indexOf(label)) + '>' + escapeHTML(label) + '</span>' + (label === '주문 내역' ? '<b>1건</b>' : '') + '</button>';
    }).join('');
  }
  return '<section class="mp-menu-group preview-editable-block" data-preview-block="' + group + '" data-block-lane="menu" draggable="true"><h2 class="mp-menu-cap"' + inlineField('labels.' + group + 'Heading') + '>' +
    escapeHTML(heading) + '</h2>' + rows(content.menuGroups[group]) + '</section>';
}

function renderMenu(content) {
  const menuOrder = (content.blockOrder || []).filter(function (id) { return id === 'trade' || id === 'activity'; });
  if (!menuOrder.includes('trade')) menuOrder.push('trade');
  if (!menuOrder.includes('activity')) menuOrder.push('activity');
  return '<nav class="mp-menu" aria-label="' + escapeHTML(content.label) + ' 마이페이지 메뉴">' +
    menuOrder.map(function (group) { return renderMenuGroup(content, group, content.labels[group + 'Heading']); }).join('') + '</nav>';
}

function renderFooter(content) {
  return '<footer class="mp-reference-footer preview-editable-block" data-preview-block="footer" data-block-lane="fixed"><img src="../../assets/logo-bellore.png" alt="BELLORE KOREA"><p' + inlineField('footer.description') + '>' +
    escapeHTML(content.footer.description) + '</p>' +
    '<a href="tel:' + escapeHTML(content.footer.phone.replace(/[^0-9+]/g, '')) + '"' + inlineField('footer.phone') + '>' + escapeHTML(content.footer.phone) + '</a>' +
    '<small' + inlineField('footer.hours') + '>' + escapeHTML(content.footer.hours) + '</small><nav><button type="button" data-demo-action="이용약관">이용약관</button>' +
    '<button type="button" data-demo-action="개인정보처리방침">개인정보처리방침</button>' +
    '<button type="button" data-demo-action="반품 교환 환불">반품·교환·환불</button><button type="button" data-demo-action="사업자정보">사업자정보</button></nav></footer>';
}

function renderTabbar() {
  const tabs = ['홈', '검색', '보관함', '시계판매', '마이'];
  return '<nav class="mp-tabbar" aria-label="하단 메뉴">' + tabs.map(function (tab, index) {
    return '<button type="button" class="' + (index === tabs.length - 1 ? 'active' : '') + '" data-demo-action="' +
      escapeHTML(tab) + '"><span>' + escapeHTML(tab) + '</span></button>';
  }).join('') + '</nav>';
}

function renderPreview(content, role, activeBlock) {
  const contentOrder = (content.blockOrder || []).filter(function (id) { return id === 'order' || id === 'banner'; });
  if (!contentOrder.includes('order')) contentOrder.push('order');
  if (!contentOrder.includes('banner')) contentOrder.push('banner');
  const contentBlocks = { order: function () { return renderOrder(content); }, banner: function () { return renderBanner(content); } };
  const markup = '<div class="mypage-app" data-preview-role="' + role + '">' + renderHeader(content, role) +
    '<main class="mp-content">' + contentOrder.map(function (id) { return contentBlocks[id](); }).join('') + renderMenu(content) + '</main>' +
    renderFooter(content) + renderTabbar() + '</div>';
  return markup.replace('data-preview-block="' + activeBlock + '"', 'data-preview-block="' + activeBlock + '" data-block-active="true"');
}

function renderShell(root, role, content, operational, activeBlock) {
  root.dataset.role = role;
  root.dataset.activeBlock = activeBlock;
  root.dataset.previewWidth = root.dataset.previewWidth || '660';
  root.classList.remove('has-unsaved-changes');
  root.innerHTML = '<header class="preview-toolbar"><div class="preview-toolbar__title"><small>화면 편집 시안</small>' +
    '<strong>고객·업체·관리자 마이페이지</strong></div><div class="preview-toolbar__roles" role="group" aria-label="미리보기 역할">' +
    renderRoleButtons(role) + '</div><div class="preview-toolbar__actions"><button type="button" data-copy-config>설정 복사</button>' +
    '<button type="button" data-reset-config>운영 기준 복원</button><button type="button" class="is-primary" data-save-config>' +
    (operational ? '운영 화면 설정 저장' : '이 브라우저에 시안 저장') + '</button>' +
    '<a href="../admin-console-v2/">기존 관리자 페이지 열기</a></div></header>' +
    '<div class="preview-notice"><strong>운영 화면과 같은 구성입니다.</strong><span>블록을 선택하면 해당 문구만 편집하고, 회원·주문 수치는 실제 데이터를 유지합니다.</span></div>' +
    '<div class="preview-workspace">' + renderBlockNavigator(content, activeBlock) +
    '<section class="preview-stage"><div class="preview-stage__head"><span><i></i>실제 화면 미리보기</span>' +
    '<div class="preview-stage__tools" role="group" aria-label="미리보기 너비"><button type="button" data-preview-size="660" aria-pressed="' +
    String(root.dataset.previewWidth === '660') + '">기본 660</button><button type="button" data-preview-size="390" aria-pressed="' +
    String(root.dataset.previewWidth === '390') + '">모바일 390</button><button type="button" data-editor-open hidden>편집 열기</button></div></div>' +
    '<div class="preview-frame" data-preview-frame data-preview-width="' + root.dataset.previewWidth + '">' +
    renderPreview(content, role, activeBlock) + '</div></section><aside class="editor-panel" data-editor-panel>' +
    renderBlockInspector(content, role, activeBlock) + '</aside></div><div class="preview-toast" data-preview-toast hidden></div>';
}

function updatePreview(root, role, content, activeBlock) {
  const frame = root.querySelector('[data-preview-frame]');
  if (frame) frame.innerHTML = renderPreview(content, role, activeBlock);
  const blockPanel = root.querySelector('.block-panel');
  if (blockPanel) blockPanel.outerHTML = renderBlockNavigator(content, activeBlock);
}

function showToast(root, text, previewWindow) {
  const toast = root.querySelector('[data-preview-toast]');
  if (!toast) return;
  toast.textContent = text;
  toast.hidden = false;
  previewWindow.clearTimeout(showToast.timer);
  showToast.timer = previewWindow.setTimeout(function () { toast.hidden = true; }, 2200);
}

async function copyConfig(root, role, content, previewWindow) {
  const payload = JSON.stringify({ role: role, content: content }, null, 2);
  try {
    await previewWindow.navigator.clipboard.writeText(payload);
    showToast(root, '현재 역할 설정을 복사했습니다.', previewWindow);
  } catch (error) {
    console.warn('설정 복사에 실패했습니다.', error);
    showToast(root, '복사할 수 없습니다. 브라우저 권한을 확인해 주세요.', previewWindow);
  }
}

function createPreviewSession(options) {
  const root = options && options.root;
  const previewWindow = options && options.window;
  const syncUrl = !options || options.syncUrl !== false;
  const persistence = options && options.persistence;
  const initialContent = options && options.initialContent;
  const operational = !!(persistence && typeof persistence.save === 'function');
  if (!root || !previewWindow) throw new Error('마이페이지 편집 시안 초기화 대상이 없습니다.');
  const params = new URLSearchParams(previewWindow.location.search);
  const activeRole = normalizeEditableRole(params.get('role'));
  if (syncUrl && params.get('role') !== activeRole) {
    const normalizedUrl = new URL(previewWindow.location.href);
    normalizedUrl.searchParams.set('role', activeRole);
    previewWindow.history.replaceState({}, '', normalizedUrl);
  }
  const session = { root, previewWindow, syncUrl, persistence, initialContent, operational,
    activeRole, activeBlock: 'header', drafts: {}, dirtyRoles: new Set(), content: null };
  session.content = getDraft(session, activeRole);
  return session;
}

function getDraft(session, role) {
  if (!session.drafts[role]) session.drafts[role] = loadContent(session.previewWindow, role, session.initialContent);
  return session.drafts[role];
}

function selectBlock(session, blockId) {
  if (!EDITOR_BLOCKS.some(function (block) { return block.id === blockId; })) return;
  session.activeBlock = blockId;
  session.root.dataset.activeBlock = blockId;
  session.root.querySelectorAll('[data-block-select]').forEach(function (button) {
      const selected = button.dataset.blockSelect === blockId;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
  });
  session.root.querySelectorAll('[data-preview-block]').forEach(function (block) {
      if (block.dataset.previewBlock === blockId) block.setAttribute('data-block-active', 'true');
      else block.removeAttribute('data-block-active');
  });
  const editor = session.root.querySelector('[data-editor-panel]');
  if (editor) editor.innerHTML = renderBlockInspector(session.content, session.activeRole, blockId);
}

function markDirty(session) {
  session.dirtyRoles.add(session.activeRole);
  session.root.classList.add('has-unsaved-changes');
}

function reorderBlock(session, sourceId, targetId) {
  const source = EDITOR_BLOCKS.find(function (block) { return block.id === sourceId; });
  const target = EDITOR_BLOCKS.find(function (block) { return block.id === targetId; });
  if (!source || !target || source.lane === 'fixed' || source.lane !== target.lane) return false;
  const order = [...session.content.blockOrder];
  const from = order.indexOf(sourceId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return false;
  order.splice(from, 1);
  order.splice(to, 0, sourceId);
  session.content.blockOrder = order;
  session.activeBlock = sourceId;
  markDirty(session);
  renderShell(session.root, session.activeRole, session.content, session.operational, session.activeBlock);
  session.root.classList.add('has-unsaved-changes');
  return true;
}

function handleInput(session, event) {
  const field = event.target.closest('[data-edit-field]');
  if (field) setValue(session.content, field.dataset.editField, field.type === 'checkbox' ? field.checked : field.value);
  else if (event.target.matches('[data-menu-group]')) {
    session.content.menuGroups[event.target.dataset.menuGroup] = event.target.value.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
  } else return;
  updatePreview(session.root, session.activeRole, session.content, session.activeBlock);
  markDirty(session);
}

function bindDirectEdit(session) {
  bindRoleBlockInteractions({
    root: session.root, previewWindow: session.previewWindow, setValue,
    getContent: function () { return session.content; },
    markDirty: function () { markDirty(session); },
    reorderBlock: function (source, target) { return reorderBlock(session, source, target); },
    refreshPreview: function () { updatePreview(session.root, session.activeRole, session.content, session.activeBlock); },
    selectBlock: function () { selectBlock(session, session.activeBlock); }
  });
}

function switchRole(session, role) {
  session.activeRole = normalizeEditableRole(role);
  session.content = getDraft(session, session.activeRole);
  if (session.syncUrl) {
    const next = new URL(session.previewWindow.location.href);
    next.searchParams.set('role', session.activeRole);
    session.previewWindow.history.replaceState({}, '', next);
  }
  renderShell(session.root, session.activeRole, session.content, session.operational, session.activeBlock);
  session.root.classList.toggle('has-unsaved-changes', session.dirtyRoles.has(session.activeRole));
}

async function saveConfig(session) {
  try {
    if (session.operational) await session.persistence.save(session.activeRole, session.content);
    else session.previewWindow.localStorage.setItem(storageKey(session.activeRole), JSON.stringify(session.content));
    session.dirtyRoles.delete(session.activeRole);
    session.root.classList.remove('has-unsaved-changes');
    showToast(session.root, session.operational
      ? session.content.label + ' 마이페이지 설정을 운영 데이터에 저장했습니다.'
      : session.content.label + ' 시안을 이 브라우저에 저장했습니다.', session.previewWindow);
  } catch (error) {
    console.error('마이페이지 편집값을 저장하지 못했습니다.', error);
    showToast(session.root, error?.message || '마이페이지 설정을 저장하지 못했습니다.', session.previewWindow);
  }
}

function resetConfig(session) {
  const approved = session.previewWindow.confirm('현재 역할의 편집값을 운영 기준으로 되돌릴까요? 저장 전까지 운영 데이터에는 반영되지 않습니다.');
  if (!approved) return;
  session.content = cloneRoleContent(session.activeRole);
  session.drafts[session.activeRole] = session.content;
  renderShell(session.root, session.activeRole, session.content, session.operational, session.activeBlock);
  markDirty(session);
  showToast(session.root, session.content.label + ' 기본값을 미리보기에 적용했습니다. 저장 버튼을 눌러야 반영됩니다.', session.previewWindow);
}

function handlePanelControls(session, event) {
  const blockButton = event.target.closest('[data-block-select]');
  if (blockButton) { selectBlock(session, blockButton.dataset.blockSelect); return true; }
  const previewBlock = event.target.closest('[data-preview-block]');
  if (previewBlock && !event.target.closest('[data-demo-action], [data-notification-toggle], [data-notification-close]')) {
    selectBlock(session, previewBlock.dataset.previewBlock); return true;
  }
  const collapse = event.target.closest('[data-editor-collapse]');
  const open = event.target.closest('[data-editor-open]');
  if (!collapse && !open) return false;
  session.root.classList.toggle('editor-is-collapsed', !!collapse);
  const opener = session.root.querySelector('[data-editor-open]');
  if (opener) opener.hidden = !!open;
  return true;
}

function handlePreviewControls(session, event) {
    const sizeButton = event.target.closest('[data-preview-size]');
    if (sizeButton) {
      session.root.dataset.previewWidth = sizeButton.dataset.previewSize === '390' ? '390' : '660';
      const frame = session.root.querySelector('[data-preview-frame]');
      if (frame) frame.dataset.previewWidth = session.root.dataset.previewWidth;
      session.root.querySelectorAll('[data-preview-size]').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.previewSize === session.root.dataset.previewWidth));
      });
      return true;
    }
    const notificationToggle = event.target.closest('[data-notification-toggle]');
    if (notificationToggle) {
      const panel = session.root.querySelector('[data-notification-panel]');
      const open = panel ? panel.hidden : false;
      if (panel) panel.hidden = !open;
      notificationToggle.setAttribute('aria-expanded', String(open));
      return true;
    }
    if (event.target.closest('[data-notification-close]')) {
      const panel = session.root.querySelector('[data-notification-panel]');
      const toggle = session.root.querySelector('[data-notification-toggle]');
      if (panel) panel.hidden = true;
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      return true;
    }
    return false;
}

async function handleClick(session, event) {
  const roleButton = event.target.closest('[data-role-switch]');
  if (roleButton) return switchRole(session, roleButton.dataset.roleSwitch);
  if (event.target.closest('[data-save-config]')) return saveConfig(session);
  if (event.target.closest('[data-reset-config]')) return resetConfig(session);
  if (event.target.closest('[data-copy-config]')) return copyConfig(session.root, session.activeRole, session.content, session.previewWindow);
  if (handlePanelControls(session, event) || handlePreviewControls(session, event)) return;
  const action = event.target.closest('[data-demo-action]');
  if (action) showToast(session.root, (action.dataset.demoAction || '선택한 항목') + ' 연결 전 화면입니다.', session.previewWindow);
}

export function initAccountRolePreview(options) {
  const session = createPreviewSession(options);
  renderShell(session.root, session.activeRole, session.content, session.operational, session.activeBlock);
  session.root.addEventListener('input', function (event) { handleInput(session, event); });
  bindDirectEdit(session);
  session.root.addEventListener('click', function (event) { handleClick(session, event); });
}
