import { formatWon } from '../_shared/telegram-ops-core.mjs';
import { formatKakaoItemDescription } from './telegram-ops-v6-core.mjs';

export function createKakaoDelivery({
  apiKey, apiSecret, pfId, sender, approvedTemplate, priceTemplate,
  closedTemplate, emptyTemplate,
}) {
  async function solapiAuth() {
    const date = new Date().toISOString();
    const salt = crypto.randomUUID().replaceAll('-', '');
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(apiSecret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(date + salt));
    const signature = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
  }

  async function getSolapiDelivery(groupId) {
    const response = await fetch(
      `https://api.solapi.com/messages/v4/groups/${encodeURIComponent(groupId)}/messages?limit=1`,
      { headers: { authorization: await solapiAuth() } },
    );
    const output = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`SOLAPI_STATUS_${response.status}`);
    const messages = Object.values(output.messageList || {});
    if (!messages.length) throw new Error('SOLAPI_STATUS_MESSAGE_MISSING');
    return messages[0];
  }

  async function waitForSolapiDelivery(groupId) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const delivery = await getSolapiDelivery(groupId);
      if (String(delivery.status || '') === 'COMPLETE') {
        const statusCode = String(delivery.statusCode || '');
        if (statusCode !== '4000') {
          throw new Error(`SOLAPI_DELIVERY_${statusCode || 'UNKNOWN'}:${String(delivery.reason || '').slice(0, 120)}`);
        }
        return delivery;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error('SOLAPI_DELIVERY_TIMEOUT');
  }

  return async function sendKakao(eventType, payload) {
    const phone = String(payload.phone || '').replace(/\D/g, '');
    if (phone.length < 10) throw new Error('CUSTOMER_PHONE_MISSING');

    let templateId = '';
    let variables = {};
    const formatKst = (value) => new Date(String(value || Date.now())).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    if (eventType === 'customer_quote_approved') {
      templateId = approvedTemplate;
      variables = {
        '#{시계정보}': formatKakaoItemDescription(payload.itemName),
        '#{승인일시}': formatKst(payload.approvedAt),
        '#{고객명}': String(payload.customerName || '고객'),
      };
    } else if (eventType === 'customer_quote_price') {
      templateId = priceTemplate;
      variables = {
        '#{제안금액}': Number(payload.amount || 0).toLocaleString('ko-KR'),
        '#{견적일시}': formatKst(payload.offeredAt),
        '#{시계정보}': formatKakaoItemDescription(payload.itemName),
        '#{현재최고금액}': formatWon(payload.currentHighestAmount),
        '#{고객명}': String(payload.customerName || '고객'),
      };
    } else {
      const hasOffer = Boolean(payload.hasOffer);
      templateId = hasOffer ? closedTemplate : emptyTemplate;
      variables = hasOffer ? {
        '#{상품명}': formatKakaoItemDescription(payload.itemName),
        '#{견적건수}': String(Number(payload.offerCount || 0)),
        '#{최고견적금액}': Number(payload.highestAmount || 0).toLocaleString('ko-KR'),
      } : {
        '#{상품명}': formatKakaoItemDescription(payload.itemName),
        '#{종료일시}': formatKst(payload.closedAt),
      };
    }
    if (!pfId || !templateId) throw new Error('SOLAPI_KAKAO_TEMPLATE_MISSING');
    if (!apiKey || !apiSecret || !sender) throw new Error('SOLAPI_SECRET_MISSING');

    const response = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: { authorization: await solapiAuth(), 'content-type': 'application/json' },
      body: JSON.stringify({ message: {
        to: phone, from: sender || undefined, type: 'ATA',
        kakaoOptions: { pfId, templateId, variables, disableSms: true },
      } }),
    });
    const output = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = JSON.stringify(output);
      throw new Error(`SOLAPI_${response.status}:${detail.slice(0, 250)}`);
    }
    const failed = Array.isArray(output.failedMessageList) ? output.failedMessageList[0] : null;
    if (failed) {
      throw new Error(`SOLAPI_REGISTER_${String(failed.statusCode || 'UNKNOWN')}:${String(failed.statusMessage || '').slice(0, 120)}`);
    }
    const groupId = String(output.groupId || output.groupInfo?.groupId || '');
    if (!groupId) throw new Error('SOLAPI_GROUP_ID_MISSING');
    const delivery = await waitForSolapiDelivery(groupId);
    return { ...output, groupId, deliveryStatusCode: delivery.statusCode };
  };
}
