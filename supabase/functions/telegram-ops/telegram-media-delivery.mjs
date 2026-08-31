import JSZip from 'jszip';
import { formatOutboxMessage, outboxMediaUrls } from './telegram-ops-v6-core.mjs';

async function hmacHex(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function equalSignature(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function allowedPhotoUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (
      url.hostname.endsWith('.supabase.co')
      || url.hostname === 'bellore.co.kr'
      || url.hostname === 'www.bellore.co.kr'
      || url.hostname === 'raw.githubusercontent.com'
      || url.hostname.endsWith('.githubusercontent.com')
    );
  } catch {
    return false;
  }
}

function photoExtension(contentType, sourceUrl) {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('heic')) return 'heic';
  const pathExtension = new URL(sourceUrl).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  return pathExtension && /^(jpe?g|png|webp|gif|heic)$/.test(pathExtension) ? pathExtension : 'jpg';
}

export function createTelegramMediaDelivery({
  supabaseUrl, serviceRole, cronSecret, telegram, sendText,
}) {
  async function buildPhotoDownloadUrl(outboxId) {
    const expires = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const signature = await hmacHex(`${outboxId}.${expires}`, cronSecret);
    return `${supabaseUrl}/functions/v1/telegram-ops?download=${encodeURIComponent(outboxId)}&expires=${expires}&sig=${signature}`;
  }

  async function sendPhotoDownloadButton(chatId, row, photoCount) {
    const url = await buildPhotoDownloadUrl(row.id);
    return await sendText(chatId, `📥 사진 ${photoCount}장을 ZIP 한 개로 다운로드할 수 있습니다.\n링크는 24시간 동안 유효합니다.`, {
      inline_keyboard: [[{ text: `사진 전체 다운로드 (${photoCount}장)`, url }]],
    });
  }

  async function sendTelegramOutbox(chatId, row) {
    const message = formatOutboxMessage(row);
    const photos = outboxMediaUrls(row);
    if (row.event_type === 'photo_download_ready') {
      return await sendPhotoDownloadButton(chatId, row, photos.length);
    }
    if (!photos.length) return await sendText(chatId, message);

    try {
      let result;
      if (photos.length === 1) {
        result = await telegram('sendPhoto', {
          chat_id: chatId, photo: photos[0], caption: message.slice(0, 1024),
        });
      } else {
        result = await telegram('sendMediaGroup', {
          chat_id: chatId,
          media: photos.map((photo, index) => ({
            type: 'photo', media: photo,
            ...(index === 0 ? { caption: message.slice(0, 1024) } : {}),
          })),
        });
      }
      try {
        await sendPhotoDownloadButton(chatId, row, photos.length);
      } catch (error) {
        console.error('telegram_download_button_failed', row.id, String(error).slice(0, 240));
      }
      return result;
    } catch (error) {
      const safeError = String(error instanceof Error ? error.message : error).slice(0, 240);
      console.error('telegram_media_delivery_failed', row.id, row.event_type, safeError);
      return await sendText(chatId, `${message}\n\n⚠️ 사진을 불러오지 못해 내용만 전송했습니다.`);
    }
  }

  async function handlePhotoDownload(request) {
    const url = new URL(request.url);
    const outboxId = url.searchParams.get('download') || '';
    const expires = Number(url.searchParams.get('expires') || 0);
    const signature = url.searchParams.get('sig') || '';
    if (!/^[0-9a-f-]{36}$/i.test(outboxId) || !Number.isSafeInteger(expires)
        || expires < Math.floor(Date.now() / 1000)) {
      return new Response('다운로드 링크가 만료되었거나 올바르지 않습니다.', { status: 403 });
    }
    const expected = await hmacHex(`${outboxId}.${expires}`, cronSecret);
    if (!equalSignature(signature, expected)) {
      return new Response('다운로드 링크가 올바르지 않습니다.', { status: 403 });
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/telegram_ops_outbox?id=eq.${encodeURIComponent(outboxId)}&select=event_type,payload&limit=1`,
      { headers: { apikey: serviceRole, authorization: `Bearer ${serviceRole}` } },
    );
    if (!response.ok) return new Response('사진 정보를 불러오지 못했습니다.', { status: 502 });
    const rows = await response.json().catch(() => []);
    const row = rows[0];
    const photos = row ? outboxMediaUrls(row).filter(allowedPhotoUrl) : [];
    if (!photos.length) return new Response('다운로드할 사진이 없습니다.', { status: 404 });

    const zip = new JSZip();
    let totalBytes = 0;
    for (let index = 0; index < photos.length; index++) {
      const photoResponse = await fetch(photos[index], { signal: AbortSignal.timeout(15_000) });
      if (!photoResponse.ok) throw new Error(`PHOTO_DOWNLOAD_${photoResponse.status}`);
      const bytes = new Uint8Array(await photoResponse.arrayBuffer());
      totalBytes += bytes.byteLength;
      if (totalBytes > 50 * 1024 * 1024) {
        return new Response('사진 전체 용량이 50MB를 초과해 ZIP을 만들 수 없습니다.', { status: 413 });
      }
      const extension = photoExtension(photoResponse.headers.get('content-type') || '', photos[index]);
      zip.file(`bellore-photo-${String(index + 1).padStart(2, '0')}.${extension}`, bytes);
    }
    const archive = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
    const responseBytes = new Uint8Array(archive.byteLength);
    responseBytes.set(archive);
    return new Response(responseBytes.buffer, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="bellore-photos-${outboxId.slice(0, 8)}.zip"`,
        'cache-control': 'private, no-store',
      },
    });
  }

  return { handlePhotoDownload, sendTelegramOutbox };
}
