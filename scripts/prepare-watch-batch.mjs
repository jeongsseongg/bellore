import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const SOURCE_ROOT = process.argv[2] || 'C:/Users/LS/Desktop/새 폴더';
const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC_ROOT = 'https://bellore.co.kr';
const BATCH_NAME = 'watch-batch-20260821';
const ASSET_ROOT = path.join(REPO_ROOT, 'assets', 'products', BATCH_NAME);
const MANIFEST_PATH = path.join(REPO_ROOT, 'data', `${BATCH_NAME}.json`);
const SHEET_ROOT = path.join(os.tmpdir(), 'bellore-watch-contact-sheets');

const progress = JSON.parse(await fs.readFile(path.join(SOURCE_ROOT, 'bellore-watch-products-progress.json'), 'utf8'));
const targets = progress.products.filter((item) => item.sequence >= 2 && item.sequence <= 70 && item.registrationStatus === 'completed');
if (targets.length !== 69) throw new Error(`Expected 69 targets, found ${targets.length}`);

await fs.mkdir(ASSET_ROOT, { recursive: true });
await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
await fs.mkdir(SHEET_ROOT, { recursive: true });

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sourcePrice(item) {
  const direct = Number(item.sourcePost?.price || 0);
  if (direct > 0) return direct;
  const match = String(item.productImageFile || '').match(/_([0-9,]+)원\.[^.]+$/);
  return match ? Number(match[1].replaceAll(',', '')) : 0;
}

function extractSize(text) {
  const matches = [...text.matchAll(/(?:^|\D)(\d{2}(?:\.\d)?)\s*(?:mm|미리|밀리)/gi)];
  for (const match of matches) {
    const size = Math.round(Number(match[1]));
    if (size >= 15 && size <= 55) return size;
  }
  return null;
}

function extractYear(text) {
  const match = text.match(/\b(19\d{2}|20\d{2})\s*년?/);
  return match ? match[1] : '';
}

