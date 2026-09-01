import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const login = read('login.html');
const loginRuntime = read('app', 'features', 'auth-login', 'auth-login.js');
const backend = read('supabase.js');
const worker = read('supabase', 'functions', 'naver-login-userinfo', 'index.ts');
const supabaseConfig = read('supabase', 'config.toml');
const serviceWorker = read('sw.js');

assert.match(login, /data-provider="naver"[\s\S]*네이버로 계속하기/);
assert.doesNotMatch(login, /네이버 로그인 준비 중/);
assert.match(backend, /provider:\s*'kakao'/);
assert.match(backend, /provider:\s*'custom:naver'/);
assert.match(backend, /meta\.full_name \|\| meta\.name \|\| meta\.preferred_username/);
assert.doesNotMatch(backend, /NAVER_LOGIN_NOT_CONFIGURED/);
assert.doesNotMatch(loginRuntime, /provider === 'naver'[\s\S]*연동 준비 중/);
assert.match(loginRuntime, /params\.get\('error'\)/);
assert.match(loginRuntime, /bellore_social_provider/);

assert.match(worker, /https:\/\/openapi\.naver\.com\/v1\/nid\/me/);
assert.match(worker, /headers:\s*\{ Authorization: authorization \}/);
assert.match(worker, /sub:\s*subject/);
for (const providerField of ['email', 'phone_number', 'mobile', 'birthyear', 'birthday']) {
  assert.match(worker, new RegExp(`\\n\\s*${providerField}(?:,|:)`), `Naver ${providerField} must be forwarded when consented`);
}
assert.doesNotMatch(worker, /email_verified:\s*true/);
assert.doesNotMatch(worker, /client_secret|service_role/i);
assert.match(supabaseConfig, /\[functions\.naver-login-userinfo\]\s*verify_jwt\s*=\s*false/);

const backendUrl = login.match(/src="(supabase\.js\?v=[^"]+)"/)?.[1];
const loginUrl = login.match(/src="(app\/features\/auth-login\/auth-login\.js\?v=[^"]+)"/)?.[1];
assert(backendUrl && serviceWorker.includes(`'./${backendUrl}'`));
assert(loginUrl && serviceWorker.includes(`'./${loginUrl}'`));

console.log('social login contracts: 22/22');
