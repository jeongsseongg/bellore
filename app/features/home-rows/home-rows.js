/* 홈의 시계 줄 — 카테고리별로 시계를 가로로 최대 20점까지 보여준다.
   모바일은 스와이프, PC는 마우스 드래그. 카드를 누르면 그 매물 상세로 간다. */

import { discountRate, dropAmountText, priceText } from '../../core/listing-display.js';

const ROW_MAX = 20;
const DRAG_THRESHOLD = 5;
/* 할인 중인 매물을 두 줄로 나눈다. 위는 할인율이 큰 쪽, 아래는 나머지.
   재고가 적어도 아래 줄이 비지 않도록 절반씩 나누되 위쪽은 여덟 점까지만 둔다. */
const FEATURE_MAX = 8;

const ROWS = [
  { mount: 'rowSaleBlock', title: '이번 주 특별가', badge: 'rate' },
  { mount: 'rowDropBlock', title: '새로워진 가격', badge: 'drop' },
  { mount: 'rowNewBlock', title: '최근 등록된 시계', badge: 'new' },
];

/* 겹치지 않게 나눈다. 두 줄 모두 손님이 실제로 내는 금액만 보여준다. */
function splitRows(listings) {
  const lowered = listings
    .filter((item) => item.saleActive && discountRate(item) > 0)
    .sort((a, b) => discountRate(b) - discountRate(a));
  const split = Math.min(FEATURE_MAX, Math.ceil(lowered.length / 2));
  return {
    rowSaleBlock: lowered.slice(0, split),
    rowDropBlock: lowered.slice(split),
    rowNewBlock: listings,
  };
}

/* 10억 이상은 자릿수가 길어 좁은 카드에서 줄이 깨진다. */
function longPrice(amount) {
  return priceText(amount).length >= 13;
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
  return `<a class="hrow-card" href="#collection" draggable="false" data-pid="${listing.id}">` +
    `<span class="hrow-img">${badgeMarkup(listing, kind)}<span class="hrow-shadow"></span></span>` +
    `<span class="hrow-model">${listing.model}</span>` +
    `<span class="hrow-price${longPrice(listing.price) ? ' is-long' : ''}">` +
    `${priceText(listing.price)}<i>원</i></span>` +
    (rate > 0 ? `<span class="hrow-old">${priceText(listing.listPrice)}원</span>` : '') +
    '</a>';
}

function buildRow({ doc, mount, config, collection }) {
  mount.innerHTML =
    '<div class="hrow-head">' +
    `<h2 class="hrow-title">${config.title}</h2>` +
    '<span class="hrow-more" aria-hidden="true">›</span>' +
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
  return rail;
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

export function initHomeRows({ document: doc, collection }) {
  const rows = ROWS
    .map((config) => ({ config, mount: doc.getElementById(config.mount) }))
    .filter((row) => row.mount);
  rows.forEach((row) => { row.rail = buildRow({ doc, mount: row.mount, config: row.config, collection }); });

  return {
    update(listings) {
      const buckets = splitRows(listings);
      rows.forEach(({ config, mount, rail }) => {
        const picks = (buckets[config.mount] || []).slice(0, ROW_MAX);
        if (!picks.length) { mount.hidden = true; rail.innerHTML = ''; return; }
        mount.hidden = false;
        rail.innerHTML = picks.map((item) => cardMarkup(item, config.badge)).join('');
        // 사진은 style 속성 대신 프로퍼티로 — 마크업에 style= 을 늘리지 않는다.
        Array.from(rail.children).forEach((card, index) => {
          card.querySelector('.hrow-img').style.backgroundImage = `url(${picks[index].image})`;
        });
        rail.scrollLeft = 0;
        if (rail._syncProgress) rail._syncProgress();
      });
    },
  };
}
