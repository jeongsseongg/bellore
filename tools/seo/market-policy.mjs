import {
  LEGACY_DEMO_PRODUCTS,
  MARKET_PATH,
  SITE_ORIGIN,
  legacyDemoMatch,
  normalizeProductNumber,
  publicMarketPath,
  publicMarketUrl,
} from '../../app/core/market-product-url.mjs';

export {
  LEGACY_DEMO_PRODUCTS,
  MARKET_PATH,
  SITE_ORIGIN,
  legacyDemoMatch,
  normalizeProductNumber,
  publicMarketPath,
  publicMarketUrl,
};

export const DEFAULT_MIN_PRODUCTS = 158;
export const SELLER_NAME = '벨로르 BELLORE';

export const LISTING_STATUS = Object.freeze({
  on_sale: Object.freeze({
    label: '판매중',
    availability: 'https://schema.org/InStock',
    publish: true,
  }),
  sold: Object.freeze({
    label: '판매완료',
    availability: 'https://schema.org/OutOfStock',
    publish: true,
  }),
  hidden: Object.freeze({
    label: '숨김',
    availability: null,
    publish: false,
  }),
});

export function statusPolicy(value) {
  const status = String(value ?? '').trim();
  const policy = LISTING_STATUS[status];
  if (!policy) throw new Error(`지원하지 않는 상품 상태: ${status || '(없음)'}`);
  return { status, ...policy };
}

export function absoluteImageUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw, `${SITE_ORIGIN}/`);
  } catch {
    throw new Error(`유효하지 않은 이미지 URL: ${raw}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`허용하지 않는 이미지 URL 프로토콜: ${url.protocol}`);
  }
  return url.href;
}

export function displayValue(value, suffix = '') {
  if (value === null || value === undefined || String(value).trim() === '') return '확인 필요';
  return `${String(value).trim()}${suffix}`;
}

export function booleanValue(value) {
  if (value === true) return '있음';
  if (value === false) return '없음';
  return '확인 필요';
}
