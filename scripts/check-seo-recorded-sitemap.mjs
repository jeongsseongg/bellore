#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { findMemoryRoot } from './check-brain-latest-sha.mjs';

const measuredOperatingCount = 160;

function git(repoRoot, ...args) {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

export function checkRecordedSitemapCount(repoRoot) {
  const memoryRoot = findMemoryRoot(repoRoot);
  if (!memoryRoot) return { status: 'NOT_MEASURED', reason: '비공개 상위 PROJECT_CONTEXT.md가 없습니다.' };
  const context = readFileSync(path.join(memoryRoot, 'PROJECT_CONTEXT.md'), 'utf8');
  const match = context.match(/기존 공개 사이트맵은 HTTP 200, 고유 URL (\d+)개/);
  if (!match) throw new Error('PROJECT_CONTEXT.md에서 운영 사이트맵 URL 개수를 찾지 못했습니다.');
  const documentedCount = Number(match[1]);
  return {
    status: documentedCount === measuredOperatingCount ? 'PASS' : 'FAIL',
    documentedCount,
    measuredOperatingCount,
  };
}

try {
  const repoRoot = git(process.cwd(), 'rev-parse', '--show-toplevel');
  const result = checkRecordedSitemapCount(repoRoot);
  console.log(`documented sitemap URLs: ${result.documentedCount ?? 'NOT_MEASURED'}`);
  console.log(`operating measurement baseline: ${result.measuredOperatingCount ?? measuredOperatingCount}`);
  console.log(`${result.status}: ${result.reason || '사이트맵 기록과 2026-08-27 운영 실측이 일치합니다.'}`);
  if (result.status === 'FAIL') process.exitCode = 1;
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
