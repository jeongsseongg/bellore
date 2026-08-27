#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function git(repoRoot, ...args) {
  return execFileSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function findMemoryRoot(repoRoot) {
  let current = repoRoot;
  for (let depth = 0; depth < 5; depth += 1) {
    if (
      existsSync(path.join(current, 'PROJECT_CONTEXT.md'))
      && existsSync(path.join(current, '.brain', 'PROJECT_CHRONICLE.md'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('PROJECT_CONTEXT.md와 .brain/PROJECT_CHRONICLE.md가 함께 있는 상위 프로젝트를 찾지 못했습니다.');
}

function extractSha(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) throw new Error(`${label}에서 40자리 SHA를 찾지 못했습니다.`);
  return match[1].toLowerCase();
}

try {
  const repoRoot = git(process.cwd(), 'rev-parse', '--show-toplevel');
  const mainHead = git(repoRoot, 'rev-parse', 'refs/heads/main').toLowerCase();
  const memoryRoot = findMemoryRoot(repoRoot);
  const contextPath = path.join(memoryRoot, 'PROJECT_CONTEXT.md');
  const chroniclePath = path.join(memoryRoot, '.brain', 'PROJECT_CHRONICLE.md');
  const context = readFileSync(contextPath, 'utf8');
  const chronicle = readFileSync(chroniclePath, 'utf8');

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
      label: '.brain/PROJECT_CHRONICLE.md Source revision',
      sha: extractSha(
        chronicle,
        /^- Source revision:.*?`([0-9a-f]{40})`/m,
        '.brain/PROJECT_CHRONICLE.md의 Source revision',
      ),
    },
  ];

  const mismatches = records.filter(({ sha }) => sha !== mainHead);
  console.log(`main HEAD: ${mainHead}`);
  for (const record of records) console.log(`${record.label}: ${record.sha}`);

  if (mismatches.length > 0) {
    console.error(`FAIL: 브레인 최신 SHA ${mismatches.length}개가 main HEAD와 다릅니다.`);
    process.exitCode = 1;
  } else {
    console.log('PASS: 브레인 최신 SHA가 main HEAD와 일치합니다.');
  }
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
