import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function collectRuntimeFiles() {
  const files = fs.readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:html|js|mjs)$/.test(entry.name))
    .map((entry) => entry.name);

  function walk(relativeDir) {
    const absoluteDir = path.join(repoRoot, relativeDir);
    if (!fs.existsSync(absoluteDir)) return;
    fs.readdirSync(absoluteDir, { withFileTypes: true }).forEach((entry) => {
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) walk(relativePath);
      else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(relativePath);
    });
  }

  walk('app');
  return files;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const assignments = [];
collectRuntimeFiles().forEach((relativePath) => {
  const source = read(relativePath);
  const count = (source.match(/window\s*\.\s*alert\s*=/g) || []).length;
  if (count) assignments.push({ relativePath, count });
});

assert(
  assignments.length === 1 && assignments[0].relativePath === 'ui-dialog.js' && assignments[0].count === 1,
  'window.alert ownership must be ui-dialog.js only: ' + JSON.stringify(assignments)
);

const dialogSource = read('ui-dialog.js');
const legacyFeatureSource = read('bellore-features.js');
const stylesSource = read('styles.css');

['belloreAlert', 'belloreConfirm', 'belloreModal', 'bellConfirm', 'bellPrompt', 'bellToast'].forEach((name) => {
  assert(new RegExp('window\\.' + name + '\\s*=').test(dialogSource), 'missing compatibility API: ' + name);
});

assert(dialogSource.includes("root.className = 'bld-modal'"), 'bld-modal must remain the only dialog renderer');
assert(dialogSource.includes('window.BELLORE_CUSTOMER_FEEDBACK'), 'dialog messages must pass through the customer feedback mapper');
assert(!/<img|logo-bellore/i.test(dialogSource), 'the unified customer dialog must not render a popup logo');
assert(!/bl-modal(?:-mask|-logo|-top|-msg|-acts)?/.test(legacyFeatureSource), 'legacy bl-modal renderer remains');
assert(!legacyFeatureSource.includes('assets/logo-bellore.png'), 'legacy popup logo remains');
assert(!/window\s*\.\s*alert\s*=/.test(legacyFeatureSource), 'bellore-features.js still owns window.alert');
assert(/window\.belloreCustomerMessage\s*=/.test(dialogSource), 'inline customer messages need the same fail-closed mapper');
assert(/\.bld-modal\s*\{[\s\S]{0,120}z-index:\s*2147483647/.test(stylesSource), 'customer dialog can be hidden behind another overlay');
assert(/var queue = \[\]/.test(dialogSource), 'sequential dialogs need an explicit queue');

console.log('dialog ownership invariants: ok');
