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

function changedTestLines(diff) {
  const files = new Map();
  let current = '';
  for (const line of diff.split(/\r?\n/)) {
    const header = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (header) {
      current = /^scripts\/test-[^/]+\.(?:m?js)$/.test(header[2]) ? header[2] : '';
      if (current && !files.has(current)) files.set(current, { removed: [], added: [] });
      continue;
    }
    if (!current || line.startsWith('---') || line.startsWith('+++')) continue;
    if (line.startsWith('-')) files.get(current).removed.push(line.slice(1));
    if (line.startsWith('+')) files.get(current).added.push(line.slice(1));
  }
  return files;
}

function assertionUses(body, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const identifier = new RegExp(`\\b${escaped}\\b`);
  return [...body.matchAll(/\bassert\.[A-Za-z]+\(([\s\S]*?)\);/g)]
    .some((match) => identifier.test(match[1]));
}

function assertionValuePortion(line) {
  return line.replace(
    /,\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)\s*\)\s*;?\s*$/,
    ')',
  );
}

function assertionCandidate(line, body) {
  const binding = line.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
  if (binding && assertionUses(body, binding[1])) return `binding:${binding[1]}`;
  if (!/\bassert\.[A-Za-z]+\s*\(/.test(line)) return '';
  return `assert:${assertionValuePortion(line)
    .replace(/\/(?:\\.|[^/\\\r\n])+\/[dgimsuvy]*/g, '<regex>')
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, '<string>')
    .replace(/-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|ms|s)?/gi, '<number>')
    .replace(/\b(?:true|false|null|undefined)\b/g, '<constant>')}`;
}

function literalSignature(line) {
  const literals = [];
  literals.push(...(line.match(/\/(?:\\.|[^/\\\r\n])+\/[dgimsuvy]*/g) || []));
  literals.push(...(line.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g) || []));
  literals.push(...(line.match(/-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|ms|s)?/gi) || []));
  literals.push(...(line.match(/\b(?:true|false|null|undefined)\b/g) || []));
  return literals;
}

function changedAssertionConstants(diff, readBefore, readAfter) {
  const changes = [];
  for (const [file, lines] of changedTestLines(diff)) {
    const before = readBefore(file);
    const after = readAfter(file);
    const removed = new Map();
    for (const line of lines.removed) {
      const key = assertionCandidate(line, before);
      if (key) removed.set(key, line);
    }
    for (const line of lines.added) {
      const key = assertionCandidate(line, after);
      const oldLine = key ? removed.get(key) : '';
      if (!oldLine) continue;
      const oldLiterals = literalSignature(key.startsWith('assert:') ? assertionValuePortion(oldLine) : oldLine);
      const newLiterals = literalSignature(key.startsWith('assert:') ? assertionValuePortion(line) : line);
      if (oldLiterals.length && JSON.stringify(oldLiterals) !== JSON.stringify(newLiterals)) {
        changes.push(`${file}:${key.replace(/^(?:binding|assert):/, '')}`);
      }
    }
  }
  return [...new Set(changes)].sort();
}

const syntheticFiles = ['app/features/member-verification/signup-verification.js', 'scripts/test-member-verifications.mjs'];
assert.deepEqual(
  sourceTestPairs(syntheticFiles, () => "read('app/features/member-verification/signup-verification.js')"),
  ['app/features/member-verification/signup-verification.js<->scripts/test-member-verifications.mjs'],
);
assert.deepEqual(addedDoesNotMatch('@@\n+assert.doesNotMatch(source, /broken/);\n context'), [
  'assert.doesNotMatch(source, /broken/);',
]);
const syntheticAssertionDiff = [
  'diff --git a/scripts/test-layout.mjs b/scripts/test-layout.mjs',
  '--- a/scripts/test-layout.mjs',
  '+++ b/scripts/test-layout.mjs',
  '@@ -1,2 +1,2 @@',
  '-const approvedWidth = /width:\\s*660px/;',
  '+const approvedWidth = /width:\\s*636px/;',
  ' assert.match(css, approvedWidth);',
  '@@ -4 +4 @@',
  '-assert.equal(columnWidth, 178);',
  '+assert.equal(columnWidth, 176);',
].join('\n');
assert.deepEqual(changedAssertionConstants(
  syntheticAssertionDiff,
  () => 'const approvedWidth = /width:\\s*660px/;\nassert.match(css, approvedWidth);\nassert.equal(columnWidth, 178);',
  () => 'const approvedWidth = /width:\\s*636px/;\nassert.match(css, approvedWidth);\nassert.equal(columnWidth, 176);',
), [
  'scripts/test-layout.mjs:approvedWidth',
  'scripts/test-layout.mjs:assert.equal(columnWidth, <number>);',
]);

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

function readAt(ref, file) {
  return git(['show', `${ref}:${file}`]);
}

const [baseArg, headArg] = process.argv.slice(2);
const head = headArg || 'HEAD';
const parent = baseArg || git(['rev-parse', `${head}^`]);
const changed = parent ? git(['diff', '--name-only', `${parent}..${head}`]).split(/\r?\n/).filter(Boolean) : [];
const diff = parent ? git(['diff', '--unified=0', `${parent}..${head}`]) : '';
const pairs = sourceTestPairs(changed, (file) => readAt(head, file));
const negatives = addedDoesNotMatch(diff);
const constants = changedAssertionConstants(
  diff,
  (file) => readAt(parent, file),
  (file) => readAt(head, file),
);

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
assert.equal(verify.phone?.smsEnabled, true, 'configured SMS provider must keep the public OTP path visible');
assert(disabled.length >= 1, 'disabled features with retained implementations must stay visible');
assert(!disabled.some((item) => item.startsWith('BELLORE_VERIFY.phone.smsEnabled=false')),
  'enabled SMS implementation must not be reported as disabled');
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
if (constants.length) console.log(`REGRESSION_WARN existing assertion literals changed: ${compact(constants)}`);
if (disabled.length) console.log(`REGRESSION_WARN disabled features with retained implementations: ${compact(disabled)}`);
console.log(`regression signals: source-test=${pairs.length} new-doesNotMatch=${negatives.length} assertion-literal=${constants.length} disabled=${disabled.length}`);
