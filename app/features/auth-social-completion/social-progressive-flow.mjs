function hasText(value) {
  return Boolean(String(value || '').trim());
}

export function socialProgressiveStep({ name, birthDate, postcode, addr1, identityVerified }) {
  if (!hasText(name)) return 0;
  if (!hasText(birthDate)) return 1;
  if (!hasText(postcode) || !hasText(addr1)) return 2;
  if (identityVerified !== true) return 3;
  return 4;
}
