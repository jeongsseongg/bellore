import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [modalId, outputName, pageKind, pageTitle] = process.argv.slice(2);
if (!modalId || !outputName || !pageKind || !pageTitle) {
  throw new Error('usage: node tools/split-standalone-page.mjs <modalId> <output.html> <kind> <title>');
}

const root = resolve(import.meta.dirname, '..');
const indexPath = resolve(root, 'index.html');
const outputPath = resolve(root, 'pages', outputName);
const index = await readFile(indexPath, 'utf8');

function extractBalancedDiv(source, id) {
  const idPattern = new RegExp(`<div\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i');
  const found = idPattern.exec(source);
  if (!found) throw new Error(`${id} markup not found`);
  const token = /<div\b[^>]*>|<\/div\s*>/gi;
  token.lastIndex = found.index;
  let depth = 0;
  let match;
  while ((match = token.exec(source))) {
    if (/^<div\b/i.test(match[0])) depth += 1;
    else depth -= 1;
    if (depth === 0) {
      return { start: found.index, end: token.lastIndex, markup: source.slice(found.index, token.lastIndex) };
    }
  }
  throw new Error(`${id} closing div not found`);
}

let modal;
let nextIndex = index;
try {
  modal = extractBalancedDiv(index, modalId);
  nextIndex = index.slice(0, modal.start) + index.slice(modal.end);
} catch (error) {
  const existingPage = await readFile(outputPath, 'utf8');
  modal = extractBalancedDiv(existingPage, modalId);
}
const head = index.match(/<head>([\s\S]*?)<\/head>/i)?.[1];
if (!head) throw new Error('index head not found');
const styles = [...head.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi)]
  .map((match) => match[0]).join('\n');
const activeTab = pageKind === 'mypage' || pageKind === 'orders' ? 'my' : '';
const authPolicy = new Map([
  ['mypage', 'required'],
  ['orders', 'required'],
  ['inquiry', 'public'],
]).get(pageKind);
if (!authPolicy) throw new Error(`standalone auth policy missing: ${pageKind}`);

const page = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<base href="/">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="robots" content="noindex, follow">
<title>${pageTitle} | BELLORE</title>
<link rel="canonical" href="https://bellore.co.kr/pages/${outputName}">
${styles}
<link rel="stylesheet" href="/app/ui/app-tabbar.css?v=20260827-latest-tabbar-v3">
<link rel="stylesheet" href="/app/pages/standalone-page.css?v=20260828-standalone-auth-v1">
</head>
<body data-bellore-standalone-page="${pageKind}" data-standalone-auth="${authPolicy}">
${modal.markup}
<bellore-tabbar data-active="${activeTab}"></bellore-tabbar>
<script type="module" src="/app/ui/app-tabbar.js?v=20260827-latest-tabbar-v3"></script>
<script type="module" src="/app/pages/standalone-page.js?v=20260828-standalone-auth-v1"></script>
</body>
</html>
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, page, 'utf8');
await writeFile(indexPath, nextIndex, 'utf8');
console.log(`${modalId} -> pages/${outputName} (${modal.markup.length} bytes)`);
