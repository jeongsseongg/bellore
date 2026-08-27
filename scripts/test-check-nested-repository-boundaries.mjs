import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createNestedRepositoryBoundaryGuard } from './check-worktree-boundaries.mjs';

const root = mkdtempSync(join(tmpdir(), 'bellore-nested-boundary-'));
const failures = [];
const passes = [];
const audits = [];
const toPosix = (file) => relative(root, file).split(sep).join('/');

try {
  const initialized = spawnSync('git', ['init', root], { encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr);

  const nestedDirectory = join(root, 'nested-directory');
  mkdirSync(join(nestedDirectory, '.git'), { recursive: true });

  const nestedFile = join(root, 'nested-file');
  mkdirSync(nestedFile, { recursive: true });
  writeFileSync(join(nestedFile, '.git'), 'gitdir: ../detached-git-dir\n');

  const trackedBoundary = join(root, 'tracked-boundary');
  mkdirSync(trackedBoundary, { recursive: true });
  writeFileSync(join(trackedBoundary, 'source.js'), 'export const tracked = true;\n');
  const staged = spawnSync('git', ['-C', root, 'add', 'tracked-boundary/source.js'], { encoding: 'utf8' });
  assert.equal(staged.status, 0, staged.stderr);
  mkdirSync(join(trackedBoundary, '.git'), { recursive: true });

  const guard = createNestedRepositoryBoundaryGuard({
    root,
    toPosix,
    addFailure: (message) => failures.push(message),
    addPass: (message) => passes.push(message),
    writeAudit: (message) => audits.push(message)
  });

  assert.equal(guard.shouldExclude(nestedDirectory), true, 'directory .git boundary must be excluded');
  assert.equal(guard.shouldExclude(nestedFile), true, 'file .git boundary must be excluded');
  assert.equal(guard.shouldExclude(trackedBoundary), false, 'tracked outer files must prevent exclusion');
  guard.report();

  assert.deepEqual(failures, [
    'nested repository boundary contains outer-repository tracked files: tracked-boundary (1)'
  ]);
  assert.ok(passes.includes('nested repositories excluded: 2'));
  assert.ok(audits.includes('excluded nested repository: nested-directory'));
  assert.ok(audits.includes('excluded nested repository: nested-file'));

  console.log('nested repository boundaries: directory=excluded file=excluded tracked=failed-open pass');
} finally {
  rmSync(root, { recursive: true, force: true });
}
