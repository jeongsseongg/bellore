/* 홈의 시계 줄 — 카테고리별로 시계를 가로로 최대 20점까지 보여준다.
   모바일은 스와이프, PC는 마우스 드래그. 카드를 누르면 그 매물 상세로 간다. */

import { discountRate, dropAmountText, listingPresentation, priceText } from '../../core/listing-display.js';
import { initHomeRowAdmin } from './home-row-admin.js';

const ROW_MAX = 20;
const DRAG_THRESHOLD = 5;
/* 할인 중인 매물을 두 줄로 나눈다. 위는 할인율이 큰 쪽, 아래는 나머지.
   재고가 적어도 아래 줄이 비지 않도록 절반씩 나누되 위쪽은 여덟 점까지만 둔다. */
const FEATURE_MAX = 8;

const ROWS = [
  {
    mount: 'rowSaleBlock', key: 'home_row_sale', title: '이번 주 특별가',
    description: '이번 주, 가격이 좋아진 시계', badge: 'rate', selectionLimit: FEATURE_MAX,
  },
  {
    mount: 'rowDropBlock', key: 'home_row_drop', title: 'TIME SALE',
    description: '지금만 만나는 한정 혜택', badge: 'drop', selectionLimit: ROW_MAX,
  },
  {
    mount: 'rowNewBlock', key: 'home_row_new', title: '최근 등록된 시계',
    description: '검수를 마치고 새로 들어온 시계', badge: 'new', selectionLimit: ROW_MAX,
  },
];

/* 겹치지 않게 나눈다. 두 줄 모두 손님이 실제로 내는 금액만 보여준다. */
function splitRows(listings, weeklySpecial) {
  const lowered = listings
    .filter((item) => item.saleActive && discountRate(item) > 0)
    .sort((a, b) => discountRate(b) - discountRate(a));
  const split = Math.min(FEATURE_MAX, Math.ceil(lowered.length / 2));
  const sale = (weeklySpecial && weeklySpecial.length ? weeklySpecial : lowered.slice(0, split));
  const drop = lowered.slice(split);
  const latest = listings.slice(0, ROW_MAX);
  const used = new Set(sale.map((item) => item.id));
  const unusedLatest = latest.filter((item) => !used.has(item.id));
  return {
    // 할인 데이터가 비어도 홈의 핵심 가로 상품 구간은 사라지지 않는다.
    // 이때 실제 판매가만 표시하고 할인 뱃지나 취소선 가격은 만들지 않는다.
    rowSaleBlock: sale.length ? sale : latest.slice(0, FEATURE_MAX),
    rowDropBlock: drop.length ? drop : unusedLatest.slice(0, FEATURE_MAX),
    rowNewBlock: latest,
  };
}

function manualFirst(listings, ids, fallback, limit) {
  const byId = new Map(listings.map((item) => [String(item.id), item]));
  const manual = (ids || []).map((id) => byId.get(String(id))).filter(Boolean);
  const used = new Set(manual.map((item) => String(item.id)));
  return [...manual, ...fallback.filter((item) => !used.has(String(item.id)))].slice(0, limit);
}

/* 10억 이상은 자릿수가 길어 좁은 카드에서 줄이 깨진다. */
function longPrice(amount) {
  return priceText(amount).length >= 13;
}

function escapeText(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function badgeMarkup(listing, kind) {
  if (kind === 'rate') {
    const rate = discountRate(listing);
    return rate > 0 ? `<span class="hrow-badge is-rate">${rate}%</span>` : '';
  }
  if (kind === 'drop') {
    const drop = dropAmountText(listing);
    return drop ? `<span class="hrow-badge is-drop">↓ ${drop}</span>` : '';
  }
  if (kind === 'new' && listing.isNew) return '<span class="hrow-badge is-new">NEW</span>';
  return '';
}

/* 할인율·내린 금액은 사진 위 뱃지가 이미 보여준다. 가격 줄은 금액만 둔다.
   1억대 금액에 할인율까지 붙이면 좁은 화면에서 두 줄로 깨진다. */
function cardMarkup(listing, kind) {
  const rate = discountRate(listing);
  const text = listingPresentation(listing);
  return `<a class="hrow-card" href="#collection" draggable="false" data-pid="${listing.id}">` +
    `<span class="hrow-img">${badgeMarkup(listing, kind)}<span class="hrow-shadow"></span></span>` +
    `<span class="hrow-brand">${escapeText(listing.brand)}</span>` +
    `<span class="hrow-model">${escapeText(text.modelSize)}</span>` +
    (text.referenceText ? `<span class="hrow-reference">${escapeText(text.referenceText)}</span>` : '') +
    (text.featureMovement ? `<span class="hrow-meta">${escapeText(text.featureMovement)}</span>` : '') +
    `<span class="hrow-price${longPrice(listing.price) ? ' is-long' : ''}">` +
    `${priceText(listing.price)}<i>원</i></span>` +
    (rate > 0 ? `<span class="hrow-old">${priceText(listing.listPrice)}원</span>` : '') +
    '</a>';
}

function viewAllMarkup(title) {
  return '<a class="hrow-view-all" href="#collection" data-nav="collection" ' +
    `aria-label="${title} 전체보기">` +
    '<span class="hrow-view-all-icon" aria-hidden="true">→</span>' +
    '<span class="hrow-view-all-label">전체보기</span>' +
    '</a>';
}

function buildRow({ doc, mount, config, collection }) {
  mount.innerHTML =
    '<div class="hrow-head">' +
    '<div class="hrow-head-copy">' +
    `<h2 class="hrow-title">${config.title}</h2>` +
    `<p class="hrow-description">${config.description}</p>` +
    '</div>' +
    '<button class="hrow-settings" type="button" hidden aria-label="상품 설정" title="상품 설정">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle>' +
    '<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.37.34.7.64.96.3.25.67.39 1.06.4H21v4h-.09c-.39.01-.76.15-1.06.4-.3.26-.52.59-.64.96Z"></path></svg>' +
    '<span>상품 설정</span></button>' +
    '</div><div class="hrow-rail"></div>' +
    '<div class="hrow-progress"><span></span></div>';
  const rail = mount.querySelector('.hrow-rail');
  const thumb = mount.querySelector('.hrow-progress span');
  enableDrag({ doc, rail, collection });
  // 바이버식 진행 표시 — 가로로 어디까지 왔는지 얇은 막대로 보여준다
  function syncProgress() {
    const max = rail.scrollWidth - rail.clientWidth;
    const bar = mount.querySelector('.hrow-progress');
    if (max <= 1) { bar.style.visibility = 'hidden'; return; }
    bar.style.visibility = 'visible';
    const ratio = rail.clientWidth / rail.scrollWidth;
    const width = Math.max(0.16, ratio);
    thumb.style.width = `${width * 100}%`;
    thumb.style.left = `${(rail.scrollLeft / max) * (1 - width) * 100}%`;
  }
  let raf = null;
  rail.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = null; syncProgress(); });
  }, { passive: true });
  rail._syncProgress = syncProgress;
  return {
    rail,
    title: mount.querySelector('.hrow-title'),
    description: mount.querySelector('.hrow-description'),
    settingsButton: mount.querySelector('.hrow-settings'),
  };
}

