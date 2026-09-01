import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [payments, paymentFlow, pendingRecovery, bootstrap, script, quotes, features, auction, dialog, html] = await Promise.all([
  read('payments.js'),
  read('app/features/checkout/payment-flow.js'),
  read('app/services/payments/pending-payment-recovery.js'),
  read('app/bootstrap.js'),
  read('script.js'),
  read('cq-demo.js'),
  read('bellore-features.js'),
  read('auction.js'),
  read('ui-dialog.js'),
  read('index.html'),
]);

const developerCopy = /PG 운영|서버 결제|샌드박스|Supabase|Edge Function|백엔드 연결|permission denied|unauthorized/i;

assert.match(payments, /선택한 쿠폰을 적용하면 결제금액이 100원 미만입니다\./, '쿠폰 적용 상태를 정확히 안내해야 합니다.');
assert.match(payments, /결제금액은 100원 이상이어야 합니다\. 상품 가격을 확인해 주세요\./, '쿠폰이 없을 때 쿠폰 문제로 오인시키면 안 됩니다.');
assert.match(html, /id="coCouponClear"[^>]*hidden[^>]*>쿠폰 해제<\/button>/, '고객이 찾을 수 있는 쿠폰 해제 버튼이 있어야 합니다.');
assert.match(payments, /ui\.clear\(updateAmount\)/, '쿠폰 해제 버튼이 금액 재계산 동작에 연결되어야 합니다.');
assert.match(bootstrap, /installLegacyCheckoutCoupon\(\{ windowObject: window, documentObject: document \}\)/, '쿠폰 UI 어댑터는 조립 지점에서 설치되어야 합니다.');
assert.doesNotMatch(payments, /다른 결제 방식을 선택해 주세요/, '결제수단 변경은 쿠폰 오류의 해결책이 아닙니다.');