function extractReference(text) {
  const labeled = text.match(/(?:레퍼런스|레퍼런스번호|레퍼런스 번호|ref\.?|모델번호|모델 번호)\s*[:#-]?\s*([A-Z0-9./-]{4,18})/i);
  if (labeled) return labeled[1];
  const candidates = text.match(/\b(?=[A-Z0-9-]{5,15}\b)(?=[A-Z0-9-]*\d{3})[A-Z0-9-]+\b/gi) || [];
  return candidates.find((value) => !/^20\d{2}$/.test(value) && !/^\d{2}$/.test(value)) || '';
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function inferAccessories(text) {
  const values = [];
  if (includesAny(text, ['풀박스', '박스', '시계 상자', '상자'])) values.push('박스');
  if (includesAny(text, ['케이스'])) values.push('케이스');
  if (includesAny(text, ['보증서', '개런티', '게런티']) && !/(보증서|개런티|게런티)\s*(빠진|없|무|미포함)/.test(text)) values.push('보증서');
  if (includesAny(text, ['책자', '설명서'])) values.push('책자');
  if (includesAny(text, ['여분줄', '여분 링크', '여분코'])) values.push('여분줄');
  if (includesAny(text, ['파우치'])) values.push('파우치');
  if (includesAny(text, ['버클'])) values.push('버클');
  return [...new Set(values)];
}

function inferMovement(text) {
  if (includesAny(text, ['스프링드라이브', '스프링 드라이브'])) return '스프링 드라이브';
  if (includesAny(text, ['오토매틱', '자동식', '자동 무브'])) return '오토매틱';
  if (includesAny(text, ['쿼츠', 'Quartz', 'quartz'])) return '쿼츠';
  if (includesAny(text, ['수동식', '수동 무브', '수동'])) return '수동';
  return '';
}

function inferDial(text) {
  const colors = [
    ['청판', '블루'], ['검판', '블랙'], ['흰판', '화이트'], ['은판', '실버'],
    ['녹판', '그린'], ['회판', '그레이'], ['자개', '자개'], ['샴페인', '샴페인'],
    ['브라운', '브라운'], ['핑크', '핑크'], ['레드', '레드']
  ];
  const found = colors.filter(([needle]) => text.includes(needle)).map(([, label]) => label);
  return [...new Set(found)].join(' · ');
}

function inferMaterial(text) {
  const values = [];
  if (includesAny(text, ['스틸', '스테인리스'])) values.push('스테인리스 스틸');
  if (includesAny(text, ['화이트골드', '화이트 골드', 'WG'])) values.push('화이트 골드');
  if (includesAny(text, ['옐로골드', '옐로 골드', 'YG'])) values.push('옐로 골드');
  if (includesAny(text, ['로즈골드', '로즈 골드', '핑크골드', '핑크 골드', 'RG'])) values.push('로즈 골드');
  if (includesAny(text, ['티타늄'])) values.push('티타늄');
  if (includesAny(text, ['세라믹'])) values.push('세라믹');
  if (includesAny(text, ['러버'])) values.push('러버');
  if (includesAny(text, ['가죽'])) values.push('가죽');
  return [...new Set(values)].join(' · ');
}

function hasWarranty(text) {
  const hasWord = /(보증서|개런티|게런티)/.test(text);
  const negative = /(보증서|개런티|게런티)\s*(빠진|없|무|미포함)|보증서가\s*없/.test(text);
  return hasWord && !negative;
}

function initialConditionScore(text) {
  if (/(찍힘|큰\s*흠집|파손|크랙|깨짐|심한\s*스크래치|사용감\s*많)/.test(text)) return 7;
  if (/(미사용|미착용|새상품|신품)/.test(text)) return 10;
  if (/(상태\s*(?:매우\s*)?좋|깨끗|잔기스\s*외|생활기스\s*외|민트급)/.test(text)) return 9;
  return 8;
}

function uploadDate(index, total) {
  const start = Date.parse('2026-05-01T03:00:00+09:00');
  const end = Date.parse('2026-08-21T11:30:00+09:00');
  return new Date(start + ((end - start) * index / Math.max(1, total - 1))).toISOString();
}

async function sha256(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function fetchBuffer(url, attempt = 1) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 Bellore product archive' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (attempt >= 3) throw new Error(`Download failed after 3 attempts: ${url} (${error.message})`);
    await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    return fetchBuffer(url, attempt + 1);
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const manifest = [];
for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
  const item = targets[targetIndex];
  const source = item.sourcePost || {};
  const id = String(source.id || `sequence-${item.sequence}`);
  const folderName = `${String(item.sequence).padStart(3, '0')}-${id}`;
  const outDir = path.join(ASSET_ROOT, folderName);
  await fs.mkdir(outDir, { recursive: true });

  const frontPath = path.join(SOURCE_ROOT, item.productImageFile);
  const expectedHash = item.imageMatch?.sha256 || '';
  if (expectedHash && await sha256(frontPath) !== expectedHash) throw new Error(`Front image hash mismatch: ${item.productImageFile}`);
  await sharp(frontPath).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toFile(path.join(outDir, 'front.webp'));

  const originals = Array.isArray(source.images) ? source.images : [];
  await mapLimit(originals, 4, async (url, imageIndex) => {
    const output = path.join(outDir, `${String(imageIndex + 1).padStart(2, '0')}.webp`);
    const buffer = await fetchBuffer(url);
    await sharp(buffer).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toFile(output);
  });

  const text = cleanText(`${source.title || ''} ${source.description || ''}`);
  const accessories = inferAccessories(text);
  const rawPrice = sourcePrice(item);
  const assetBase = `${PUBLIC_ROOT}/assets/products/${BATCH_NAME}/${folderName}`;
  manifest.push({
    sequence: item.sequence,
    sourceId: id,
    sourceProfile: item.sourceProfile,
    sourceFile: item.sourceFile,
    sourceTitle: source.title || '',
    sourceDescription: source.description || '',
    productNo: `K${2167 + item.sequence}`,
    brand: item.brand,
    modelName: item.modelName,
    referenceNo: extractReference(text),
    sourcePrice: rawPrice,
    sellingPrice: Math.round(rawPrice * 1.1),
    conditionScore: initialConditionScore(text),
    condition: initialConditionScore(text) === 10 ? '미사용 새상품' : `중고 ${initialConditionScore(text)}/10`,
    conditionNotes: initialConditionScore(text) === 10 ? '미사용 새상품입니다.' : `착용 이력이 있는 중고 상품입니다.\n사진 기준 상태 ${initialConditionScore(text)}/10`,
    hasWarranty: hasWarranty(text),
    hasDiamond: /다이아|diamond/i.test(text),
    sizeMm: extractSize(text),
    stamping: extractYear(text),
    dialColor: inferDial(text),
    material: inferMaterial(text),
    movement: inferMovement(text),
    accessories: accessories.join(' · '),
    pack: /풀박스/.test(text) ? '풀박스' : (accessories.length ? '일부 구성' : '구성품 정보없음'),
    setGrade: `${accessories.length ? accessories.join(' · ') : '구성품 정보없음'} / 등급 정보없음`,
    createdAt: uploadDate(targetIndex, targets.length),
    imageUrls: [`${assetBase}/front.webp`, ...originals.map((_, imageIndex) => `${assetBase}/${String(imageIndex + 1).padStart(2, '0')}.webp`)]
  });
  process.stdout.write(`Prepared ${targetIndex + 1}/${targets.length}: ${item.brand} ${item.modelName}\n`);
}

await fs.writeFile(MANIFEST_PATH, JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceProgress: path.basename('bellore-watch-products-progress.json'),
  range: { fromSequence: 2, toSequence: 70, count: manifest.length },
  productNumberRange: { first: manifest[0].productNo, last: manifest.at(-1).productNo },
  pricingRule: 'sourcePrice * 1.10, rounded to nearest won',
  products: manifest
}, null, 2) + '\n', 'utf8');

// 검수용: 상품당 누끼+앞쪽 실물 3장을 한 타일에 묶어 12개씩 시트 생성
for (let sheetIndex = 0; sheetIndex < Math.ceil(manifest.length / 12); sheetIndex += 1) {
  const products = manifest.slice(sheetIndex * 12, sheetIndex * 12 + 12);
  const tileWidth = 720;
  const tileHeight = 250;
  const composites = [];
  for (let productIndex = 0; productIndex < products.length; productIndex += 1) {
    const product = products[productIndex];
    const folderName = `${String(product.sequence).padStart(3, '0')}-${product.sourceId}`;
    const files = ['front.webp', '01.webp', '02.webp', '03.webp'];
    for (let imageIndex = 0; imageIndex < files.length; imageIndex += 1) {
      const filePath = path.join(ASSET_ROOT, folderName, files[imageIndex]);
      try {
        const buffer = await sharp(filePath).resize(170, 190, { fit: 'contain', background: '#ffffff' }).toBuffer();
        composites.push({ input: buffer, left: (imageIndex * 175) + 10, top: (productIndex * tileHeight) + 45 });
      } catch {}
    }
    const label = `${product.sequence}. ${product.brand} ${product.modelName} | ${product.condition}`.replace(/[&<>]/g, '');
    const svg = Buffer.from(`<svg width="${tileWidth}" height="40"><rect width="100%" height="100%" fill="#f3f1ec"/><text x="12" y="27" font-size="18" font-family="Arial, sans-serif" fill="#111">${label}</text></svg>`);
    composites.push({ input: svg, left: 0, top: productIndex * tileHeight });
  }
  await sharp({ create: { width: 720, height: products.length * tileHeight, channels: 3, background: '#ffffff' } })
    .composite(composites)
    .jpeg({ quality: 86 })
    .toFile(path.join(SHEET_ROOT, `sheet-${String(sheetIndex + 1).padStart(2, '0')}.jpg`));
}

const totalBytes = (await Promise.all((await fs.readdir(ASSET_ROOT, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map(async (entry) => (await fs.stat(path.join(entry.parentPath, entry.name))).size)))
  .reduce((sum, value) => sum + value, 0);

console.log(JSON.stringify({
  prepared: manifest.length,
  firstProductNo: manifest[0].productNo,
  lastProductNo: manifest.at(-1).productNo,
  imageCount: manifest.reduce((sum, item) => sum + item.imageUrls.length, 0),
  assetMegabytes: Math.round(totalBytes / 1024 / 1024 * 100) / 100,
  manifestPath: MANIFEST_PATH,
  contactSheetRoot: SHEET_ROOT
}, null, 2));
