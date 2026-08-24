import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const functionsRoot = join(root, 'supabase', 'functions');
const lockPath = join(root, 'supabase', 'deno.lock');
const expectedSupabaseImport = 'https://esm.sh/@supabase/supabase-js@2.112.2';
const deno = process.env.DENO_BIN || 'deno';

if (!existsSync(lockPath)) {
  console.error('Edge check failed: supabase/deno.lock is missing');
  process.exit(1);
}

const entries = readdirSync(functionsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(functionsRoot, entry.name, 'index.ts'))
  .filter(existsSync)
  .sort();

if (entries.length === 0) {
  console.error('Edge check failed: no Supabase Edge function entrypoints found');
  process.exit(1);
}

for (const entry of entries) {
  const source = readFileSync(entry, 'utf8');
  const imports = [...source.matchAll(/https:\/\/esm\.sh\/@supabase\/supabase-js(?:@[^"'\s]+)?/g)];
  for (const match of imports) {
    if (match[0] !== expectedSupabaseImport) {
      console.error(`Edge check failed: unpinned Supabase import in ${entry}`);
      process.exit(1);
    }
  }
}

const result = spawnSync(deno, [
  'check',
  `--lock=${lockPath}`,
  '--frozen',
  ...entries
], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit'
});

if (result.error) {
  console.error(`Edge check failed: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Supabase Edge typecheck: ${entries.length}/${entries.length} passed (locked)`);
