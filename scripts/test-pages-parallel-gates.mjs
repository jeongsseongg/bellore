import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const workflow = readFileSync(resolve(root, '.github/workflows/pages-deploy.yml'), 'utf8').replace(/\r\n?/g, '\n');
const verifyJob = workflow.match(/\n  verify:\n([\s\S]*?)\n  build:\n/)?.[1] || '';
const buildJob = workflow.match(/\n  build:\n([\s\S]*?)\n  deploy:\n/)?.[1] || '';
const deployJob = workflow.match(/\n  deploy:\n([\s\S]*)$/)?.[1] || '';

assert.doesNotMatch(
  verifyJob,
  /^    needs:\s*truth_guard\s*$/m,
  'expensive Pages verification should run in parallel with Truth Guard',
);
assert.match(
  buildJob,
  /^    needs:\s*\[truth_guard, verify\]\s*$/m,
  'the Pages publication gate must wait for Truth Guard and verified artifact',
);
assert.match(
  deployJob,
  /^    needs:\s*\[truth_guard, build\]\s*$/m,
  'production publishing must wait for both Truth Guard and the complete build gate',
);
assert.match(verifyJob, /node scripts\/check\.mjs/, 'full project release gate must remain in Pages verification');
assert.match(verifyJob, /node scripts\/check-edge\.mjs/, 'Edge type-check must remain in Pages verification');
assert.match(verifyJob, /node scripts\/test-pages-artifact\.mjs/, 'final artifact verification must remain in Pages verification');

console.log('Pages parallel gate contract: verification is parallel, publish waits for both gates');
