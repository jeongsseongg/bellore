import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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
assert.match(brainGuard, /process\.argv\.includes\('--sync'\)/,
  'brain pointer sync must be an explicit CLI mode');

const fixture = mkdtempSync(path.join(os.tmpdir(), 'bellore-brain-sync-'));
const repo = path.join(fixture, 'project', 'repo');
mkdirSync(path.join(fixture, 'project', '.brain'), { recursive: true });
mkdirSync(repo, { recursive: true });
execFileSync('git', ['init', '--initial-branch=main'], { cwd: repo, stdio: 'ignore' });
execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repo });
execFileSync('git', ['config', 'user.name', 'Bellore Test'], { cwd: repo });
writeFileSync(path.join(repo, 'fixture.txt'), 'fixture\n');
execFileSync('git', ['add', 'fixture.txt'], { cwd: repo });
execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repo, stdio: 'ignore' });
const fixtureSha = execFileSync('git', ['rev-parse', 'main'], { cwd: repo, encoding: 'utf8' }).trim();
const staleSha = '0'.repeat(40);
writeFileSync(
  path.join(fixture, 'project', 'PROJECT_CONTEXT.md'),
  `- Latest confirmed version or milestone: release \`${staleSha}\`\n- Preserve: ${staleSha}\n`,
);
writeFileSync(
  path.join(fixture, 'project', '.brain', 'INDEX.md'),
  `- Main SHA: \`${staleSha}\`\n- Preserve: ${staleSha}\n`,
);
execFileSync(process.execPath, [path.join(root, 'scripts', 'check-brain-latest-sha.mjs'), '--sync'], {
  cwd: repo,
  stdio: 'ignore',
});
const syncedContext = readFileSync(path.join(fixture, 'project', 'PROJECT_CONTEXT.md'), 'utf8');
const syncedIndex = readFileSync(path.join(fixture, 'project', '.brain', 'INDEX.md'), 'utf8');
assert.ok(
  syncedContext.includes(`milestone: release \`${fixtureSha}\``),
  'PROJECT_CONTEXT pointer must preserve its closing backtick',
);
assert.ok(
  syncedIndex.includes(`Main SHA: \`${fixtureSha}\``),
  '.brain/INDEX pointer must preserve its closing backtick',
);
assert.match(syncedContext, new RegExp(`Preserve: ${staleSha}`), 'unrelated SHA text must remain unchanged');
assert.match(syncedIndex, new RegExp(`Preserve: ${staleSha}`), 'unrelated SHA text must remain unchanged');

const noBrainRepo = path.join(fixture, 'standalone');
mkdirSync(noBrainRepo, { recursive: true });
execFileSync('git', ['init', '--initial-branch=main'], { cwd: noBrainRepo, stdio: 'ignore' });
execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: noBrainRepo });
execFileSync('git', ['config', 'user.name', 'Bellore Test'], { cwd: noBrainRepo });
writeFileSync(path.join(noBrainRepo, 'fixture.txt'), 'fixture\n');
execFileSync('git', ['add', 'fixture.txt'], { cwd: noBrainRepo });
execFileSync('git', ['commit', '-m', 'fixture'], { cwd: noBrainRepo, stdio: 'ignore' });
const noBrainOutput = execFileSync(
  process.execPath,
  [path.join(root, 'scripts', 'check-brain-latest-sha.mjs')],
  { cwd: noBrainRepo, encoding: 'utf8' },
);
assert.match(noBrainOutput, /NOT_MEASURED:/, 'checkout without private Brain must fail open explicitly');
rmSync(fixture, { recursive: true, force: true });

for (const script of scripts) {
  const output = execFileSync(process.execPath, [path.join(root, 'scripts', script)], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(output, /(?:PASS|NOT_MEASURED):/, `${script} did not report an auditable state`);
}

console.log('evidence-memory guards: 4/4 passed or explicitly NOT_MEASURED');
