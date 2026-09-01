import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const migration = read('supabase', 'migrations', '20260826172707_harden_member_verifications.sql');
const identityMigration = read('supabase', 'migrations', '20260901080724_enforce_verified_identity_one_account.sql');
const lifecycleMigration = read('supabase', 'migrations', '20260826210000_harden_admin_member_lifecycle.sql');
const config = read('supabase', 'config.toml');
const identity = read('supabase', 'functions', 'verify-identity', 'index.ts');
const completeSignup = read('supabase', 'functions', 'complete-otp-signup', 'index.ts');
const business = read('supabase', 'functions', 'verify-business', 'index.ts');
const account = read('supabase', 'functions', 'verify-account', 'index.ts');
const accountMigration = read('supabase', 'migrations', '20260826121009_kftc_account_verification.sql');
const admin = read('supabase', 'functions', 'admin-manage-verification', 'index.ts');
const memberOps = read('supabase', 'functions', 'admin-member-ops', 'index.ts');
const adminAccountConfig = read('prototypes', 'admin-console-v2', 'features', 'operations', 'admin-account-config.js');
const client = read('supabase.js');
const ui = read('script.js');
const legacyFeatures = read('bellore-features.js');
const verificationService = read('app', 'services', 'auth', 'member-verification-service.js');
const verificationUi = read('app', 'features', 'member-verification', 'signup-verification.js');
const sendPhoneOtp = read('supabase', 'functions', 'send-phone-otp', 'index.ts');
const verifyPhoneOtp = read('supabase', 'functions', 'verify-phone-otp', 'index.ts');
const phoneOtpShared = read('supabase', 'functions', '_shared', 'phone-otp.mjs');
const verificationAdapter = read('app', 'legacy', 'member-verification-service.js');
const bootstrap = read('app', 'bootstrap.js');
const signupHtml = read('login.html');
const signupPage = read('app', 'features', 'auth-signup', 'auth-signup.js');
const loginPage = read('app', 'features', 'auth-login', 'auth-login.js');

