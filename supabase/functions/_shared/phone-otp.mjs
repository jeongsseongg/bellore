const encoder = new TextEncoder();

function base64UrlEncode(value) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function createOtpChallenge({ secret, phone, code, ttlMs = 5 * 60 * 1000 }) {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const expiresAt = Date.now() + ttlMs;
  const codeHash = base64UrlEncode(await hmac(secret, `code\0${nonce}\0${phone}\0${code}`));
  const payload = base64UrlEncode(JSON.stringify({ version: 1, phone, nonce, codeHash, expiresAt }));
  const signature = base64UrlEncode(await hmac(secret, `challenge\0${payload}`));
  return { challenge: `${payload}.${signature}`, nonce, expiresAt };
}

export async function verifyOtpChallenge({ secret, challenge, phone, code }) {
  const [payload, signature, extra] = String(challenge || '').split('.');
  if (!payload || !signature || extra) throw new Error('OTP_CHALLENGE_INVALID');
  const expectedSignature = await hmac(secret, `challenge\0${payload}`);
  if (!equalBytes(base64UrlDecode(signature), expectedSignature)) throw new Error('OTP_CHALLENGE_INVALID');
  let parsed;
  try { parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))); }
  catch { throw new Error('OTP_CHALLENGE_INVALID'); }
  if (parsed.version !== 1 || parsed.phone !== phone || !parsed.nonce || !parsed.codeHash) throw new Error('OTP_CHALLENGE_INVALID');
  if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= Date.now()) throw new Error('OTP_EXPIRED');
  const expectedCodeHash = await hmac(secret, `code\0${parsed.nonce}\0${phone}\0${code}`);
  if (!equalBytes(base64UrlDecode(parsed.codeHash), expectedCodeHash)) throw new Error('OTP_INVALID');
  return { nonce: parsed.nonce, expiresAt: parsed.expiresAt };
}

export async function solapiAuthorization(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replaceAll('-', '');
  const signature = Array.from(await hmac(apiSecret, date + salt), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}
