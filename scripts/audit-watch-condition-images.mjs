import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_ROOT = process.argv[2] || 'C:/Users/LS/Desktop/새 폴더';
const OUTPUT_ROOT = process.argv[3] || path.join(os.tmpdir(), 'bellore-watch-condition-audit-1-110');
const progress = JSON.parse(await fs.readFile(path.join(SOURCE_ROOT, 'bellore-watch-products-progress.json'), 'utf8'));
const manifests = await Promise.all([
  fs.readFile(path.join(REPO_ROOT, 'data', 'watch-batch-20260821.json'), 'utf8').then(JSON.parse),
  fs.readFile(path.join(REPO_ROOT, 'data', 'watch-batch-20260821-2.json'), 'utf8').then(JSON.parse)
]);
const manifestBySequence = new Map(manifests.flatMap((manifest) => manifest.products).map((product) => [product.sequence, product]));

function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function localImages(item) {
  const manifest = manifestBySequence.get(item.sequence);
  if (!manifest) {
    return item.sourcePost?.images || [];
  }
  const batch = item.sequence <= 70 ? 'watch-batch-20260821' : 'watch-batch-20260821-2';
  const folderUrl = manifest.imageUrls.find((url) => /\/front\.webp$/.test(url));
  const folder = folderUrl.split('/').at(-2);
  return manifest.imageUrls.slice(1).map((url) => path.join(REPO_ROOT, 'assets', 'products', batch, folder, url.split('/').at(-1)));
}

async function tile(imagePath, width, height) {
  let input = imagePath;
  if (/^https?:\/\//.test(imagePath)) {
    const response = await fetch(imagePath, { headers: { 'user-agent': 'Mozilla/5.0 Bellore condition audit' } });
    if (!response.ok) throw new Error(`Image request failed: ${response.status} ${imagePath}`);
    input = Buffer.from(await response.arrayBuffer());
  }
  return sharp(input).rotate().resize(width, height, { fit: 'contain', background: '#f5f3ef' }).jpeg({ quality: 88 }).toBuffer();
}

await fs.mkdir(OUTPUT_ROOT, { recursive: true });
const products = progress.products.filter((item) => item.sequence >= 1 && item.sequence <= 110);
for (let sheetIndex = 0; sheetIndex < Math.ceil(products.length / 10); sheetIndex += 1) {
  const items = products.slice(sheetIndex * 10, sheetIndex * 10 + 10);
  const width = 1500;
  const cellWidth = 750;
  const cellHeight = 430;
  const composites = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const images = localImages(item);
    const selected = images.length > 1 ? [images[0], images.at(-1)] : [images[0], images[0]];
    const [first, last] = await Promise.all(selected.map((image) => tile(image, 345, 345)));
    const column = index % 2;
    const row = Math.floor(index / 2);
    const left = column * cellWidth;
    const top = row * cellHeight;
    const label = `${item.sequence}. ${item.brand} ${item.modelName}`;
    const svg = Buffer.from(`<svg width="${cellWidth}" height="75"><rect width="100%" height="100%" fill="#e9e5dc"/><text x="15" y="32" font-size="25" font-family="Arial, sans-serif" fill="#111">${escapeXml(label)}</text><text x="15" y="60" font-size="19" font-family="Arial, sans-serif" fill="#555">첫 실사 / 마지막 실사 · 외관 점수 6~9 검토</text></svg>`);
    composites.push({ input: svg, left, top });
    composites.push({ input: first, left: left + 15, top: top + 78 });
    composites.push({ input: last, left: left + 390, top: top + 78 });
  }
  const height = Math.ceil(items.length / 2) * cellHeight;
  await sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(path.join(OUTPUT_ROOT, `sheet-${String(sheetIndex + 1).padStart(2, '0')}.jpg`));
}

console.log(JSON.stringify({ products: products.length, sheets: Math.ceil(products.length / 10), outputRoot: OUTPUT_ROOT }, null, 2));
