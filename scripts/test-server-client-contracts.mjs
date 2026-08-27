import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(readFileSync(join(root, 'scripts', 'server-client-contract-baseline.json'), 'utf8'));
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString('utf8').split('\0').filter(Boolean);
const posix = (file) => relative(root, file).split(sep).join('/');
const read = (file) => readFileSync(join(root, file), 'utf8');
const unique = (values) => [...new Set(values)].sort();

const sqlFiles = tracked.filter((file) => extname(file).toLowerCase() === '.sql');
const edgeFiles = tracked.filter((file) => /^supabase\/functions\/[^/]+\/index\.ts$/.test(file));
const serverFiles = tracked.filter((file) => {
  if (!['.js', '.mjs', '.ts', '.yml', '.yaml'].includes(extname(file).toLowerCase())) return false;
  return file.startsWith('supabase/functions/') || file.startsWith('tools/') || file.startsWith('.github/workflows/');
});
const clientFiles = tracked.filter((file) => {
  if (!['.html', '.js', '.mjs', '.ts'].includes(extname(file).toLowerCase())) return false;
  return !file.startsWith('scripts/')
    && !file.startsWith('supabase/functions/')
    && !file.startsWith('tools/')
    && !file.startsWith('cloudflare/');
});

const rpcDefinitions = new Map();
for (const file of sqlFiles) {
  const source = read(file);
  for (const match of source.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public|private)\.([a-zA-Z0-9_]+)\s*\(/gi)) {
    const files = rpcDefinitions.get(match[1]) || [];
    files.push(file);
    rpcDefinitions.set(match[1], files);
  }
}

function literalRpcCalls(files, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:\\.rpc\\(\\s*)?['\"]${escaped}['\"]`, 'g');
  return files.filter((file) => pattern.test(read(file)) && (pattern.lastIndex = 0) === 0);
}

function sqlCalls(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b(?:(?:public|private)\\.)?${escaped}\\s*\\(`, 'i');
  const declaration = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public|private)\\.${escaped}\\s*\\(`, 'i');
  return sqlFiles.filter((file) => {
    const body = read(file).split(/\r?\n/).filter((line) => {
      return !declaration.test(line)
        && !/^\s*(?:grant|revoke|drop|alter|comment)\b/i.test(line);
    }).join('\n');
    return pattern.test(body);
  });
}

const rpcAudit = [...rpcDefinitions].map(([name, definitions]) => ({
  name,
  definitions: unique(definitions),
  clientCalls: unique(literalRpcCalls(clientFiles, name)),
  serverCalls: unique(literalRpcCalls(serverFiles, name)),
  sqlCalls: unique(sqlCalls(name)),
}));

const edgeDefinitions = edgeFiles.map((file) => ({
  name: file.split('/')[2],
  definitions: [file],
}));
function edgeCalls(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const invoke = new RegExp(`(?:functions\\.invoke|\\.edge|\\binvoke)\\([\\s\\S]{0,120}?['\"]${escaped}['\"]`, 'g');
  const url = new RegExp(`/functions/v1/${escaped}(?:['\"?]|$)`, 'g');
  return clientFiles.filter((file) => {
    const source = read(file);
    return invoke.test(source) || url.test(source);
  });
}
const edgeAudit = edgeDefinitions.map((entry) => ({ ...entry, clientCalls: unique(edgeCalls(entry.name)) }));

const zeroRpc = rpcAudit.filter((item) => !item.clientCalls.length && !item.serverCalls.length && !item.sqlCalls.length);
const zeroEdge = edgeAudit.filter((item) => !item.clientCalls.length);
const zeroKeys = unique([
  ...zeroRpc.map((item) => `rpc:${item.name}`),
  ...zeroEdge.map((item) => `edge:${item.name}`),
]);
const allowed = new Set(baseline.intentionalZeroReferences.map((item) => item.key));
const unexpected = zeroKeys.filter((key) => !allowed.has(key));

const report = {
  rpcDefinitions: rpcAudit.length,
  rpcClientReferenced: rpcAudit.filter((item) => item.clientCalls.length).length,
  rpcServerReferenced: rpcAudit.filter((item) => item.serverCalls.length).length,
  rpcSqlReferenced: rpcAudit.filter((item) => item.sqlCalls.length).length,
  edgeDefinitions: edgeAudit.length,
  edgeClientReferenced: edgeAudit.filter((item) => item.clientCalls.length).length,
  zeroReferences: zeroKeys.length,
  ceiling: baseline.zeroReferenceCeiling,
  zeroKeys,
};
if (process.env.CONTRACT_AUDIT_REPORT === '1') console.log(JSON.stringify({ ...report, rpcAudit, edgeAudit }, null, 2));

assert.equal(baseline.schemaVersion, 1);
assert.equal(baseline.zeroReferenceCeiling, baseline.intentionalZeroReferences.length);
assert.ok(zeroKeys.length <= baseline.zeroReferenceCeiling,
  `zero-reference contracts ${zeroKeys.length} exceed ceiling ${baseline.zeroReferenceCeiling}`);
assert.deepEqual(unexpected, [], `unexpected zero-reference contracts:\n${unexpected.join('\n')}`);
for (const item of baseline.intentionalZeroReferences) {
  assert.ok(item.reason && item.reason.length >= 8, `${item.key} needs an audit reason`);
}

console.log(`server-client contracts: rpc=${report.rpcDefinitions} edge=${report.edgeDefinitions} zero=${report.zeroReferences}/${report.ceiling}`);
