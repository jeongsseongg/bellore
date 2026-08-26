/* 공개 마켓 URL의 단일 규칙. 브라우저 공유와 SEO 생성기가 함께 사용한다. */

export const SITE_ORIGIN = 'https://bellore.co.kr';
export const MARKET_PATH = '/market/';

export const LEGACY_DEMO_PRODUCTS = Object.freeze([
  ['06051ab5-6d16-40df-b81a-129c4c76bb66', '00B260606001'],
  ['0bfcfd5b-0a0f-4c78-bbc8-afc655573244', '00B260606002'],
  ['513fa018-acdd-4852-bacd-c8205469037c', '00B260606008'],
  ['5964feda-4e62-4bf6-bd6f-97b06e39d6c4', '00B260606009'],
  ['a5c153ae-7a5d-481c-bc84-446d785bb065', '00B260606018'],
  ['bc674d3c-3319-4e22-89b5-28d863ce4422', '00B260606020'],
  ['ea9695dd-7b1e-4d7e-af8c-aee4aa350e46', '00B260606025'],
  ['f2a6783a-d400-441b-8157-428f9f6ef2fc', '00B260606026'],
]);

const demoNumberById = new Map(LEGACY_DEMO_PRODUCTS);
const demoIdByNumber = new Map(LEGACY_DEMO_PRODUCTS.map(([id, number]) => [number, id]));

export function normalizeProductNumber(value) {
  const productNumber = String(value ?? '').trim();
  if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(productNumber)) {
    throw new Error(`유효하지 않은 상품번호: ${productNumber || '(없음)'}`);
  }
  return productNumber.toLowerCase();
}

export function legacyDemoMatch(row) {
  const id = String(row?.id ?? '').trim();
  const productNumber = String(row?.product_no ?? row?.productNo ?? '').trim();
  const expectedNumber = demoNumberById.get(id);
  const expectedId = demoIdByNumber.get(productNumber);

  if (expectedNumber && expectedNumber !== productNumber) {
    throw new Error(`레거시 데모 ID의 상품번호가 변경됨: ${id}`);
  }
  if (expectedId && expectedId !== id) {
    throw new Error(`레거시 데모 상품번호가 다른 상품에 재사용됨: ${productNumber}`);
  }
  return expectedNumber === productNumber && expectedId === id;
}

export function publicMarketPath(row) {
  if (legacyDemoMatch(row)) return '';
  const productNumber = row?.product_no ?? row?.productNo;
  return `${MARKET_PATH}${normalizeProductNumber(productNumber)}/`;
}

export function publicMarketUrl(row, origin = SITE_ORIGIN) {
  const path = publicMarketPath(row);
  if (!path) return '';
  const site = new URL(origin);
  if (!/^https?:$/.test(site.protocol)) {
    throw new Error(`허용하지 않는 사이트 URL: ${origin}`);
  }
  return `${site.origin}${path}`;
}
