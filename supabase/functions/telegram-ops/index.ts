import {
  buildOrderCallback,
  buildQuoteCallback,
  formatWon,
  isAllowedActor,
  parseCallback,
  parseOrderCommand,
  parseQuoteCommand,
} from '../_shared/telegram-ops-core.mjs';

const env = (name: string) => Deno.env.get(name) ?? '';
const SUPABASE_URL = env('SUPABASE_URL').replace(/\/$/, '');
const SERVICE_ROLE = env('SUPABASE_SERVICE_ROLE_KEY');
const BOT_TOKEN = env('TELEGRAM_BOT_TOKEN');
const WEBHOOK_SECRET = env('TELEGRAM_WEBHOOK_SECRET');
const CRON_SECRET = env('TELEGRAM_CRON_SECRET');
const ORDER_CHAT_ID = env('TELEGRAM_ORDER_CHAT_ID');
const QUOTE_CHAT_ID = env('TELEGRAM_QUOTE_CHAT_ID');
const ADMIN_IDS = env('TELEGRAM_ADMIN_USER_IDS');
const BELLORE_PROFILE_ID = env('TELEGRAM_BELLORE_PROFILE_ID');

const SOLAPI_API_KEY = env('SOLAPI_API_KEY');
const SOLAPI_API_SECRET = env('SOLAPI_API_SECRET');
const SOLAPI_PFID = env('SOLAPI_PFID');
const SOLAPI_SENDER = env('SOLAPI_SENDER').replace(/\D/g, '');
const SOLAPI_APPROVED_TEMPLATE = env('SOLAPI_TEMPLATE_QUOTE_APPROVED');
const SOLAPI_PRICE_TEMPLATE = env('SOLAPI_TEMPLATE_QUOTE_PRICE');
const SOLAPI_CLOSED_TEMPLATE = env('SOLAPI_TEMPLATE_QUOTE_CLOSED');
const SOLAPI_EMPTY_TEMPLATE = env('SOLAPI_TEMPLATE_QUOTE_CLOSED_EMPTY');

