import assert from 'node:assert/strict';
import {
  customerFeedback,
  customerMessage,
  paymentProviderCustomerFeedback,
} from '../app/core/customer-error.mjs';
import { installCustomerFeedback } from '../app/legacy/customer-feedback.js';

const forbiddenTechnicalText = /unauthorized|permission denied|row.level security|\brls\b|pgrst|\brpc\b|\bsql\b|postgres|internal server error|edge function|sandbox|failure_type|card_declined|supabase|백엔드|서버 결제|운영 채널|관리자:/i;

const technicalCases = [
  ['unauthorized', 'access_error'],
  ['permission denied for table orders', 'access_error'],
  ['new row violates row-level security policy', 'access_error'],
  ['PGRST204: column was not found in the schema cache', 'database_error'],
  ['RPC begin_order_payment_cancellation_v1 failed', 'database_error'],
  ['SQLSTATE 42501 from postgres', 'access_error'],
  ['Internal Server Error in Edge Function', 'server_error'],
  ['Sandbox payment server unavailable', 'sandbox_error'],
  ['PG 운영 채널 또는 서버 결제 검증이 준비되지 않았습니다.', 'developer_copy'],
  ['관리자: Supabase 환경 설정이 필요합니다.', 'developer_copy'],
  ['저장 실패: duplicate key value violates unique constraint orders_pkey', 'database_error'],
  ['등록 실패: null value in column buyer_email violates not-null constraint', 'database_error'],
  ['처리 실패: invalid input syntax for type uuid: abc', 'database_error'],
  ['오류(PAYMENT_AUTH_NOT_READY)', 'internal_error'],
  ['로그인 실패: Invalid login credentials', 'auth_error'],
  ['사진 저장 실패: Bucket not found', 'storage_error'],
  ['처리 실패: [object Object]', 'internal_error'],
  ['가입 실패: AuthApiError: User already registered', 'auth_error'],
  ['등록 실패: new row violates check constraint', 'database_error'],
  ['결제 오류: PAYMENT_AUTH_NOT_READY.', 'internal_error'],
  ['처리 실패: [PAYMENT_AUTH_NOT_READY]', 'internal_error'],
  ['로그인 실패: invalid JWT', 'auth_error'],
  ['저장 실패: value too long for type character varying(20)', 'database_error'],
  ['조회 실패: JSON object requested, multiple (or no) rows returned', 'database_error'],
  ['사진 저장 실패: The resource already exists', 'storage_error'],
  ['처리 실패: Cannot read properties of undefined', 'internal_error'],
  ['삭제 실패: Failed to execute removeChild', 'internal_error'],
  ['로그인 실패: Email rate limit exceeded', 'auth_error'],
  ['조회 실패: User not found', 'auth_error'],
  ['처리 실패: The operation was aborted', 'internal_error'],
  ['충전 실패: wallet.sql 실행 여부 확인', 'database_error'],
];

for (const [raw, expectedClassification] of technicalCases) {
  const feedback = customerFeedback(raw, 'general');
  assert.equal(feedback.classification, expectedClassification, raw);
  assert.match(feedback.message, /[가-힣]/, raw);
  assert.doesNotMatch(feedback.message, forbiddenTechnicalText, raw);
  assert(!feedback.message.includes(raw), 'raw error leaked: ' + raw);
}

assert.equal(
  customerMessage('unauthorized', 'payment_start'),
  '결제를 준비하는 중 문제가 발생했습니다. 결제는 진행되지 않았습니다. 잠시 후 다시 시도해 주세요.'
);
assert.match(customerMessage('Failed to fetch', 'confirmation'), /중복 결제하지 말고/);
assert.match(customerMessage('PGRST500', { context: 'upload' }), /사진을 처리하지 못했습니다/);
assert.match(customerMessage('JWT expired', { context: 'general' }), /다시 로그인/);
assert.match(customerMessage('unauthorized', 'auth'), /로그인하지 못했습니다/);
assert.match(customerMessage('PGRST500', 'identity'), /본인인증을 완료하지 못했습니다/);
assert.match(customerMessage({ code: 'NOT_VERIFIED' }, 'identity'), /인증 완료 상태가 확인되지 않았습니다/);
assert.match(customerMessage({ code: 'PROVIDER_LOOKUP_FAILED' }, 'identity'), /인증기관의 완료 결과를 확인하지 못했습니다/);

