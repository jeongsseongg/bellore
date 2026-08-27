#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function git(repoRoot, ...args) {
  return execFileSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function findMemoryRoot(repoRoot) {
  let current = repoRoot;
  for (let depth = 0; depth < 5; depth += 1) {
    if (
      existsSync(path.join(current, 'PROJECT_CONTEXT.md'))
      && existsSync(path.join(current, '.brain', 'INDEX.md'))
    ) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function extractSha(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) throw new Error(`${label}에서 40자리 SHA를 찾지 못했습니다.`);
  return match[1].toLowerCase();
}

export function checkBrainLatestSha(repoRoot) {
  const mainHead = git(repoRoot, 'rev-parse', 'refs/heads/main').toLowerCase();
  const memoryRoot = findMemoryRoot(repoRoot);
  if (!memoryRoot) {
    return { status: 'NOT_MEASURED', mainHead, reason: '비공개 상위 Brain이 이 checkout에 없습니다.' };
  }

  const context = readFileSync(path.join(memoryRoot, 'PROJECT_CONTEXT.md'), 'utf8');
  const index = readFileSync(path.join(memoryRoot, '.brain', 'INDEX.md'), 'utf8');
  const records = [
    {
      label: 'PROJECT_CONTEXT.md Latest confirmed version or milestone',
      sha: extractSha(
        context,
        /^- Latest confirmed version or milestone:.*?`([0-9a-f]{40})`/m,
        'PROJECT_CONTEXT.md의 Latest confirmed version or milestone',
      ),
    },
    {
      label: '.brain/INDEX.md Main SHA',
      sha: extractSha(index, /^- Main SHA: `([0-9a-f]{40})`/m, '.brain/INDEX.md의 Main SHA'),
    },
  ];
  const mismatches = records.filter(({ sha }) => sha !== mainHead);
  return { status: mismatches.length ? 'FAIL' : 'PASS', mainHead, records, mismatches };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const repoRoot = git(process.cwd(), 'rev-parse', '--show-toplevel');
    const result = checkBrainLatestSha(repoRoot);
    console.log(`main HEAD: ${result.mainHead}`);
    for (const record of result.records || []) console.log(`${record.label}: ${record.sha}`);
    console.log(`${result.status}: ${result.reason || `Brain 최신 SHA 대조 ${result.records.length}/${result.records.length}`}`);
    if (result.status === 'FAIL') process.exitCode = 1;
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