type Json = Record<string, unknown>;
type Outbox = { id: string; event_type: string; target: string; payload: Json };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function rpc(name: string, body: Json = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      authorization: `Bearer ${SERVICE_ROLE}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const output = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof output?.message === 'string' ? output.message : `RPC_${response.status}`;
    throw new Error(message);
  }
  return output;
}

async function telegram(method: string, body: Json) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const output = await response.json().catch(() => ({}));
  if (!response.ok || !output?.ok) {
    throw new Error(`TELEGRAM_${response.status}:${String(output?.description || 'unknown').slice(0, 200)}`);
  }
  return output.result;
}

async function sendText(chatId: string, text: string, replyMarkup?: Json) {
  return await telegram('sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4096),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function solapiAuth() {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replaceAll('-', '');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SOLAPI_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(date + salt));
  const signature = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function sendKakao(eventType: string, payload: Json) {
  const phone = String(payload.phone || '').replace(/\D/g, '');
  if (phone.length < 10) throw new Error('CUSTOMER_PHONE_MISSING');

  let templateId = '';
  let variables: Record<string, string> = {};
  const formatKst = (value: unknown) => new Date(String(value || Date.now())).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  if (eventType === 'customer_quote_approved') {
    templateId = SOLAPI_APPROVED_TEMPLATE;
    variables = {
      '#{시계정보}': String(payload.itemName || '시계'),
      '#{승인일시}': formatKst(payload.approvedAt),
      '#{고객명}': String(payload.customerName || '고객'),
    };
  } else if (eventType === 'customer_quote_price') {
    templateId = SOLAPI_PRICE_TEMPLATE;
    variables = {
      '#{제안금액}': Number(payload.amount || 0).toLocaleString('ko-KR'),
      '#{견적일시}': formatKst(payload.offeredAt),
      '#{시계정보}': String(payload.itemName || '시계'),
      '#{현재최고금액}': formatWon(payload.currentHighestAmount),
      '#{고객명}': String(payload.customerName || '고객'),
    };
  } else {
    const hasOffer = Boolean(payload.hasOffer);
    templateId = hasOffer ? SOLAPI_CLOSED_TEMPLATE : SOLAPI_EMPTY_TEMPLATE;
    variables = hasOffer
      ? {
        '#{상품명}': String(payload.itemName || '시계'),
        '#{최종금액}': formatWon(payload.highestAmount),
      }
      : { '#{상품명}': String(payload.itemName || '시계') };
  }
  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !SOLAPI_PFID || !templateId) {
    throw new Error('SOLAPI_SECRET_OR_TEMPLATE_MISSING');
  }

  const response = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: { authorization: await solapiAuth(), 'content-type': 'application/json' },
    body: JSON.stringify({ message: {
      to: phone,
      from: SOLAPI_SENDER || undefined,
      type: 'ATA',
      kakaoOptions: { pfId: SOLAPI_PFID, templateId, variables },
    } }),
  });
  const output = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`SOLAPI_${response.status}:${JSON.stringify(output).slice(0, 250)}`);
  return output;
}

function formatOutboxMessage(row: Outbox) {
  const p = row.payload;
  if (row.event_type === 'quote_received') {
    return [
      '⌚ 새 비교견적 양식',
      `입력키: ${p.inputKey}`,
      `시계: ${String(p.brand || '')} ${String(p.model || '')}`.trim(),
      `종료: ${new Date(String(p.expiresAt)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
      '',
      `입력 예: ${p.inputKey} 500  (500만원)`,
    ].join('\n');
  }
  if (row.event_type === 'order_paid') {
    return [
      '🧾 결제 완료 주문',
      `입력키: ${p.inputKey}`,
      `주문번호: ${p.orderNo}`,
      `상품: ${p.productName}`,
      `결제금액: ${formatWon(p.amount)}`,
      `구매자: ${p.buyerName || '-'} / ${p.buyerPhone || '-'}`,
      '',
      `승인 입력: ${p.inputKey}`,
    ].join('\n');
  }
  if (row.event_type === 'vendor_bid') {
    return [
      '💰 업체 가격 제안',
      `입력키: ${p.inputKey}`,
      `업체: ${p.company || '업체'}`,
      `전화: ${p.phone || '-'}`,
      `금액: ${formatWon(p.amount)}`,
    ].join('\n');
  }
  if (row.event_type === 'quote_final_report') {
    const vendorLines = Array.isArray(p.externalVendors)
      ? p.externalVendors.flatMap((vendor: Json, i: number) => {
        const offers = Array.isArray(vendor.offers)
          ? vendor.offers.map((offer: Json) => formatWon(offer.amount)).join(', ') : '-';
        return [`${i + 1}. ${vendor.company || '업체'} / ${vendor.phone || '-'}`, `   ${offers}`];
      }) : [];
    const bellore = Array.isArray(p.belloreOffers)
      ? p.belloreOffers.map((offer: Json) => `${offer.round || '-'}차 ${formatWon(offer.amount)}`).join(', ')
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

async function finishOutbox(id: string, success: boolean, providerId = '', error = '') {
  await rpc('telegram_ops_finish_outbox', {
    p_id: id, p_success: success, p_provider_message_id: providerId, p_error: error,
  });
}

async function drainOutbox() {
  const rows = await rpc('telegram_ops_claim_outbox', { p_limit: 20 }) as Outbox[];
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      let providerId = '';
      if (row.target === 'customer_kakao') {
        const result = await sendKakao(row.event_type, row.payload) as Json;
        providerId = String(result.groupId || result.messageId || 'solapi');
      } else {
        const chatId = row.target === 'order_room' ? ORDER_CHAT_ID : QUOTE_CHAT_ID;
        const result = await sendText(chatId, formatOutboxMessage(row)) as Json;
        providerId = String(result.message_id || 'telegram');
      }
      await finishOutbox(row.id, true, providerId);
      sent++;
    } catch (error) {
      const safeError = String(error instanceof Error ? error.message : error).slice(0, 500);
      console.error('outbox_delivery_failed', row.id, row.event_type, safeError);
      await finishOutbox(row.id, false, '', safeError);
      failed++;
    }
  }
  return { claimed: rows.length, sent, failed };
}

function requireConfigured() {
  const missing = Object.entries({
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE, TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET, TELEGRAM_CRON_SECRET: CRON_SECRET,
    TELEGRAM_ORDER_CHAT_ID: ORDER_CHAT_ID, TELEGRAM_QUOTE_CHAT_ID: QUOTE_CHAT_ID,
    TELEGRAM_ADMIN_USER_IDS: ADMIN_IDS, TELEGRAM_BELLORE_PROFILE_ID: BELLORE_PROFILE_ID,
  }).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`MISSING_ENV:${missing.join(',')}`);
}

