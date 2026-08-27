#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function git(repoRoot, ...args) {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

function primaryCheckout(repoRoot) {
  const common = git(repoRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  return path.basename(common) === '.git' ? path.dirname(common) : repoRoot;
}

export function checkTruthGuardLedgerPaths(repoRoot) {
  const checkout = primaryCheckout(repoRoot);
  const ledgerRoot = path.join(checkout, '.truth-guard', 'ledgers');
  if (!existsSync(ledgerRoot)) {
    return { status: 'NOT_MEASURED', checkout, ledgerCount: 0, reason: '로컬 비공개 Truth Guard 원장이 없습니다.' };
  }
  const ledgers = readdirSync(ledgerRoot).filter((name) => name.endsWith('.json') && !/template/i.test(name));
  if (ledgers.length === 0) return { status: 'NOT_MEASURED', checkout, ledgerCount: 0, reason: '비템플릿 원장이 없습니다.' };

  const missing = [];
  for (const name of ledgers) {
    const ledger = JSON.parse(readFileSync(path.join(ledgerRoot, name), 'utf8'));
    const paths = [ledger?.document?.path, ledger?.source_manifest_path];
    for (const recorded of paths) {
      if (typeof recorded !== 'string' || !recorded.startsWith('.truth-guard/')) {
        missing.push(`${name}: invalid recorded path`);
      } else if (!existsSync(path.join(checkout, ...recorded.split('/')))) {
        missing.push(`${name}: ${recorded}`);
      }
    }
  }
  return { status: missing.length ? 'FAIL' : 'PASS', checkout, ledgerCount: ledgers.length, missing };
}

try {
  const repoRoot = git(process.cwd(), 'rev-parse', '--show-toplevel');
  const result = checkTruthGuardLedgerPaths(repoRoot);
  console.log(`non-template ledgers: ${result.ledgerCount}`);
  console.log(`${result.status}: ${result.reason || `기록 경로 ${result.ledgerCount * 2}/${result.ledgerCount * 2} 존재`}`);
  for (const missing of result.missing || []) console.error(`missing: ${missing}`);
  if (result.status === 'FAIL') process.exitCode = 1;
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
