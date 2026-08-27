#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const lineCeiling = 22;
const fileCeiling = 12;
const cacheLiteral = /20\d{6}-(?!\d{6})[A-Za-z][A-Za-z0-9-]*(?:-v\d+)?/;
const serviceWorkerLiteral = /bellore-v\d+/;
const buildShaLiteral = /["'`][0-9a-f]{40}["'`]/i;
const directAssertion = /\bassert(?:\.|\()/;

export function volatileReleaseAssertions(root) {
  const scripts = path.join(root, 'scripts');
  const files = readdirSync(scripts)
    .filter((name) => /^test-.*\.(?:m?js)$/.test(name))
    .sort();
  const hits = [];
  for (const name of files) {
    const lines = readFileSync(path.join(scripts, name), 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!directAssertion.test(line)) return;
      const cacheHit = cacheLiteral.test(line) && !/\.sql\b/.test(line);
      if (cacheHit || serviceWorkerLiteral.test(line) || buildShaLiteral.test(line)) hits.push({ file: name, line: index + 1 });
    });
  }
  const fileCount = new Set(hits.map(({ file }) => file)).size;
  return { hits, lineCount: hits.length, fileCount };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = volatileReleaseAssertions(root);
console.log(`volatile release assertions: lines=${result.lineCount}/${lineCeiling} files=${result.fileCount}/${fileCeiling}`);
if (result.lineCount > lineCeiling || result.fileCount > fileCeiling) {
  for (const hit of result.hits) console.error(`${hit.file}:${hit.line}`);
  process.exitCode = 1;
} else {
  console.log('PASS: 휘발성 릴리스 단언이 현재 천장을 넘지 않았습니다.');
}
