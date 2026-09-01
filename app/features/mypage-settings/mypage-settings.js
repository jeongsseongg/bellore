const MENU_GROUPS = Object.freeze({
  customer: [],
  vendor: [{ id: 'vendor_quotes', label: '비교견적 매물 보기', sub: '고객이 신청한 비교견적 확인' }],
  admin: [
    { id: 'vendor_quotes', label: '비교견적 매물 보기', sub: '고객이 신청한 비교견적 확인' },
    { id: 'admin_page', label: '관리자 페이지', sub: '상품·주문·회원·견적 통합 관리' }
  ]
});

function text(value) {
  return String(value == null ? '' : value).trim();
}

function actionId(button) {
  if (button.hasAttribute('data-cqd-open')) return 'vendor_quotes';
  if (button.hasAttribute('data-admin-page-open')) return 'admin_page';
  return button.dataset.mpmenu || '';
}

function createMenuButton(doc, item, current) {
  const button = current || doc.createElement('button');
  button.type = 'button';
  button.className = 'mp-menu-row mp-role-entry';
  button.removeAttribute('data-mpmenu');
  button.removeAttribute('data-cqd-open');
  button.removeAttribute('data-cqd-screen');
  button.removeAttribute('data-admin-page-open');
  if (item.id === 'vendor_quotes') {
    button.setAttribute('data-cqd-open', '');
    button.setAttribute('data-cqd-screen', 'v-watches');
  } else if (item.id === 'admin_page') {
    button.setAttribute('data-admin-page-open', '');
  } else {
    button.dataset.mpmenu = item.id;
  }
  button.replaceChildren();
  const label = doc.createElement('span');
  label.className = 'mr-label';
  label.textContent = item.label;
  button.append(label);
  if (item.sub) {
    const sub = doc.createElement('span');
    sub.className = 'mr-sub';
    sub.textContent = item.sub;
    button.append(sub);
  }
  const arrow = doc.createElement('span');
  arrow.className = 'mr-arrow';
  arrow.textContent = '›';
  button.append(arrow);
  return button;
}

function renderMenu(doc, modal, role) {
  const menu = modal.querySelector('#mpMenuList');
  const contract = MENU_GROUPS[role];
  if (!menu || !contract) return;
  if (!contract.length) {
    menu.replaceChildren();
    menu.hidden = true;
    return;
  }
  const existing = new Map([...menu.querySelectorAll('.mp-menu-row')].map((button) => [actionId(button), button]));
  const signature = contract.map((item) => `${item.id}:${item.label}`).join('|');
  const currentSignature = [...menu.children].map((node) => `${actionId(node)}:${node.querySelector('.mr-label')?.textContent || ''}`).join('|');
  if (currentSignature !== signature) {
    const fragment = doc.createDocumentFragment();
    contract.forEach((item) => fragment.append(createMenuButton(doc, item, existing.get(item.id))));
    menu.replaceChildren(fragment);
  }
  menu.hidden = false;
}

function applySafeSettings(doc, modal, configs) {
  const role = modal.dataset.accountRole;
  const content = configs[role];
  if (!content || !MENU_GROUPS[role]) return;

  const header = modal.querySelector('#mpNextGrade');
  if (header && text(content.headerMessage)) header.textContent = text(content.headerMessage);

  renderMenu(doc, modal, role);
}

export function initMypageSettings({ document: doc, service }) {
  const modal = doc.querySelector('#myPageModal');
  if (!modal || !service || typeof service.loadAll !== 'function') return { refresh: async () => {} };
  let configs = {};
  let applying = false;

  function apply() {
    if (applying) return;
    applying = true;
    try { applySafeSettings(doc, modal, configs); } finally { applying = false; }
  }

  async function refresh() {
    configs = await service.loadAll();
    apply();
    return configs;
  }

  const menu = modal.querySelector('#mpMenuList');
  const observer = new MutationObserver(apply);
  observer.observe(modal, { attributes: true, attributeFilter: ['hidden', 'data-account-role'] });
  if (menu) observer.observe(menu, { childList: true, subtree: true });
  refresh().catch((error) => console.warn('마이페이지 운영 설정 연결에 실패했습니다.', error));
  return { refresh, disconnect: () => observer.disconnect() };
}