const checkoutBusinessCases = [
  ['checkout_temporarily_unavailable', /잠시 점검 중/],
  ['checkout_recovery_unavailable', /결제를 시작하지 않았습니다/],
  ['checkout_request_changed', /현재 입력 내용이 다릅니다/],
  ['checkout_request_conflict', /다시 결제하지 말고/],
  ['listing_reserved', /현재 구매가 진행 중인 상품/],
  ['listing_unavailable', /현재 구매할 수 없는 상품/],
  ['listing_not_found', /상품 정보를 찾지 못했습니다/],
  ['coupon_invalid', /쿠폰을 해제하거나/],
  ['coupon_reserved', /이전 결제를 마친 뒤/],
  ['guest_coupon_not_allowed', /로그인하거나 쿠폰을 해제/],
  ['checkout_shipping_required', /받는 분과 배송 주소/],
  ['checkout_amount_changed', /새로고침하고 쿠폰을 다시 선택한 뒤 결제를 다시 시도/],
  ['checkout_amount_too_small', /쿠폰과 상품 가격을 확인/],
  ['checkout_rate_limited', /15분 후/],
  ['listing_price_invalid', /상품 가격/],
];
for (const [code, expectedMessage] of checkoutBusinessCases) {
  const feedback = customerFeedback({ code, message: code }, 'payment_start');
  assert.equal(feedback.classification, `payment_${code}`);
  assert.match(feedback.message, expectedMessage);
  assert.doesNotMatch(feedback.message, forbiddenTechnicalText);
  assert(!feedback.message.includes(code), 'customer message leaked checkout code: ' + code);
}
const pendingConfirmation = customerFeedback({ code: 'payment_confirmation_pending' }, 'confirmation');
assert.equal(pendingConfirmation.classification, 'payment_confirmation_pending');
assert.match(pendingConfirmation.message, /다시 결제하지 말고/);
assert.doesNotMatch(pendingConfirmation.message, forbiddenTechnicalText);
assert(!pendingConfirmation.message.includes('payment_confirmation_pending'));
const confirmationBusinessCases = [
  ['payment_confirmation_response_invalid', /다시 결제하지 말고/],
  ['payment_canceled', /결제를 취소했습니다/],
  ['payment_declined', /승인되지 않았습니다/],
  ['payment_automatically_refunded', /자동 취소되었습니다/],
  ['payment_refund_in_progress', /결제 취소를 진행하고 있습니다/],
  ['payment_refund_pending', /중복 결제하지 말고/],
  ['payment_refunded', /환불 처리되었습니다/],
];
for (const [code, expectedMessage] of confirmationBusinessCases) {
  const feedback = customerFeedback({ code, message: code }, 'confirmation');
  assert.equal(feedback.classification, code);
  assert.match(feedback.message, expectedMessage);
  assert.doesNotMatch(feedback.message, forbiddenTechnicalText);
  assert(!feedback.message.includes(code), 'customer message leaked confirmation code: ' + code);
}
const terminalStatePending = customerFeedback(
  { code: 'payment_terminal_state_pending' },
  'confirmation',
);
assert.match(terminalStatePending.message, /중복 결제하지 말고/);
assert.doesNotMatch(terminalStatePending.message, forbiddenTechnicalText);
assert(!terminalStatePending.message.includes('payment_terminal_state_pending'));
assert.equal(
  customerFeedback({ code: 'listing_reserved' }, 'general').classification,
  'internal_error',
  '결제 시작 외 문맥에서 결제 오류 코드를 임의 해석하면 안 됩니다.',
);

