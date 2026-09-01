import { normalizePhone, safeText } from "./verification-core.mjs";

export function validatePortOneIdentity(verification, expected) {
  if (!verification || typeof verification !== "object" || Array.isArray(verification)) {
    throw new Error("PROVIDER_RESPONSE_INVALID");
  }
  const channel = verification.channel && typeof verification.channel === "object" && !Array.isArray(verification.channel)
    ? verification.channel
    : null;
  const channelKey = safeText(channel?.key, 120);
  const channelType = safeText(channel?.type, 20);
  if (verification.storeId != null && verification.storeId !== expected.storeId) {
    throw new Error("STORE_MISMATCH");
  }
  if (channelKey !== expected.channelKey) throw new Error("CHANNEL_MISMATCH");
  if (!expected.allowTest && channelType !== "LIVE") throw new Error("CHANNEL_NOT_LIVE");
  if (verification.status !== "VERIFIED") {
    return { verified: false, status: safeText(verification.status, 40) ?? "UNKNOWN", channelType };
  }
  const customer = verification.verifiedCustomer && typeof verification.verifiedCustomer === "object" && !Array.isArray(verification.verifiedCustomer)
    ? verification.verifiedCustomer
    : null;
  const phone = normalizePhone(customer?.phoneNumber ?? customer?.phone);
  if (!phone) throw new Error("VERIFIED_PHONE_MISSING");
  const name = safeText(customer?.name, 80);
  const birthDate = safeText(customer?.birthDate, 10);
  const di = safeText(customer?.di, 512);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate ?? "") || !di) {
    throw new Error("VERIFIED_IDENTITY_INCOMPLETE");
  }
  const parsedBirthDate = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(parsedBirthDate.getTime()) || parsedBirthDate.toISOString().slice(0, 10) !== birthDate) {
    throw new Error("VERIFIED_BIRTH_DATE_INVALID");
  }
  return { verified: true, phone, name, birthDate, di, channelType };
}

export function ntsBusinessResult(response) {
  const items = response && Array.isArray(response.data) ? response.data : [];
  const item = items[0] && typeof items[0] === "object" && !Array.isArray(items[0]) ? items[0] : null;
  return { valid: item?.valid === "01" };
}
