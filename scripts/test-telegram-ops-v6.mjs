import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  formatChatAmount,
  formatKakaoItemDescription,
  formatOutboxMessage,
  formatPaymentMethod,
  formatVendorBidNotice,
  friendlyActionError,
  normalizeTelegramMediaUrls,
  outboxMediaUrls,
  parseQuoteDetail,
} from '../supabase/functions/telegram-ops/telegram-ops-v6-core.mjs';
import {
  parseOrderCommand,
  parseQuoteApprovalCommand,
  parseQuoteContactCommand,
  parseQuoteCommand,
} from '../supabase/functions/_shared/telegram-ops-core.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('일반 숫자 견적·주문 명령 계약을 유지한다', () => {
  assert.deepEqual(parseQuoteCommand('3751 500'), { inputKey: '3751', amount: 5_000_000 });
  assert.deepEqual(parseQuoteCommand('/1547 380'), { inputKey: '1547', amount: 3_800_000 });
  assert.deepEqual(parseOrderCommand('7471'), { inputKey: '7471' });
  assert.deepEqual(parseOrderCommand('/7471'), { inputKey: '7471' });
  assert.deepEqual(parseQuoteApprovalCommand('/1547 승인'), { inputKey: '1547' });
});

test('판매요청 연락완료 명령을 승인·가격 명령과 구분한다', () => {
  assert.deepEqual(parseQuoteContactCommand('1547 연락완료'), { inputKey: '1547' });
  assert.deepEqual(parseQuoteContactCommand('/1547 연락완료'), { inputKey: '1547' });
  assert.equal(parseQuoteCommand('1547 연락완료'), null);
});

test('금액과 결제수단을 운영자가 읽기 쉽게 표시한다', () => {
  assert.equal(formatChatAmount(5_000_000), '500만원');
  assert.equal(formatPaymentMethod('EASY_PAY:TOSSPAY', 'full'), '토스페이 간편결제 · 전액 결제');
  assert.equal(formatPaymentMethod('CARD', 'full'), '카드 결제 · 전액 결제');
  assert.equal(formatPaymentMethod('TRANSFER'), '계좌이체');
});