const safeKorean = '쿠폰을 해제하거나 다른 쿠폰을 선택해 주세요.';
const safeFeedback = customerFeedback(safeKorean, 'payment_start');
assert.equal(safeFeedback.classification, 'safe_customer_message');
assert.equal(safeFeedback.message, safeKorean);
assert.notEqual(
  customerMessage('결제를 시작할 수 없습니다: unauthorized', 'payment_start'),
  '결제를 시작할 수 없습니다: unauthorized'
);
assert.equal(customerMessage('결제금액은 500원입니다.'), '결제금액은 500원입니다.');
assert.equal(customerMessage('배송비는 502원입니다.'), '배송비는 502원입니다.');
const koreanTechnical = customerFeedback('orders 테이블 접근 권한 없음', 'general');
assert.equal(koreanTechnical.classification, 'access_error');
assert.notEqual(koreanTechnical.message, 'orders 테이블 접근 권한 없음');
assert.equal(
  customerFeedback({ message: '저장 실패: 알 수 없는 내부 사유' }, 'general').classification,
  'unknown_error',
  '동적 오류 객체의 message는 작성된 고객 문구로 신뢰하면 안 됩니다.',
);

const canceled = paymentProviderCustomerFeedback({ code: 'FAILURE_TYPE_USER', message: 'PG raw cancel text' });
assert.equal(canceled.classification, 'payment_provider_canceled');
assert.match(canceled.message, /결제를 취소했습니다/);

const declined = paymentProviderCustomerFeedback({ code: 'CARD_DECLINED', message: 'Do not honor' });
assert.equal(declined.classification, 'payment_provider_declined');
assert.match(declined.message, /승인되지 않았습니다/);

const unknown = paymentProviderCustomerFeedback({ code: 'PORTONE_UNKNOWN_X91', message: 'opaque provider failure' });
assert.equal(unknown.classification, 'payment_provider_unverified');
assert.match(unknown.message, /중복 결제하지 말고/);

const permissionFailure = paymentProviderCustomerFeedback({ code: 'PERMISSION_DENIED', message: 'permission denied for table orders' });
assert.equal(permissionFailure.classification, 'payment_provider_unverified');
assert.match(permissionFailure.message, /중복 결제하지 말고/);

for (const ambiguous of [
  { code: 'CONNECTION_CLOSED', message: 'connection closed' },
  { code: 'WINDOW_CLOSED', message: 'window closed' },
  { code: 'PORTONE_UNKNOWN', message: 'payment cancelled' },
  { message: '사용자가 결제창을 닫았습니다' },
]) {
  const feedback = paymentProviderCustomerFeedback(ambiguous);
  assert.equal(feedback.classification, 'payment_provider_unverified');
  assert.match(feedback.message, /중복 결제하지 말고/);
}

for (const feedback of [canceled, declined, unknown, permissionFailure]) {
  assert.doesNotMatch(feedback.message, forbiddenTechnicalText);
}

const warnings = [];
const windowObject = {};
const api = installCustomerFeedback({
  windowObject,
  logger: { warn(...args) { warnings.push(args); } },
});

assert.equal(windowObject.BELLORE_CUSTOMER_FEEDBACK, api);
assert.equal(api.message(safeKorean, 'payment_start'), safeKorean);
assert.match(api.message('permission denied for table orders', 'payment_start'), /결제는 진행되지 않았습니다/);
assert.match(api.message('PGRST500', { context: 'upload' }), /사진을 처리하지 못했습니다/);
assert.match(api.message('Internal Server Error', 'identity'), /본인인증을 완료하지 못했습니다/);
assert.match(api.paymentProviderFeedback({ code: 'FAILURE_TYPE_USER' }), /결제를 취소했습니다/);

assert.deepEqual(warnings, [
  ['access_error'],
  ['database_error'],
  ['server_error'],
  ['payment_provider_canceled'],
]);
assert(warnings.every((args) => args.length === 1), 'console warning must contain only the classification');
assert.doesNotMatch(JSON.stringify(warnings), forbiddenTechnicalText, 'console warning leaked a raw technical error');

console.log('customer feedback core and legacy adapter: ok');
