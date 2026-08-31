import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  formatChatAmount,
  formatOutboxMessage,
  formatPaymentMethod,
  formatVendorBidNotice,
  friendlyActionError,
  normalizeTelegramMediaUrls,
  parseQuoteDetail,
} from '../supabase/functions/telegram-ops/telegram-ops-v6-core.mjs';
import {
  parseOrderCommand,
  parseQuoteCommand,
} from '../supabase/functions/_shared/telegram-ops-core.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('일반 숫자 견적·주문 명령 계약을 유지한다', () => {
  assert.deepEqual(parseQuoteCommand('3751 500'), { inputKey: '3751', amount: 5_000_000 });
  assert.deepEqual(parseOrderCommand('7471'), { inputKey: '7471' });
});

test('금액과 결제수단을 운영자가 읽기 쉽게 표시한다', () => {
  assert.equal(formatChatAmount(5_000_000), '500만원');
  assert.equal(formatPaymentMethod('EASY_PAY:TOSSPAY', 'full'), '토스페이 간편결제 · 전액 결제');
  assert.equal(formatPaymentMethod('CARD', 'full'), '카드 결제 · 전액 결제');
  assert.equal(formatPaymentMethod('TRANSFER'), '계좌이체');
});

test('운영 오류를 내부 코드 대신 친화 문장으로 바꾼다', () => {
  assert.equal(friendlyActionError(new Error('QUOTE_EXPIRED')), '이 견적은 72시간이 지나 종료되었습니다.');
  assert.equal(friendlyActionError('ORDER_NOT_PAID'), '결제가 확인되지 않아 주문을 승인할 수 없습니다.');
  assert.equal(friendlyActionError('unexpected database error'), '처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
});

test('공개 사진 URL을 중복 없이 최대 10개로 제한한다', () => {
  const urls = Array.from({ length: 12 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
  assert.deepEqual(
    normalizeTelegramMediaUrls([urls[0], '', 'javascript:alert(1)', urls[0], ...urls.slice(1)]),
    urls.slice(0, 10),
  );
  assert.deepEqual(
    normalizeTelegramMediaUrls('https://cdn.example.com/order.webp'),
    ['https://cdn.example.com/order.webp'],
  );
});

test('견적 상세와 최고가 갱신 문구를 보존한다', () => {
  assert.deepEqual(parseQuoteDetail('[레퍼런스] 126610\n미세 사용감\n[연락처] 홍길동 / 010-1234-5678'), {
    name: '홍길동', phone: '010-1234-5678', memo: '미세 사용감',
  });
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

test('견적·주문 outbox를 사진 수와 전체 운영 상세가 있는 문장으로 만든다', () => {
  const quote = formatOutboxMessage({
    event_type: 'quote_received',
    payload: {
      detail: '[연락처] 홍길동 / 010-1234-5678\n미세 사용감',
      brand: '롤렉스', model: '서브마리너', ref: '126610', year: '2021',
      grade: '8', stamping: '2021', parts: '풀세트', inputKey: '3751',
      expiresAt: '2026-08-29T00:00:00Z',
      photos: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
    },
  });
  assert.match(quote, /신청자: 홍길동/);
  assert.match(quote, /레퍼런스: 126610/);
  assert.match(quote, /첨부사진: 2장/);

  const order = formatOutboxMessage({
    event_type: 'order_paid',
    payload: {
      orderNo: 'ORDER', productName: '롤렉스 서브마리너', amount: 5_000_000,
      method: 'EASY_PAY:TOSSPAY', payType: 'full', buyerName: '홍길동', buyerPhone: '010-1111-2222',
      shipRecipient: '김수령', shipPhone: '010-3333-4444', shipPostcode: '04524',
      shipAddr1: '서울시 중구', shipAddr2: '1층', shipRequest: '도착 전 연락', inputKey: '7471',
    },
  });
  assert.match(order, /토스페이 간편결제 · 전액 결제/);
  assert.match(order, /수령인: 김수령/);
  assert.match(order, /배송주소: \(04524\) 서울시 중구 1층/);
});

test('Edge가 사진 전송 실패를 텍스트로 폴백하고 친화 오류를 사용한다', async () => {
  const edge = await read('supabase/functions/telegram-ops/index.ts');
  assert.match(edge, /telegram\('sendPhoto'/);
  assert.match(edge, /telegram\('sendMediaGroup'/);
  assert.match(edge, /사진을 불러오지 못해 내용만 전송했습니다/);
  assert.match(edge, /const friendlyMessage = friendlyActionError\(error\)/);
  assert.match(edge, /취소했습니다\. 변경된 내용은 없습니다\./);
  assert.match(edge, /!SOLAPI_SENDER/);
  assert.match(edge, /disableSms: false/);
  assert.match(edge, /'#\{견적건수\}': String\(Number\(payload\.offerCount \|\| 0\)\)/);
  assert.match(edge, /'#\{최고견적금액\}': Number\(payload\.highestAmount \|\| 0\)\.toLocaleString\('ko-KR'\)/);
  assert.match(edge, /'#\{종료일시\}': formatKst\(payload\.closedAt\)/);
});

test('만료 견적은 비회원 연락처를 사용하고 null 회원 알림을 만들지 않는다', async () => {
  const source = await read('telegram_operations.sql');
  const migration = await read('supabase/migrations/20260831044354_telegram_guest_kakao_notifications.sql');
  for (const sql of [source, migration]) {
    assert.match(sql, /if quote_row\.customer_id is not null then[\s\S]*insert into public\.notifications/);
    assert.match(sql, /from public\.sell_service_requests s[\s\S]*s\.quote_request_id = quote_row\.id/);
    assert.match(sql, /char_length\(regexp_replace\(coalesce\(customer_phone, ''\), '\\D', '', 'g'\)\) >= 10/);
    assert.match(sql, /customer_quote_closed:[\s\S]*customer_kakao/);
    assert.match(sql, /'offerCount', total_count/);
    assert.match(sql, /'closedAt', now\(\)/);
  }
});

test('운영 원장 버전 migration이 미디어·전체 상세·최고가 전용 계약을 보존한다', async () => {
  const media = await read('supabase/migrations/20260826053138_telegram_ops_media_payload.sql');
  const detail = await read('supabase/migrations/20260826053958_telegram_ops_complete_payload.sql');
  const highest = await read('supabase/migrations/20260826055215_telegram_vendor_highest_only.sql');

  assert.match(media, /'photos', coalesce\(to_jsonb\(new\.photo_urls\), '\[\]'::jsonb\)/);
  for (const field of ['item_ref', 'item_year', 'item_grade', 'item_stamping', 'item_parts']) {
    assert.match(detail, new RegExp(`new\\.${field}`));
  }
  for (const field of ['product_image', 'pay_type', 'method', 'ship_recipient', 'ship_postcode', 'ship_request']) {
    assert.match(detail, new RegExp(`new\\.${field}`));
  }

  const eventWrite = highest.indexOf('insert into public.quote_offer_events');
  const highestGate = highest.indexOf('if new.amount <= previous_highest then return new; end if;');
  const outboxWrite = highest.indexOf('insert into public.telegram_ops_outbox');
  assert(eventWrite >= 0 && eventWrite < highestGate && highestGate < outboxWrite,
    '모든 제안은 이력에 남기고 최고가 갱신만 Telegram outbox를 만들어야 한다');
  assert.match(highest, /'previousHighest', previous_highest/);
});
