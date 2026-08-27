import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export function pathKey(file) {
  const absolute = resolve(file);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function isInsideRoot(root, file) {
  const pathFromRoot = relative(root, file);
  return Boolean(pathFromRoot) && pathFromRoot !== '..' &&
    !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}

function commandError(result) {
  return (result.error?.message || result.stderr || result.stdout || 'unknown error').trim();
}

function outerTrackedFiles(root, relativePath) {
  const tracked = spawnSync('git', ['-C', root, 'ls-files', '--', `${relativePath}/`], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  return {
    error: tracked.error || tracked.status !== 0 ? commandError(tracked) : '',
    files: tracked.stdout.trim().split(/\r?\n/).filter(Boolean)
  };
}

export function readRegisteredWorktreeBoundaries({ root, toPosix, addFailure, addPass, writeAudit = () => {} }) {
  const listed = spawnSync('git', ['-C', root, 'worktree', 'list', '--porcelain', '-z'], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  if (listed.error || listed.status !== 0) {
    addFailure(`registered worktree lookup failed: ${commandError(listed)}`);
    return new Map();
  }

  const candidates = listed.stdout
    .split('\0')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => resolve(line.slice('worktree '.length)))
    .filter((worktreePath) => pathKey(worktreePath) !== pathKey(root) && isInsideRoot(root, worktreePath));
  const boundaries = new Map();
  for (const worktreePath of candidates) {
    const relativePath = toPosix(worktreePath);
    const tracked = outerTrackedFiles(root, relativePath);
    if (tracked.error) {
      addFailure(`registered worktree tracked-file check failed for ${relativePath}: ${tracked.error}`);
      continue;
    }
    if (tracked.files.length > 0) {
      addFailure(`registered worktree boundary contains outer-repository tracked files: ${relativePath} (${tracked.files.length})`);
      continue;
    }
    boundaries.set(pathKey(worktreePath), relativePath);
  }
  addPass(`registered nested worktrees excluded: ${boundaries.size}`);
  for (const relativePath of [...boundaries.values()].sort()) {
    writeAudit(`excluded registered worktree: ${relativePath}`);
  }
  return boundaries;
}

export function createNestedRepositoryBoundaryGuard({ root, toPosix, addFailure, addPass, writeAudit = () => {} }) {
  const excluded = new Map();
  const checked = new Map();

  function shouldExclude(directory) {
    const key = pathKey(directory);
    if (checked.has(key)) return checked.get(key);
    if (!existsSync(resolve(directory, '.git'))) {
      checked.set(key, false);
      return false;
    }

    const relativePath = toPosix(directory);
    const tracked = outerTrackedFiles(root, relativePath);
    if (tracked.error) {
      addFailure(`nested repository tracked-file check failed for ${relativePath}: ${tracked.error}`);
      checked.set(key, false);
      return false;
    }
    if (tracked.files.length > 0) {
      addFailure(`nested repository boundary contains outer-repository tracked files: ${relativePath} (${tracked.files.length})`);
      checked.set(key, false);
      return false;
    }

    excluded.set(key, relativePath);
    checked.set(key, true);
    return true;
  }

  function report() {
    addPass(`nested repositories excluded: ${excluded.size}`);
    for (const relativePath of [...excluded.values()].sort()) {
      writeAudit(`excluded nested repository: ${relativePath}`);
    }
  }

  return { shouldExclude, report, excluded };
}
