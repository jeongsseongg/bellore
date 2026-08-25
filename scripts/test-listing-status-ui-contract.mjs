import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [script, html, css, rowJs, rowCss, payments, supabase, merchandising, listingUi, paymentFlow, listingDisplay] = await Promise.all([
  read('script.js'), read('index.html'), read('bellore-redesign.css'),
  read('app/features/home-rows/home-rows.js'), read('app/features/home-rows/home-rows.css'),
  read('payments.js'), read('supabase.js'), read('app/features/home-merchandising/home-merchandising.js'),
  read('app/features/listing-availability/listing-availability-ui.js'),
  read('app/features/checkout/payment-flow.js'), read('app/core/listing-display.js'),
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

const preflightIndex = payments.indexOf("paymentFlow().guard(product, $('#coPayBtn'))");
const createOrderIndex = payments.indexOf('window.NWBackend.createOrder({');
assert(preflightIndex >= 0 && createOrderIndex > preflightIndex, '주문 생성 전에 상품 상태를 다시 조회해야 합니다.');
assert.match(paymentFlow, /backend\.getListing\(product\.listingId\)/, '결제 직전 최신 상품 상태를 서버에서 조회해야 합니다.');
assert.match(payments, /paymentFlow\(\)\.confirm\([^;]+, 3\)\.then/, '202 응답은 같은 결제를 최대 3회 제한 재확인해야 합니다.');
assert.match(paymentFlow, /confirm\(params, rechecksLeft - 1\)/, '재확인은 같은 승인 인자를 재사용해야 합니다.');
assert.match(payments, /다시 결제하지 말고 고객센터에 주문번호로 문의해 주세요/, '확인 보류 고객 문구에 재결제 금지와 주문번호 안내가 있어야 합니다.');
assert.match(paymentFlow, /win\.console\.warn\('\[BELLORE_PAYMENT\]', \{/, '결제 진단은 구조화된 필드만 기록해야 합니다.');
assert.doesNotMatch(paymentFlow, /console\.warn\([^\n]*(?:error|value)\s*\)/, '오류 객체 원문을 콘솔에 직접 기록하면 안 됩니다.');
assert.match(supabase, /BELLORE_PAYMENT_FLOW\.readResponse\(response\)/, '승인 응답 파싱은 HTTP 상태를 보존하는 결제 모듈을 거쳐야 합니다.');
assert.match(paymentFlow, /httpStatus: response\.status/, '승인 응답이 HTTP 상태를 프런트에 보존해야 합니다.');
assert.match(supabase, /Backend\.refreshListings/, '결제 완료 뒤 상품 피드를 갱신할 수 있어야 합니다.');
assert.match(listingDisplay, /until === 'infinity'/, 'payment_review의 무기한 예약도 예약중으로 표시해야 합니다.');
assert.match(listingDisplay, /expiresAt > Number\(now\) \? 'reserved'/, '유효한 일반 체크아웃 hold도 예약중으로 표시해야 합니다.');

console.log('listing status card/detail/payment frontend contract: ok');
