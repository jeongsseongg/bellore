import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const dataModuleUrl = new URL('app/features/auth-social-completion/social-profile-data.mjs', root);
const {
  extractSocialPrefill,
  missingSocialProfileFields,
  socialProviderKeys,
  socialProviderLabels,
} = await import(dataModuleUrl);

const user = {
  email: 'member@example.com',
  app_metadata: { provider: 'google', providers: ['google', 'kakao', 'custom:naver'] },
  user_metadata: { full_name: '구글 이름' },
  identities: [
    { provider: 'google', identity_data: { full_name: '구글 이름', email: 'member@example.com' } },
    { provider: 'kakao', identity_data: { nickname: '카카오 이름', birthyear: '1990', birthday: '0102' } },
    { provider: 'custom:naver', identity_data: { mobile: '010-1234-5678' } },
  ],
};

assert.deepEqual(socialProviderKeys(user), ['google', 'kakao', 'naver']);
assert.deepEqual(socialProviderLabels(user), ['Google', '카카오', '네이버']);
assert.deepEqual(extractSocialPrefill(user, null), {
  providerKeys: ['google', 'kakao', 'naver'],
  providerLabels: ['Google', '카카오', '네이버'],
  email: 'member@example.com',
  name: '구글 이름',
  birthDate: '1990-01-02',
  phone: '010-1234-5678',
  postcode: '',
  addr1: '',
  addr2: '',
  phoneVerified: false,
});

const completedProfile = {
  display_name: '본인인증 이름', birth_date: '1990-01-02',
  phone: '01012345678', phone_verified: true,
  postcode: '04567', addr1: '서울특별시 중구', addr2: '101호',
};
assert.deepEqual(missingSocialProfileFields(completedProfile), []);
assert.deepEqual(missingSocialProfileFields({ display_name: '이름' }), ['birthDate', 'phone', 'address']);
assert.equal(extractSocialPrefill(user, completedProfile).name, '본인인증 이름');

const login = await readFile(new URL('login.html', root), 'utf8');
const loginRuntime = await readFile(new URL('app/features/auth-login/auth-login.js', root), 'utf8');
const completionRuntime = await readFile(new URL('app/features/auth-social-completion/auth-social-completion.js', root), 'utf8');
const providerRuntime = await readFile(new URL('app/features/profile-login-provider/profile-login-provider.js', root), 'utf8');
const authGate = await readFile(new URL('app/pages/standalone-auth-gate.mjs', root), 'utf8');
const serviceWorker = await readFile(new URL('sw.js', root), 'utf8');

for (const id of ['socialCompleteShell', 'socialCompleteForm', 'socialName', 'socialBirthDate',
  'socialPhone', 'socialPostcode', 'socialAddr1', 'socialAddr2', 'socialIdentityVerify',
  'socialFindAddr', 'socialCompleteSubmit']) {
  assert.match(login, new RegExp(`id="${id}"`), `${id} is required`);
}
assert.match(login, /id="socialBirthDate"[^>]+readonly/);
assert.match(login, /id="socialPhone"[^>]+readonly/);
assert.match(loginRuntime, /view === 'social-complete'/);
assert.match(loginRuntime, /loadSocialProfileState/);
assert.match(completionRuntime, /verifyIdentity/);
assert.match(completionRuntime, /completeIdentityVerification/);
assert.match(completionRuntime, /saveSocialProfile/);
assert.match(providerRuntime, /로그인 방법/);
assert.match(providerRuntime, /socialProviderLabels/);
assert.match(authGate, /social-complete/);
assert.match(authGate, /loadSocialProfileState/);

for (const asset of [
  './app/features/auth-social-completion/auth-social-completion.css?v=20260902-social-profile-v1',
  './app/features/auth-social-completion/auth-social-completion.js?v=20260902-social-profile-v1',
  './app/features/auth-social-completion/social-profile-data.mjs?v=20260902-social-profile-v1',
  './app/features/profile-login-provider/profile-login-provider.js?v=20260902-social-profile-v1',
]) {
  assert(serviceWorker.includes(`'${asset}'`), `service worker must precache ${asset}`);
}

console.log('social profile completion: providers=4 prefill=3 completion=3 ui=10 routing=7 cache=4 passed');
