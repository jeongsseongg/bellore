const clean = (value, max = 180) => String(value ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
const consentLabels = { granted: '동의', denied: '비동의', pending: '선택 전', unknown: '확인 불가' };
const providerLabels = { email: '이메일/아이디', phone: '휴대폰', google: 'Google', kakao: '카카오', 'custom:naver': '네이버', naver: '네이버' };

function sourceLabel(touch) {
  if (!touch || typeof touch !== 'object' || !Object.keys(touch).length) return '확인 불가';
  const source = clean(touch.utm_source || touch.referrer_host || touch.channel, 100);
  const campaign = clean(touch.utm_campaign, 100);
  return [source, clean(touch.utm_medium, 100), campaign].filter(Boolean).join(' / ') || '확인 불가';
}

export function formatSignupNotice(payload) {
  const context = payload.context || {};
  const date = new Date(payload.completedAt);
  const time = Number.isNaN(date.getTime()) ? '확인 불가' : date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const phone = clean(payload.phone, 24).replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
  const lines = [
    '🎉 신규 고객이 가입을 완료했습니다.',
    `이름: ${clean(payload.name, 80) || '미입력'}`,
    `연락처: ${phone || '미입력'}`,
    `주소: ${[clean(payload.postcode, 20), clean(payload.addr1, 240), clean(payload.addr2, 240)].filter(Boolean).join(' ') || '미입력'}`,
    `가입일시: ${time}`,
    `가입방법: ${providerLabels[payload.provider] || '확인 불가'}`,
    `휴대폰 본인인증: ${payload.phoneVerified === true ? '완료' : '미완료'}`,
    '',
    `서비스 분석: ${consentLabels[context.analytics] || '확인 불가'}`,
    `광고 분석: ${consentLabels[context.ads] || '확인 불가'}`,
    `광고성 정보 수신: ${payload.marketingConsent === true ? '동의' : payload.marketingConsent === false ? '비동의' : '확인 불가'}`,
  ];
  if (context.analytics === 'granted') {
    lines.push(`최초 유입: ${sourceLabel(context.first)}`, `가입 방문 유입: ${sourceLabel(context.session)}`);
    lines.push('유입정보는 브라우저 기록 기준이며 일부 경로는 확인되지 않을 수 있습니다.');
  } else {
    lines.push(`유입경로: ${context.analytics === 'denied' ? '비동의로 미수집' : '동의 기록 없음 — 확인 불가'}`);
    lines.push('기본 방문 분석은 익명 집계이며 이 고객의 이동 경로를 뜻하지 않습니다.');
  }
  return lines.join('\n');
}

export function createSignupNoticeDelivery({ token, chatId, ownerId, telegramWithToken }) {
  return async function sendSignupNotice(payload) {
    if (!token || !chatId || !ownerId) throw new Error('SIGNUP_TELEGRAM_NOT_CONFIGURED');
    const chat = await telegramWithToken(token, 'getChat', { chat_id: chatId });
    if (!['group', 'supergroup'].includes(chat.type) || chat.username) throw new Error('SIGNUP_PRIVATE_GROUP_REQUIRED');
    const count = await telegramWithToken(token, 'getChatMemberCount', { chat_id: chatId });
    if (count !== 2) throw new Error('SIGNUP_GROUP_MEMBERSHIP_CHANGED');
    const admins = await telegramWithToken(token, 'getChatAdministrators', { chat_id: chatId });
    if (!admins.some((member) => member.status === 'creator' && String(member.user.id) === ownerId)) {
      throw new Error('SIGNUP_GROUP_OWNER_CHANGED');
    }
    return telegramWithToken(token, 'sendMessage', {
      chat_id: chatId, text: formatSignupNotice(payload), protect_content: true,
      link_preview_options: { is_disabled: true },
    });
  };
}
