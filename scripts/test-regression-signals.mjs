import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

function sourceTestPairs(changedFiles, readText) {
  const tests = changedFiles.filter((file) => /^scripts\/test-[^/]+\.(?:m?js)$/.test(file));
  const sources = changedFiles.filter((file) => {
    if (file.startsWith('scripts/test-') || file.startsWith('.brain/') || file.startsWith('docs/')) return false;
    return ['.js', '.mjs', '.ts', '.html', '.css'].includes(extname(file));
  });
  const pairs = [];
  for (const source of sources) {
    const name = basename(source);
    for (const test of tests) {
      const body = readText(test);
      if (body.includes(source) || body.includes(name)) pairs.push(`${source}<->${test}`);
    }
  }
  return [...new Set(pairs)].sort();
}

function addedDoesNotMatch(diff) {
  return diff.split(/\r?\n/)
    .filter((line) => line.startsWith('+') && !line.startsWith('+++') && line.includes('assert.doesNotMatch'))
    .map((line) => line.slice(1).trim());
}

const syntheticFiles = ['app/features/member-verification/signup-verification.js', 'scripts/test-member-verifications.mjs'];
assert.deepEqual(
  sourceTestPairs(syntheticFiles, () => "read('app/features/member-verification/signup-verification.js')"),
  ['app/features/member-verification/signup-verification.js<->scripts/test-member-verifications.mjs'],
);
assert.deepEqual(addedDoesNotMatch('@@\n+assert.doesNotMatch(source, /broken/);\n context'), [
  'assert.doesNotMatch(source, /broken/);',
]);

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

const parent = git(['rev-parse', 'HEAD^']);
const changed = parent ? git(['diff', '--name-only', `${parent}..HEAD`]).split(/\r?\n/).filter(Boolean) : [];
const diff = parent ? git(['diff', '--unified=0', `${parent}..HEAD`]) : '';
const pairs = sourceTestPairs(changed, (file) => existsSync(resolve(root, file)) ? read(file) : '');
const negatives = addedDoesNotMatch(diff);

const configSandbox = { window: {} };
vm.runInNewContext(read('supabase-config.js'), configSandbox);
const disabled = [];
const verify = configSandbox.window.BELLORE_VERIFY || {};
const wallet = configSandbox.window.BELLORE_WALLET || {};
if (verify.phone?.smsEnabled === false && existsSync(resolve(root, 'supabase/functions/send-phone-otp/index.ts'))
  && read('app/features/member-verification/signup-verification.js').includes('data-phone-sms')) {
  disabled.push('BELLORE_VERIFY.phone.smsEnabled=false(SMS UI+Edge present)');
}
if (verify.account?.enabled === false && existsSync(resolve(root, 'supabase/functions/verify-account/index.ts'))
  && read('app/features/member-verification/signup-verification.js').includes('verifyAccountData')) {
  disabled.push('BELLORE_VERIFY.account.enabled=false(account UI+Edge present)');
}
if (wallet.charge?.card === false && read('auction.js').includes('W.charge.card')) {
  disabled.push('BELLORE_WALLET.charge.card=false(card charge UI present)');
}
if (wallet.charge?.transfer === false && read('auction.js').includes('W.charge.transfer')) {
  disabled.push('BELLORE_WALLET.charge.transfer=false(transfer charge UI present)');
}
assert(disabled.length >= 2, 'disabled features with retained implementations must stay visible');
assert(disabled.some((item) => item.startsWith('BELLORE_VERIFY.phone.smsEnabled=false')),
  'disabled SMS implementation must be printed');
assert(disabled.some((item) => item.startsWith('BELLORE_VERIFY.account.enabled=false')),
  'disabled account implementation must be printed');

const identity = read('supabase/functions/verify-identity/index.ts');
assert.match(identity, /function observedFailure\([\s\S]{0,400}identity_verification_failed[\s\S]{0,200}jsonResponse\(req, \{ ok: false, code, traceId \}, status\)/);
assert.match(identity, /observedFailure\(req, traceId, "BAD_IDENTITY_ID", 400\)/);
assert.match(identity, /observedFailure\(req, traceId, "PROVIDER_LOOKUP_FAILED", 502/);
assert.match(identity, /observedFailure\(req, traceId, code, code === "IDENTITY_ALREADY_USED" \? 409 : 502/);
assert.doesNotMatch(identity, /return jsonResponse\(req, \{ ok: false, code(?:(?!traceId)[\s\S]){0,100}\}, 502\)/,
  'identity 502 responses must not lose the traceId');

const pagesWorkflow = read('.github/workflows/pages-deploy.yml');
assert.match(pagesWorkflow, /name: Verify live service worker release/);
assert.match(pagesWorkflow, /actual=.*sed -n[\s\S]*actual.*expected/);
assert.match(pagesWorkflow, /publish_required:[\s\S]*needs: \[truth_guard, verify, build, deploy\]/);
assert.match(pagesWorkflow, /DEPLOY_RESULT[\s\S]*!= 'success'/);

const compact = (items) => items.length ? items.join(',') : 'none';
if (pairs.length) console.log(`REGRESSION_WARN source and asserting tests changed together: ${compact(pairs)}`);
if (negatives.length) console.log(`REGRESSION_WARN new assert.doesNotMatch assertions: ${compact(negatives)}`);
if (disabled.length) console.log(`REGRESSION_WARN disabled features with retained implementations: ${compact(disabled)}`);
console.log(`regression signals: source-test=${pairs.length} new-doesNotMatch=${negatives.length} disabled=${disabled.length}`);