async function handleMessage(update: Json) {
  const message = update.message as Json | undefined;
  if (!message?.text) return;
  const actor = message.from as Json | undefined;
  const chat = message.chat as Json | undefined;
  if (!actor?.id || !chat?.id || !isAllowedActor(actor.id, ADMIN_IDS)) return;

  const chatId = String(chat.id);
  const text = String(message.text);
  if (chatId === QUOTE_CHAT_ID) {
    const command = parseQuoteCommand(text);
    if (!command) {
      await sendText(chatId, '형식: 입력키 금액\n예: 4821 500 (500만원)');
      return;
    }
    await sendText(chatId, [
      '견적을 등록할까요?',
      `입력키: ${command.inputKey}`,
      `금액: ${formatWon(command.amount)}`,
    ].join('\n'), { inline_keyboard: [[
      { text: '견적 등록', callback_data: buildQuoteCallback(command.inputKey, command.amount) },
      { text: '취소', callback_data: 'cancel' },
    ]] });
  } else if (chatId === ORDER_CHAT_ID) {
    const command = parseOrderCommand(text);
    if (!command) {
      await sendText(chatId, '형식: 4자리 입력키\n예: 4821');
      return;
    }
    await sendText(chatId, `주문 ${command.inputKey}를 검수 단계로 승인할까요?`, {
      inline_keyboard: [[
        { text: '주문 승인', callback_data: buildOrderCallback(command.inputKey) },
        { text: '취소', callback_data: 'cancel' },
      ]],
    });
  }
}

async function handleCallback(update: Json) {
  const callback = update.callback_query as Json | undefined;
  if (!callback?.id || !callback.from) return;
  const actor = callback.from as Json;
  const message = callback.message as Json | undefined;
  const chat = message?.chat as Json | undefined;
  const chatId = String(chat?.id || '');
  if (!isAllowedActor(actor.id, ADMIN_IDS)) {
    await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: '권한이 없습니다.', show_alert: true });
    return;
  }
  const parsed = parseCallback(callback.data);
  if (!parsed) {
    await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: '잘못된 요청입니다.', show_alert: true });
    return;
  }
  if (parsed.kind === 'cancel') {
    await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: '취소했습니다.' });
    return;
  }

  try {
    let result: Json;
    if (parsed.kind === 'quote') {
      if (chatId !== QUOTE_CHAT_ID) throw new Error('WRONG_CHAT');
      result = await rpc('telegram_ops_register_quote_offer', {
        p_input_key: parsed.inputKey, p_amount: parsed.amount,
        p_admin_profile_id: BELLORE_PROFILE_ID, p_actor_telegram_id: String(actor.id),
        p_chat_id: chatId, p_dedupe_key: `telegram:${String(update.update_id)}`,
      }) as Json;
      await sendText(chatId, `등록 완료 · ${result.round}차 · ${formatWon(result.amount)}`);
    } else {
      if (chatId !== ORDER_CHAT_ID) throw new Error('WRONG_CHAT');
      result = await rpc('telegram_ops_approve_order', {
        p_input_key: parsed.inputKey, p_actor_telegram_id: String(actor.id),
        p_chat_id: chatId, p_dedupe_key: `telegram:${String(update.update_id)}`,
      }) as Json;
      await sendText(chatId, `주문 승인 완료 · ${result.orderNo} · 검수 단계`);
    }
    await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: '처리 완료' });
  } catch (error) {
    const messageText = String(error instanceof Error ? error.message : error).slice(0, 180);
    console.error('telegram_action_failed', update.update_id, messageText);
    await telegram('answerCallbackQuery', {
      callback_query_id: callback.id, text: `처리 실패: ${messageText}`, show_alert: true,
    });
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    requireConfigured();
    const telegramSecret = request.headers.get('x-telegram-bot-api-secret-token') || '';
    const cronSecret = request.headers.get('x-bellore-cron-secret') || '';

    if (telegramSecret === WEBHOOK_SECRET) {
      const update = await request.json() as Json;
      await handleMessage(update);
      await handleCallback(update);
      const delivery = await drainOutbox();
      return json({ ok: true, delivery });
    }
    if (cronSecret === CRON_SECRET) {
      const closed = await rpc('telegram_ops_close_expired_quotes') as number;
      const delivery = await drainOutbox();
      return json({ ok: true, closed, delivery });
    }
    return json({ error: 'unauthorized' }, 401);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 500);
    console.error('telegram_ops_failed', message);
    return json({ error: 'server_error', detail: message }, 500);
  }
});
