import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const migration = read('supabase', 'migrations', '20260826172707_harden_member_verifications.sql');
const lifecycleMigration = read('supabase', 'migrations', '20260826210000_harden_admin_member_lifecycle.sql');
const config = read('supabase', 'config.toml');
const identity = read('supabase', 'functions', 'verify-identity', 'index.ts');
const business = read('supabase', 'functions', 'verify-business', 'index.ts');
const account = read('supabase', 'functions', 'verify-account', 'index.ts');
const admin = read('supabase', 'functions', 'admin-manage-verification', 'index.ts');
const memberOps = read('supabase', 'functions', 'admin-member-ops', 'index.ts');
const adminAccountConfig = read('prototypes', 'admin-console-v2', 'features', 'operations', 'admin-account-config.js');
const client = read('supabase.js');
const ui = read('script.js');
const legacyFeatures = read('bellore-features.js');
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
assert.match(lifecycleMigration, /new\.suspended := old\.suspended/);
assert.match(lifecycleMigration, /new\.approved := old\.approved/);
assert.match(lifecycleMigration, /coalesce\(auth\.role\(\), ''\) = 'service_role'/);
assert.match(lifecycleMigration, /admin_manage_member_profile/);
assert.match(lifecycleMigration, /admin_prepare_member_delete/);
assert.match(lifecycleMigration, /revoke delete on table public\.profiles from anon, authenticated/);
assert.match(lifecycleMigration, /create trigger trg_guard_profile_delete/);
assert.match(lifecycleMigration, /session_user not in \('supabase_auth_admin', 'supabase_admin', 'postgres'\)/);
assert.match(lifecycleMigration, /phone_verified = case when next_phone is distinct from target\.phone then false/);
assert.match(lifecycleMigration, /admin_cancel_member_delete/);
assert.match(lifecycleMigration, /admin_reconcile_member_deletes/);
assert.match(lifecycleMigration, /reconcile_member_delete_events/);
assert.doesNotMatch(lifecycleMigration, /cron\.schedule[\s\S]*member-delete/, 'member deletion must never be scheduled automatically');
assert.doesNotMatch(lifecycleMigration, /event\.action = 'delete'[\s\S]*delete from public\.profiles/, 'stale delete reconciliation must never hard-delete a profile');
assert.match(lifecycleMigration, /is_active_member_session/);
assert.match(lifecycleMigration, /active_member_session_gate/);
assert.match(lifecycleMigration, /admin_begin_member_auth_transition/);
assert.match(lifecycleMigration, /admin_complete_member_auth_transition/);
assert.match(lifecycleMigration, /admin_cancel_member_auth_transition/);
assert.match(lifecycleMigration, /role = 'admin' and approved = true[\s\S]*suspended, false\) = false/);
assert.match(memberOps, /admin_manage_member_profile/);
assert.match(memberOps, /admin_prepare_member_delete/);
assert.match(memberOps, /admin_cancel_member_delete/);
assert.match(memberOps, /admin_reconcile_member_deletes/);
assert.match(memberOps, /admin_begin_member_auth_transition/);
assert.match(memberOps, /admin_complete_member_auth_transition/);
assert.match(memberOps, /admin_cancel_member_auth_transition/);
assert.match(memberOps, /select\("admin_operation_version"\)/);
assert.match(memberOps, /PENDING_RECONCILIATION/);
assert.match(adminAccountConfig, /promptText: '삭제'[\s\S]*reasonPrompt: '계정 삭제 사유를 5자 이상 입력해 주세요\.'/);
assert.doesNotMatch(memberOps, /from\("profiles"\)\.update\(\{ suspended \}\)/);
assert.match(client, /accountVersionById/);
assert.match(client, /VERSION_REQUIRED_REFRESH/);
assert.match(client, /body\.expectedVersion = expectedVersion/);
assert.doesNotMatch(client, /phone_verified:\s*true/);
assert.match(legacyFeatures, /KG이니시스 통합인증/);
assert.match(legacyFeatures, /B\.verifyIdentityPortone\(\)/);
assert.doesNotMatch(legacyFeatures, /B\.sendPhoneOtp\(/);

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
