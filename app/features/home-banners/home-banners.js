/* 홈 배너 — 가격대·테마 슬라이더 / 판매중 매물 배너 레일 / 매입 안내 배너.
   배경만 픽셀 이미지(assets/banners)이고 시계 사진·모델명·금액·문구는 실제 데이터로 그린다.
   매물은 홈 '판매 중인 시계' 그리드가 채워지는 것을 보고 그대로 읽어 쓴다. */

import { BUYIN_COPY, CATEGORY_BANNERS, stableIndex } from './home-banner-data.js';
import { badgeText, isCutoutPhoto, priceText, specText } from '../../core/listing-display.js';

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
function createFeaturedBanner({ doc, window: win, mount, collection }) {
  if (!mount) return { update() {} };
  mount.innerHTML = '<a class="feat-card" href="#collection"></a>';
  const card = mount.querySelector('.feat-card');

  let items = [];
  let shownId = null;

  // 판매중 매물에서 한 점을 배너에 그린다
  function paint(item) {
    shownId = item.id;
    const cutout = isCutoutPhoto(item.image);
    const spec = specText(item);
    card.dataset.pid = item.id;
    card.style.backgroundImage = `url(${FABRICS[stableIndex(item.id, FABRICS.length)]})`;
    card.innerHTML =
      '<span class="bn-fx"></span>' +
      (cutout ? '<span class="feat-gs"></span>' : '') +
      `<span class="feat-ph${cutout ? '' : ' card'}"></span>` +
      '<span class="bn-tx">' +
      `<span class="feat-tag">${badgeText(item)}</span>` +
      `<span class="feat-br">${item.brand}</span>` +
      `<span class="feat-nm">${item.model}</span>` +
      (spec ? `<span class="feat-sp">${spec}</span>` : '') +
      `<span class="feat-pr">${priceText(item.price)}<i>원</i></span>` +
      '</span>';
    card.querySelector('.feat-ph').style.backgroundImage = `url(${item.image})`;
  }

  // 직전과 다른 매물을 랜덤으로 고른다
  function pickRandom() {
    if (!items.length) return null;
    if (items.length === 1) return items[0];
    let next = items[Math.floor(Math.random() * items.length)];
    let guard = 0;
    while (next.id === shownId && guard < 8) { next = items[Math.floor(Math.random() * items.length)]; guard += 1; }
    return next;
  }

  function update(listings) {
    items = listings || [];
    if (!items.length) { mount.hidden = true; return; }
    mount.hidden = false;
    const first = pickRandom();
    if (first) paint(first);
  }

  // 15초마다 랜덤으로 바뀐다. 수동 조작은 없다.
  win.setInterval(() => {
    const next = pickRandom();
    if (next) paint(next);
  }, 15000);

  // 배너를 누르면 그 매물 상세로
  card.addEventListener('click', (event) => {
    if (!card.dataset.pid) return;
    if (collection.openProduct(card.dataset.pid)) event.preventDefault();
  });

  return { update };
}

export function initHomeBanners({ document: doc, window: win, collection }) {
  initCategorySlider({ doc, window: win, mount: doc.getElementById('catBannerBlock'), collection });
  renderBuyinBanner({ doc, win, mount: doc.getElementById('buyBannerBlock') });
  return createFeaturedBanner({ doc, window: win, mount: doc.getElementById('featBannerBlock'), collection });
}
