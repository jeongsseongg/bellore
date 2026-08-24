/* 홈 배너 — 가격대·테마 슬라이더 / 판매중 매물 배너 레일 / 매입 안내 배너.
   배경만 픽셀 이미지(assets/banners)이고 시계 사진·모델명·금액·문구는 실제 데이터로 그린다.
   매물은 홈 '판매 중인 시계' 그리드가 채워지는 것을 보고 그대로 읽어 쓴다. */

import { BUYIN_COPY, CATEGORY_BANNERS, FEATURED_MAX, stableIndex } from './home-banner-data.js';
import { badgeText, isCutoutPhoto, priceText, shuffled, specText } from '../../core/listing-display.js';

const FABRICS = [
  'assets/banners/fab-1.jpg', 'assets/banners/fab-2.jpg', 'assets/banners/fab-3.jpg',
  'assets/banners/fab-4.jpg', 'assets/banners/fab-5.jpg',
];
const BUYIN_BACKGROUNDS = [
  'assets/banners/buybg-1.jpg', 'assets/banners/buybg-2.jpg',
  'assets/banners/buybg-3.jpg', 'assets/banners/buybg-4.jpg',
];
const BUYIN_WATCHES = [
  'assets/m2282380069.png', 'assets/m3362390002.png', 'assets/m3369350008.png',
];
const BUYIN_MEMORY_KEY = 'bl_buyin_banner';
const DRAG_THRESHOLD = 5;

function counterMarkup(current, total) {
  return `<b>${current}</b><em></em><s>${total}</s>`;
}

function readMemory(win, key) {
  try { return win.localStorage.getItem(key); } catch (error) { return null; }
}
function writeMemory(win, key, value) {
  try { win.localStorage.setItem(key, String(value)); } catch (error) { /* 시크릿 모드 등 */ }
}

/* ── 가격대·테마 슬라이더 ── */
function initCategorySlider({ doc, window: win, mount, collection }) {
  if (!mount) return;
  const total = CATEGORY_BANNERS.length;
  mount.innerHTML =
    '<div class="bn-slider"><div class="bn-track">' +
    CATEGORY_BANNERS.map((banner) => (
      `<button type="button" class="bn-cat" data-slug="${banner.slug}">` +
      '<span class="bn-fx"></span><span class="bn-tx">' +
      `<span class="bn-lead">${banner.lead}</span>` +
      `<span class="bn-t">${banner.title}<span class="bn-sm">${banner.sub}</span></span>` +
      '</span></button>'
    )).join('') +
    '</div><div class="bn-ctl">' +
    `<span class="bn-num">${counterMarkup(1, total)}</span>` +
    '</div></div>';

  const track = mount.querySelector('.bn-track');
  const num = mount.querySelector('.bn-num');
  let index = 0;

  function show(target) {
    index = ((target % total) + total) % total;
    track.style.transform = `translateX(${-index * 100}%)`;
    num.innerHTML = counterMarkup(index + 1, total);
  }

  // 15초마다 랜덤으로 바뀐다. 직전과 같은 배너는 피한다. 수동 조작은 없다.
  win.setInterval(() => {
    let next = index;
    while (next === index && total > 1) next = Math.floor(Math.random() * total);
    show(next);
  }, 15000);

  // 배너를 누르면 해당 가격대/테마로 이동(이건 조작이 아니라 링크다)
  track.addEventListener('click', (event) => {
    const button = event.target.closest('.bn-cat');
    if (!button) return;
    const banner = CATEGORY_BANNERS.find((item) => item.slug === button.dataset.slug);
    if (!banner) return;
    if (banner.query) collection.search(banner.query);
    else collection.filterByPrice(banner.min, banner.max);
  });

  show(Math.floor(Math.random() * total));
}

