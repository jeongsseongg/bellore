import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathKey, readRegisteredWorktreeBoundaries } from './check-worktree-boundaries.mjs';
const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const baselinePath = join(root, 'scripts', 'architecture-baseline.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const failures = [];
const warnings = [];
const passes = [];
const excludedDirectories = new Set(['.git', 'node_modules', 'assets', 'data', 'design-refs', '_site']);
let registeredWorktreeBoundaries = new Map();
function toPosix(file) {
  return relative(root, file).split(sep).join('/');
}

function walk(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && (excludedDirectories.has(entry.name) || entry.name.startsWith('.tmp-pages-test-'))) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory() && registeredWorktreeBoundaries.has(pathKey(absolute))) continue;
    if (entry.isDirectory()) walk(absolute, output);
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}
function lineCount(text) {
  if (!text) return 0;
  const normalized = text.replace(/\r\n?/g, '\n');
  return normalized.endsWith('\n')
    ? normalized.slice(0, -1).split('\n').length
    : normalized.split('\n').length;
}

function normalizedByteLength(text) {
  return Buffer.byteLength(text.replace(/\r\n?/g, '\n'));
}

function addPass(message) {
  passes.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function addFailure(message) {
  failures.push(message);
}

function ceiling(label, actual, maximum) {
  if (actual > maximum) addFailure(`${label}: ${actual} > ceiling ${maximum}`);
  else addPass(`${label}: ${actual}/${maximum}`);
}

function scriptBlocks(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((match) => ({
    attributes: match[1],
    body: match[2]
  }));
}

function htmlWithoutComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function htmlMarkupWithoutEmbeddedCode(html) {
  return html
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>')
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/gi, '$1</style>');
}

function attributeValue(attributes, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i');
  const match = attributes.match(pattern);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

function htmlAttributeValues(html, name) {
  const values = [];
  for (const tag of html.matchAll(/<[A-Za-z][^>]*>/g)) {
    const value = attributeValue(tag[0], name);
    if (value !== null) values.push(value);
  }
  return values;
}

function sourceWithoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\r\n]*/g, '$1 ');
}

function browserGlobalAssignments(source) {
  const code = sourceWithoutComments(source);
  const dot = [...code.matchAll(/(?:window|globalThis)\.[A-Za-z_$][\w$]*\s*=/g)].length;
  const bracket = [...code.matchAll(/(?:window|globalThis)\s*\[\s*["'][^"']+["']\s*\]\s*=/g)].length;
  return dot + bracket;
}

function isExecutableInline(block) {
  if (/\bsrc\s*=/i.test(block.attributes)) return false;
  const type = (attributeValue(block.attributes, 'type') || '').toLowerCase();
  return !type || type === 'module' || /(?:java|ecma)script/.test(type);
}

