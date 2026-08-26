/* 홈 배너 — 가격대·테마 슬라이더 / 판매중 매물 배너 레일 / 매입 안내 배너.
   배경만 픽셀 이미지(assets/banners)이고 시계 사진·모델명·금액·문구는 실제 데이터로 그린다.
   매물은 홈 '판매 중인 시계' 그리드가 채워지는 것을 보고 그대로 읽어 쓴다. */

import { BUYIN_COPY, CATEGORY_BANNERS, FEATURED_MAX, HERO_CAMPAIGNS, stableIndex } from './home-banner-data.js';
import { featuredMetaText, isCutoutPhoto, listingPresentation, priceText, shuffled } from '../../core/listing-display.js';

const PRODUCT_STAGES = [
  'assets/banners/product-stage-01.webp', 'assets/banners/product-stage-02.webp',
  'assets/banners/product-stage-03.webp', 'assets/banners/product-stage-04.webp',
  'assets/banners/product-stage-05.webp', 'assets/banners/product-stage-06.webp',
];
const BUYIN_BACKGROUNDS = [
  { image: 'assets/banners/buyin-01.webp', darkCopy: false },
  { image: 'assets/banners/buyin-02.webp', darkCopy: true },
  { image: 'assets/banners/buyin-03.webp', darkCopy: true },
  { image: 'assets/banners/buyin-04.webp', darkCopy: false },
  { image: 'assets/banners/buyin-05.webp', darkCopy: true },
  { image: 'assets/banners/buyin-06.webp', darkCopy: false },
];
const BUYIN_MEMORY_KEY = 'bl_buyin_banner';
const ROTATION_MS = 15000;
const FEATURED_AFTER_CARD = 6;

function textUnits(value) {
  return Array.from(String(value || '')).reduce((sum, char) => sum + (/\s/.test(char) ? .35 : /[\x00-\x7F]/.test(char) ? .58 : 1), 0);
}

/* 상품명은 의미 단위의 단어 묶음이 가장 균형적인 지점에서 최대 2줄로 나눈다. */
function balancedTitleLines(value) {
  const tokens = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || textUnits(tokens.join(' ')) <= 13) return [tokens.join(' ')];
  let best = null;
  for (let index = 1; index < tokens.length; index += 1) {
    const lines = [tokens.slice(0, index).join(' '), tokens.slice(index).join(' ')];
    const widths = lines.map(textUnits);
    const score = Math.abs(widths[0] - widths[1]) + Math.max(0, Math.max(...widths) - 14) * 2;
    if (!best || score < best.score) best = { lines, score };
  }
  return best ? best.lines : [tokens.join(' ')];
}

function readMemory(win, key) {
  try { return win.localStorage.getItem(key); } catch (error) { return null; }
}
function writeMemory(win, key, value) {
  try { win.localStorage.setItem(key, String(value)); } catch (error) { /* 시크릿 모드 등 */ }
}

function initHeroCampaigns({ doc, win, collection }) {
  const track = doc.getElementById('heroTrack');
  if (!track) return;
  win.BELLORE_HOME_CAMPAIGNS = HERO_CAMPAIGNS;
  track._openHeroCampaign = (action) => {
    const campaign = HERO_CAMPAIGNS.find((item) => item.action === action);
    if (campaign) collection.filter(campaign.filter);
  };
  if (typeof win.belloreSetBanners === 'function') win.belloreSetBanners(HERO_CAMPAIGNS);
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
    '<span class="bn-fx"></span>' +
    '<span class="bn-tx">' +
    '<span class="bn-lead"></span>' +
    '<span class="bn-t"></span>' +
    '</span></a>';

  const banner = mount.querySelector('.bn-buy');
  let index = pick;
  let backgroundIndex = -1;
  function pickBackground() {
    let next = backgroundIndex;
    while (next === backgroundIndex && BUYIN_BACKGROUNDS.length > 1) {
      next = Math.floor(Math.random() * BUYIN_BACKGROUNDS.length);
    }
    backgroundIndex = next;
    return BUYIN_BACKGROUNDS[backgroundIndex];
  }
  function paint(target) {
    index = ((target % BUYIN_COPY.length) + BUYIN_COPY.length) % BUYIN_COPY.length;
    const copy = BUYIN_COPY[index];
    const background = pickBackground();
    mount.querySelector('.bn-lead').textContent = copy.lead;
    mount.querySelector('.bn-t').innerHTML = copy.title.join('<br>');
    banner.style.backgroundImage = `url(${background.image})`;
    banner.classList.toggle('is-dark-copy', background.darkCopy);
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
    const presentation = listingPresentation(item);
    const detail = presentation.featureMovement || spec;
    const titleLines = balancedTitleLines(presentation.modelSize);
    card.dataset.pid = item.id;
    card.style.backgroundImage = `url(${PRODUCT_STAGES[stableIndex(item.id, PRODUCT_STAGES.length)]})`;
    card.innerHTML =
      '<span class="bn-fx"></span>' +
      '<span class="feat-showcase" aria-hidden="true">' +
      (cutout ? '<span class="feat-light"></span><span class="feat-plinth"></span><span class="feat-gs"></span>' : '') +
      `<img class="feat-ph${cutout ? '' : ' card'}" alt="" decoding="async">` +
      '</span>' +
      '<span class="bn-tx">' +
      `<span class="feat-br">${item.brand}</span>` +
      `<span class="feat-nm">${titleLines.map((line) => `<span class="feat-nm-line">${line}</span>`).join('')}</span>` +
      (presentation.referenceText ? `<span class="feat-ref">${presentation.referenceText}</span>` : '') +
      (detail ? `<span class="feat-sp">${detail}</span>` : '') +
      `<span class="feat-pr">${priceText(item.price)}<i>원</i></span>` +
      '</span>';
    card.querySelector('.feat-ph').src = item.image;
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
  initHeroCampaigns({ doc, win, collection });
  initCategorySlider({ doc, window: win, mount: doc.getElementById('catBannerBlock'), collection });
  renderBuyinBanner({ doc, win, mount: doc.getElementById('buyBannerBlock') });
  return createFeaturedBanner({ doc, window: win, mount: doc.getElementById('featBannerBlock'), collection });
}