/* PC 드래그. setPointerCapture는 클릭 타깃을 레일로 바꿔 카드 클릭을 죽이므로 쓰지 않는다. */
function enableDrag({ doc, rail, collection }) {
  let startX = 0; let startLeft = 0; let pressed = false; let dragging = false; let moved = 0;

  rail.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    pressed = true; dragging = false; moved = 0;
    startX = event.clientX; startLeft = rail.scrollLeft;
  });
  doc.addEventListener('pointermove', (event) => {
    if (!pressed) return;
    const distance = event.clientX - startX;
    moved = Math.max(moved, Math.abs(distance));
    if (!dragging) {
      if (moved < DRAG_THRESHOLD) return;
      dragging = true; rail.classList.add('drag');
    }
    rail.scrollLeft = startLeft - distance;
    event.preventDefault();
  });
  function endDrag() {
    if (!pressed) return;
    pressed = false;
    if (!dragging) return;
    dragging = false; rail.classList.remove('drag');
  }
  doc.addEventListener('pointerup', endDrag);
  doc.addEventListener('pointercancel', endDrag);
  rail.addEventListener('dragstart', (event) => { event.preventDefault(); });

  rail.addEventListener('click', (event) => {
    if (moved > DRAG_THRESHOLD + 1) { event.preventDefault(); event.stopPropagation(); return; }
    const card = event.target.closest('.hrow-card');
    if (!card) return;
    if (collection.openProduct(card.dataset.pid)) event.preventDefault();
  }, true);
}

export function initHomeRows({ document: doc, window: win, collection }) {
  const rows = ROWS
    .map((source) => ({
      config: {
        ...source,
        defaultTitle: source.title,
        defaultDescription: source.description,
      },
      mount: doc.getElementById(source.mount),
    }))
    .filter((row) => row.mount);
  rows.forEach((row) => Object.assign(row, buildRow({
    doc, mount: row.mount, config: row.config, collection,
  })));
  let latestListings = [];
  let latestMerchandising = {};
  let settingsHandler = () => {};

  function render() {
    const buckets = splitRows(latestListings, latestMerchandising.weeklySpecial);
    rows.forEach(({ config, mount, rail }) => {
      const picks = manualFirst(
        latestListings, config.selectedIds, buckets[config.mount] || [], config.selectionLimit,
      );
      if (!picks.length) { mount.hidden = true; rail.innerHTML = ''; return; }
      mount.hidden = false;
      rail.innerHTML = picks.map((item) => cardMarkup(item, config.badge)).join('') +
        viewAllMarkup(config.title);
      Array.from(rail.querySelectorAll(':scope > .hrow-card')).forEach((card, index) => {
        card.querySelector('.hrow-img').style.backgroundImage = `url(${picks[index].image})`;
      });
      rail.scrollLeft = 0;
      if (rail._syncProgress) rail._syncProgress();
    });
  }

  initHomeRowAdmin({
    document: doc,
    window: win,
    rows,
    getListings: () => latestListings,
    onSettingsChange: () => settingsHandler(),
  });

  return {
    update(listings, merchandising = {}) {
      latestListings = listings || [];
      latestMerchandising = merchandising;
      render();
    },
    weeklySpecialIds() {
      return rows.find((row) => row.config.key === 'home_row_sale')?.config.selectedIds || [];
    },
    onSettingsChange(handler) {
      settingsHandler = typeof handler === 'function' ? handler : () => {};
    },
  };
}
