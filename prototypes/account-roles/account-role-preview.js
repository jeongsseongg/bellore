import {
  cloneRoleContent,
  EDITABLE_ROLE_ORDER,
  MYPAGE_ROLE_DEFAULTS,
  normalizeEditableRole
} from './account-role-model.js?v=20260826-editor-v5';

const STORAGE_PREFIX = 'bellore-mypage-editor-v1:';

function escapeHTML(value) {
  return String(value == null ? '' : value).replace(/[&<>'"]/g, function (character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
  });
}

function storageKey(role) {
  return STORAGE_PREFIX + role;
}

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
  parts.slice(0, -1).forEach(function (part) {
    cursor = cursor[Number.isNaN(Number(part)) ? part : Number(part)];
  });
  const last = parts[parts.length - 1];
  cursor[Number.isNaN(Number(last)) ? last : Number(last)] = value;
}

function inputField(label, path, value, options) {
  const settings = options || {};
  const type = settings.type || 'text';
  const help = settings.help ? '<small>' + escapeHTML(settings.help) + '</small>' : '';
  return '<label class="editor-field"><span>' + escapeHTML(label) + '</span>' +
    '<input type="' + type + '" data-edit-field="' + escapeHTML(path) + '" value="' +
    escapeHTML(value) + '"' + (settings.placeholder ? ' placeholder="' + escapeHTML(settings.placeholder) + '"' : '') + '>' + help + '</label>';
}

function toggleField(label, path, checked, help) {
  return '<label class="editor-toggle"><input type="checkbox" data-edit-field="' + escapeHTML(path) + '"' +
    (checked ? ' checked' : '') + '><span aria-hidden="true"></span><b>' + escapeHTML(label) + '</b>' +
    (help ? '<small>' + escapeHTML(help) + '</small>' : '') + '</label>';
}

function renderRoleButtons(activeRole) {
  return EDITABLE_ROLE_ORDER.map(function (role) {
    return '<button type="button" data-role-switch="' + role + '" aria-pressed="' +
      String(role === activeRole) + '">' + escapeHTML(MYPAGE_ROLE_DEFAULTS[role].label) + '</button>';
  }).join('');
}

function renderEditor(content, role) {
  return '<div class="editor-panel__head"><div><small>현재 편집 역할</small><strong>' +
    escapeHTML(content.label) + ' 마이페이지</strong></div><button type="button" data-editor-collapse>편집 숨기기</button></div>' +
    '<div class="editor-panel__scroll">' +
    '<section class="editor-section"><h2>회원 헤더 <small class="editor-example-badge">예시 회원 데이터</small></h2>' +
    inputField('회원 이름', 'profile.name', content.profile.name) +
    inputField('안내 문구', 'headerMessage', content.headerMessage) +
    inputField('알림 개수', 'profile.notificationCount', content.profile.notificationCount, { type: 'number' }) +
    '<div class="editor-grid editor-grid--stats">' + content.stats.map(function (stat, index) {
      return '<div>' + inputField('수치 ' + (index + 1), 'stats.' + index + '.value', stat.value) +
        inputField('이름 ' + (index + 1), 'stats.' + index + '.label', stat.label) + '</div>';
    }).join('') + '</div></section>' +
    '<section class="editor-section"><h2>최근 주문 <small class="editor-example-badge">예시 주문 데이터</small></h2>' +
    toggleField('최근 주문 표시', 'order.visible', content.order.visible, '끄면 주문 카드가 화면에서 사라집니다.') +
    inputField('상태', 'order.status', content.order.status) +
    inputField('상품명', 'order.name', content.order.name) +
    inputField('주문번호', 'order.orderNumber', content.order.orderNumber) +
    inputField('배송 정보', 'order.courier', content.order.courier) +
    inputField('상품 이미지 경로', 'order.image', content.order.image) + '</section>' +
    '<section class="editor-section"><h2>마이페이지 배너</h2>' +
    toggleField('미리보기용 배너 표시', 'banner.visible', content.banner.visible, '실제 배너 저장은 기존 관리자 배너 관리에서 처리합니다.') +
    inputField('제목', 'banner.title', content.banner.title) +
    inputField('설명', 'banner.description', content.banner.description) +
    inputField('배경 이미지 경로', 'banner.image', content.banner.image, { placeholder: '../../assets/…' }) + '</section>' +
    '<section class="editor-section"><h2>메뉴 순서와 이름</h2><label class="editor-field"><span>거래 메뉴 · 한 줄에 하나</span>' +
    '<textarea rows="5" data-menu-group="trade">' + escapeHTML(content.menuGroups.trade.join('\n')) + '</textarea></label>' +
    '<label class="editor-field"><span>내 활동 메뉴 · 한 줄에 하나</span>' +
    '<textarea rows="5" data-menu-group="activity">' + escapeHTML(content.menuGroups.activity.join('\n')) + '</textarea>' +
    '<small>각 영역 안에서 줄 순서가 실제 화면 순서입니다.</small></label></section>' +
    '<section class="editor-section"><h2>고객센터 푸터</h2>' +
    inputField('전화번호', 'footer.phone', content.footer.phone) +
    inputField('운영시간', 'footer.hours', content.footer.hours) + '</section>' +
    '<p class="editor-role-note">' + (role === 'admin'
      ? '관리자 화면은 업체 마이페이지와 같은 구조를 사용하며 역할과 안내 문구만 구분합니다.'
      : (role === 'vendor'
        ? '업체 화면은 고객 화면과 같은 구조이며 비교견적·입찰 메뉴만 추가됩니다.'
        : '고객 화면은 현재 운영 마이페이지의 기본 구조를 기준으로 합니다.')) + '</p></div>';
}

