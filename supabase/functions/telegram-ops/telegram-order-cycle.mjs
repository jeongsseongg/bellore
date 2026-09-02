import { buildOrderAdvanceCallback, parseOrderAdvanceCommand } from '../_shared/telegram-ops-core.mjs';

export function createTelegramOrderCycle({ rpc, sendText, orderChatId }) {
  async function handleMessage(text, chatId) {
    const command = parseOrderAdvanceCommand(text);
    if (!command) return false;
    const detail = command.action === 'shipping' ? `\n택배사: ${command.courier}\n운송장: ${command.trackingNo}` : '';
    await sendText(chatId, `📦 입력키 ${command.inputKey} 주문을 「${command.label}」 처리할까요?${detail}`, { inline_keyboard: [[
      { text: `네, ${command.label}`, callback_data: buildOrderAdvanceCallback(command.inputKey, command.action, command.courier, command.trackingNo) },
      { text: '아니요, 취소', callback_data: 'cancel' },
    ]] });
    return true;
  }

  async function handleCallback(parsed, context) {
    if (parsed.kind !== 'order_advance') return { handled: false };
    if (context.chatId !== orderChatId) throw new Error('WRONG_CHAT');
    const result = await rpc('telegram_ops_advance_order', {
      p_input_key: parsed.inputKey, p_action: parsed.action,
      p_courier: parsed.courier || null, p_tracking_no: parsed.trackingNo || null,
      p_actor_telegram_id: context.actorId, p_chat_id: context.chatId, p_dedupe_key: context.dedupeKey,
    });
    await sendText(context.chatId, [
      `✅ ${result.title || '주문 상태'} 처리했습니다.`, `주문번호: ${result.orderNo}`,
      `주문 입력키: ${parsed.inputKey}`, `현재 단계: ${result.statusLabel || result.status}`,
      result.trackingNo ? `운송장: ${result.courier || '-'} ${result.trackingNo}` : '',
      '고객 마이페이지와 알림함에 반영되었습니다.',
    ].filter(Boolean).join('\n'));
    return { handled: true, result };
  }
  return { handleMessage, handleCallback };
}