assert.match(migration, /create table if not exists public\.member_verification_events/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.member_verification_events from anon, authenticated/);
assert.match(migration, /finalize_member_verification/);
assert.match(migration, /admin_set_member_verification/);
assert.match(migration, /new\.phone is distinct from old\.phone/);
assert.match(migration, /new\.business_no/);
assert.match(migration, /new\.bank_account/);
assert.match(migration, /grant execute on function public\.finalize_member_verification[\s\S]*to service_role/);
assert.match(identityMigration, /create table if not exists public\.member_verified_identities/);
assert.match(identityMigration, /identity_di_hash text not null unique/);
assert.match(identityMigration, /revoke all on table public\.member_verified_identities from public, anon, authenticated/);
assert.match(identityMigration, /create unique index if not exists profiles_verified_phone_uidx/);
assert.match(identityMigration, /new\.verified_name := old\.verified_name/);
assert.match(identityMigration, /new\.birth_date := old\.birth_date/);
assert.match(identityMigration, /message = 'IDENTITY_ALREADY_REGISTERED'/);
assert.match(identityMigration, /message = 'ACCOUNT_IDENTITY_MISMATCH'/);
assert.doesNotMatch(identityMigration, /\bci\b\s+(?:text|varchar)|\bdi\b\s+(?:text|varchar)/i,
  'raw CI or DI columns must never be created');
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
assert.doesNotMatch(client, /provider:\s*['"]naver['"]/, 'unsupported Supabase Naver provider must never be called');
assert.match(client, /NAVER_LOGIN_NOT_CONFIGURED/);
assert.match(legacyFeatures, /간편인증으로 인증하기/);
assert.match(legacyFeatures, /B\.verifyIdentityPortone\(\{ agency: 'SMS' \}\)/);
assert.match(legacyFeatures, /B\.verifyIdentityPortone\(\)/);
assert.doesNotMatch(legacyFeatures, /id="vfPhoneNumber"/);
assert.match(legacyFeatures, /통신사 문자 본인확인[\s\S]*KG 간편인증/);
assert.doesNotMatch(legacyFeatures, /B\.sendPhoneOtp\(phone\)/);
assert.doesNotMatch(legacyFeatures, /B\.verifyPhoneOtp\(/);
assert.match(legacyFeatures, /completeReturnedIdentity/);

assert.match(config, /\[functions\.verify-identity\]\s+verify_jwt = false/);
for (const fn of ['send-phone-otp', 'verify-phone-otp']) {
  assert.match(config, new RegExp(`\\[functions\\.${fn}\\]\\s+verify_jwt = false`));
}
for (const fn of ['sync-email-verification', 'complete-otp-signup', 'verify-business', 'verify-account', 'admin-manage-verification']) {
  assert.match(config, new RegExp(`\\[functions\\.${fn}\\]\\s+verify_jwt = true`));
}

assert.match(identity, /identity-verifications\/\$\{encodeURIComponent\(identityVerificationId\)\}/);
assert.match(identity, /validatePortOneIdentity/);
assert.match(identity, /finalize_member_verification/);
assert.match(identity, /member_signup_phone_tickets/);
assert.match(identity, /signupTicket/);
assert.match(identity, /portone-identity-di-v1/);
assert.match(identity, /identity_di_hash: identityDiHash/);
assert.match(identity, /IDENTITY_ALREADY_REGISTERED/);
assert.doesNotMatch(identity, /ci\s*:/i, 'CI must not be persisted');
assert.doesNotMatch(identity, /di\s*:/i, 'DI must not be persisted');
assert.match(completeSignup, /from\("member_verified_identities"\)/);
assert.match(completeSignup, /display_name: verifiedName, verified_name: verifiedName/);
assert.match(completeSignup, /birth_date: birthDate, phone: identityPhone/);
assert.doesNotMatch(completeSignup, /display_name:\s*displayName/,
  'signup must not persist the client-submitted name');

assert.match(business, /ntsBusinessResult\(nts\)\.valid/);
assert.doesNotMatch(business, /valid === true \|\|/);
assert.match(account, /requestKftcClientToken/);
assert.match(account, /lookupKftcAccount/);
assert.match(account, /BUSINESS_VERIFICATION_REQUIRED/);
assert.match(account, /p_subject: \{ bank_name: bank, bank_account: account, bank_holder: holder \}/);
assert.match(accountMigration, /bank_account = nullif\(p_subject->>'bank_account', ''\)/);

assert.match(admin, /select\("role,approved,suspended"\)/);
assert.match(admin, /actorProfile\.approved !== true/);
assert.match(admin, /actorProfile\.suspended === true/);
assert.match(admin, /admin_set_member_verification/);
assert.match(verificationService, /invoke\('verify-identity'/);
assert.match(verificationService, /redirectUrl: identityReturnUrl\(\)/);
assert.match(verificationService, /flgFixedUser: 'N'/);
assert.match(verificationService, /invoke\('sync-email-verification'/);
assert.match(verificationService, /redirectUrl: identityReturnUrl\(\)/);
assert.match(verificationService, /response\?\.identityVerificationId \|\| identityVerificationId/);
assert.doesNotMatch(verificationService, /birthYear:/);
assert.doesNotMatch(verificationService, /customer:/);
assert.match(verificationService, /options\?\.agency === 'SMS'/);
assert.match(verificationService, /inicisUnified\.directAgency = directAgency/);
assert.match(verificationService, /invoke\('send-phone-otp'/);
assert.match(verificationService, /invoke\('verify-phone-otp'/);
assert.match(sendPhoneOtp, /PHONE_OTP_ENABLED/);
assert.match(sendPhoneOtp, /SOLAPI_API_KEY/);
assert.match(sendPhoneOtp, /consume_checkout_rate_limit/);
assert.match(sendPhoneOtp, /messages\/v4\/send-many\/detail/);
assert.match(sendPhoneOtp, /showMessageList:\s*true/);
assert.match(sendPhoneOtp, /failedMessageList/);
assert.match(verifyPhoneOtp, /member_signup_phone_tickets/);
assert.match(verifyPhoneOtp, /finalize_member_verification/);
assert.match(verifyPhoneOtp, /consume_checkout_rate_limit/);
assert.match(verifyPhoneOtp, /"challenge", challenge/);
assert.match(verifyPhoneOtp, /"ip", forwarded/);
assert.match(phoneOtpShared, /createOtpChallenge/);
assert.match(phoneOtpShared, /verifyOtpChallenge/);
assert.match(verificationService, /invoke\('verify-business'/);
assert.match(verificationService, /invoke\('verify-account'/);
assert.match(verificationService, /response\.error\.context\?\.clone/);
assert.match(client, /BelloreMemberVerificationService/);
assert.match(ui, /BelloreMemberVerificationUi\.create/);
assert.match(verificationAdapter, /createMemberVerificationService/);
assert.match(bootstrap, /installLegacyMemberVerificationService/);
assert.doesNotMatch(verificationUi, /키 미설정\(soft\) → 즉시 통과/);
assert.match(verificationUi, /이메일 인증을 먼저 완료해 주세요/);
assert.match(verificationUi, /verifiedPhone/);
assert.match(ui, /이메일 인증 후 휴대폰/);
assert.match(signupHtml, /data-v="email"[\s\S]*id="suEmailCode"/);
assert.match(signupHtml, /data-v="phone"[\s\S]*data-v="biz"[\s\S]*data-v="account"/);
assert.match(signupPage, /createSignupVerification/);
assert.match(signupPage, /getAuthSignupBackend/);
assert.match(signupPage, /backend\.signUp/);
assert.match(loginPage, /provider === 'naver'/);
assert.match(loginPage, /backend\.resetPassword/);

const sharedUrl = pathToFileURL(path.join(root, 'supabase', 'functions', '_shared', 'verification-core.mjs')).href;
const shared = await import(sharedUrl);
const providersUrl = pathToFileURL(path.join(root, 'supabase', 'functions', '_shared', 'member-verification-providers.mjs')).href;
const providers = await import(providersUrl);
const serviceUrl = pathToFileURL(path.join(root, 'app', 'services', 'auth', 'member-verification-service.js')).href;
const { createMemberVerificationService } = await import(serviceUrl);
const identityCalls = [];
const service = createMemberVerificationService({
  getClient: () => ({
    functions: { invoke: async (name, options) => {
      identityCalls.push({ name, body: options.body });
      return { data: { ok: true, identityVerificationId: options.body.identityVerificationId }, error: null };
    } },
  }),
  getPortOne: () => ({ requestIdentityVerification: async (request) => {
    identityCalls.push({ request });
    return { transactionType: 'IDENTITY_VERIFICATION', identityVerificationId: 'idv_provider_response' };
  } }),
  getVerifyConfig: () => ({ phone: { channelKey: 'channel-live' } }),
  getPaymentConfig: () => ({ storeId: 'store-live' }),
});
await service.verifyIdentity({ agency: 'SMS' });
assert.equal(identityCalls[0].request.bypass.inicisUnified.directAgency, 'SMS');
assert.equal(identityCalls[0].request.bypass.inicisUnified.flgFixedUser, 'N');
assert.equal(identityCalls[0].request.customer, undefined);
assert.deepEqual(identityCalls[1], { name: 'verify-identity', body: { identityVerificationId: 'idv_provider_response' } });
await service.verifyIdentity();
assert.equal(identityCalls[2].request.bypass.inicisUnified.directAgency, undefined);
assert.deepEqual(identityCalls[3], { name: 'verify-identity', body: { identityVerificationId: 'idv_provider_response' } });
const kftcUrl = pathToFileURL(path.join(root, 'supabase', 'functions', '_shared', 'kftc-account-provider.mjs')).href;
const kftc = await import(kftcUrl);
const phoneOtpUrl = pathToFileURL(path.join(root, 'supabase', 'functions', '_shared', 'phone-otp.mjs')).href;
const phoneOtp = await import(phoneOtpUrl);
const challenge = await phoneOtp.createOtpChallenge({ secret: 'test-signing-key', phone: '01012345678', code: '654321' });
assert.equal((await phoneOtp.verifyOtpChallenge({ secret: 'test-signing-key', challenge: challenge.challenge, phone: '01012345678', code: '654321' })).nonce, challenge.nonce);
await assert.rejects(() => phoneOtp.verifyOtpChallenge({ secret: 'test-signing-key', challenge: challenge.challenge, phone: '01012345678', code: '000000' }), /OTP_INVALID/);
assert.deepEqual(phoneOtp.publicOtpVerifyError(new Error('OTP_CHALLENGE_INVALID')), { code: 'OTP_INVALID', status: 401 });
assert.deepEqual(phoneOtp.publicOtpVerifyError(new Error('OTP_EXPIRED')), { code: 'OTP_EXPIRED', status: 410 });
assert.deepEqual(phoneOtp.publicOtpVerifyError(new Error('database secret leaked')), { code: 'OTP_VERIFY_FAILED', status: 502 });
assert.equal(shared.normalizePhone('+82 10-1234-5678'), '01012345678');
assert.equal(shared.normalizePhone('010-1234-5678'), '01012345678');
assert.equal(shared.normalizePhone('02-123-4567'), null);
assert.equal(shared.digits('123-45-67890', 10), '1234567890');
assert.equal((await shared.sha256Hex('bellore')).length, 64);

const verifiedIdentity = {
  status: 'VERIFIED', storeId: 'store-live',
  channel: { key: 'channel-live', type: 'LIVE' },
  verifiedCustomer: {
    phoneNumber: '+82 10-1234-5678', name: '홍길동', birthDate: '1990-02-03',
    di: 'provider-di-value', ci: 'must-not-be-persisted',
  },
};
assert.deepEqual(providers.validatePortOneIdentity(verifiedIdentity, {
  storeId: 'store-live', channelKey: 'channel-live', allowTest: false,
}), { verified: true, phone: '01012345678', name: '홍길동', birthDate: '1990-02-03',
  di: 'provider-di-value', channelType: 'LIVE' });
assert.deepEqual(providers.validatePortOneIdentity({ ...verifiedIdentity, storeId: undefined }, {
  storeId: 'store-live', channelKey: 'channel-live', allowTest: false,
}), { verified: true, phone: '01012345678', name: '홍길동', birthDate: '1990-02-03',
  di: 'provider-di-value', channelType: 'LIVE' },
'PortOne V2 identity lookup omits storeId; the verified live channel remains the tenant boundary');
assert.throws(() => providers.validatePortOneIdentity({
  ...verifiedIdentity, verifiedCustomer: { ...verifiedIdentity.verifiedCustomer, di: undefined },
}, { storeId: 'store-live', channelKey: 'channel-live', allowTest: false }), /VERIFIED_IDENTITY_INCOMPLETE/);
assert.throws(() => providers.validatePortOneIdentity({
  ...verifiedIdentity, verifiedCustomer: { ...verifiedIdentity.verifiedCustomer, birthDate: '1990-02-31' },
}, { storeId: 'store-live', channelKey: 'channel-live', allowTest: false }), /VERIFIED_BIRTH_DATE_INVALID/);
assert.throws(() => providers.validatePortOneIdentity(verifiedIdentity, {
  storeId: 'other-store', channelKey: 'channel-live', allowTest: false,
}), /STORE_MISMATCH/);
assert.throws(() => providers.validatePortOneIdentity({ ...verifiedIdentity, channel: { key: 'channel-test', type: 'TEST' } }, {
  storeId: 'store-live', channelKey: 'channel-test', allowTest: false,
}), /CHANNEL_NOT_LIVE/);
assert.match(signupPage, /handled\s*&&\s*verification\.state\.phone\.real\s*\?\s*3\s*:\s*2/,
  'a successful mobile identity return must advance signup past the phone step');
assert.deepEqual(providers.ntsBusinessResult({ data: [{ valid: '01' }] }), { valid: true });
assert.deepEqual(providers.ntsBusinessResult({ data: [{ valid: '02' }] }), { valid: false });
assert.equal(kftc.resolveKftcBankCode('국민은행'), '004');
assert.equal(kftc.resolveKftcBankCode('카카오뱅크'), '090');
assert.equal(kftc.resolveKftcBankCode('092'), '092');
assert.equal(kftc.resolveKftcBankCode('없는은행'), null);
assert.equal(kftc.normalizeAccountHolder('(주) 벨로르'), '주벨로르');
assert.equal(kftc.kftcBaseUrl('test'), 'https://testapi.openbanking.or.kr');
assert.equal(kftc.kftcBaseUrl('production'), 'https://openapi.openbanking.or.kr');
assert.equal(kftc.kftcBaseUrl('other'), null);
assert.match(kftc.createBankTranId('F123456789'), /^F123456789U[A-F0-9]{9}$/);
assert.equal(kftc.formatKftcTranDtime(new Date('2026-08-26T01:02:03Z')), '20260826100203');

let tokenRequest;
const token = await kftc.requestKftcClientToken({
  baseUrl: 'https://testapi.openbanking.or.kr', clientId: 'client-id', clientSecret: 'client-secret',
  fetchFn: async (url, options) => {
    tokenRequest = { url, options };
    return new Response(JSON.stringify({ access_token: 'token', client_use_code: 'F123456789', expires_in: 7200 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
});
assert.equal(token.accessToken, 'token');
assert.equal(token.clientUseCode, 'F123456789');
assert.equal(tokenRequest.url, 'https://testapi.openbanking.or.kr/oauth/2.0/token');
assert.match(String(tokenRequest.options.body), /grant_type=client_credentials/);
assert.match(String(tokenRequest.options.body), /scope=oob/);

let lookupRequest;
const lookup = await kftc.lookupKftcAccount({
  baseUrl: 'https://testapi.openbanking.or.kr', accessToken: 'token', clientUseCode: 'F123456789',
  bankCode: '004', accountNumber: '1234567890', holderInfoType: '4', holderInfo: '1234567890',
  fetchFn: async (url, options) => {
    lookupRequest = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ rsp_code: 'A0000', bank_rsp_code: '000', account_holder_name: '벨로르' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
});
assert.equal(lookup.ok, true);
assert.equal(lookup.holderName, '벨로르');
assert.equal(lookupRequest.url, 'https://testapi.openbanking.or.kr/v2.0/inquiry/real_name');
assert.equal(lookupRequest.options.headers.Authorization, 'Bearer token');
assert.equal(lookupRequest.body.bank_code_std, '004');
assert.equal(lookupRequest.body.account_holder_info, '1234567890');
assert.match(lookupRequest.body.bank_tran_id, /^F123456789U[A-F0-9]{9}$/);
assert.match(lookupRequest.body.tran_dtime, /^\d{14}$/);

console.log('member verification security contract: ok');
