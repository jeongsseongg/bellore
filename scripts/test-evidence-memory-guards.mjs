import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = [
  'check-brain-latest-sha.mjs',
  'check-seo-recorded-sitemap.mjs',
  'check-truth-guard-ledger-paths.mjs',
  'check-volatile-release-assertions.mjs',
];

const brainGuard = readFileSync(path.join(root, 'scripts', 'check-brain-latest-sha.mjs'), 'utf8');
assert.match(brainGuard, /GITHUB_ACTIONS !== 'true'/,
  'detached fallback must be limited to GitHub Actions');
assert.match(brainGuard, /checkoutHead !== env\.GITHUB_SHA\.toLowerCase\(\)/,
  'detached fallback must match the checked-out commit to GITHUB_SHA');

for (const script of scripts) {
  const output = execFileSync(process.execPath, [path.join(root, 'scripts', script)], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(output, /(?:PASS|NOT_MEASURED):/, `${script} did not report an auditable state`);
}

console.log('evidence-memory guards: 4/4 passed or explicitly NOT_MEASURED');
