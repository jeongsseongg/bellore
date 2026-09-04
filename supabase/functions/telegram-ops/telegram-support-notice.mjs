import { formatOutboxMessage } from './telegram-ops-v6-core.mjs';

export function createSupportNoticeDelivery({ token, chatId, telegramWithToken }) {
  return async function sendSupportNotice(row) {
    if (!token || !chatId) throw new Error('SUPPORT_TELEGRAM_NOT_CONFIGURED');
    return telegramWithToken(token, 'sendMessage', {
      chat_id: chatId, text: formatOutboxMessage(row).slice(0, 4096),
    });
  };
}
