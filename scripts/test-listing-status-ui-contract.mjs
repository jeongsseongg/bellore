import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createListingAvailabilityUi } from '../app/features/listing-availability/listing-availability-ui.js';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [script, html, css, rowJs, rowCss, payments, supabase, merchandising, listingUi, paymentFlow, listingDisplay, wishlist, search] = await Promise.all([
  read('script.js'), read('index.html'), read('bellore-redesign.css'),
  read('app/features/home-rows/home-rows.js'), read('app/features/home-rows/home-rows.css'),
  read('payments.js'), read('supabase.js'), read('app/features/home-merchandising/home-merchandising.js'),
  read('app/features/listing-availability/listing-availability-ui.js'),
  read('app/features/checkout/payment-flow.js'), read('app/core/listing-display.js'),
  read('wishlist.js'), read('search.js'),
]);

assert.match(html, /id="pmSaleState"[^>]*hidden/, '상세 페이지에 판매 상태 표시 영역이 있어야 합니다.');
assert.match(script, /listingStatusUi\(\)\.cardMarkup\(it\)/, '상품 카드가 판매 상태 모듈의 배지를 렌더링해야 합니다.');
assert.match(listingUi, /card\.dataset\.status = current\.status/, '카드 DOM이 상태를 보존해야 합니다.');
assert.match(listingUi, /button\.disabled = !current\.purchasable/, '상세 구매 버튼이 예약·판매완료 상태에서 비활성화되어야 합니다.');
assert.match(listingUi, /badge\.textContent = current\.visible \? current\.label/, '상세 페이지가 예약중·SOLD OUT 배지를 표시해야 합니다.');
assert.match(script, /status: it\.status \|\| 'on_sale'/, '상세 결제 객체가 DB 상태를 보존해야 합니다.');
assert.match(css, /\.listing-sale-state\.is-sold/, '판매완료 카드 배지 스타일이 있어야 합니다.');
assert.match(css, /\.pp-bottom \.pp-buy:disabled/, '비활성 구매 버튼 스타일이 있어야 합니다.');
assert.match(rowJs, /hrow-sale-state/, '홈 가로 카드도 상태를 표시해야 합니다.');
assert.match(rowJs, /data-status=/, '홈 가로 카드도 상태를 DOM에 보존해야 합니다.');
assert.match(rowCss, /\.hrow-sale-state\.is-sold/, '홈 판매완료 상태 스타일이 있어야 합니다.');
assert.match(merchandising, /status: listing\.status \|\| 'on_sale'/, '홈 추천 입력이 상태를 on_sale로 덮어쓰면 안 됩니다.');

