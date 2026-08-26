const WON_PER_MANWON = 10_000;

export function parseQuoteCommand(input) {
  const text = String(input || '').trim();
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
  const match = String(input || '').trim().match(/^(\d{4})$/);
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
