import {
  buildOrderCallback,
  buildQuoteApprovalCallback,
  buildQuoteCallback,
  isAllowedActor,
  parseCallback,
  parseOrderCommand,
  parseQuoteApprovalCommand,
  parseQuoteCommand,
} from '../_shared/telegram-ops-core.mjs';
import {
  formatChatAmount,
  friendlyActionError,
} from './telegram-ops-v6-core.mjs';
import { createKakaoDelivery } from './kakao-delivery.mjs';
import { createTelegramMediaDelivery } from './telegram-media-delivery.mjs';

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

const { handlePhotoDownload, sendTelegramOutbox } = createTelegramMediaDelivery({
  supabaseUrl: SUPABASE_URL, serviceRole: SERVICE_ROLE, cronSecret: CRON_SECRET,
  telegram, sendText,
});

const sendKakao = createKakaoDelivery({
  apiKey: SOLAPI_API_KEY, apiSecret: SOLAPI_API_SECRET,
  pfId: SOLAPI_PFID, sender: SOLAPI_SENDER,
  approvedTemplate: SOLAPI_APPROVED_TEMPLATE, priceTemplate: SOLAPI_PRICE_TEMPLATE,
  closedTemplate: SOLAPI_CLOSED_TEMPLATE, emptyTemplate: SOLAPI_EMPTY_TEMPLATE,
});

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
        const result = await sendTelegramOutbox(chatId, row) as Json | Json[];
        providerId = Array.isArray(result)
          ? result.map((message) => message.message_id).filter(Boolean).join(',') || 'telegram_album'
          : String(result.message_id || 'telegram');
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
    const approval = parseQuoteApprovalCommand(text);
    if (approval) {
      await sendText(chatId, [
        `📋 입력키 ${approval.inputKey} 비교견적을 승인할까요?`,
        '승인하면 고객 마이페이지에 반영되고 지금부터 72시간 견적이 시작됩니다.',
      ].join('\n'), { inline_keyboard: [[
        { text: '네, 비교견적 승인', callback_data: buildQuoteApprovalCallback(approval.inputKey) },
        { text: '아니요, 취소', callback_data: 'cancel' },
      ]] });
      return;
    }
    const command = parseQuoteCommand(text);
    if (!command) {
      await sendText(chatId, [
        '입력을 이해하지 못했어요.',
        '견적을 승인하려면 「4자리 입력키 + 승인」을 보내주세요.',
        '예) /1547 승인',
        '',
        '견적을 제안하려면 「4자리 입력키 + 금액」을 보내주세요.',
        '예) 3751 500 → 500만원 견적',
      ].join('\n'));
      return;
    }
    const amountText = formatChatAmount(command.amount);
    await sendText(chatId, [
      `💬 ${amountText}의 견적을 제안할까요?`,
      `시계 입력키: ${command.inputKey}`,
      '아래 확인 버튼을 누르면 고객 견적에 반영됩니다.',
    ].join('\n'), { inline_keyboard: [[
      { text: `네, ${amountText} 제안`, callback_data: buildQuoteCallback(command.inputKey, command.amount) },
      { text: '아니요, 취소', callback_data: 'cancel' },
    ]] });
  } else if (chatId === ORDER_CHAT_ID) {
    const command = parseOrderCommand(text);
    if (!command) {
      await sendText(chatId, [
        '입력을 이해하지 못했어요.',
        '주문을 승인하려면 4자리 입력키만 보내주세요.',
        '예) 7471',
      ].join('\n'));
      return;
    }
    await sendText(chatId, [
      `📦 입력키 ${command.inputKey} 주문을 승인할까요?`,
      '승인하면 결제 완료 주문이 상품 검수 단계로 이동합니다.',
    ].join('\n'), {
      inline_keyboard: [[
        { text: '네, 주문 승인', callback_data: buildOrderCallback(command.inputKey) },
        { text: '아니요, 취소', callback_data: 'cancel' },
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
    if (chatId) await sendText(chatId, '취소했습니다. 변경된 내용은 없습니다.');
    return;
  }

  try {
    let result: Json;
    if (parsed.kind === 'quote_approve') {
      if (chatId !== QUOTE_CHAT_ID) throw new Error('WRONG_CHAT');
      result = await rpc('telegram_ops_approve_quote', {
        p_input_key: parsed.inputKey, p_actor_telegram_id: String(actor.id),
        p_chat_id: chatId, p_dedupe_key: `telegram:${String(update.update_id)}`,
      }) as Json;
      const expiresAt = new Date(String(result.expiresAt)).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
      await sendText(chatId, result.alreadyApproved ? [
        'ℹ️ 이미 승인된 비교견적입니다.',
        `입력키: ${parsed.inputKey}`,
        `기존 종료: ${expiresAt}`,
        '승인 시간을 다시 늘리지는 않았습니다.',
      ].join('\n') : [
        '✅ 비교견적이 승인되었습니다.',
        `입력키: ${parsed.inputKey}`,
        '진행시간: 지금부터 72시간',
        `종료: ${expiresAt}`,
        '고객 마이페이지에 반영되었습니다.',
      ].join('\n'));
    } else if (parsed.kind === 'quote') {
      if (chatId !== QUOTE_CHAT_ID) throw new Error('WRONG_CHAT');
      result = await rpc('telegram_ops_register_quote_offer', {
        p_input_key: parsed.inputKey, p_amount: parsed.amount,
        p_admin_profile_id: BELLORE_PROFILE_ID, p_actor_telegram_id: String(actor.id),
        p_chat_id: chatId, p_dedupe_key: `telegram:${String(update.update_id)}`,
      }) as Json;
      await sendText(chatId, [
        `✅ ${formatChatAmount(result.amount)}의 견적을 제안했습니다.`,
        `이번 제안: ${result.round}차 견적`,
        `시계 입력키: ${parsed.inputKey}`,
        '고객 마이페이지 견적에 반영되었습니다.',
      ].join('\n'));
    } else {
      if (chatId !== ORDER_CHAT_ID) throw new Error('WRONG_CHAT');
      result = await rpc('telegram_ops_approve_order', {
        p_input_key: parsed.inputKey, p_actor_telegram_id: String(actor.id),
        p_chat_id: chatId, p_dedupe_key: `telegram:${String(update.update_id)}`,
      }) as Json;
      await sendText(chatId, [
        '✅ 주문이 승인되었습니다.',
        `주문번호: ${result.orderNo}`,
        '현재 단계: 상품 검수',
      ].join('\n'));
    }
    await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: '처리 완료' });
  } catch (error) {
    const messageText = String(error instanceof Error ? error.message : error).slice(0, 180);
    const friendlyMessage = friendlyActionError(error);
    console.error('telegram_action_failed', update.update_id, messageText);
    await telegram('answerCallbackQuery', {
      callback_query_id: callback.id, text: friendlyMessage, show_alert: true,
    });
    if (chatId) await sendText(chatId, `⚠️ ${friendlyMessage}`);
  }
}

Deno.serve(async (request) => {
  try {
    requireConfigured();
    if (request.method === 'GET') return await handlePhotoDownload(request);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
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
      const deliveryBeforeClose = await drainOutbox();
      const closed = await rpc('telegram_ops_close_expired_quotes') as number;
      const deliveryAfterClose = await drainOutbox();
      return json({ ok: true, closed, deliveryBeforeClose, deliveryAfterClose });
    }
    return json({ error: 'unauthorized' }, 401);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 500);
    console.error('telegram_ops_failed', message);
    return json({ error: 'server_error', detail: message }, 500);
  }
});
