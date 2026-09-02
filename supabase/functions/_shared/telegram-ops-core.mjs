const WON_PER_MANWON = 10_000;

export function parseQuoteCommand(input) {
  const text = String(input || '').trim();
  const match = text.match(/^\/?(\d{4})\s+(.+)$/);
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

export function parseQuoteApprovalCommand(input) {
  const match = String(input || '').trim().match(/^\/?(\d{4})\s+승인$/);
  return match ? { inputKey: match[1] } : null;
}

export function parseQuoteContactCommand(input) {
  const match = String(input || '').trim().match(/^\/?(\d{4})\s+연락완료$/);
  return match ? { inputKey: match[1] } : null;
}

export function parseQuoteFollowupCommand(input) {
  const match = String(input || '').trim().match(/^\/?(\d{4})\s+(업체연락완료|거래완료)$/);
  if (!match) return null;
  return { inputKey: match[1], step: match[2] === '업체연락완료' ? 'vendor_contacted' : 'trade_completed' };
}

export function parseSellOfferCommand(input) {
  const match = String(input || '').trim().match(/^\/?(\d{4})\s+(금액|최종)\s+(.+)$/);
  if (!match) return null;
  const parsed = parseQuoteCommand(`${match[1]} ${match[3]}`);
  return parsed ? { ...parsed, isFinal: match[2] === '최종' } : null;
}

export function parseSellAdvanceCommand(input) {
  const match = String(input || '').trim().match(/^\/?(\d{4})\s+(판매연락완료|예약확정|수령|검수완료|판매개시|거래완료|정산완료)$/);
  if (!match) return null;
  const actions = {
    판매연락완료: 'contact_complete', 예약확정: 'appointment_confirmed', 수령: 'received',
    검수완료: 'inspected', 판매개시: 'listed', 거래완료: 'completed', 정산완료: 'settled',
  };
  return { inputKey: match[1], action: actions[match[2]], label: match[2] };
}

export function parseOrderCommand(input) {
  const match = String(input || '').trim().match(/^\/?(\d{4})$/);
  return match ? { inputKey: match[1] } : null;
}

export function formatWon(amount) {
  return `${Number(amount || 0).toLocaleString('ko-KR')}원`;
}

export function isAllowedActor(actorId, configuredIds) {
  return new Set(String(configuredIds || '').split(',').map((v) => v.trim()).filter(Boolean))
    .has(String(actorId));
}

export function buildQuoteCallback(inputKey, amount) {
  return `q:${inputKey}:${amount}`;
}

export function buildQuoteApprovalCallback(inputKey) {
  return `a:${inputKey}`;
}

export function buildQuoteContactCallback(inputKey) {
  return `c:${inputKey}`;
}

export function buildQuoteFollowupCallback(inputKey, step) {
  return `${step === 'vendor_contacted' ? 'v' : 't'}:${inputKey}`;
}

export function buildSellOfferCallback(inputKey, amount, isFinal) {
  return `s:${inputKey}:${amount}:${isFinal ? 1 : 0}`;
}

export function buildSellAdvanceCallback(inputKey, action) {
  const codes = { contact_complete: 'c', appointment_confirmed: 'a', received: 'r', inspected: 'i', listed: 'l', completed: 'd', settled: 's' };
  return `x:${inputKey}:${codes[action]}`;
}

export function buildOrderCallback(inputKey) {
  return `o:${inputKey}`;
}

export function parseCallback(data) {
  const value = String(data || '');
  let match = value.match(/^q:(\d{4}):(\d+)$/);
  if (match) return { kind: 'quote', inputKey: match[1], amount: Number(match[2]) };
  match = value.match(/^a:(\d{4})$/);
  if (match) return { kind: 'quote_approve', inputKey: match[1] };
  match = value.match(/^o:(\d{4})$/);
  if (match) return { kind: 'order', inputKey: match[1] };
  match = value.match(/^c:(\d{4})$/);
  if (match) return { kind: 'quote_contact', inputKey: match[1] };
  match = value.match(/^v:(\d{4})$/);
  if (match) return { kind: 'quote_followup', inputKey: match[1], step: 'vendor_contacted' };
  match = value.match(/^t:(\d{4})$/);
  if (match) return { kind: 'quote_followup', inputKey: match[1], step: 'trade_completed' };
  match = value.match(/^s:(\d{4}):(\d+):([01])$/);
  if (match) return { kind: 'sell_offer', inputKey: match[1], amount: Number(match[2]), isFinal: match[3] === '1' };
  match = value.match(/^x:(\d{4}):([carilds])$/);
  if (match) {
    const actions = { c: 'contact_complete', a: 'appointment_confirmed', r: 'received', i: 'inspected', l: 'listed', d: 'completed', s: 'settled' };
    return { kind: 'sell_advance', inputKey: match[1], action: actions[match[2]] };
  }
  if (value === 'cancel') return { kind: 'cancel' };
  return null;
}
