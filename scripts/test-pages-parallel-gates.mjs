import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const workflow = readFileSync(resolve(root, '.github/workflows/pages-deploy.yml'), 'utf8').replace(/\r\n/g, '\n');
const buildJob = workflow.match(/\n  build:\n([\s\S]*?)\n  deploy:\n/)?.[1] || '';
const deployJob = workflow.match(/\n  deploy:\n([\s\S]*)$/)?.[1] || '';

assert.doesNotMatch(
  buildJob,
  /^    needs:\s*truth_guard\s*$/m,
  'Pages build checks should run in parallel with Truth Guard',
);
assert.match(
  deployJob,
  /^    needs:\s*\[truth_guard, build\]\s*$/m,
  'production publishing must wait for both Truth Guard and the complete build gate',
);
assert.match(buildJob, /node scripts\/check\.mjs/, 'full project release gate must remain in the Pages build');
assert.match(buildJob, /node scripts\/check-edge\.mjs/, 'Edge type-check must remain in the Pages build');
assert.match(buildJob, /node scripts\/test-pages-artifact\.mjs/, 'final artifact verification must remain in the Pages build');

console.log('Pages parallel gate contract: full checks retained, publish waits for both jobs');
