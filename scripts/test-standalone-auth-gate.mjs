import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { discoverPageHtmlFiles } from '../tools/pages-html.mjs';
import {
  enforceStandaloneAuth,
  standaloneAuthPolicyFor,
  standaloneLoginUrl,
} from '../app/pages/standalone-auth-gate.mjs';

const root = resolve(import.meta.dirname, '..');
const AUTH_POLICY = new Map([
  ['pages/mypage.html', 'required'],
  ['pages/orders.html', 'required'],
  ['pages/saved.html', 'required'],
  ['pages/recent.html', 'required'],
  ['pages/support.html', 'required'],
  ['pages/inquiry.html', 'public'],
]);

for (const file of await discoverPageHtmlFiles(root)) {
  const policy = AUTH_POLICY.get(file);
  assert.ok(policy, `${file}: AUTH_POLICY에 required 또는 public 예외를 명시해야 합니다.`);
  const html = await readFile(resolve(root, file), 'utf8');
  assert.match(html, new RegExp(`data-standalone-auth=["']${policy}["']`, 'i'), `${file}: 인증 정책 표시가 필요합니다.`);
  if (file === 'pages/mypage.html') {
    assert.match(html, /<main[^>]*hidden/i, `${file}: 인증 전 호환 진입점은 표시할 UI가 없어야 합니다.`);
    assert.doesNotMatch(html, /id=["']myPageModal["']/i, `${file}: 보호 UI를 중복하면 안 됩니다.`);
  } else {
    assert.match(html, /app\/pages\/standalone-page\.css/i, `${file}: 인증 확인 전 보호 콘텐츠를 숨겨야 합니다.`);
  }
  assert.match(html, /app\/pages\/standalone-page\.js/i, `${file}: 공통 진입 게이트가 필요합니다.`);
}

assert.equal(standaloneAuthPolicyFor('mypage'), 'required');
assert.equal(standaloneAuthPolicyFor('orders'), 'required');
assert.equal(standaloneAuthPolicyFor('saved'), 'required');
assert.equal(standaloneAuthPolicyFor('recent'), 'required');
assert.equal(standaloneAuthPolicyFor('support'), 'required');
assert.equal(standaloneAuthPolicyFor('inquiry'), 'public');
assert.match(standaloneLoginUrl({ pathname: '/pages/orders', search: '?status=paid', hash: '' }),
  /^\/login\.html\?returnTo=%2Fpages%2Forders%3Fstatus%3Dpaid$/);

const signedInLocation = { pathname: '/pages/mypage', search: '', hash: '', replace() { throw new Error('unexpected redirect'); } };
let getUserCalls = 0;
const signedIn = await enforceStandaloneAuth({
  page: 'mypage',
  backend: { configured: true, ready: Promise.resolve() },
  client: { auth: { getUser: async () => { getUserCalls += 1; return { data: { user: { id: 'user-1' } }, error: null }; } } },
  locationObject: signedInLocation,
});
assert.equal(signedIn.allowed, true);
assert.equal(getUserCalls, 1, '보호 페이지는 Auth 서버로 사용자를 검증해야 합니다.');

let redirectedTo = '';
const signedOut = await enforceStandaloneAuth({
  page: 'orders',
  backend: { configured: true, ready: Promise.resolve() },
  client: { auth: { getUser: async () => ({ data: { user: null }, error: null }) } },
  locationObject: { pathname: '/pages/orders', search: '?status=paid', hash: '', replace(url) { redirectedTo = url; } },
});
assert.equal(signedOut.allowed, false);
assert.equal(redirectedTo, '/login.html?returnTo=%2Fpages%2Forders%3Fstatus%3Dpaid');

let publicAuthCalls = 0;
const publicInquiry = await enforceStandaloneAuth({
  page: 'inquiry',
  backend: null,
  client: { auth: { getUser: async () => { publicAuthCalls += 1; } } },
  locationObject: { pathname: '/pages/inquiry', search: '', hash: '', replace() {} },
});
assert.equal(publicInquiry.allowed, true);
assert.equal(publicAuthCalls, 0, '비회원 문의 예외는 로그인 검사를 요구하지 않아야 합니다.');

const login = await readFile(resolve(root, 'app/features/auth-login/auth-login.js'), 'utf8');
assert.match(login, /params\.get\(['"]returnTo['"]\)[\s\S]*params\.get\(['"]return['"]\)/,
  '로그인은 returnTo를 우선하고 기존 return 링크도 호환해야 합니다.');
assert.match(login, /pendingSocialReturn\(\)[\s\S]*bellore_social_pending[\s\S]*bellore_auth_return/,
  '소셜 로그인 복귀도 저장한 통합 화면 목적지를 읽어야 합니다.');
assert.match(login, /function clearSocialReturn\(\)[\s\S]*removeItem\(['"]bellore_social_pending['"]\)[\s\S]*removeItem\(['"]bellore_auth_return['"]\)/,
  '로그인 완료나 실패 뒤 소셜 복귀 상태를 정리해야 합니다.');

const runtime = await readFile(resolve(root, 'app/pages/standalone-page.js'), 'utf8');
const authIndex = runtime.indexOf('await enforceStandaloneAuth');
const redirectIndex = runtime.indexOf("window.location.replace('/pages/mypage/')");
const dependenciesIndex = runtime.indexOf('for (const dependency of pageDependencies)');
assert(authIndex >= 0 && redirectIndex > authIndex && dependenciesIndex > redirectIndex,
  '인증 검사는 마이페이지 리다이렉트와 레거시 UI 주입보다 먼저 실행돼야 합니다.');

console.log('standalone auth gate: protected=5 public-exceptions=1 returnTo=2 runtime=3 passed');