/* ── 매입 안내 배너 ── */
function renderBuyinBanner({ doc, win, mount }) {
  if (!mount) return;
  const last = Number.parseInt(readMemory(win, BUYIN_MEMORY_KEY), 10);
  const choices = BUYIN_COPY.map((_, i) => i).filter((i) => i !== last);
  const pick = choices[Math.floor(Math.random() * choices.length)];
  writeMemory(win, BUYIN_MEMORY_KEY, pick);

  const copy = BUYIN_COPY[pick];
  mount.innerHTML =
    '<a class="bn-buy" href="#compare" data-nav="compare">' +
    '<span class="bn-fx"></span><span class="bn-watch"></span>' +
    '<span class="bn-tx">' +
    `<span class="bn-lead">${copy.lead}</span>` +
    `<span class="bn-t">${copy.title.join('<br>')}</span>` +
    '</span></a>';

  const banner = mount.querySelector('.bn-buy');
  banner.style.backgroundImage = `url(${BUYIN_BACKGROUNDS[pick % BUYIN_BACKGROUNDS.length]})`;
  mount.querySelector('.bn-watch').style.backgroundImage =
    `url(${BUYIN_WATCHES[pick % BUYIN_WATCHES.length]})`;
}

/* ── 판매중 매물 배너 레일 ── */
function createFeaturedRail({ doc, mount, collection }) {
  if (!mount) return { update() {} };
  mount.innerHTML = '<div class="feat-wrap"><div class="feat-rail"></div><span class="feat-num"></span></div>';
  const rail = mount.querySelector('.feat-rail');
  const num = mount.querySelector('.feat-num');

  function syncCounter() {
    const total = rail.children.length;
    if (!total) { num.hidden = true; return; }
    num.hidden = total < 2;
    const current = Math.min(total, Math.max(1, Math.round(rail.scrollLeft / (rail.clientWidth || 1)) + 1));
    num.innerHTML = counterMarkup(current, total);
  }

  function update(listings) {
    if (!listings.length) { mount.hidden = true; rail.innerHTML = ''; return; }
    mount.hidden = false;
    const picks = shuffled(listings).slice(0, FEATURED_MAX);
    rail.innerHTML = picks.map((item) => {
      const cutout = isCutoutPhoto(item.image);
      const spec = specText(item);
      return `<a class="feat-card" href="#collection" draggable="false" data-pid="${item.id}">` +
        '<span class="bn-fx"></span>' +
        (cutout ? '<span class="feat-gs"></span>' : '') +
        `<span class="feat-ph${cutout ? '' : ' card'}"></span>` +
        '<span class="bn-tx">' +
        `<span class="feat-tag">${badgeText(item)}</span>` +
        `<span class="feat-br">${item.brand}</span>` +
        `<span class="feat-nm">${item.model}</span>` +
        (spec ? `<span class="feat-sp">${spec}</span>` : '') +
        `<span class="feat-pr">${priceText(item.price)}<i>원</i></span>` +
        '</span></a>';
    }).join('');
    // 배경은 style 속성 대신 프로퍼티로 — 마크업에 style= 을 늘리지 않는다.
    Array.from(rail.children).forEach((card, position) => {
      const item = picks[position];
      card.style.backgroundImage = `url(${FABRICS[stableIndex(item.id, FABRICS.length)]})`;
      card.querySelector('.feat-ph').style.backgroundImage = `url(${item.image})`;
    });
    rail.scrollLeft = 0;
    syncCounter();
  }

  let frame = null;
  rail.addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = null; syncCounter(); });
  }, { passive: true });

  // PC 드래그. setPointerCapture는 클릭 타깃을 레일로 바꿔 카드 클릭을 죽이므로 쓰지 않는다.
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
    const width = rail.clientWidth || 1;
    rail.scrollTo({ left: Math.round(rail.scrollLeft / width) * width, behavior: 'smooth' });
  }
  doc.addEventListener('pointerup', endDrag);
  doc.addEventListener('pointercancel', endDrag);
  rail.addEventListener('dragstart', (event) => { event.preventDefault(); });

  rail.addEventListener('click', (event) => {
    if (moved > DRAG_THRESHOLD + 1) { event.preventDefault(); event.stopPropagation(); return; }
    const card = event.target.closest('.feat-card');
    if (!card) return;
    if (collection.openProduct(card.dataset.pid)) event.preventDefault();
  }, true);

  return { update };
}

export function initHomeBanners({ document: doc, window: win, collection }) {
  initCategorySlider({ doc, window: win, mount: doc.getElementById('catBannerBlock'), collection });
  renderBuyinBanner({ doc, win, mount: doc.getElementById('buyBannerBlock') });
  return createFeaturedRail({ doc, mount: doc.getElementById('featBannerBlock'), collection });
}
