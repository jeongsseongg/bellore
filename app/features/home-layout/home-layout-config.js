export const HOME_LAYOUT_KEY = 'home_page_layout_config';

export const HOME_BLOCKS = Object.freeze([
  { id: 'hero', label: '메인 배너', selector: '#heroCarousel' },
  { id: 'quick', label: '바로가기', selector: '#homeQuickCategories' },
  { id: 'sale', label: '이번 주 특별가', selector: '#rowSaleBlock', titleSelector: '.hrow-title', subtitleSelector: '.hrow-description' },
  { id: 'drop', label: '기간 한정 특가', selector: '#rowDropBlock', titleSelector: '.hrow-title', subtitleSelector: '.hrow-description' },
  { id: 'category', label: '테마 컬렉션', selector: '#catBannerBlock' },
  { id: 'new', label: '최근 등록', selector: '#rowNewBlock', titleSelector: '.hrow-title', subtitleSelector: '.hrow-description' },
  { id: 'buyin', label: '시계 판매 안내', selector: '#buyBannerBlock' },
  { id: 'recommended', label: '추천 매물', selector: '#homeOnSale', titleSelector: '.hrow-title', moreSelector: '.home-sale-more' }
]);

export const HOME_LAYOUT_DEFAULTS = Object.freeze({
  order: HOME_BLOCKS.map((block) => block.id),
  blocks: {
    hero: { visible: true },
    quick: { visible: true },
    sale: { visible: true, title: '이번 주 특별가', subtitle: '이번 주, 가격이 좋아진 시계' },
    drop: { visible: true, title: 'TIME SALE', subtitle: '지금만 만나는 한정 혜택' },
    category: { visible: true },
    new: { visible: true, title: '최근 등록된 시계', subtitle: '검수를 마치고 새로 들어온 시계' },
    buyin: { visible: true },
    recommended: { visible: true, title: '추천 매물', moreText: '추천 매물 더보기' }
  }
});

export function cloneHomeLayoutDefaults() {
  return JSON.parse(JSON.stringify(HOME_LAYOUT_DEFAULTS));
}

export function normalizeHomeLayout(value) {
  const defaults = cloneHomeLayoutDefaults();
  if (!value || typeof value !== 'object') return defaults;
  const known = new Set(HOME_BLOCKS.map((block) => block.id));
  const requested = Array.isArray(value.order) ? value.order.filter((id) => known.has(id)) : [];
  defaults.order.forEach((id) => { if (!requested.includes(id)) requested.push(id); });
  defaults.order = requested;
  Object.keys(defaults.blocks).forEach((id) => {
    const saved = value.blocks?.[id];
    if (saved && typeof saved === 'object') defaults.blocks[id] = { ...defaults.blocks[id], ...saved };
  });
  return defaults;
}