function renderNotificationPanel() {
  return '<div class="mp-notification-panel" data-notification-panel hidden><div><strong>알림</strong>' +
    '<button type="button" data-notification-close>닫기</button></div>' +
    '<button type="button" data-demo-action="새 견적 확인"><b>새 견적이 도착했습니다</b><span>방금 전</span></button>' +
    '<button type="button" data-demo-action="배송 상태 확인"><b>상품이 배송 중입니다</b><span>20분 전</span></button></div>';
}

function headerIcon(name) {
  if (name === 'notification') {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
}

function renderHeader(content, role) {
  const count = Math.max(0, Number(content.profile.notificationCount) || 0);
  const initial = String(content.profile.name || '벨').trim().slice(0, 1) || '벨';
  const membershipLabel = role === 'admin' ? '벨로르 운영 관리자' : (role === 'vendor' ? '벨로르 업체 회원' : '벨로르 회원');
  return '<header class="mp-head"><div class="mp-head-bar"><strong>마이페이지</strong><span class="mp-head-actions">' +
    '<button type="button" class="mp-head-icon" data-notification-toggle aria-expanded="false" aria-label="알림">' +
    headerIcon('notification') + (count ? '<i>' + count + '</i>' : '') + '</button>' +
    '<button type="button" class="mp-head-icon" data-demo-action="설정" aria-label="설정">' + headerIcon('settings') + '</button></span></div>' +
    '<div class="mp-profile"><span class="mp-profile-avatar" aria-hidden="true">' + escapeHTML(initial) + '</span>' +
    '<div class="mp-profile-copy"><p class="mp-member-kicker">' + membershipLabel + '</p>' +
    '<button type="button" class="mp-name-row" data-demo-action="회원정보 수정"><span class="mpa-name">' +
    escapeHTML(content.profile.name) + '님</span><span class="mp-role-chip">' + escapeHTML(content.label) + '</span>' +
    '<span class="mp-name-edit">수정</span></button><p class="mp-next-grade">' + escapeHTML(content.headerMessage) +
    '</p></div></div><div class="mp-member-stats">' +
    content.stats.map(function (stat) {
      return '<button type="button" data-demo-action="' + escapeHTML(stat.label) + '"><span class="mp-stat-copy"><strong>' +
        escapeHTML(stat.value) + '</strong><small>' + escapeHTML(stat.label) + '</small></span></button>';
    }).join('') + '</div>' + renderNotificationPanel() + '</header>';
}

function renderOrder(content) {
  if (!content.order.visible) return '';
  return '<section class="mp-order-preview" aria-label="최근 주문"><div class="mp-section-head"><h2>최근 주문</h2>' +
    '<span class="mp-order-status"><i></i><b>' + escapeHTML(content.order.status) + '</b></span></div>' +
    '<div class="mp-order-surface"><div class="mp-order-main"><span class="mp-order-thumb"><img src="' +
    escapeHTML(content.order.image) + '" alt="' + escapeHTML(content.order.name) + '"></span><span class="mp-order-copy"><strong>' +
    escapeHTML(content.order.name) + '</strong><small>' + escapeHTML(content.order.orderNumber) + ' · ' +
    escapeHTML(content.order.courier) + '</small></span></div><div class="mp-order-actions">' +
    '<button type="button" data-demo-action="배송 조회">배송 조회</button><button type="button" data-demo-action="주문 상세">주문 상세</button></div></div></section>';
}

function renderBanner(content) {
  if (!content.banner.visible) return '';
  const imageStyle = content.banner.image
    ? ' style="background-image:linear-gradient(90deg,rgba(16,25,22,.88),rgba(16,25,22,.24)),url(&quot;' + escapeHTML(content.banner.image) + '&quot;)"'
    : '';
  return '<section class="mp-banner" aria-label="마이페이지 배너"><button type="button" data-demo-action="배너 상세"' + imageStyle +
    '><span><strong>' + escapeHTML(content.banner.title) + '</strong><small>' + escapeHTML(content.banner.description) +
    '</small></span><b>보기</b></button></section>';
}

function renderMenu(content) {
  function rows(labels) {
    return labels.map(function (label) {
      return '<button type="button" class="mp-menu-row" data-demo-action="' + escapeHTML(label) + '"><span class="mp-menu-label">' +
        escapeHTML(label) + '</span>' + (label === '주문 내역' ? '<b>1건</b>' : '') + '</button>';
    }).join('');
  }
  return '<nav class="mp-menu" aria-label="' + escapeHTML(content.label) + ' 마이페이지 메뉴">' +
    '<section class="mp-menu-group"><h2 class="mp-menu-cap">거래</h2>' + rows(content.menuGroups.trade) + '</section>' +
    '<section class="mp-menu-group"><h2 class="mp-menu-cap">내 활동</h2>' + rows(content.menuGroups.activity) + '</section></nav>';
}

function renderFooter(content) {
  return '<footer class="mp-reference-footer"><img src="../../assets/logo-bellore.png" alt="BELLORE KOREA"><p>명품시계 거래 · 통신판매</p>' +
    '<a href="tel:' + escapeHTML(content.footer.phone.replace(/[^0-9+]/g, '')) + '">' + escapeHTML(content.footer.phone) + '</a>' +
    '<small>' + escapeHTML(content.footer.hours) + '</small><nav><button type="button" data-demo-action="이용약관">이용약관</button>' +
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

function renderPreview(content, role) {
  return '<div class="mypage-app" data-preview-role="' + role + '">' + renderHeader(content, role) +
    '<main class="mp-content">' + renderOrder(content) + renderBanner(content) + renderMenu(content) + '</main>' +
    renderFooter(content) + renderTabbar() + '</div>';
}

function renderShell(root, role, content, operational) {
  root.dataset.role = role;
  root.dataset.previewWidth = root.dataset.previewWidth || '660';
  root.classList.remove('has-unsaved-changes');
  root.innerHTML = '<header class="preview-toolbar"><div class="preview-toolbar__title"><small>화면 편집 시안</small>' +
    '<strong>고객·업체·관리자 마이페이지</strong></div><div class="preview-toolbar__roles" role="group" aria-label="미리보기 역할">' +
    renderRoleButtons(role) + '</div><div class="preview-toolbar__actions"><button type="button" data-copy-config>설정 복사</button>' +
    '<button type="button" data-reset-config>운영 기준 복원</button><button type="button" class="is-primary" data-save-config>' +
    (operational ? '운영 화면 설정 저장' : '이 브라우저에 시안 저장') + '</button>' +
    '<a href="../admin-console-v2/">기존 관리자 페이지 열기</a></div></header>' +
    '<div class="preview-notice"><strong>세 역할은 구조를 공유합니다.</strong><span>고객·업체·관리자를 전환해 같은 마이페이지 구조와 역할별 문구를 비교할 수 있습니다.</span></div>' +
    '<div class="preview-workspace"><aside class="editor-panel" data-editor-panel>' + renderEditor(content, role) + '</aside>' +
    '<section class="preview-stage"><div class="preview-stage__head"><span><i></i>실제 화면 미리보기</span>' +
    '<div class="preview-stage__tools" role="group" aria-label="미리보기 너비"><button type="button" data-preview-size="660" aria-pressed="' +
    String(root.dataset.previewWidth === '660') + '">기본 660</button><button type="button" data-preview-size="390" aria-pressed="' +
    String(root.dataset.previewWidth === '390') + '">모바일 390</button><button type="button" data-editor-open hidden>편집 열기</button></div></div>' +
    '<div class="preview-frame" data-preview-frame data-preview-width="' + root.dataset.previewWidth + '">' +
    renderPreview(content, role) + '</div></section></div><div class="preview-toast" data-preview-toast hidden></div>';
}

function updatePreview(root, role, content) {
  const frame = root.querySelector('[data-preview-frame]');
  if (frame) frame.innerHTML = renderPreview(content, role);
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

export function initAccountRolePreview(options) {
  const root = options && options.root;
  const previewWindow = options && options.window;
  const syncUrl = !options || options.syncUrl !== false;
  const persistence = options && options.persistence;
  const initialContent = options && options.initialContent;
  const operational = !!(persistence && typeof persistence.save === 'function');
  if (!root || !previewWindow) throw new Error('마이페이지 편집 시안 초기화 대상이 없습니다.');

  const params = new URLSearchParams(previewWindow.location.search);
  let activeRole = normalizeEditableRole(params.get('role'));
  if (syncUrl && params.get('role') !== activeRole) {
    const normalizedUrl = new URL(previewWindow.location.href);
    normalizedUrl.searchParams.set('role', activeRole);
    previewWindow.history.replaceState({}, '', normalizedUrl);
  }
  const drafts = {};
  const dirtyRoles = new Set();
  function getDraft(role) {
    if (!drafts[role]) drafts[role] = loadContent(previewWindow, role, initialContent);
    return drafts[role];
  }
  let content = getDraft(activeRole);
  renderShell(root, activeRole, content, operational);

  root.addEventListener('input', function (event) {
    const field = event.target.closest('[data-edit-field]');
    if (field) {
      setValue(content, field.dataset.editField, field.type === 'checkbox' ? field.checked : field.value);
      updatePreview(root, activeRole, content);
      dirtyRoles.add(activeRole);
      root.classList.add('has-unsaved-changes');
      return;
    }
    if (event.target.matches('[data-menu-group]')) {
      content.menuGroups[event.target.dataset.menuGroup] = event.target.value.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
      updatePreview(root, activeRole, content);
      dirtyRoles.add(activeRole);
      root.classList.add('has-unsaved-changes');
    }
  });

  root.addEventListener('click', async function (event) {
    const roleButton = event.target.closest('[data-role-switch]');
    if (roleButton) {
      activeRole = normalizeEditableRole(roleButton.dataset.roleSwitch);
      content = getDraft(activeRole);
      if (syncUrl) {
        const next = new URL(previewWindow.location.href);
        next.searchParams.set('role', activeRole);
        previewWindow.history.replaceState({}, '', next);
      }
      renderShell(root, activeRole, content, operational);
      root.classList.toggle('has-unsaved-changes', dirtyRoles.has(activeRole));
      return;
    }

    if (event.target.closest('[data-save-config]')) {
      try {
        if (operational) await persistence.save(activeRole, content);
        else previewWindow.localStorage.setItem(storageKey(activeRole), JSON.stringify(content));
        dirtyRoles.delete(activeRole);
        root.classList.remove('has-unsaved-changes');
        showToast(root, operational
          ? content.label + ' 마이페이지 설정을 운영 데이터에 저장했습니다.'
          : content.label + ' 시안을 이 브라우저에 저장했습니다.', previewWindow);
      } catch (error) {
        console.error('마이페이지 편집값을 저장하지 못했습니다.', error);
        showToast(root, error?.message || '마이페이지 설정을 저장하지 못했습니다.', previewWindow);
      }
      return;
    }

    if (event.target.closest('[data-reset-config]')) {
      const defaultContent = cloneRoleContent(activeRole);
      if (operational && typeof persistence.reset === 'function') await persistence.reset(activeRole, defaultContent);
      else previewWindow.localStorage.removeItem(storageKey(activeRole));
      content = defaultContent;
      drafts[activeRole] = content;
      dirtyRoles.delete(activeRole);
      renderShell(root, activeRole, content, operational);
      showToast(root, operational
        ? content.label + ' 마이페이지 설정을 기본값으로 저장했습니다.'
        : content.label + ' 시안을 현재 운영 화면 기준으로 되돌렸습니다.', previewWindow);
      return;
    }

    if (event.target.closest('[data-copy-config]')) {
      await copyConfig(root, activeRole, content, previewWindow);
      return;
    }

    if (event.target.closest('[data-editor-collapse]')) {
      root.classList.add('editor-is-collapsed');
      const opener = root.querySelector('[data-editor-open]');
      if (opener) opener.hidden = false;
      return;
    }

    if (event.target.closest('[data-editor-open]')) {
      root.classList.remove('editor-is-collapsed');
      const opener = root.querySelector('[data-editor-open]');
      if (opener) opener.hidden = true;
      return;
    }

    const sizeButton = event.target.closest('[data-preview-size]');
    if (sizeButton) {
      root.dataset.previewWidth = sizeButton.dataset.previewSize === '390' ? '390' : '660';
      const frame = root.querySelector('[data-preview-frame]');
      if (frame) frame.dataset.previewWidth = root.dataset.previewWidth;
      root.querySelectorAll('[data-preview-size]').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.previewSize === root.dataset.previewWidth));
      });
      return;
    }

    const notificationToggle = event.target.closest('[data-notification-toggle]');
    if (notificationToggle) {
      const panel = root.querySelector('[data-notification-panel]');
      const open = panel ? panel.hidden : false;
      if (panel) panel.hidden = !open;
      notificationToggle.setAttribute('aria-expanded', String(open));
      return;
    }

    if (event.target.closest('[data-notification-close]')) {
      const panel = root.querySelector('[data-notification-panel]');
      const toggle = root.querySelector('[data-notification-toggle]');
      if (panel) panel.hidden = true;
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      return;
    }

    const action = event.target.closest('[data-demo-action]');
    if (action) showToast(root, (action.dataset.demoAction || '선택한 항목') + ' 연결 전 화면입니다.', previewWindow);
  });
}
