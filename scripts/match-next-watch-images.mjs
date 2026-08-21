import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const SOURCE_ROOT = process.argv[2] || 'C:/Users/LS/Desktop/새 폴더';
const FROM_SEQUENCE = Number(process.argv[3] || 71);
const TO_SEQUENCE = Number(process.argv[4] || 110);
const APPLY = process.argv.includes('--apply');
const progressPath = path.join(SOURCE_ROOT, 'bellore-watch-products-progress.json');
const sheetRoot = path.join(os.tmpdir(), `bellore-watch-match-${FROM_SEQUENCE}-${TO_SEQUENCE}`);
const PRODUCT_CORRECTIONS = new Map([
  [71, { brand: '부쉐러', modelName: '쿼츠 통금 시계' }],
  [84, { brand: '제랄드 젠타', modelName: '여성 풀다이아 시계' }],
  [95, { brand: '롤렉스', modelName: '서브마리너 116610' }],
  [99, { brand: '리브토만', modelName: '다이버 헐크 녹판 시계' }]
]);

function rawImageOrder(name) {
  const match = name.match(/ChatGPT Image (\d{4})년 (\d{1,2})월 (\d{1,2})일 (오전|오후) (\d{1,2})_(\d{2})_(\d{2}) \((\d+)\)\.png$/);
  if (!match) return null;
  let hour = Number(match[5]);
  if (match[4] === '오후' && hour !== 12) hour += 12;
  if (match[4] === '오전' && hour === 12) hour = 0;
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, Number(match[6]), Number(match[7]));
  return { timestamp, index: Number(match[8]) };
}

async function fetchBuffer(url, attempt = 1) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 Bellore image audit' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    return fetchBuffer(url, attempt + 1);
  }
}

const progress = JSON.parse(await fs.readFile(progressPath, 'utf8'));
const targets = progress.products.filter((item) => item.sequence >= FROM_SEQUENCE && item.sequence <= TO_SEQUENCE);
const files = (await fs.readdir(SOURCE_ROOT, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && rawImageOrder(entry.name))
  .map((entry) => ({ name: entry.name, ...rawImageOrder(entry.name) }))
  .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);

if (targets.length !== TO_SEQUENCE - FROM_SEQUENCE + 1) throw new Error(`Expected target count mismatch: ${targets.length}`);
if (files.length !== targets.length) throw new Error(`Expected ${targets.length} raw images, found ${files.length}`);

await fs.mkdir(sheetRoot, { recursive: true });
const matches = [];
for (let i = 0; i < targets.length; i += 1) {
  const target = targets[i];
  const file = files[i];
  const sourceUrl = target.sourcePost?.images?.[0];
  if (!sourceUrl) throw new Error(`Missing source image for sequence ${target.sequence}`);
  const [front, source] = await Promise.all([
    sharp(path.join(SOURCE_ROOT, file.name)).rotate().resize(470, 470, { fit: 'contain', background: '#ffffff' }).png().toBuffer(),
    fetchBuffer(sourceUrl).then((buffer) => sharp(buffer).rotate().resize(470, 470, { fit: 'contain', background: '#ffffff' }).png().toBuffer())
  ]);
  matches.push({ target, file, front, source });
}

for (let sheetIndex = 0; sheetIndex < Math.ceil(matches.length / 10); sheetIndex += 1) {
  const rows = matches.slice(sheetIndex * 10, sheetIndex * 10 + 10);
  const width = 1000;
  const rowHeight = 540;
  const composites = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const { target, front, source } = rows[rowIndex];
    const label = `${target.sequence}. ${target.brand} ${target.modelName}`.replace(/[&<>]/g, '');
    const svg = Buffer.from(`<svg width="${width}" height="60"><rect width="100%" height="100%" fill="#f3f1ec"/><text x="16" y="39" font-size="25" font-family="Arial, sans-serif" fill="#111">${label}</text><text x="520" y="39" font-size="18" font-family="Arial, sans-serif" fill="#555">JSON 첫 실물 사진</text></svg>`);
    composites.push({ input: svg, left: 0, top: rowIndex * rowHeight });
    composites.push({ input: front, left: 10, top: rowIndex * rowHeight + 65 });
    composites.push({ input: source, left: 520, top: rowIndex * rowHeight + 65 });
  }
  await sharp({ create: { width, height: rows.length * rowHeight, channels: 3, background: '#ffffff' } })
    .composite(composites).jpeg({ quality: 88 })
    .toFile(path.join(sheetRoot, `sheet-${String(sheetIndex + 1).padStart(2, '0')}.jpg`));
}

if (APPLY) {
  const crypto = await import('node:crypto');
  const backupPath = path.join(SOURCE_ROOT, `bellore-watch-products-progress.before-${FROM_SEQUENCE}-${TO_SEQUENCE}-match.json`);
  await fs.copyFile(progressPath, backupPath);
  for (const { target, file } of matches) {
    const previousProductImageFile = target.productImageFile;
    const correction = PRODUCT_CORRECTIONS.get(target.sequence);
    if (correction) Object.assign(target, correction);
    const price = Number(target.sourcePost?.price || 0);
    const safeName = `초가을_${target.brand}_${target.modelName}_${price.toLocaleString('en-US')}원.png`;
    const sourcePath = path.join(SOURCE_ROOT, file.name);
    const renamedPath = path.join(SOURCE_ROOT, safeName);
    await fs.copyFile(sourcePath, renamedPath);
    const data = await fs.readFile(renamedPath);
    if (previousProductImageFile && previousProductImageFile !== safeName) {
      const previousPath = path.join(SOURCE_ROOT, previousProductImageFile);
      try {
        const previousData = await fs.readFile(previousPath);
        if (crypto.createHash('sha256').update(previousData).digest('hex') === crypto.createHash('sha256').update(data).digest('hex')) {
          await fs.unlink(previousPath);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    target.registrationStatus = 'completed';
    target.productImageFile = safeName;
    target.imageMatch = {
      originalFileName: file.name,
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
      method: 'generation batch order plus side-by-side source photo visual verification',
      confidence: 'high'
    };
  }
  progress.counts.completed = progress.products.filter((item) => item.registrationStatus === 'completed').length;
  progress.counts.pendingImage = progress.products.filter((item) => item.registrationStatus === 'pending_image').length;
  progress.updatedAt = new Date().toISOString();
  await fs.writeFile(progressPath, JSON.stringify(progress, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify({
  mode: APPLY ? 'applied' : 'audit-only',
  range: [FROM_SEQUENCE, TO_SEQUENCE],
  matched: matches.length,
  first: { file: files[0].name, product: `${targets[0].brand} ${targets[0].modelName}` },
  last: { file: files.at(-1).name, product: `${targets.at(-1).brand} ${targets.at(-1).modelName}` },
  sheetRoot
}, null, 2));