const preflightIndex = payments.indexOf("paymentFlow().guard(requestProduct, $('#coPayBtn'))");
const createOrderIndex = payments.indexOf('window.NWBackend.createOrder({');
assert(preflightIndex >= 0 && createOrderIndex > preflightIndex, '주문 생성 전에 상품 상태를 다시 조회해야 합니다.');
assert.match(paymentFlow, /backend\.getListing\(product\.listingId\)/, '결제 직전 최신 상품 상태를 서버에서 조회해야 합니다.');
assert.match(payments, /paymentFlow\(\)\.confirm\([^;]+, 3\)\.then/, '202 응답은 같은 결제를 최대 3회 제한 재확인해야 합니다.');
assert.match(paymentFlow, /confirm\(params, rechecksLeft - 1\)/, '재확인은 같은 승인 인자를 재사용해야 합니다.');
assert.match(paymentFlow, /다시 결제하지 말고 고객센터에 주문번호로 문의해 주세요/, '확인 보류 고객 문구에 재결제 금지와 주문번호 안내가 있어야 합니다.');
assert.match(paymentFlow, /win\.console\.warn\(`\[BELLORE_PAYMENT\] \$\{JSON\.stringify\(\{[\s\S]*?stage:[\s\S]*?code:[\s\S]*?httpStatus:/,
  '결제 진단은 브라우저에서 읽을 수 있는 구조화된 문자열 필드만 기록해야 합니다.');
assert.doesNotMatch(paymentFlow, /console\.warn\([^\n]*(?:error|value)\s*\)/, '오류 객체 원문을 콘솔에 직접 기록하면 안 됩니다.');
assert.match(supabase, /BELLORE_PAYMENT_FLOW\.readResponse\(response\)/, '승인 응답 파싱은 HTTP 상태를 보존하는 결제 모듈을 거쳐야 합니다.');
assert.match(paymentFlow, /httpStatus: response\.status/, '승인 응답이 HTTP 상태를 프런트에 보존해야 합니다.');
assert.match(supabase, /Backend\.refreshListings/, '결제 완료 뒤 상품 피드를 갱신할 수 있어야 합니다.');
assert.match(supabase, /currentGeneration !== requestGeneration/, '늦게 도착한 이전 listings 응답을 화면에 적용하면 안 됩니다.');
assert.match(supabase, /addEventListener\('focus', refreshListingsAfterResume\)/, '앱 복귀 시 상품 상태를 다시 읽어야 합니다.');
assert.match(supabase, /addEventListener\('visibilitychange', refreshListingsAfterResume\)/, '백그라운드 복귀 시 상품 상태를 다시 읽어야 합니다.');
assert.match(listingDisplay, /until === 'infinity'/, 'payment_review의 무기한 예약도 예약중으로 표시해야 합니다.');
assert.match(listingDisplay, /expiresAt > Number\(now\) \? 'reserved'/, '유효한 일반 체크아웃 hold도 예약중으로 표시해야 합니다.');
assert.match(listingUi, /async function hydrateCollections\(backend, collections/, '공용 상태 UI가 저장 상품 묶음을 최신 상품 상태로 동기화해야 합니다.');
assert.match(wishlist, /ui\.hydrateCollections\(B, collections, \{ preferSalePrice: true \}\)/, '찜·장바구니는 공용 동기화 모듈로 최신 상품 상태를 다시 읽어야 합니다.');
assert.match(wishlist, /listingBadge\(it\)/, '찜 카드도 예약중·SOLD OUT 상태를 표시해야 합니다.');
assert.match(wishlist, /disabled aria-disabled=\"true\"/, '예약·판매완료 상품의 찜 구매 버튼은 비활성화되어야 합니다.');
assert.match(listingUi, /function refreshViewedStatuses\(backend\)/, '최근 본 상품 상태 동기화는 공용 상태 UI가 담당해야 합니다.');
assert.match(search, /BELLORE_LISTING_UI\.refreshViewedStatuses\(window\.NWBackend\)/, '검색 화면이 최근 본 상품의 최신 상태 동기화를 요청해야 합니다.');
assert.doesNotMatch(search, /window\.BELLORE_refreshViewedStatuses\s*=/, '최근 본 상품 동기화가 새 최상위 전역으로 노출되면 안 됩니다.');
assert.match(search, /saleBadge = ui \? ui\.cardMarkup\(it\) : ''/, '최근 본 상품 카드도 예약중·SOLD OUT 상태를 표시해야 합니다.');

const listingId = '11111111-1111-4111-8111-111111111111';
const missingId = '22222222-2222-4222-8222-222222222222';
const storage = new Map();
const fakeWindow = {
  alert() {},
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
};
const ui = createListingAvailabilityUi({ document: { getElementById: () => null }, window: fakeWindow });
const backend = { getListingsByIds: async () => [{
  id: listingId, brand: 'B', model: 'M', price: 1300, sale_price: 900,
  photos: ['watch.webp'], product_no: 'P-1', status: 'reserved',
}] };
const original = [{ id: listingId, price: 1 }, { id: missingId, status: 'on_sale' }, { id: 'legacy|item', status: 'on_sale' }];
const [hydrated] = await ui.hydrateCollections(backend, [original], { preferSalePrice: true });
assert.equal(hydrated[0].price, 900, '찜·장바구니는 현재 판매가로 갱신해야 합니다.');
assert.equal(hydrated[0].status, 'reserved', '현재 예약 상태를 갱신해야 합니다.');
assert.equal(hydrated[1].status, 'unavailable', '서버에서 사라진 UUID 상품은 구매불가로 닫아야 합니다.');
assert.equal(hydrated[2], original[2], '레거시 비 UUID 항목은 임의 변경하지 않아야 합니다.');
storage.set('bellore_recent_items', JSON.stringify([{ id: listingId, status: 'on_sale' }]));
const refreshed = await ui.refreshViewedStatuses(backend);
assert.equal(refreshed[0].status, 'reserved', '최근 본 상품도 현재 상태로 갱신해야 합니다.');
assert.equal(JSON.parse(storage.get('bellore_recent_items'))[0].status, 'reserved', '갱신 상태를 최근 본 상품 저장소에 반영해야 합니다.');

console.log('listing status card/detail/payment frontend contract: ok');
