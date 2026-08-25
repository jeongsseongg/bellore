import assert from 'node:assert/strict';
import {
  classifyCheckoutJwtClaims,
  decodeGatewayVerifiedJwtClaims
} from '../supabase/functions/_shared/checkout-auth.mjs';

function unsignedJwt(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `eyJhbGciOiJIUzI1NiJ9.${encoded}.signature`;
}

const userId = '123e4567-e89b-42d3-a456-426614174000';

assert.deepEqual(classifyCheckoutJwtClaims({ role: 'anon' }), { kind: 'guest' });
assert.deepEqual(classifyCheckoutJwtClaims({ role: 'anon', sub: '' }), { kind: 'guest' });
assert.deepEqual(
  classifyCheckoutJwtClaims({ role: 'authenticated', sub: userId.toUpperCase() }),
  { kind: 'user', subject: userId }
);
assert.equal(classifyCheckoutJwtClaims({ role: 'service_role' }).kind, 'reject');
assert.equal(classifyCheckoutJwtClaims({ role: 'authenticated' }).kind, 'reject');
assert.equal(classifyCheckoutJwtClaims({ role: 'anon', sub: userId }).kind, 'reject');
assert.equal(classifyCheckoutJwtClaims(null).kind, 'reject');

const decodedGuest = decodeGatewayVerifiedJwtClaims(unsignedJwt({ role: 'anon' }));
assert.deepEqual(classifyCheckoutJwtClaims(decodedGuest), { kind: 'guest' });
assert.equal(decodeGatewayVerifiedJwtClaims('not-a-jwt'), null);

console.log('checkout auth claim classification: ok');
