/* 홈의 시계 줄 — 카테고리별로 시계를 가로로 최대 20점까지 보여준다.
   모바일은 스와이프, PC는 마우스 드래그. 카드를 누르면 그 매물 상세로 간다. */

import { discountRate, priceText, specText } from '../../core/listing-display.js';

const ROW_MAX = 20;
const DRAG_THRESHOLD = 5;

/* 줄마다 어떤 매물을 담는지. 겹치지 않게 조건을 나눈다. */
const ROWS = [
  {
    mount: 'rowSaleBlock', title: '이번 주 특별가', more: '지금 값이 내려간 시계',
    select: (list) => list.filter((item) => item.saleActive),
  },
  {
    mount: 'rowDropBlock', title: '새로워진 가격', more: '가격을 다시 매긴 시계',
    select: (list) => list.filter((item) => item.priceLowered && !item.saleActive),
  },
  {
    mount: 'rowNewBlock', title: '최근 등록된 시계', more: '방금 들어온 매물',
    select: (list) => list,
  },
];

function cardMarkup(listing) {
  const rate = discountRate(listing);
  const spec = specText(listing);
  return `<a class="hrow-card" href="#collection" draggable="false" data-pid="${listing.id}">` +
    '<span class="hrow-img"></span>' +
    `<span class="hrow-brand">${listing.brand}</span>` +
    `<span class="hrow-model">${listing.model}</span>` +
    (spec ? `<span class="hrow-spec">${spec}</span>` : '') +
    '<span class="hrow-price">' +
    (rate > 0 ? `<b class="hrow-rate">${rate}%</b>` : '') +
    `${priceText(listing.price)}<i>원</i></span>` +
    (rate > 0 ? `<span class="hrow-old">${priceText(listing.listPrice)}원</span>` : '') +
    '</a>';
}

function buildRow({ doc, mount, config, collection }) {
  mount.innerHTML =
    '<div class="hrow-head">' +
    `<h2 class="hrow-title">${config.title}</h2>` +
    `<span class="hrow-more">${config.more}</span>` +
    '</div><div class="hrow-rail"></div>';
  const rail = mount.querySelector('.hrow-rail');
  enableDrag({ doc, rail, collection });
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
      rows.forEach(({ config, mount, rail }) => {
        const picks = config.select(listings).slice(0, ROW_MAX);
        if (!picks.length) { mount.hidden = true; rail.innerHTML = ''; return; }
        mount.hidden = false;
        rail.innerHTML = picks.map(cardMarkup).join('');
        // 사진은 style 속성 대신 프로퍼티로 — 마크업에 style= 을 늘리지 않는다.
        Array.from(rail.children).forEach((card, index) => {
          card.querySelector('.hrow-img').style.backgroundImage = `url(${picks[index].image})`;
        });
        rail.scrollLeft = 0;
      });
    },
  };
}