test('카카오 아이템 설명은 중복 브랜드를 제거하고 23자 이내로 제한한다', () => {
  const compact = formatKakaoItemDescription('BREITLING (브라이틀링) 네비타이머 43 B01');
  assert.equal(compact, 'BREITLING 네비타이머 43 B01');
  assert.ok(Array.from(compact).length <= 23);
  const truncated = formatKakaoItemDescription('아주 긴 시계 상품 이름이 계속 이어지는 경우에도 안전하게 제한');
  assert.ok(Array.from(truncated).length <= 23);
  assert.match(truncated, /…$/);
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

test('즉시매입·위탁 신청과 결제 문제를 연락처·사진과 함께 안내한다', () => {
  const sell = {
    event_type: 'sell_service_received',
    payload: {
      method: 'instant', receiptNo: 'SELL-001', customerName: '박설민',
      customerPhone: '010-4187-1107', brand: '브라이틀링', model: '네비타이머',
      ref: 'AB0123', year: '2020', parts: '보증서, 박스', memo: '오버홀 이력 없음',
      photos: ['https://cdn.example.com/sell-1.jpg'], createdAt: '2026-08-31T05:30:33Z',
    },
  };
  const sellMessage = formatOutboxMessage(sell);
  assert.match(sellMessage, /새로운 즉시매입 신청이 접수되었습니다/);
  assert.match(sellMessage, /연락처: 010-4187-1107/);
  assert.match(sellMessage, /첨부사진: 1장/);

  const paymentMessage = formatOutboxMessage({
    event_type: 'payment_issue',
    payload: {
      status: 'failed', orderNo: 'ORDER-FAILED', productName: '롤렉스 데이저스트',
      amount: 5_000_000, method: 'CARD', payType: 'full', buyerName: '홍길동',
      buyerPhone: '010-1111-2222', reason: '승인 거절', createdAt: '2026-08-31T06:00:00Z',
      productImage: 'https://cdn.example.com/watch.jpg',
    },
  });
  assert.match(paymentMessage, /결제에 실패한 주문이 발생했습니다/);
  assert.match(paymentMessage, /연락처: 010-1111-2222/);
  assert.match(paymentMessage, /사유: 승인 거절/);
  assert.deepEqual(outboxMediaUrls(sell), ['https://cdn.example.com/sell-1.jpg']);
  assert.deepEqual(outboxMediaUrls({
    event_type: 'photo_download_ready',
    payload: { photos: ['https://cdn.example.com/sell-1.jpg'] },
  }), ['https://cdn.example.com/sell-1.jpg']);
});

test('고객의 견적 선택 후 판매 요청을 관리자 운영 정보와 함께 안내한다', () => {
  const message = formatOutboxMessage({
    event_type: 'quote_sale_requested',
    payload: {
      inputKey: '1547', customerName: '홍길동', customerPhone: '010-1234-5678',
      brand: '롬렉스', model: '서브마리너', ref: '126610LN',
      selectedAmount: 5_500_000, vendorName: '굿타임', tradeMethod: '방문거래',
      requestedAt: '2026-08-31T07:30:00Z',
    },
  });
  assert.match(message, /고객이 견적을 선택하고 판매를 요청했습니다/);
  assert.match(message, /견적 입력키: 1547/);
  assert.match(message, /선택금액: 550만원/);
  assert.match(message, /선택견적: 굿타임/);
  assert.match(message, /거래방법: 방문거래/);
  assert.match(message, /1547 연락완료/);
});

test('고객센터 문의는 전용 상담방에서 바로 처리할 정보로 표시한다', () => {
  const message = formatOutboxMessage({
    event_type: 'support_new',
    payload: {
      customerName: '홍길동', customerPhone: '010-1234-5678',
      customerEmail: 'customer@example.com', refQuote: '1547',
      body: '견적 진행상황을 알고 싶습니다.', createdAt: '2026-09-02T03:00:00Z',
    },
  });
  assert.match(message, /새로운 고객센터 문의/);
  assert.match(message, /연락처: 010-1234-5678/);
  assert.match(message, /견적 진행상황을 알고 싶습니다/);
  assert.match(message, /관리자 화면 > 고객센터에서 답변/);
});

test('판매 요청 트리거는 awarded 전환만 감지하고 견적별로 한 번만 적재한다', async () => {
  const sql = await read('supabase/migrations/20260831090000_telegram_quote_sale_requested.sql');
  assert.match(sql, /new\.status is distinct from 'awarded'/);
  assert.match(sql, /new\.status is not distinct from old\.status/);
  assert.match(sql, /'quote_sale_requested:' \|\| new\.id::text/);
  assert.match(sql, /on conflict \(dedupe_key\) do nothing/);
  assert.match(sql, /'selectedAmount',[\s\S]*selected_bid\.amount/);
  assert.match(sql, /'tradeMethod',[\s\S]*v_trade_method/);
});

test('Edge가 사진 전송 실패를 텍스트로 폴백하고 친화 오류를 사용한다', async () => {
  const edge = await read('supabase/functions/telegram-ops/index.ts');
  const media = await read('supabase/functions/telegram-ops/telegram-media-delivery.mjs');
  const kakao = await read('supabase/functions/telegram-ops/kakao-delivery.mjs');
  assert.match(media, /telegram\('sendPhoto'/);
  assert.match(media, /telegram\('sendMediaGroup'/);
  assert.match(media, /사진을 불러오지 못해 내용만 전송했습니다/);
  assert.match(edge, /const friendlyMessage = friendlyActionError\(error\)/);
  assert.match(edge, /취소했습니다\. 변경된 내용은 없습니다\./);
  assert.match(kakao, /!sender/);
  assert.match(kakao, /disableSms: true/);
  assert.match(kakao, /waitForSolapiDelivery/);
  assert.match(kakao, /statusCode !== '4000'/);
  assert.doesNotMatch(kakao, /sendSolapiText/);
  assert.match(kakao, /'#\{견적건수\}': String\(Number\(payload\.offerCount \|\| 0\)\)/);
  assert.match(kakao, /'#\{최고견적금액\}': Number\(payload\.highestAmount \|\| 0\)\.toLocaleString\('ko-KR'\)/);
  assert.match(kakao, /'#\{종료일시\}': formatKst\(payload\.closedAt\)/);
  assert.match(edge, /const deliveryBeforeClose = await drainOutbox\(\);[\s\S]*telegram_ops_close_expired_quotes/);
  assert.match(media, /사진 전체 다운로드/);
  assert.match(media, /expires = Math\.floor\(Date\.now\(\) \/ 1000\) \+ 24 \* 60 \* 60/);
  assert.match(media, /totalBytes > 50 \* 1024 \* 1024/);
  assert.match(edge, /if \(request\.method === 'GET'\) return await handlePhotoDownload\(request\)/);
  assert.match(edge, /telegram_ops_approve_quote/);
  assert.match(edge, /telegram_ops_complete_quote_customer_contact/);
  assert.match(edge, /row\.target === 'support_room'/);
  assert.match(edge, /TELEGRAM_SUPPORT_BOT_TOKEN/);
  assert.match(edge, /비교견적이 승인되었습니다/);
});

test('만료 견적은 비회원 연락처를 사용하고 null 회원 알림을 만들지 않는다', async () => {
  const sql = await read('supabase/migrations/20260831070000_telegram_sell_payment_issue_delivery.sql');
  assert.match(sql, /if quote_row\.customer_id is not null then[\s\S]*insert into public\.notifications/);
  assert.match(sql, /from public\.sell_service_requests s[\s\S]*s\.quote_request_id = quote_row\.id/);
  assert.match(sql, /char_length\(regexp_replace\(coalesce\(customer_phone, ''\), '\\D', '', 'g'\)\) >= 10/);
  assert.match(sql, /customer_quote_closed:[\s\S]*customer_kakao/);
  assert.match(sql, /'offerCount', total_count/);
  assert.match(sql, /'closedAt', now\(\)/);
});

test('신청·결제 문제 트리거와 제한된 기존 건 재적재 계약을 보존한다', async () => {
  const sql = await read('supabase/migrations/20260831070000_telegram_sell_payment_issue_delivery.sql');
  assert.match(sql, /create trigger trg_telegram_ops_sell_service[\s\S]*after insert on public\.sell_service_requests/);
  assert.match(sql, /new\.method in \('instant', 'consignment'\)/);
  assert.match(sql, /'photos', coalesce\(to_jsonb\(new\.photo_urls\), '\[\]'::jsonb\)/);
  assert.match(sql, /create trigger trg_telegram_ops_payment_issue[\s\S]*after insert or update of status on public\.orders/);
  assert.match(sql, /new\.status in \('failed', 'payment_review'\)/);
  assert.match(sql, /'buyerPhone', coalesce\(new\.buyer_phone, ''\)/);
  assert.match(sql, /s\.created_at >= timestamptz '2026-08-31 00:00:00\+00'/);
  assert.match(sql, /where o\.status in \('failed', 'payment_review'\)/);
});
