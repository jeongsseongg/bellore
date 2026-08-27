import { spawnSync } from 'node:child_process';
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

export function readRegisteredWorktreeBoundaries({ root, toPosix, addFailure, addPass }) {
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
    const tracked = spawnSync('git', ['-C', root, 'ls-files', '--', `${relativePath}/`], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024
    });
    if (tracked.error || tracked.status !== 0) {
      addFailure(`registered worktree tracked-file check failed for ${relativePath}: ${commandError(tracked)}`);
      continue;
    }
    const outerTrackedFiles = tracked.stdout.trim().split(/\r?\n/).filter(Boolean);
    if (outerTrackedFiles.length > 0) {
      addFailure(`registered worktree boundary contains outer-repository tracked files: ${relativePath} (${outerTrackedFiles.length})`);
      continue;
    }
    boundaries.set(pathKey(worktreePath), relativePath);
  }
  addPass(`registered nested worktrees excluded: ${boundaries.size}`);
  for (const relativePath of [...boundaries.values()].sort()) {
    addPass(`excluded registered worktree: ${relativePath}`);
  }
  return boundaries;
}
