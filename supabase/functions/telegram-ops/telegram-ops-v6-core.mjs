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

export function formatKakaoItemDescription(value, maxLength = 23) {
  const compact = String(value || '시계')
    .replace(/\s*\([^)]{1,20}\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || '시계';
  const characters = Array.from(compact);
  if (characters.length <= maxLength) return compact;
  return `${characters.slice(0, Math.max(1, maxLength - 1)).join('')}…`;
}

export function friendlyActionError(error) {
  const value = String(error instanceof Error ? error.message : error || '');
  const known = [
    ['QUOTE_KEY_NOT_FOUND', '해당 입력키의 진행 중인 견적을 찾지 못했습니다.'],
    ['QUOTE_EXPIRED', '이 견적은 72시간이 지나 종료되었습니다.'],
    ['QUOTE_NOT_ACTIVE', '이미 종료되었거나 선택이 끝난 견적입니다.'],
    ['ORDER_KEY_NOT_FOUND', '해당 입력키의 승인 대기 주문을 찾지 못했습니다.'],
    ['ORDER_NOT_PAID', '결제가 확인되지 않아 주문을 승인할 수 없습니다.'],
    ['SALE_REQUEST_NOT_FOUND', '해당 입력키의 판매 요청을 찾지 못했습니다.'],
    ['SALE_REQUEST_NOT_AWARDED', '아직 판매 요청이 확정되지 않은 견적입니다.'],
    ['SELL_KEY_NOT_FOUND', '해당 입력키의 위탁·즉시매입 신청을 찾지 못했습니다.'],
    ['SELL_NOT_ACTIVE', '이미 종료된 판매 신청입니다.'],
    ['SELL_HANDOFF_NOT_REQUESTED', '고객의 거래방법 선택이 아직 접수되지 않았습니다.'],
    ['SELL_VISIT_NOT_REQUESTED', '방문 지점과 희망 시간이 먼저 필요합니다.'],
    ['SELL_NOT_RECEIVED', '시계 수령 완료 후 검수완료 처리할 수 있습니다.'],
    ['SELL_NOT_READY_TO_LIST', '위탁 시계 검수완료 후 판매개시 처리할 수 있습니다.'],
    ['SELL_NOT_READY_TO_COMPLETE', '앞 단계가 끝나지 않아 거래완료 처리할 수 없습니다.'],
    ['SELL_NOT_COMPLETED', '거래완료 후 정산완료 처리할 수 있습니다.'],
    ['QUOTE_CONTACTS_INCOMPLETE', '고객 연락과 업체 연락을 모두 완료한 뒤 거래완료 처리해주세요.'],
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
  if (row.event_type === 'order_paid' || row.event_type === 'payment_issue') {
    return normalizeTelegramMediaUrls(row.payload.productImage);
  }
  if (row.event_type === 'sell_service_received') {
    return normalizeTelegramMediaUrls(row.payload.photos);
  }
  if (row.event_type === 'photo_download_ready') {
    return normalizeTelegramMediaUrls(row.payload.photos);
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
  if (row.event_type === 'support_new') {
    const createdAt = p.createdAt
      ? new Date(String(p.createdAt)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-';
    return [
      '💬 새로운 고객센터 문의가 접수되었습니다.',
      '',
      `문의일시: ${createdAt}`,
      '',
      '고객 정보와 문의 내용은 개인정보 보호를 위해 Telegram에 표시하지 않습니다.',
      '처리: 관리자 화면 > 고객센터에서 확인 및 답변',
    ].join('\n');
  }
  if (row.event_type === 'photo_download_ready') {
    return '사진 전체 다운로드';
  }
  if (row.event_type === 'quote_sale_requested') {
    const watch = [p.brand, p.model]
      .map((value) => String(value || '').trim()).filter(Boolean).join(' ') || '시계';
    const requestedAt = p.requestedAt
      ? new Date(String(p.requestedAt)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
      : '-';
    return [
      '✅ 고객이 견적을 선택하고 판매를 요청했습니다.',
      `견적 입력키: ${p.inputKey || '-'}`,
      '',
      `고객: ${p.customerName || '-'}`,
      `연락처: ${p.customerPhone || '-'}`,
      `시계: ${watch}`,
      `레퍼런스: ${p.ref || '-'}`,
      `선택금액: ${p.selectedAmount == null ? '확인 필요' : formatChatAmount(p.selectedAmount)}`,
      `선택견적: ${p.vendorName || '확인 필요'}`,
      `거래방법: ${p.tradeMethod || '확인 필요'}`,
      `요청일시: ${requestedAt}`,
      '',
      '관리자 화면에서 거래 진행 내용을 확인해주세요.',
      `연락 완료 처리: ${p.inputKey || '입력키'} 연락완료`,
    ].join('\n');
  }
  if (row.event_type === 'sell_service_received') {
    const methodLabel = p.method === 'consignment' ? '위탁판매' : '즉시매입';
    return [
      `⌚ 새로운 ${methodLabel} 신청이 접수되었습니다.`,
      `접수번호: ${p.receiptNo || p.requestId || '-'}`,
      `판매 입력키: ${p.inputKey || '-'}`,
      '',
      `신청자: ${p.customerName || '-'}`,
      `연락처: ${p.customerPhone || '-'}`,
      `브랜드: ${p.brand || '-'}`,
      `모델명: ${p.model || '-'}`,
      `레퍼런스: ${p.ref || '-'}`,
      `스탬핑/연식: ${p.year || '-'}`,
      `구성품: ${p.parts || '-'}`,
      `특이사항: ${p.memo || '-'}`,
      `첨부사진: ${outboxMediaUrls(row).length}장`,
      `접수일시: ${new Date(String(p.createdAt)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
      '',
      `금액 안내: ${p.inputKey || '입력키'} 금액 500 → 500만원`,
      p.method === 'instant' ? `검수 후 최종금액: ${p.inputKey || '입력키'} 최종 480` : '',
    ].filter(Boolean).join('\n');
  }
  if (row.event_type === 'sell_handoff_requested') {
    const method = ({ visit: '방문거래', delivery: '택배거래', quick: '퀵거래' })[p.tradeMethod] || '확인 필요';
    const branch = ({ jongno: '벨로르 종로점', cheongdam: '벨로르 청담점' })[p.visitBranch] || '-';
    const requestedAt = p.requestedVisitAt ? new Date(String(p.requestedVisitAt)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-';
    return [
      '🚚 고객이 시계 전달 방법을 선택했습니다.',
      `판매 입력키: ${p.inputKey || '-'}`,
      `접수번호: ${p.receiptNo || '-'}`,
      '',
      `고객: ${p.customerName || '-'}`,
      `연락처: ${p.customerPhone || '-'}`,
      `시계: ${[p.brand, p.model].filter(Boolean).join(' ') || '-'}`,
      `안내금액: ${formatChatAmount(p.amount)}`,
      `거래방법: ${method}`,
      ...(p.tradeMethod === 'visit' ? [`희망지점: ${branch}`, `희망일시: ${requestedAt}`, '', `예약 확정: ${p.inputKey} 예약확정`] : ['', `연락 완료: ${p.inputKey} 판매연락완료`]),
      `수령 완료: ${p.inputKey} 수령`,
    ].join('\n');
  }
  if (row.event_type === 'cycle_followup_report') {
    return [
      '🧭 미완료 운영 사이클 일일 점검',
      `24시간 이상 미완료 판매요청: ${p.sellPending || 0}건`,
      `4시간 이상 후속대기 확정견적: ${p.quotePending || 0}건`,
      `24시간 이상 결제확인·검수대기 주문: ${p.orderPending || 0}건`,
      '',
      '관리자 화면에서 실제 처리 상태를 확인해주세요.',
    ].join('\n');
  }
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
  if (row.event_type === 'payment_issue') {
    const review = p.status === 'payment_review';
    return [
      review ? '⚠️ 결제 확인이 필요한 주문이 발생했습니다.' : '❌ 결제에 실패한 주문이 발생했습니다.',
      `주문번호: ${p.orderNo || p.orderId || '-'}`,
      `상품: ${p.productName || '-'}`,
      `시도금액: ${formatWon(p.amount)}`,
      `결제방법: ${formatPaymentMethod(String(p.method || ''), String(p.payType || ''))}`,
      '',
      `주문자: ${p.buyerName || '-'}`,
      `연락처: ${p.buyerPhone || '-'}`,
      `사유: ${p.reason || '-'}`,
      `발생일시: ${new Date(String(p.createdAt)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
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
