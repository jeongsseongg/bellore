const ITEMS = [
  ['home', '/', '홈', '<path d="M3 12L12 3l9 9"/><path d="M5 10v10h14V10"/>'],
  ['search', '/#collection', '검색', '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>'],
  ['wishlist', '/#wishlist', '보관함', '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>'],
  ['sell', '/?sell=1', '시계판매', '<circle cx="10.5" cy="12" r="5"/><path d="M7.5 7.3 7 4h7l-.5 3.3M7.5 16.7 7 20h7l-.5-3.3"/><path d="M10.5 12V9.6M10.5 12h2"/><path d="M19 15.5v-6m0 0-1.9 1.9M19 9.5l1.9 1.9"/>'],
  ['my', '/login.html', '마이', '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'],
];

function itemMarkup([name, href, label, icon], active) {
  const current = name === active ? ' active' : '';
  const ariaCurrent = name === active ? ' aria-current="page"' : '';
  const myId = name === 'my' ? ' id="tabMy"' : '';
  const sellHook = name === 'sell'
    ? ' data-sell-method-open aria-haspopup="dialog" aria-controls="sellMethodSheet"'
    : '';
  const iconMarkup = name === 'wishlist'
    ? `<span class="tab-wish-ic"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>` +
      '<b class="tab-wish-badge" id="tabWishBadge" hidden>0</b></span>'
    : `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
  return `<a class="tab-item${name === 'wishlist' ? ' tab-wish' : ''}${current}" data-app-tab="${name}" href="${href}"${myId}${sellHook}${ariaCurrent}>` +
    `${iconMarkup}<span>${label}</span></a>`;
}

class BelloreTabbar extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready === 'true') return;
    const active = this.dataset.active || '';
    this.innerHTML = `<nav class="tabbar app-tabbar" aria-label="주요 메뉴">${ITEMS.map((item) => itemMarkup(item, active)).join('')}</nav>`;
    this.dataset.ready = 'true';
    document.body?.classList.add('has-app-tabbar');
  }
}

if (!customElements.get('bellore-tabbar')) {
  customElements.define('bellore-tabbar', BelloreTabbar);
}
