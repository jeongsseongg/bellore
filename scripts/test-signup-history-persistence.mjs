import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const signup = await readFile(new URL('app/features/auth-signup/auth-signup.js', root), 'utf8');
const login = await readFile(new URL('login.html', root), 'utf8');
const pages = await Promise.all(['mypage', 'orders', 'inquiry']
  .map((name) => readFile(new URL(`pages/${name}.html`, root), 'utf8')));

assert.match(signup, /history\.pushState\(\{ belloreSignupStep: number \}/);
assert.match(signup, /addEventListener\('popstate'/);
assert.match(signup, /history\.back\(\)/);
assert.match(signup, /\[1, 2, 3, 4\]\.includes/);
assert.match(signup, /progress\.textContent = `\$\{number\} \/ 4`/);
assert.match(signup, /sessionStorage\.setItem\(SIGNUP_DRAFT_KEY/);
assert.match(signup, /sessionStorage\.removeItem\(SIGNUP_DRAFT_KEY\)/);
assert.doesNotMatch(signup.match(/const DRAFT_FIELDS = \[[\s\S]*?\];/)?.[0] || '', /suPw/,
  '비밀번호는 브라우저 저장소에 보관하면 안 됩니다.');

for (const [name, html] of [['login', login], ...['mypage', 'orders', 'inquiry'].map((name, i) => [name, pages[i]])]) {
  assert.match(html, /rel="icon"[^>]+assets\/icons\/favicon-32\.png/, `${name} 파비콘이 누락됐습니다.`);
  assert.match(html, /rel="apple-touch-icon"[^>]+assets\/icons\/apple-touch-icon\.png/, `${name} 앱 아이콘이 누락됐습니다.`);
  assert.match(html, /rel="manifest"[^>]+manifest\.json/, `${name} manifest가 누락됐습니다.`);
}
assert.doesNotMatch(login, /assets\/favicon\.png/);
assert.match(login, /id="signupStep1"[\s\S]*일반 회원[\s\S]*파트너사[\s\S]*id="signupRoleNext"/);
assert.match(login, /id="signupStep2"[\s\S]*data-v="phone"[\s\S]*id="suName"[\s\S]*id="signupInfoPrev"/);
assert.match(login, /id="suName"[^>]+readonly[^>]+required/);
assert.match(login, /id="suPhone"[^>]+readonly[^>]+required/);
assert.doesNotMatch(login, /id="suBirthDate"/, '사이트가 생년월일을 사전 수집하면 인증 공급자 결과와 이중 정본이 됩니다.');
assert.match(login, /id="signupStep3"[\s\S]*id="suUsername"[\s\S]*data-v="email"/);
assert.match(login, /id="signupStep4"[\s\S]*id="signupPostcode"[\s\S]*id="signupSubmitBtn"/);
assert.match(login, /id="suEmailCode"[^>]+minlength="6"[^>]+maxlength="10"/,
  'Supabase가 허용하는 6~10자리 이메일 OTP를 입력할 수 있어야 합니다.');
assert.doesNotMatch(login, /id="suEmailCode"[^>]+maxlength="6"/);

console.log('signup history persistence: history=5 draft=2 favicon=4 otp-range=1 role-screen=4 passed');
