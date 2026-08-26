import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const migration = read('supabase', 'migrations', '20260826172707_harden_member_verifications.sql');
const config = read('supabase', 'config.toml');
const identity = read('supabase', 'functions', 'verify-identity', 'index.ts');
const business = read('supabase', 'functions', 'verify-business', 'index.ts');
const account = read('supabase', 'functions', 'verify-account', 'index.ts');
const admin = read('supabase', 'functions', 'admin-manage-verification', 'index.ts');
const client = read('supabase.js');
const ui = read('script.js');
const verificationService = read('app', 'services', 'auth', 'member-verification-service.js');
const verificationUi = read('app', 'features', 'member-verification', 'signup-verification.js');
const verificationAdapter = read('app', 'legacy', 'member-verification-service.js');
const bootstrap = read('app', 'bootstrap.js');

assert.match(migration, /create table if not exists public\.member_verification_events/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.member_verification_events from anon, authenticated/);
assert.match(migration, /finalize_member_verification/);
assert.match(migration, /admin_set_member_verification/);
assert.match(migration, /new\.phone is distinct from old\.phone/);
assert.match(migration, /new\.business_no/);
assert.match(migration, /new\.bank_account/);
assert.match(migration, /grant execute on function public\.finalize_member_verification[\s\S]*to service_role/);

for (const fn of ['verify-identity', 'sync-email-verification', 'complete-otp-signup', 'verify-business', 'verify-account', 'admin-manage-verification']) {
  assert.match(config, new RegExp(`\\[functions\\.${fn}\\]\\s+verify_jwt = true`));
}

assert.match(identity, /identity-verifications\/\$\{encodeURIComponent\(identityVerificationId\)\}/);
assert.match(identity, /validatePortOneIdentity/);
assert.match(identity, /finalize_member_verification/);
assert.doesNotMatch(identity, /ci\s*:/i, 'CI must not be persisted');
assert.doesNotMatch(identity, /di\s*:/i, 'DI must not be persisted');

assert.match(business, /ntsBusinessResult\(nts\)\.valid/);
assert.doesNotMatch(business, /valid === true \|\|/);
assert.match(account, /Provider is intentionally not guessed/);
assert.match(account, /code: "NOT_CONFIGURED"/);

assert.match(admin, /select\("role,approved,suspended"\)/);
assert.match(admin, /actorProfile\.approved !== true/);
assert.match(admin, /actorProfile\.suspended === true/);
assert.match(admin, /admin_set_member_verification/);
assert.match(verificationService, /invoke\('verify-identity'/);
assert.match(verificationService, /invoke\('sync-email-verification'/);
assert.match(verificationService, /invoke\('verify-business'/);
assert.match(verificationService, /invoke\('verify-account'/);
assert.match(client, /BelloreMemberVerificationService/);
assert.match(ui, /BelloreMemberVerificationUi\.create/);
assert.match(verificationAdapter, /createMemberVerificationService/);
assert.match(bootstrap, /installLegacyMemberVerificationService/);
assert.doesNotMatch(verificationUi, /키 미설정\(soft\) → 즉시 통과/);
assert.match(verificationUi, /이메일 인증을 먼저 완료해 주세요/);

const sharedUrl = pathToFileURL(path.join(root, 'supabase', 'functions', '_shared', 'verification-core.mjs')).href;
const shared = await import(sharedUrl);
const providersUrl = pathToFileURL(path.join(root, 'supabase', 'functions', '_shared', 'member-verification-providers.mjs')).href;
const providers = await import(providersUrl);
assert.equal(shared.normalizePhone('+82 10-1234-5678'), '01012345678');
assert.equal(shared.normalizePhone('010-1234-5678'), '01012345678');
assert.equal(shared.normalizePhone('02-123-4567'), null);
assert.equal(shared.digits('123-45-67890', 10), '1234567890');
assert.equal((await shared.sha256Hex('bellore')).length, 64);

const verifiedIdentity = {
  status: 'VERIFIED', storeId: 'store-live',
  channel: { key: 'channel-live', type: 'LIVE' },
  verifiedCustomer: { phoneNumber: '+82 10-1234-5678', ci: 'must-not-be-persisted' },
};
assert.deepEqual(providers.validatePortOneIdentity(verifiedIdentity, {
  storeId: 'store-live', channelKey: 'channel-live', allowTest: false,
}), { verified: true, phone: '01012345678', channelType: 'LIVE' });
assert.throws(() => providers.validatePortOneIdentity(verifiedIdentity, {
  storeId: 'other-store', channelKey: 'channel-live', allowTest: false,
}), /STORE_MISMATCH/);
assert.throws(() => providers.validatePortOneIdentity({ ...verifiedIdentity, channel: { key: 'channel-test', type: 'TEST' } }, {
  storeId: 'store-live', channelKey: 'channel-test', allowTest: false,
}), /CHANNEL_NOT_LIVE/);
assert.deepEqual(providers.ntsBusinessResult({ data: [{ valid: '01' }] }), { valid: true });
assert.deepEqual(providers.ntsBusinessResult({ data: [{ valid: '02' }] }), { valid: false });

console.log('member verification security contract: ok');