const paymentCustomerStrings = [...(payments + paymentFlow + pendingRecovery).matchAll(/(['"])([가-힣][\s\S]*?)\1/g)].map((match) => match[2]);
assert(
  paymentCustomerStrings.every((message) => !developerCopy.test(message)),
  '결제 고객 문구에 내부 용어가 남았습니다: ' + paymentCustomerStrings.filter((message) => developerCopy.test(message)).join(' | '),
);

assert.match(
  payments,
  /if \(resp && resp\.code != null\)[\s\S]{0,500}verifyPayment\(order\.orderNo,[\s\S]{0,220}order\.checkoutToken \|\| null, true,[\s\S]{0,120}providerFailureKind\(resp\)\)/,
  '결제창이 닫히거나 실패 응답을 줘도 같은 주문을 checkoutAbandoned 상태로 서버 재검증해야 합니다.',
);
assert.match(
  payments,
  /checkoutAbandoned:\s*checkoutAbandoned === true/,
  '결제창 이탈 여부를 서버 확인 요청에 명시적으로 전달해야 합니다.',
);
assert.match(
  pendingRecovery,
  /verify\([\s\S]{0,220}pending\?\.checkoutToken \|\| null,[\s\S]{0,80}Boolean\(code\)/,
  '모바일 복귀 오류도 저장된 같은 주문과 토큰으로 서버 재검증해야 합니다.',
);
assert.match(
  pendingRecovery,
  /if \(code && !pending\)[\s\S]{0,300}customerMessage\(\{ code, message: params\.get\('message'\) \|\| '' \}\)/,
  '저장된 주문이 없는 모바일 복귀 원문만 고객 문구 변환을 거쳐야 합니다.',
);
assert.match(paymentFlow, /notify\(customerMessage\(error, 'payment_start', false\)\)/, '결제 시작 오류 원문은 고객 문구 변환을 거쳐야 합니다.');
assert.match(
  payments,
  /paymentFlow\(\)\.confirmationPresentation\(res, paymentId, checkoutAbandoned === true, providerFailure \|\| ''\)/,
  '승인 확인 결과는 고객 표시 전용 계층에서 분류해야 합니다.',
);
assert.match(
  paymentFlow,
  /function confirmationPresentation\(result, paymentId, checkoutAbandoned = false, providerFailure = ''\)[\s\S]*message: customerMessage\([\s\S]{0,120}'confirmation', false\)/,
  '승인 확인 실패 원문은 표시 전용 계층 안에서 고객 문구로 변환해야 합니다.',
);
assert.doesNotMatch(payments, /showResult\([^;]{0,300}\bresp\b/, '결제창 응답 원문을 결과창에 직접 표시하면 안 됩니다.');
assert.doesNotMatch(payments, /showResult\([^;]{0,240}\bresp\.message/, '결제사 원문을 결과창에 직접 표시하면 안 됩니다.');
assert.doesNotMatch(payments, /alert\('결제를 시작할 수 없습니다:\s*'\s*\+/, '결제 시작 오류를 직접 붙이면 안 됩니다.');
assert.doesNotMatch(payments, /showResult\(false,\s*'결제 실패',\s*q\.get\('message'\)/, 'URL 원문을 결과창에 직접 표시하면 안 됩니다.');

assert.match(bootstrap, /installCustomerFeedback\(\{ windowObject: window/, '조립 지점에서 고객 문구 계층을 설치해야 합니다.');
assert.match(bootstrap, /createPaymentFlow\(\{ window \}\)/, '결제 고객 문구·진단 모듈은 조립 지점에서 설치되어야 합니다.');
assert.doesNotMatch(html, /app\/payment-bootstrap\.js/, '팝업 릴리스가 동결된 결제 bootstrap을 추가하면 안 됩니다.');
assert.match(script, /BELLORE_CUSTOMER_FEEDBACK\?\.message\?\.\(err, 'auth'\)/, '로그인 미분류 오류가 원문으로 되돌아가면 안 됩니다.');
assert.match(quotes, /(?:feedback|f)\.message\(err, 'general'\)/, '비교견적 미분류 오류가 원문으로 되돌아가면 안 됩니다.');
assert.match(features, /feedback\.message\(err, 'identity'\)/, '인증 미분류 오류가 원문으로 되돌아가면 안 됩니다.');
assert.doesNotMatch(features, /관리자:\s*Supabase/, '고객 인증 화면에 운영 설정 문구가 나오면 안 됩니다.');
assert.doesNotMatch(script, /st\.textContent\s*=\s*'인증 실패:\s*'\s*\+/, '본인인증 상태에 원문을 직접 붙이면 안 됩니다.');
assert.doesNotMatch(script, /(?:SMS\s*)?키 등록 후 활성화/, '고객 인증 화면에 내부 설정 문구가 나오면 안 됩니다.');
assert.doesNotMatch(script, /alert\(err\s*&&\s*err\.message/, '동적 인증 오류 문자열을 팝업에 직접 전달하면 안 됩니다.');
assert.doesNotMatch(script, /환불 실패:\s*'\s*\+/, '관리자 환불 팝업에도 내부 오류 코드를 직접 붙이면 안 됩니다.');
assert.match(script, /결제가 승인되지 않은 주문이라 결제 취소 없이 주문만 취소했습니다\./, '미승인 주문 취소와 실제 환불을 구분해서 안내해야 합니다.');
assert.doesNotMatch(features, /am\.textContent\s*=\s*'제출 실패:\s*'\s*\+/, '계좌인증 상태에 원문을 직접 붙이면 안 됩니다.');
assert.doesNotMatch(features, /setMsg\('인증 실패:\s*'\s*\+/, '사업자 인증 상태에 원문을 직접 붙이면 안 됩니다.');
assert.match(auction, /tEl\.textContent\s*=\s*window\.belloreCustomerMessage/, '경매 토스트도 고객 문구 변환을 거쳐야 합니다.');
assert.doesNotMatch(auction, /(?:auction|wallet)\.sql 실행 여부/, '고객 팝업에 내부 설치 문구가 나오면 안 됩니다.');
assert.doesNotMatch(auction, /Supabase SQL Editor/, '고객 경매 화면에 운영 도구 안내가 나오면 안 됩니다.');
assert.match(dialog, /return '요청을 처리하지 못했습니다\. 잠시 후 다시 시도해 주세요\.'/,
  '고객 문구 변환기가 없거나 실패해도 원문을 보여주면 안 됩니다.');

console.log('customer popup copy and raw-error boundaries: ok');