function normalizeLocalReference(value) {
  if (!value || /^(?:[a-z]+:|\/\/|#)/i.test(value)) return null;
  const clean = value.split('#')[0].split('?')[0].replace(/^\.\//, '').replace(/^\//, '');
  if (!clean || /[{}<>]/.test(clean)) return null;
  try {
    return decodeURIComponent(clean).replace(/\\/g, '/');
  } catch {
    return clean.replace(/\\/g, '/');
  }
}

function normalizeLocalCacheKey(value) {
  if (!value || /^(?:[a-z]+:|\/\/|#)/i.test(value)) return null;
  const clean = value.split('#')[0].replace(/^\.\//, '').replace(/^\//, '');
  if (!clean || /[{}<>]/.test(clean)) return null;
  try {
    return decodeURIComponent(clean).replace(/\\/g, '/');
  } catch {
    return clean.replace(/\\/g, '/');
  }
}

function localReferences(html) {
  const references = new Set();
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const normalized = normalizeLocalReference(match[1]);
    if (normalized) references.add(normalized);
  }
  return references;
}

function literalSourceAssetReferences(sourceFiles) {
  const references = new Set();
  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:^|["'`(\s:=])((?:\.\/)?assets\/[^"'`\s]*?\.[A-Za-z0-9]{2,5})(?=$|["'`\s),;?&#])/gm)) {
      const candidate = match[1];
      const normalized = normalizeLocalReference(candidate);
      if (normalized) references.add(normalized);
    }
  }
  return references;
}

function localShellEntrypoints(html) {
  const entries = new Set();
  for (const match of html.matchAll(/<link\b([^>]+)>/gi)) {
    if (!/\brel\s*=\s*["'][^"']*stylesheet/i.test(match[1])) continue;
    const href = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    const normalized = normalizeLocalCacheKey(href);
    if (normalized) entries.add(normalized);
  }
  for (const match of html.matchAll(/<script\b([^>]+)>/gi)) {
    const src = match[1].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    const normalized = normalizeLocalCacheKey(src);
    if (normalized) entries.add(normalized);
  }
  return entries;
}

function shellAssets(swSource) {
  const body = swSource.match(/const\s+SHELL_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';
  const assets = new Set();
  for (const match of body.matchAll(/["']([^"']+)["']/g)) {
    const normalized = normalizeLocalCacheKey(match[1]);
    if (normalized) assets.add(normalized);
  }
  return assets;
}

function staticLocalModuleReferences(moduleFiles) {
  const references = new Set();
  for (const file of moduleFiles) {
    const source = sourceWithoutComments(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^"']*?\sfrom\s*)?["'](\.[^"']+)["']/g)) {
      const specifier = match[1].split('#')[0].split('?')[0];
      const absolute = resolve(dirname(file), specifier);
      if (!existsSync(absolute)) addFailure(`missing local module import: ${toPosix(file)} -> ${specifier}`);
      else references.add(toPosix(absolute));
    }
  }
  return references;
}

function compareKnownDebt(label, actualValues, knownValues) {
  const actual = new Set(actualValues);
  const known = new Set(knownValues);
  for (const value of actual) {
    if (known.has(value)) addWarning(`${label} (기존): ${value}`);
    else addFailure(`${label} (신규): ${value}`);
  }
  for (const value of known) {
    if (!actual.has(value)) addFailure(`${label} 해결됨 — baseline 허용 목록에서 제거 필요: ${value}`);
  }
}

function checkSyntax(file, moduleMode = false) {
  const source = readFileSync(file, 'utf8');
  const args = moduleMode ? ['--input-type=module', '--check'] : ['--check', file];
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    input: moduleMode ? source : undefined,
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.status !== 0) {
    addFailure(`syntax ${toPosix(file)}: ${(result.stderr || result.stdout || '').trim()}`);
    return false;
  }
  return true;
}

function runTests(testFiles) {
  let passed = 0;
  for (const file of testFiles) {
    const result = spawnSync(process.execPath, [file], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    });
    const summary = (result.stdout || '').trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
    if (result.status === 0) {
      passed += 1;
      console.log(`  PASS ${toPosix(file)}${summary ? ` — ${summary}` : ''}`);
    } else {
      addFailure(`test ${toPosix(file)}: ${(result.stderr || result.stdout || '').trim()}`);
    }
  }
  if (passed === testFiles.length) addPass(`tests: ${passed}/${testFiles.length}`);
}

registeredWorktreeBoundaries = readRegisteredWorktreeBoundaries({ root, toPosix, addFailure, addPass });
const allFiles = walk(root);
const htmlPath = join(root, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const cleanHtml = htmlWithoutComments(html);
const markupHtml = htmlMarkupWithoutEmbeddedCode(cleanHtml);
const htmlDocuments = allFiles
  .filter((file) => extname(file).toLowerCase() === '.html')
  .map((file) => htmlWithoutComments(readFileSync(file, 'utf8')));
const allMarkupHtml = htmlDocuments.map(htmlMarkupWithoutEmbeddedCode);
const swSource = readFileSync(join(root, 'sw.js'), 'utf8');

console.log('[1/6] repository invariants');
const cname = readFileSync(join(root, 'CNAME'), 'utf8').trim();
if (cname === 'bellore.co.kr') addPass('CNAME: bellore.co.kr');
else addFailure(`CNAME changed: ${cname || '(empty)'}`);
const localScriptEntrypoints = [...cleanHtml.matchAll(/<script\b([^>]*)>/gi)]
  .map((match) => normalizeLocalReference(attributeValue(match[1], 'src')))
  .filter((reference) => reference && ['.js', '.mjs'].includes(extname(reference).toLowerCase()))
  .filter((reference) => existsSync(join(root, reference)));
const serviceWorkerRegistrationSource = [html, ...localScriptEntrypoints.map((reference) => readFileSync(join(root, reference), 'utf8'))]
  .find((source) => /navigator\.serviceWorker\.register\(\s*["']sw\.js/i.test(source));
if (serviceWorkerRegistrationSource) addPass('service worker registration present in a loaded entrypoint');
else addFailure('service worker registration missing from loaded entrypoints');

const rootRuntimeExtensions = new Set(['.js', '.mjs', '.css', '.html']);
const actualRootRuntime = readdirSync(root)
  .filter((name) => statSync(join(root, name)).isFile() && rootRuntimeExtensions.has(extname(name).toLowerCase()))
  .sort();
const allowedRootRuntime = new Set(baseline.allowedRootRuntimeFiles);
for (const file of actualRootRuntime) {
  if (!allowedRootRuntime.has(file)) addFailure(`new root runtime file must live under app/: ${file}`);
}
for (const file of baseline.allowedRootRuntimeFiles) {
  if (!actualRootRuntime.includes(file)) addWarning(`root legacy file removed or moved; lower baseline allowlist: ${file}`);
}

console.log('[2/6] legacy ratchets');
for (const [file, maximum] of Object.entries(baseline.legacyLineCeilings)) {
  const absolute = join(root, file);
  if (!existsSync(absolute)) {
    addFailure(`baseline file missing; update migration deliberately: ${file}`);
    continue;
  }
  ceiling(`lines ${file}`, lineCount(readFileSync(absolute, 'utf8')), maximum);
}

const universalBudgets = { '.js': 400, '.mjs': 400, '.ts': 400, '.css': 500, '.html': 300 };
const knownOversizeFiles = new Set([
  ...Object.keys(baseline.legacyLineCeilings),
  ...Object.keys(baseline.newCodeExceptions)
]);
for (const file of allFiles) {
  const extension = extname(file).toLowerCase();
  const maximum = universalBudgets[extension];
  if (!maximum) continue;
  const fileRelative = toPosix(file);
  const lines = lineCount(readFileSync(file, 'utf8'));
  if (lines > maximum && !knownOversizeFiles.has(fileRelative)) {
    addFailure(`unregistered oversized source ${fileRelative}: ${lines} > ${maximum}`);
  }
}

const executableBlocks = htmlDocuments.flatMap((document) => scriptBlocks(document).filter(isExecutableInline));
ceiling('executable inline script blocks', executableBlocks.length, baseline.legacyCeilings.executableInlineScriptBlocks);
ceiling('executable inline script bytes', executableBlocks.reduce((sum, block) => sum + normalizedByteLength(block.body), 0), baseline.legacyCeilings.executableInlineScriptBytes);
ceiling('style attributes', allMarkupHtml.reduce((sum, document) => sum + htmlAttributeValues(document, 'style').length, 0), baseline.legacyCeilings.styleAttributes);

const cssFiles = allFiles.filter((file) => extname(file).toLowerCase() === '.css');
const importantTokens = cssFiles.reduce((sum, file) => {
  const activeCss = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  return sum + [...activeCss.matchAll(/!important/gi)].length;
}, 0);
ceiling('!important tokens', importantTokens, baseline.legacyCeilings.importantTokens);

const javascriptFiles = allFiles.filter((file) => ['.js', '.mjs'].includes(extname(file).toLowerCase()));
const windowAssignments = javascriptFiles.reduce((sum, file) => {
  return sum + browserGlobalAssignments(readFileSync(file, 'utf8'));
}, 0) + executableBlocks.reduce((sum, block) => sum + browserGlobalAssignments(block.body), 0);
ceiling('window assignments', windowAssignments, baseline.legacyCeilings.windowAssignments);

const scriptStyleAttributeTokens = javascriptFiles.reduce((sum, file) => {
  return sum + [...sourceWithoutComments(readFileSync(file, 'utf8')).matchAll(/\sstyle\s*=/gi)].length;
}, 0) + executableBlocks.reduce((sum, block) => {
  return sum + [...sourceWithoutComments(block.body).matchAll(/\sstyle\s*=/gi)].length;
}, 0);
ceiling('script template style attributes', scriptStyleAttributeTokens, baseline.legacyCeilings.scriptStyleAttributeTokens);

const localClassicScripts = htmlDocuments.reduce((sum, document) => sum + [...document.matchAll(/<script\b([^>]*)>/gi)].filter((match) => {
  const src = attributeValue(match[1], 'src');
  return normalizeLocalReference(src) && (attributeValue(match[1], 'type') || '').toLowerCase() !== 'module';
}).length, 0);
ceiling('local classic scripts', localClassicScripts, baseline.legacyCeilings.localClassicScripts);

console.log('[3/6] new app boundaries');
const appRoot = join(root, 'app');
const appFiles = existsSync(appRoot) ? walk(appRoot) : [];
const appRuntime = appFiles.filter((file) => ['.js', '.mjs', '.ts', '.css', '.html'].includes(extname(file).toLowerCase()));
if (appRuntime.length > 0 && !existsSync(join(appRoot, 'bootstrap.js')) && !existsSync(join(appRoot, 'bootstrap.mjs'))) {
  addFailure('app runtime exists without app/bootstrap.js or app/bootstrap.mjs composition root');
}
if (appRuntime.length === 0) addPass('app boundaries armed; first real feature will create the composition root');

for (const file of appRuntime) {
  const fileRelative = toPosix(file);
  const extension = extname(file).toLowerCase();
  const budget = baseline.newCodeBudgets[extension];
  const exception = baseline.newCodeExceptions[fileRelative];
  const source = readFileSync(file, 'utf8');
  const maximum = exception?.maximum || budget?.maximum;
  if (maximum) ceiling(`new module lines ${fileRelative}`, lineCount(source), maximum);
  if (budget && lineCount(source) >= budget.review) addWarning(`split review ${fileRelative}: ${lineCount(source)} lines`);
  if (/^(?:utils?|helpers?|common|misc)\.(?:m?js|css|html)$/i.test(fileRelative.split('/').pop())) {
    addFailure(`generic module name hides ownership: ${fileRelative}`);
  }
  if (/window\.[A-Za-z_$][\w$]*\s*=/.test(source) && !fileRelative.startsWith('app/legacy/')) {
    addFailure(`new browser global outside app/legacy: ${fileRelative}`);
  }
  if (extension === '.css' && /!important/i.test(source)) addFailure(`new !important in ${fileRelative}`);
  if (extension === '.html' && /\sstyle\s*=/i.test(source)) addFailure(`new inline style in ${fileRelative}`);
  if (fileRelative.startsWith('app/features/') && /window\.(?:NWBackend|sbClient)|\bcreateClient\s*\(|\bsupabase\s*\.\s*from\s*\(/.test(source)) {
    addFailure(`feature bypasses injected service boundary: ${fileRelative}`);
  }
}

console.log('[4/6] HTML and service-worker assets');
const missingLocal = [...localReferences(cleanHtml)].filter((reference) => !existsSync(join(root, reference)));
compareKnownDebt('missing local HTML asset', missingLocal, baseline.knownMissingLocalAssets);
const sourceAssetFiles = [...javascriptFiles, ...cssFiles];
const missingSourceAssets = [...literalSourceAssetReferences(sourceAssetFiles)]
  .filter((reference) => !existsSync(join(root, reference)));
compareKnownDebt('missing literal JS/CSS asset', missingSourceAssets, baseline.knownMissingSourceAssets);
const shell = shellAssets(swSource);
const missingShellAssets = [...shell].filter((entry) => !existsSync(join(root, entry.split('?')[0])));
if (missingShellAssets.length) addFailure(`missing service-worker shell assets: ${missingShellAssets.join(', ')}`);
else addPass(`service-worker shell assets exist: ${shell.size}`);
const uncachedEntrypoints = [...localShellEntrypoints(cleanHtml)].filter((entry) => !shell.has(entry));
compareKnownDebt('HTML entrypoint absent from SW shell', uncachedEntrypoints, baseline.knownUncachedShellAssets);
if (uncachedEntrypoints.length === 0) addPass(`HTML entrypoint exact cache keys: ${localShellEntrypoints(cleanHtml).size}`);
const appModuleImports = staticLocalModuleReferences(
  appRuntime.filter((file) => ['.js', '.mjs'].includes(extname(file).toLowerCase()))
);
const shellPaths = new Set([...shell].map((entry) => entry.split('?')[0]));
const uncachedAppImports = [...appModuleImports].filter((entry) => !shellPaths.has(entry));
if (uncachedAppImports.length) addFailure(`app module import absent from SW shell: ${uncachedAppImports.join(', ')}`);
else addPass(`app module imports cached: ${appModuleImports.size}`);

const ids = htmlAttributeValues(markupHtml, 'id');
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) addFailure(`duplicate HTML ids: ${duplicateIds.join(', ')}`);
else addPass(`HTML ids unique: ${ids.length}`);

console.log('[5/6] JavaScript syntax');
let syntaxPassed = 0;
for (const file of javascriptFiles) {
  const moduleMode = toPosix(file).startsWith('app/') && extname(file).toLowerCase() === '.js';
  if (checkSyntax(file, moduleMode)) syntaxPassed += 1;
}
for (let index = 0; index < executableBlocks.length; index += 1) {
  const result = spawnSync(process.execPath, ['--check'], {
    encoding: 'utf8',
    input: executableBlocks[index].body,
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.status === 0) syntaxPassed += 1;
  else addFailure(`inline script ${index + 1} syntax: ${(result.stderr || result.stdout || '').trim()}`);
}
if (syntaxPassed === javascriptFiles.length + executableBlocks.length) {
  addPass(`JavaScript syntax: ${syntaxPassed}/${javascriptFiles.length + executableBlocks.length}`);
}

console.log('[6/6] project tests');
const testFiles = allFiles
  .filter((file) => {
    const extension = extname(file).toLowerCase();
    return toPosix(file).startsWith('scripts/test-') && ['.js', '.mjs'].includes(extension);
  })
  .sort();
runTests(testFiles);

console.log('\nRESULT');
for (const message of passes) console.log(`PASS ${message}`);
for (const message of warnings) console.log(`WARN ${message}`);
for (const message of failures) console.log(`FAIL ${message}`);

console.log('\nNOT VERIFIED');
console.log('- browser DOM/E2E, accessibility, mobile device behavior');
console.log('- Edge Function TypeScript type-check and deployed runtime');
console.log('- PostgreSQL compile, RLS role matrix, two-session concurrency');
console.log('- PortOne/KG live approval, cancellation, refund, idempotency');
console.log('- remote GitHub Pages environment protection, required checks, branch/ruleset enforcement');

console.log(`\nSUMMARY pass=${passes.length} warn=${warnings.length} fail=${failures.length}`);
if (failures.length > 0) process.exitCode = 1;
