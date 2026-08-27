const WON_PER_MANWON = 10_000;

export function parseQuoteCommand(input) {
  const text = String(input || '').trim().replace(/^\//, '');
  const match = text.match(/^(\d{4})\s+(.+)$/);
  if (!match) return null;

  const inputKey = match[1];
  let rawAmount = match[2].trim().replace(/\s+/g, '');
  const isManwon = /만원?$/.test(rawAmount);
  rawAmount = rawAmount.replace(/만원?$/, '').replace(/,/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(rawAmount)) return null;

  const numeric = Number(rawAmount);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  // 운영 입력의 기본 단위는 만원이다. 쉼표가 있는 7자리 이상 숫자와
  // 10,000 이상의 정수는 원 단위로 취급한다.
  const explicitWon = !isManwon && Number.isInteger(numeric) && numeric >= WON_PER_MANWON;
  const amount = Math.round(explicitWon ? numeric : numeric * WON_PER_MANWON);
  if (!Number.isSafeInteger(amount) || amount < WON_PER_MANWON || amount > 100_000_000_000) {
    return null;
  }

  return { inputKey, amount };
}

export function parseOrderCommand(input) {
  const match = String(input || '').trim().replace(/^\//, '').match(/^(\d{4})$/);
  return match ? { inputKey: match[1] } : null;
}

export function formatWon(amount) {
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

export function isAllowedActor(actorId, configuredIds) {
  return new Set(String(configuredIds || '').split(',').map((v) => v.trim()).filter(Boolean))
    .has(String(actorId));
}

export function buildQuoteCallback(inputKey, amount) {
  return `q:${inputKey}:${amount}`;
}

export function buildOrderCallback(inputKey) {
  return `o:${inputKey}`;
}

export function parseCallback(data) {
  const value = String(data || '');
  let match = value.match(/^q:(\d{4}):(\d+)$/);
  if (match) return { kind: 'quote', inputKey: match[1], amount: Number(match[2]) };
  match = value.match(/^o:(\d{4})$/);
  if (match) return { kind: 'order', inputKey: match[1] };
  if (value === 'cancel') return { kind: 'cancel' };
  return null;
}
