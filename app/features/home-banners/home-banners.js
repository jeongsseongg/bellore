/* 홈 배너 — 가격대·테마 슬라이더 / 판매중 매물 배너 레일 / 매입 안내 배너.
   배경만 픽셀 이미지(assets/banners)이고 시계 사진·모델명·금액·문구는 실제 데이터로 그린다.
   매물은 홈 '판매 중인 시계' 그리드가 채워지는 것을 보고 그대로 읽어 쓴다. */

import { BUYIN_COPY, CATEGORY_BANNERS, FEATURED_MAX, HERO_COPY, HERO_FILTER, stableIndex } from './home-banner-data.js';
import { featuredMetaText, isCutoutPhoto, priceText, shuffled } from '../../core/listing-display.js';

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
const ROTATION_MS = 15000;
const FEATURED_AFTER_CARD = 6;

function readMemory(win, key) {
  try { return win.localStorage.getItem(key); } catch (error) { return null; }
}
function writeMemory(win, key, value) {
  try { win.localStorage.setItem(key, String(value)); } catch (error) { /* 시크릿 모드 등 */ }
}

function initHeroSlogans({ doc, win, collection }) {
  const title = doc.getElementById('heroSloganTitle');
  const sub = doc.getElementById('heroSloganSub');
  if (!title || !sub) return;
  let index = 0;
  function paint(target) {
    index = ((target % HERO_COPY.length) + HERO_COPY.length) % HERO_COPY.length;
    const copy = HERO_COPY[index];
    title.innerHTML = copy.title.join('<br>');
    sub.textContent = copy.sub;
  }
  win.setInterval(() => {
    let next = index;
    while (next === index && HERO_COPY.length > 1) next = Math.floor(Math.random() * HERO_COPY.length);
    paint(next);
  }, ROTATION_MS);
  paint(0);
  const hero = doc.querySelector('.hero-default');
  if (hero) hero.addEventListener('click', (event) => {
    event.preventDefault();
    collection.filter(HERO_FILTER);
  });
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
    '</div></div>';

  const track = mount.querySelector('.bn-track');
  Array.from(track.children).forEach((slide, position) => {
    slide.style.backgroundImage = `url(${CATEGORY_BANNERS[position].image})`;
  });
  let index = 0;

  function show(target) {
    index = ((target % total) + total) % total;
    track.style.transform = `translateX(${-index * 100}%)`;
  }

  // 15초마다 랜덤으로 바뀐다. 직전과 같은 배너는 피한다. 수동 조작은 없다.
  win.setInterval(() => {
    let next = index;
    while (next === index && total > 1) next = Math.floor(Math.random() * total);
    show(next);
  }, ROTATION_MS);

  // 배너를 누르면 해당 가격대/테마로 이동(이건 조작이 아니라 링크다)
  track.addEventListener('click', (event) => {
    const button = event.target.closest('.bn-cat');
    if (!button) return;
    const banner = CATEGORY_BANNERS.find((item) => item.slug === button.dataset.slug);
    if (!banner) return;
    collection.filter(banner.filter);
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

  mount.innerHTML =
    '<a class="bn-buy" href="#compare" data-nav="compare">' +
    '<span class="bn-fx"></span><span class="bn-watch"></span>' +
    '<span class="bn-tx">' +
    '<span class="bn-lead"></span>' +
    '<span class="bn-t"></span>' +
    '</span></a>';

  const banner = mount.querySelector('.bn-buy');
  let index = pick;
  function paint(target) {
    index = ((target % BUYIN_COPY.length) + BUYIN_COPY.length) % BUYIN_COPY.length;
    const copy = BUYIN_COPY[index];
    mount.querySelector('.bn-lead').textContent = copy.lead;
    mount.querySelector('.bn-t').innerHTML = copy.title.join('<br>');
    banner.style.backgroundImage = `url(${BUYIN_BACKGROUNDS[index % BUYIN_BACKGROUNDS.length]})`;
    mount.querySelector('.bn-watch').style.backgroundImage =
      `url(${BUYIN_WATCHES[index % BUYIN_WATCHES.length]})`;
    writeMemory(win, BUYIN_MEMORY_KEY, index);
  }
  paint(index);
  win.setInterval(() => {
    let next = index;
    while (next === index && BUYIN_COPY.length > 1) next = Math.floor(Math.random() * BUYIN_COPY.length);
    paint(next);
  }, ROTATION_MS);
}

/* ── 추천 매물 3번째 줄과 4번째 줄 사이의 단독 매물 배너 ── */
function createFeaturedBanner({ doc, window: win, mount, collection }) {
  if (!mount) return { update() {} };
  mount.innerHTML = '<a class="feat-card" href="#collection"></a>';
  const card = mount.querySelector('.feat-card');
  const grid = doc.querySelector('#homeOnSale .home-sale-grid');
  let items = [];
  let shownId = null;

  function placeBetweenRows() {
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll(':scope > .hcard-dynamic'));
    const target = cards[FEATURED_AFTER_CARD] || null;
    if (mount.parentNode !== grid || mount.nextElementSibling !== target) grid.insertBefore(mount, target);
  }

  if (grid && typeof win.MutationObserver !== 'undefined') {
    new win.MutationObserver(placeBetweenRows).observe(grid, { childList: true });
  }

  function paint(item) {
    shownId = item.id;
    const cutout = isCutoutPhoto(item.image);
    const spec = featuredMetaText(item);
    card.dataset.pid = item.id;
    card.style.backgroundImage = `url(${FABRICS[stableIndex(item.id, FABRICS.length)]})`;
    card.innerHTML =
      '<span class="bn-fx"></span>' +
      (cutout ? '<span class="feat-gs"></span>' : '') +
      `<span class="feat-ph${cutout ? '' : ' card'}"></span>` +
      '<span class="bn-tx">' +
      `<span class="feat-br">${item.brand}</span>` +
      `<span class="feat-nm">${item.model}</span>` +
      (spec ? `<span class="feat-sp">${spec}</span>` : '') +
      `<span class="feat-pr">${priceText(item.price)}<i>원</i></span>` +
      '</span>';
    card.querySelector('.feat-ph').style.backgroundImage = `url(${item.image})`;
  }

  function pickRandom() {
    if (!items.length) return null;
    if (items.length === 1) return items[0];
    let next = items[Math.floor(Math.random() * items.length)];
    while (next.id === shownId) next = items[Math.floor(Math.random() * items.length)];
    return next;
  }

  function update(listings) {
    items = shuffled(listings).slice(0, FEATURED_MAX);
    if (!items.length) { mount.hidden = true; return; }
    mount.hidden = false;
    placeBetweenRows();
    const first = pickRandom();
    if (first) paint(first);
  }

  win.setInterval(() => {
    const next = pickRandom();
    if (next) paint(next);
  }, ROTATION_MS);

  card.addEventListener('click', (event) => {
    if (!card.dataset.pid) return;
    if (collection.openProduct(card.dataset.pid)) event.preventDefault();
  });

  return { update };
}

export function initHomeBanners({ document: doc, window: win, collection }) {
  initHeroSlogans({ doc, win, collection });
  initCategorySlider({ doc, window: win, mount: doc.getElementById('catBannerBlock'), collection });
  renderBuyinBanner({ doc, win, mount: doc.getElementById('buyBannerBlock') });
  return createFeaturedBanner({ doc, window: win, mount: doc.getElementById('featBannerBlock'), collection });
}
