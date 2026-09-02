import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrderCallback,
  buildQuoteApprovalCallback,
  buildQuoteContactCallback,
  buildQuoteCallback,
  isAllowedActor,
  parseCallback,
  parseOrderCommand,
  parseQuoteApprovalCommand,
  parseQuoteContactCommand,
  parseQuoteCommand,
} from './telegram-ops-core.mjs';

test('견적 금액은 기본적으로 만원 단위를 사용한다', () => {
  assert.deepEqual(parseQuoteCommand('4821 500'), { inputKey: '4821', amount: 5_000_000 });
  assert.deepEqual(parseQuoteCommand('/4821 500'), { inputKey: '4821', amount: 5_000_000 });
  assert.deepEqual(parseQuoteCommand('4821 500만'), { inputKey: '4821', amount: 5_000_000 });
  assert.deepEqual(parseQuoteCommand('4821 500만원'), { inputKey: '4821', amount: 5_000_000 });
});

test('판매 요청 연락완료 명령은 견적 금액 명령과 구분한다', () => {
  assert.deepEqual(parseQuoteContactCommand('1547 연락완료'), { inputKey: '1547' });
  assert.deepEqual(parseQuoteContactCommand('/1547 연락완료'), { inputKey: '1547' });
  assert.equal(parseQuoteContactCommand('1547 500'), null);
  assert.deepEqual(parseCallback(buildQuoteContactCallback('1547')), {
    kind: 'quote_contact', inputKey: '1547',
  });
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

test('비교견적 승인 명령은 4자리 키와 정확한 승인 문구만 허용한다', () => {
  assert.deepEqual(parseQuoteApprovalCommand('1547 승인'), { inputKey: '1547' });
  assert.deepEqual(parseQuoteApprovalCommand('/1547 승인'), { inputKey: '1547' });
  assert.equal(parseQuoteApprovalCommand('1547'), null);
  assert.equal(parseQuoteApprovalCommand('1547 승인해'), null);
  assert.equal(parseQuoteApprovalCommand('547 승인'), null);
  assert.deepEqual(parseCallback(buildQuoteApprovalCallback('1547')), {
    kind: 'quote_approve', inputKey: '1547',
  });
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
