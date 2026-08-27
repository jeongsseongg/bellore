import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrderCallback,
  buildQuoteCallback,
  friendlyActionError,
  formatChatAmount,
  formatPaymentMethod,
  formatVendorBidNotice,
  isAllowedActor,
  normalizeTelegramMediaUrls,
  parseQuoteDetail,
  parseCallback,
  parseOrderCommand,
  parseQuoteCommand,
} from './telegram-ops-core.mjs';

test('견적 금액은 기본적으로 만원 단위를 사용한다', () => {
  assert.deepEqual(parseQuoteCommand('4821 500'), { inputKey: '4821', amount: 5_000_000 });
  assert.deepEqual(parseQuoteCommand('4821 500만'), { inputKey: '4821', amount: 5_000_000 });
  assert.deepEqual(parseQuoteCommand('4821 500만원'), { inputKey: '4821', amount: 5_000_000 });
  assert.deepEqual(parseQuoteCommand('/4821 500'), { inputKey: '4821', amount: 5_000_000 });
  assert.equal(formatChatAmount(5_000_000), '500만원');
});

test('운영 오류를 사람이 이해할 수 있는 문장으로 바꾼다', () => {
  assert.equal(friendlyActionError(new Error('QUOTE_EXPIRED')), '이 견적은 72시간이 지나 종료되었습니다.');
  assert.equal(friendlyActionError('ORDER_NOT_PAID'), '결제가 확인되지 않아 주문을 승인할 수 없습니다.');
  assert.equal(friendlyActionError('unexpected database error'), '처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
});

test('텔레그램 사진 URL은 안전한 공개 URL만 최대 10개 사용한다', () => {
  const urls = Array.from({ length: 12 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
  assert.deepEqual(normalizeTelegramMediaUrls([urls[0], '', 'javascript:alert(1)', urls[0], ...urls.slice(1)]), urls.slice(0, 10));
  assert.deepEqual(normalizeTelegramMediaUrls('https://cdn.example.com/order.webp'), ['https://cdn.example.com/order.webp']);
});

test('견적 연락처·메모와 주문 결제수단을 읽기 쉽게 표시한다', () => {
  assert.deepEqual(parseQuoteDetail('[레퍼런스] 126610\n미세 사용감\n[연락처] 홍길동 / 010-1234-5678'), {
    name: '홍길동', phone: '010-1234-5678', memo: '미세 사용감',
  });
  assert.equal(formatPaymentMethod('EASY_PAY:TOSSPAY', 'full'), '토스페이 간편결제 · 전액 결제');
  assert.equal(formatPaymentMethod('CARD', 'full'), '카드 결제 · 전액 결제');
  assert.equal(formatPaymentMethod('TRANSFER'), '계좌이체');
});

test('최고가 갱신 업체견적을 신청자와 시계 이름이 포함된 문장으로 표시한다', () => {
  assert.equal(formatVendorBidNotice({
    quoteDetail: '[연락처] 홍길동 / 010-1234-5678',
    brand: '롤렉스', model: '서브마리너', company: '굿타임',
    amount: 5_500_000, previousHighest: 5_100_000, inputKey: '3751', phone: '010-9999-9999',
  }), [
    '💰 홍길동님이 신청한 롤렉스 서브마리너 비교견적에',
    '굿타임 업체의 더 높은 추가견적이 들어왔습니다.',
    '',
    '새 견적: 550만원',
    '이전 최고가: 510만원',
    '시계 입력키: 3751',
    '업체 연락처: 010-9999-9999',
  ].join('\n'));
});

test('큰 정수와 쉼표 표기는 원 단위로 해석한다', () => {
  assert.deepEqual(parseQuoteCommand('4821 5,000,000'), { inputKey: '4821', amount: 5_000_000 });
  assert.deepEqual(parseQuoteCommand('4821 5000000'), { inputKey: '4821', amount: 5_000_000 });
});

test('잘못된 키와 금액을 거부한다', () => {
  assert.equal(parseQuoteCommand('821 500'), null);
  assert.equal(parseQuoteCommand('4821 오백'), null);
  assert.equal(parseQuoteCommand('4821 -1'), null);
  assert.equal(parseOrderCommand('12345'), null);
});

test('주문 키, 관리자 허용목록, 콜백을 파싱한다', () => {
  assert.deepEqual(parseOrderCommand(' 4821 '), { inputKey: '4821' });
  assert.deepEqual(parseOrderCommand('/4821'), { inputKey: '4821' });
  assert.equal(isAllowedActor(22, '11, 22,33'), true);
  assert.equal(isAllowedActor(44, '11,22,33'), false);
  assert.deepEqual(parseCallback(buildQuoteCallback('4821', 5_000_000)), {
    kind: 'quote', inputKey: '4821', amount: 5_000_000,
  });
  assert.deepEqual(parseCallback(buildOrderCallback('4821')), { kind: 'order', inputKey: '4821' });
});
