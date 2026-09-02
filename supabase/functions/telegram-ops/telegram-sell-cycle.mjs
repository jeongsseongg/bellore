import {
  buildSellAdvanceCallback,
  buildSellOfferCallback,
  parseSellAdvanceCommand,
  parseSellOfferCommand,
} from '../_shared/telegram-ops-core.mjs';

export function createTelegramSellCycle({ rpc, sendText, formatChatAmount, quoteChatId }) {
  async function handleMessage(text, chatId) {
    const advance = parseSellAdvanceCommand(text);
    if (advance) {
      await sendText(chatId, `⌚ 입력키 ${advance.inputKey} 판매건을 「${advance.label}」 처리할까요?`, { inline_keyboard: [[
        { text: `네, ${advance.label}`, callback_data: buildSellAdvanceCallback(advance.inputKey, advance.action) },
        { text: '아니요, 취소', callback_data: 'cancel' },
      ]] });
      return true;
    }
    const offer = parseSellOfferCommand(text);
    if (!offer) return false;
    const label = offer.isFinal ? '최종 매입금액' : '판매 안내금액';
    await sendText(chatId, `💵 입력키 ${offer.inputKey}에 ${label} ${formatChatAmount(offer.amount)}을 안내할까요?`, { inline_keyboard: [[
      { text: '네, 금액 안내', callback_data: buildSellOfferCallback(offer.inputKey, offer.amount, offer.isFinal) },
      { text: '아니요, 취소', callback_data: 'cancel' },
    ]] });
    return true;
  }

  async function handleCallback(parsed, context) {
    if (!['sell_offer', 'sell_advance'].includes(parsed.kind)) return { handled: false };
    if (context.chatId !== quoteChatId) throw new Error('WRONG_CHAT');
    if (parsed.kind === 'sell_offer') {
      const result = await rpc('telegram_ops_offer_sell_service', {
        p_input_key: parsed.inputKey, p_amount: parsed.amount, p_is_final: parsed.isFinal,
        p_actor_telegram_id: context.actorId, p_chat_id: context.chatId, p_dedupe_key: context.dedupeKey,
      });
      await sendText(context.chatId, [
        `✅ ${result.label || '판매금액'} ${formatChatAmount(result.amount)}을 안내했습니다.`,
        `판매 입력키: ${parsed.inputKey}`, '고객 판매 현황에 반영되었습니다.',
      ].join('\n'));
      return { handled: true, result };
    }
    const result = await rpc('telegram_ops_advance_sell_service', {
      p_input_key: parsed.inputKey, p_action: parsed.action, p_actor_telegram_id: context.actorId,
      p_chat_id: context.chatId, p_dedupe_key: context.dedupeKey,
    });
    await sendText(context.chatId, [
      `✅ ${result.title || '판매 상태'} 처리했습니다.`,
      `판매 입력키: ${parsed.inputKey}`, `현재 상태: ${result.status}`,
    ].join('\n'));
    return { handled: true, result };
  }

  return { handleMessage, handleCallback };
}
