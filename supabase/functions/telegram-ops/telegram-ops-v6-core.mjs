const WON_PER_MANWON = 10_000;

function formatWon(amount) {
  return `${Number(amount || 0).toLocaleString('ko-KR')}원`;
}

export function formatChatAmount(amount) {
  const won = Number(amount || 0);
  if (Number.isSafeInteger(won) && won > 0 && won % WON_PER_MANWON === 0) {
    return `${(won / WON_PER_MANWON).toLocaleString('ko-KR')}만원`;
  }
  return formatWon(won);
}

export function friendlyActionError(error) {
  const value = String(error instanceof Error ? error.message : error || '');
  const known = [
    ['QUOTE_KEY_NOT_FOUND', '해당 입력키의 진행 중인 견적을 찾지 못했습니다.'],
    ['QUOTE_EXPIRED', '이 견적은 72시간이 지나 종료되었습니다.'],
    ['QUOTE_NOT_ACTIVE', '이미 종료되었거나 선택이 끝난 견적입니다.'],
    ['ORDER_KEY_NOT_FOUND', '해당 입력키의 승인 대기 주문을 찾지 못했습니다.'],
    ['ORDER_NOT_PAID', '결제가 확인되지 않아 주문을 승인할 수 없습니다.'],
    ['WRONG_CHAT', '이 작업은 지정된 관리방에서만 처리할 수 있습니다.'],
  ];
  return known.find(([code]) => value.includes(code))?.[1]
    || '처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
}

export function normalizeTelegramMediaUrls(values, limit = 10) {
  const source = Array.isArray(values) ? values : [values];
  const result = [];
  for (const value of source) {
    const url = String(value || '').trim();
    if (!/^https?:\/\/\S+$/i.test(url) || result.includes(url)) continue;
    result.push(url);
    if (result.length >= limit) break;
  }
  return result;
}

export function outboxMediaUrls(row) {
  if (row.event_type === 'quote_received') {
    return normalizeTelegramMediaUrls(row.payload.photos);
  }
  if (row.event_type === 'order_paid') {
    return normalizeTelegramMediaUrls(row.payload.productImage);
  }
  return [];
}

export function parseQuoteDetail(detail) {
  const lines = String(detail || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const contact = lines.find((line) => /^\[연락처\]/.test(line))?.replace(/^\[연락처\]\s*/, '') || '';
  const separator = contact.lastIndexOf('/');
  return {
    name: (separator >= 0 ? contact.slice(0, separator) : contact).trim(),
    phone: (separator >= 0 ? contact.slice(separator + 1) : '').trim(),
    memo: lines.filter((line) => !/^\[[^\]]+\]/.test(line)).join('\n'),
  };
}

export function formatPaymentMethod(method, payType = '') {
  const raw = String(method || '').trim();
  const upper = raw.toUpperCase();
  let label = '결제수단 확인 필요';
  if (/E2E_SIMULATION/.test(upper)) label = '테스트 결제(실결제 아님)';
  else if (/TOSS/.test(upper) && /EASY|PAY/.test(upper)) label = '토스페이 간편결제';
  else if (/KAKAO/.test(upper)) label = '카카오페이 간편결제';
  else if (/NAVER/.test(upper)) label = '네이버페이 간편결제';
  else if (/VIRTUAL_ACCOUNT|VIRTUALACCOUNT|VBANK/.test(upper)) label = '가상계좌 입금';
  else if (/TRANSFER|BANK_TRANSFER|ACCOUNT_TRANSFER/.test(upper)) label = '계좌이체';
  else if (/CARD/.test(upper)) label = '카드 결제';
  else if (/CASH/.test(upper)) label = '현금 결제';
  else if (/MOBILE|PHONE/.test(upper)) label = '휴대폰 결제';
  else if (/EASY_PAY|EASYPAY/.test(upper)) label = '간편결제';
  else if (raw) label = raw;

  const type = String(payType || '').toLowerCase() === 'full' ? '전액 결제' : String(payType || '').trim();
  return type ? `${label} · ${type}` : label;
}

