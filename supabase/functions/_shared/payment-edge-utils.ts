import { safeText, type JsonRecord } from "./payment-recovery.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizePaymentAttribution(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as JsonRecord;
  const uuid = (candidate: unknown) => {
    const text = safeText(candidate, 36);
    return text && UUID_RE.test(text) ? text.toLowerCase() : null;
  };
  const touch = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const input = candidate as JsonRecord;
    const keys = [
      "utm_id", "utm_source", "utm_medium", "utm_campaign", "utm_source_platform",
      "utm_term", "utm_content", "gclid", "dclid", "wbraid", "gbraid", "msclkid",
      "fbclid", "ttclid", "n_media", "n_query", "n_keyword", "n_campaign",
      "n_campaign_type", "n_ad_group", "n_ad", "n_rank", "n_click_id",
      "referrer_host", "channel",
    ];
    const output: Record<string, string> = {};
    for (const key of keys) {
      const text = safeText(input[key], 200);
      if (text) output[key] = text;
    }
    return output;
  };
  return {
    event_id: uuid(source.event_id),
    anonymous_id: uuid(source.anonymous_id),
    session_id: uuid(source.session_id),
    first_touch: touch(source.first_touch),
    session_touch: touch(source.session_touch),
    conversion_touch: touch(source.conversion_touch),
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function safeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function confirmationAuthorized(
  customerId: string | null,
  callerId: string | null,
  checkoutTokenMatches: boolean,
): boolean {
  return checkoutTokenMatches || Boolean(customerId && callerId === customerId);
}

export function publicOrder(order: JsonRecord | null | undefined) {
  if (!order) return null;
  return {
    id: order.id,
    order_no: order.order_no,
    listing_id: order.listing_id,
    status: order.status,
    amount: order.amount,
    paid_at: order.paid_at,
    receipt_url: order.receipt_url,
  };
}
