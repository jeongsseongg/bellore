const BUSINESS_MENU = Object.freeze({
  trade: [
    { id: 'orders', label: '주문 내역' },
    { id: 'auction', label: '경매' },
    { id: 'bids', label: '비교견적 · 입찰 내역' },
    { id: 'cart', label: '장바구니' }
  ],
  activity: [
    { id: 'interest', label: '내 관심' },
    { id: 'recent', label: '최근 본 상품' },
    { id: 'cs', label: '고객센터' },
    { id: 'profile', label: '회원정보 수정' }
  ]
});

const MENU_GROUPS = Object.freeze({
  customer: {
    trade: [
      { id: 'orders', label: '주문 내역' },
      { id: 'auction', label: '경매' },
      { id: 'cart', label: '장바구니' }
    ],
    activity: [
      { id: 'interest', label: '내 관심' },
      { id: 'recent', label: '최근 본 상품' },
      { id: 'cs', label: '고객센터' },
      { id: 'profile', label: '회원정보 수정' }
    ]
  },
  vendor: BUSINESS_MENU,
  admin: BUSINESS_MENU
});

function text(value) {
  return String(value == null ? '' : value).trim();
}

function actionId(button) {
  if (button.hasAttribute('data-auction-open')) return 'auction';
  return button.dataset.mpmenu || '';
}

function createMenuButton(doc, item, current) {
  const button = current || doc.createElement('button');
  button.type = 'button';
  button.className = 'mp-menu-row';
  if (item.id === 'auction') {
    button.removeAttribute('data-mpmenu');
    button.setAttribute('data-auction-open', '');
  } else {
    button.removeAttribute('data-auction-open');
    button.dataset.mpmenu = item.id;
  }
  const count = button.querySelector('.mr-count')?.textContent || '';
  button.replaceChildren();
  const label = doc.createElement('span');
  label.className = 'mr-label';
  label.textContent = item.label;
  button.append(label);
  if (count) {
    const countNode = doc.createElement('span');
    countNode.className = 'mr-count';
    countNode.textContent = count;
    button.append(countNode);
  }
  const arrow = doc.createElement('span');
  arrow.className = 'mr-arrow';
  arrow.textContent = '›';
  button.append(arrow);
  return button;
}

function resolvedItems(definitions, configuredLabels) {
  const unused = definitions.slice();
  const result = [];
  (configuredLabels || []).forEach((configuredLabel) => {
    if (!unused.length) return;
    const label = text(configuredLabel);
    let index = unused.findIndex((item) => item.label === label);
    if (index < 0) index = 0;
    const item = unused.splice(index, 1)[0];
    result.push({ ...item, label: label || item.label });
  });
  return result.concat(unused);
}

function renderMenu(doc, modal, role, content) {
  const menu = modal.querySelector('#mpMenuList');
  const contract = MENU_GROUPS[role];
  if (!menu || !contract || !content?.menuGroups) return;
  const existing = new Map([...menu.querySelectorAll('.mp-menu-row')].map((button) => [actionId(button), button]));
  const groups = [
    ['거래', resolvedItems(contract.trade, content.menuGroups.trade)],
    ['내 활동', resolvedItems(contract.activity, content.menuGroups.activity)]
  ];
  const signature = groups.flatMap(([cap, items]) => [cap, ...items.map((item) => `${item.id}:${item.label}`)]).join('|');
  const currentSignature = [...menu.children].map((node) => {
    if (node.classList.contains('mp-menu-cap')) return node.textContent;
    return `${actionId(node)}:${node.querySelector('.mr-label')?.textContent || ''}`;
  }).join('|');
  if (currentSignature !== signature) {
    const fragment = doc.createDocumentFragment();
    groups.forEach(([cap, items]) => {
      const heading = doc.createElement('p');
      heading.className = 'mp-menu-cap';
      heading.textContent = cap;
      fragment.append(heading);
      items.forEach((item) => fragment.append(createMenuButton(doc, item, existing.get(item.id))));
    });
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

  const statLabels = modal.querySelectorAll('.mp-member-stats button span');
  (content.stats || []).slice(0, statLabels.length).forEach((stat, index) => {
    if (text(stat?.label)) statLabels[index].textContent = text(stat.label);
  });

  const footer = modal.querySelector('.mp-reference-footer');
  const phone = text(content.footer?.phone);
  const hours = text(content.footer?.hours);
  const phoneLink = footer?.querySelector('a');
  const hoursNode = footer?.querySelector('small');
  if (phoneLink && phone) {
    phoneLink.textContent = phone;
    phoneLink.href = `tel:${phone.replace(/[^0-9+]/g, '')}`;
  }
  if (hoursNode && hours) hoursNode.textContent = hours;

  renderMenu(doc, modal, role, content);
  if (role === 'admin') {
    const order = modal.querySelector('#mpOrderPreview');
    if (order) order.hidden = false;
  }
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