export function formatVendorBidNotice(payload) {
  const p = payload || {};
  const detail = parseQuoteDetail(p.quoteDetail);
  const customer = detail.name || String(p.customerName || '').trim() || '고객';
  const watch = [p.brand, p.model].map((value) => String(value || '').trim()).filter(Boolean).join(' ') || '시계';
  const company = String(p.company || '').trim() || '업체';
  const companyLabel = /업체$/.test(company) ? company : `${company} 업체`;
  return [
    `💰 ${customer}님이 신청한 ${watch} 비교견적에`,
    `${companyLabel}의 더 높은 추가견적이 들어왔습니다.`,
    '',
    `새 견적: ${formatChatAmount(p.amount)}`,
    `이전 최고가: ${formatChatAmount(p.previousHighest)}`,
    `시계 입력키: ${p.inputKey}`,
    `업체 연락처: ${p.phone || '-'}`,
  ].join('\n');
}

export function formatOutboxMessage(row) {
  const p = row.payload;
  if (row.event_type === 'quote_received') {
    const detail = parseQuoteDetail(p.detail);
    return [
      '⌚ 새로운 비교견적이 접수되었습니다.',
      '',
      `신청자: ${detail.name || '-'}`,
      `연락처: ${detail.phone || '-'}`,
      `브랜드: ${p.brand || '-'}`,
      `모델명: ${p.model || '-'}`,
      `레퍼런스: ${p.ref || '-'}`,
      `구입시기: ${p.year || '-'}`,
      `상태등급: ${p.grade || '-'}`,
      `스템핑: ${p.stamping || '-'}`,
      `구성품: ${p.parts || '-'}`,
      `특이사항: ${detail.memo || '-'}`,
      `첨부사진: ${outboxMediaUrls(row).length}장`,
      `견적 입력키: ${p.inputKey}`,
      `종료: ${new Date(String(p.expiresAt)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
      '',
      '가격 제안 방법',
      `${p.inputKey} 500 → 500만원 제안`,
    ].join('\n');
  }
  if (row.event_type === 'order_paid') {
    const recipient = p.shipRecipient || p.buyerName || '-';
    const recipientPhone = p.shipPhone || p.buyerPhone || '-';
    const address = [p.shipPostcode ? `(${p.shipPostcode})` : '', p.shipAddr1, p.shipAddr2]
      .map((value) => String(value || '').trim()).filter(Boolean).join(' ');
    return [
      '🧾 결제가 완료된 주문이 접수되었습니다.',
      `주문번호: ${p.orderNo}`,
      `상품: ${p.productName}`,
      `결제금액: ${formatWon(p.amount)}`,
      `결제방법: ${formatPaymentMethod(String(p.method || ''), String(p.payType || ''))}`,
      '',
      `주문자: ${p.buyerName || '-'}`,
      `주문자 연락처: ${p.buyerPhone || '-'}`,
      `수령인: ${recipient}`,
      `수령인 연락처: ${recipientPhone}`,
      `배송주소: ${address || '-'}`,
      `배송요청: ${p.shipRequest || '-'}`,
      `주문 입력키: ${p.inputKey}`,
      '',
      '주문 승인 방법',
      `${p.inputKey} 입력`,
    ].join('\n');
  }
  if (row.event_type === 'vendor_bid') return formatVendorBidNotice(p);
  if (row.event_type === 'quote_final_report') {
    const vendorLines = Array.isArray(p.externalVendors)
      ? p.externalVendors.flatMap((vendor, i) => {
        const offers = Array.isArray(vendor.offers)
          ? vendor.offers.map((offer) => formatWon(offer.amount)).join(', ') : '-';
        return [`${i + 1}. ${vendor.company || '업체'} / ${vendor.phone || '-'}`, `   ${offers}`];
      }) : [];
    const bellore = Array.isArray(p.belloreOffers)
      ? p.belloreOffers.map((offer) => `${offer.round || '-'}차 ${formatWon(offer.amount)}`).join(', ')
      : '-';
    return [
      '🏁 비교견적 72시간 최종보고',
      `입력키: ${p.inputKey}`,
      `전체 제안: ${p.totalOfferCount || 0}건`,
      `외부 업체 제안: ${p.externalOfferCount || 0}건 / ${p.externalVendorCount || 0}개 업체`,
      `최고 제안금액: ${formatWon(p.highestAmount)}`,
      '',
      '참여 업체',
      ...(vendorLines.length ? vendorLines : ['- 참여 업체 없음']),
      '',
      `벨로르 텔레그램 제안: ${bellore || '-'}`,
    ].join('\n');
  }
  throw new Error(`UNKNOWN_OUTBOX_EVENT:${row.event_type}`);
}
