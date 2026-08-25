const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The Edge gateway must keep verify_jwt=true. This helper only decodes claims
// after that platform signature check; it never verifies a token by itself.
export function decodeGatewayVerifiedJwtClaims(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    return claims && typeof claims === 'object' && !Array.isArray(claims) ? claims : null;
  } catch {
    return null;
  }
}

export function classifyCheckoutJwtClaims(claims) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    return { kind: 'reject', reason: 'malformed_claims' };
  }

  const role = typeof claims.role === 'string' ? claims.role : '';
  const rawSubject = typeof claims.sub === 'string' ? claims.sub.trim() : '';
  if (role === 'anon' && !rawSubject) return { kind: 'guest' };
  if (role === 'service_role') return { kind: 'reject', reason: 'privileged_token_forbidden' };
  if (role === 'authenticated' && UUID_RE.test(rawSubject)) {
    return { kind: 'user', subject: rawSubject.toLowerCase() };
  }
  return { kind: 'reject', reason: 'unexpected_claims' };
}
