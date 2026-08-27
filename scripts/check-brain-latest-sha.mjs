#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

export function resolveMainHead(repoRoot, env = process.env) {
  try {
    return git(repoRoot, 'rev-parse', 'refs/heads/main').toLowerCase();
  } catch (error) {
    if (env.GITHUB_ACTIONS !== 'true' || !/^[0-9a-f]{40}$/i.test(env.GITHUB_SHA || '')) throw error;
    const checkoutHead = git(repoRoot, 'rev-parse', 'HEAD').toLowerCase();
    if (checkoutHead !== env.GITHUB_SHA.toLowerCase()) {
      throw new Error('detached CI checkout HEAD가 GITHUB_SHA와 일치하지 않습니다.');
    }
    return checkoutHead;
  }
}

export function checkBrainLatestSha(repoRoot) {
  const mainHead = resolveMainHead(repoRoot);
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

function replacePointer(text, pattern, mainHead, label) {
  if (!pattern.test(text)) throw new Error(`${label}에서 40자리 SHA를 찾지 못했습니다.`);
  return text.replace(pattern, `$1${mainHead}$2`);
}

export function syncBrainLatestSha(repoRoot) {
  const mainHead = resolveMainHead(repoRoot);
  const memoryRoot = findMemoryRoot(repoRoot);
  if (!memoryRoot) {
    return { status: 'NOT_MEASURED', mainHead, reason: '비공개 상위 Brain이 이 checkout에 없습니다.' };
  }

  const targets = [
    {
      path: path.join(memoryRoot, 'PROJECT_CONTEXT.md'),
      pattern: /^(- Latest confirmed version or milestone:.*?`)[0-9a-f]{40}(`.*)$/m,
      label: 'PROJECT_CONTEXT.md의 Latest confirmed version or milestone',
    },
    {
      path: path.join(memoryRoot, '.brain', 'INDEX.md'),
      pattern: /^(- Main SHA: `)[0-9a-f]{40}(`.*)$/m,
      label: '.brain/INDEX.md의 Main SHA',
    },
  ];

  let updated = 0;
  for (const target of targets) {
    const before = readFileSync(target.path, 'utf8');
    const after = replacePointer(before, target.pattern, mainHead, target.label);
    if (after === before) continue;
    writeFileSync(target.path, after, 'utf8');
    updated += 1;
  }

  return { status: 'PASS', mainHead, updated, targets: targets.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const repoRoot = git(process.cwd(), 'rev-parse', '--show-toplevel');
    const shouldSync = process.argv.includes('--sync');
    const result = shouldSync ? syncBrainLatestSha(repoRoot) : checkBrainLatestSha(repoRoot);
    console.log(`main HEAD: ${result.mainHead}`);
    for (const record of result.records || []) console.log(`${record.label}: ${record.sha}`);
    const detail = shouldSync
      ? `Brain SHA 포인터 동기화 ${result.updated || 0}/${result.targets || 0}`
      : `Brain 최신 SHA 대조 ${result.records.length}/${result.records.length}`;
    console.log(`${result.status}: ${result.reason || detail}`);
    if (result.status === 'FAIL') process.exitCode = 1;
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
