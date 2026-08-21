import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_ROOT = process.argv[2] || 'C:/Users/LS/Desktop/새 폴더';
const APPLY = process.argv.includes('--apply');
const TODAY = '2026-08-21';
const OLD_PRODUCT_NO = (sequence) => `K${2167 + sequence}`;

const SCORE_VALUES = `
1:8 2:7 3:8 4:7 5:7 6:9 7:9 8:8 9:8 10:9
11:7 12:7 13:8 14:8 15:7 16:7 17:6 18:8 19:9 20:8
21:8 22:6 23:7 24:8 25:8 26:8 27:6 28:9 29:7 30:8
31:7 32:7 33:8 34:8 35:7 36:7 37:7 38:9 39:6 40:7
41:8 42:8 43:6 44:7 45:7 46:7 47:6 48:7 49:7 50:6
51:8 52:8 53:7 54:8 55:6 56:9 57:9 58:7 59:9 60:7
61:9 62:8 63:8 64:8 65:7 66:8 67:8 68:7 69:6 70:6
71:6 72:7 73:6 74:7 75:8 76:7 77:6 78:7 79:8 80:8
81:7 82:7 83:6 84:8 85:9 86:7 87:6 88:7 89:6 90:7
91:6 92:9 93:7 94:8 95:9 96:9 97:6 98:8 99:9 100:6
101:7 102:7 103:8 104:7 105:8 106:8 107:7 108:8 109:8 110:8
`;
const SCORES = new Map(SCORE_VALUES.trim().split(/\s+/).map((pair) => pair.split(':').map(Number)));
const HEAVY_STRAP = new Set([22, 55, 69, 71, 73, 77, 83, 89, 91, 97]);
const HEAVY_METAL = new Set([17, 27, 39, 43, 47, 50, 70, 87, 100]);

const BRAND_CODES = new Map(Object.entries({
  '롤렉스': 'ROL', '오메가': 'OME', '까르띠에': 'CAR', '불가리': 'BVL',
  '브라이틀링': 'BRT', '그랜드세이코': 'GRS', '로저드뷔': 'RDU', '태그호이어': 'TAG',
  '해밀턴': 'HAM', '미도': 'MID', '코럼': 'COR', '브레게': 'BRG', '위블로': 'HUB',
  '론진': 'LON', '샤넬': 'CHA', '몽블랑': 'MON', '파네라이': 'PAN', '에르메스': 'HER',
  '파텍필립': 'PAT', '블랑팡': 'BLP', '보메 메르시에': 'BME', '제니스': 'ZEN',
  '브랜드미상': 'UNK', '프랭크뮬러': 'FRM', '부쉐러': 'BUC', '제랄드 젠타': 'GGE',
  '리브토만': 'RTH', '오리스': 'ORI'
}));

function scoreReason(sequence, score) {
  if (score === 9) return '실사 기준 눈에 띄는 큰 흠집이 적고 케이스·베젤·브레이슬릿의 전체 외관이 매우 깔끔합니다.';
  if (score === 8) return '실사 기준 전체 외관은 깔끔하며 케이스·베젤 또는 브레이슬릿에 가벼운 생활 스크래치가 보입니다.';
  if (score === 7) return '실사 기준 케이스·베젤과 브레이슬릿 또는 스트랩에 뚜렷한 사용감과 스크래치가 확인됩니다.';
  if (HEAVY_STRAP.has(sequence)) return '실사 기준 가죽 스트랩의 주름·마모와 케이스의 빈티지 사용감이 뚜렷하게 확인됩니다.';
  if (HEAVY_METAL.has(sequence)) return '실사 기준 케이스백과 브레이슬릿 전반에 반복된 스크래치와 마모가 확인됩니다.';
  return '실사 기준 빈티지 노화와 케이스·브레이슬릿 또는 스트랩의 넓은 스크래치·마모가 확인됩니다.';
}

function deterministicDate(sourceId) {
  const start = Date.UTC(2026, 0, 1);
  const end = Date.UTC(2026, 7, 20);
  const days = Math.floor((end - start) / 86400000) + 1;
  const digest = crypto.createHash('sha256').update(`bellore-date:${sourceId}`).digest();
  const dayOffset = digest.readUInt32BE(0) % days;
  const hour = 9 + (digest[4] % 12);
  const minute = digest[5] % 60;
  const second = digest[6] % 60;
  const kstDay = new Date(start + dayOffset * 86400000);
  const year = kstDay.getUTCFullYear();
  const month = kstDay.getUTCMonth() + 1;
  const day = kstDay.getUTCDate();
  const utc = Date.UTC(year, month - 1, day, hour - 9, minute, second);
  return { localDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, createdAt: new Date(utc).toISOString() };
}

function todayDate(sequence) {
  const hour = 9 + ((sequence * 7) % 12);
  const minute = (sequence * 13) % 60;
  const second = (sequence * 17) % 60;
  return { localDate: TODAY, createdAt: new Date(Date.UTC(2026, 7, 21, hour - 9, minute, second)).toISOString() };
}

function compactDate(localDate) {
  const [year, month, day] = localDate.split('-').map(Number);
  return `${day}${String(year).slice(-2)}${month}`;
}

const progressPath = path.join(SOURCE_ROOT, 'bellore-watch-products-progress.json');
const manifestPaths = [
  path.join(REPO_ROOT, 'data', 'watch-batch-20260821.json'),
  path.join(REPO_ROOT, 'data', 'watch-batch-20260821-2.json')
];
const progress = JSON.parse(await fs.readFile(progressPath, 'utf8'));
const manifests = await Promise.all(manifestPaths.map(async (manifestPath) => ({
  path: manifestPath,
  data: JSON.parse(await fs.readFile(manifestPath, 'utf8'))
})));
const manifestBySequence = new Map(manifests.flatMap(({ data }) => data.products).map((product) => [product.sequence, product]));
const items = progress.products.filter((item) => item.sequence >= 1 && item.sequence <= 110);
if (items.length !== 110 || SCORES.size !== 110) throw new Error(`Expected 110 products and scores, got ${items.length}/${SCORES.size}`);

const updates = items.map((item) => {
  const manifest = manifestBySequence.get(item.sequence);
  const brand = manifest?.brand || item.brand;
  const modelName = manifest?.modelName || item.modelName;
  const sourceId = manifest?.sourceId || item.sourcePost?.id || String(item.sequence);
  const pack = manifest?.pack || item.siteRegistration?.pack || '';
  const fullSet = pack === '풀세트' || /(풀셋|풀세트)/.test(`${item.sourcePost?.title || ''} ${item.sourcePost?.description || ''}`);
  const date = fullSet ? todayDate(item.sequence) : deterministicDate(sourceId);
  const score = SCORES.get(item.sequence);
  const reason = scoreReason(item.sequence, score);
  const brandCode = BRAND_CODES.get(brand);
  if (!brandCode) throw new Error(`Missing brand code: ${brand}`);
  return { sequence: item.sequence, sourceId, brand, brandCode, modelName, fullSet, score, reason, ...date };
});

const byDate = new Map();
for (const update of updates) {
  if (!byDate.has(update.localDate)) byDate.set(update.localDate, []);
  byDate.get(update.localDate).push(update);
}
for (const sameDay of byDate.values()) {
  sameDay.sort((a, b) => a.sequence - b.sequence);
  sameDay.forEach((update, index) => {
    update.dayRank = index + 1;
    update.oldProductNo = OLD_PRODUCT_NO(update.sequence);
    update.productNo = `${update.brandCode}-N${compactDate(update.localDate)}-${update.dayRank}`;
    update.condition = `중고 ${update.score}/10`;
    update.conditionNotes = `착용 이력이 있는 중고 상품입니다.\n사진 기준 상태 ${update.score}/10\n평가 근거: ${update.reason}`;
  });
}

if (new Set(updates.map((update) => update.productNo)).size !== 110) throw new Error('Generated product numbers are not unique');
const updateBySequence = new Map(updates.map((update) => [update.sequence, update]));

for (const { data } of manifests) {
  for (const product of data.products) {
    const update = updateBySequence.get(product.sequence);
    product.previousProductNo ||= product.productNo;
    product.productNo = update.productNo;
    product.brandCode = update.brandCode;
    product.conditionScore = update.score;
    product.condition = update.condition;
    product.conditionReason = update.reason;
    product.conditionNotes = update.conditionNotes;
    product.createdAt = update.createdAt;
  }
  data.productNumberRule = 'BRAND-N(day)(2-digit year)(month)-same-day rank; no zero padding for day/month/rank';
  data.registrationDateRule = 'full-set watches: 2026-08-21 KST; all others: deterministic random dates from 2026-01-01 through 2026-08-20 KST';
  data.conditionRule = 'visual review of first and last real-item photos; used condition scored 6-9 with per-product reason';
  data.regradedAt = new Date().toISOString();
  data.productNumberRange = { first: data.products[0].productNo, last: data.products.at(-1).productNo };
}

for (const item of items) {
  const update = updateBySequence.get(item.sequence);
  item.catalogUpdate = {
    previousProductNo: item.catalogUpdate?.previousProductNo || item.siteRegistration?.productNo || update.oldProductNo,
    productNo: update.productNo,
    brandCode: update.brandCode,
    conditionScore: update.score,
    conditionReason: update.reason,
    createdAt: update.createdAt,
    fullSetRegisteredToday: update.fullSet
  };
  if (item.siteRegistration) {
    item.siteRegistration.productNo = update.productNo;
    item.siteRegistration.condition = update.condition;
  }
}
progress.updatedAt = new Date().toISOString();
progress.productNumberRule = '브랜드코드-N일년월-같은날순번(1~999), 일·월·순번 앞자리 0 없음';
progress.conditionRule = '실사 이미지 기준 중고 6~9점, 최대 9점, 상품별 평가 근거 기록';
progress.registrationDateRule = '풀세트만 2026-08-21, 나머지는 2026-01-01~2026-08-20 분산';
progress.siteRegistration.firstProductNo = updates[0].productNo;
progress.siteRegistration.lastProductNo = updates.at(-1).productNo;

const sqlRows = updates.map((update) => ({
  old_product_no: update.oldProductNo,
  new_product_no: update.productNo,
  condition: update.condition,
  condition_notes: update.conditionNotes,
  created_at: update.createdAt
}));
const sql = `-- Bellore 110-watch condition regrade, SKU renumbering, and registration-date redistribution\n` +
`with changes as (\n` +
`  select * from jsonb_to_recordset($bellore$${JSON.stringify(sqlRows)}$bellore$::jsonb) as x(\n` +
`    old_product_no text, new_product_no text, condition text, condition_notes text, created_at timestamptz\n` +
`  )\n` +
`)\n` +
`update public.listings l\n` +
`set product_no = c.new_product_no, condition = c.condition, condition_notes = c.condition_notes,\n` +
`    created_at = c.created_at, sale_started_at = c.created_at, updated_at = now()\n` +
`from changes c\n` +
`where l.product_no = c.old_product_no\n` +
`returning l.id, c.old_product_no, l.product_no, l.condition, l.condition_notes, l.created_at;\n\n` +
`select count(*) as updated_count, count(distinct product_no) as unique_product_numbers,\n` +
`  count(*) filter (where condition = '중고 6/10') as score6,\n` +
`  count(*) filter (where condition = '중고 7/10') as score7,\n` +
`  count(*) filter (where condition = '중고 8/10') as score8,\n` +
`  count(*) filter (where condition = '중고 9/10') as score9\n` +
`from public.listings where product_no in (select jsonb_array_elements_text($bellore$${JSON.stringify(updates.map((update) => update.productNo))}$bellore$::jsonb));\n`;

const audit = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  rules: {
    productNumber: 'BRAND-N(day)(2-digit year)(month)-same-day rank; no zero padding',
    fullSetDate: TODAY,
    otherDateRange: ['2026-01-01', '2026-08-20'],
    condition: 'visual exterior review, 6-9 points, maximum 9'
  },
  counts: {
    products: updates.length,
    fullSetToday: updates.filter((update) => update.fullSet).length,
    score6: updates.filter((update) => update.score === 6).length,
    score7: updates.filter((update) => update.score === 7).length,
    score8: updates.filter((update) => update.score === 8).length,
    score9: updates.filter((update) => update.score === 9).length
  },
  products: updates
};

if (APPLY) {
  const backupPath = path.join(SOURCE_ROOT, 'bellore-watch-products-progress.before-regrade-renumber-20260821.json');
  await fs.copyFile(progressPath, backupPath);
  await Promise.all(manifests.map(({ path: manifestPath, data }) => fs.writeFile(manifestPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')));
  await fs.writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(REPO_ROOT, 'data', 'watch-catalog-regrade-20260821.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(REPO_ROOT, 'scripts', 'generated', 'watch-catalog-regrade-20260821.sql'), sql, 'utf8');
}

console.log(JSON.stringify({ mode: APPLY ? 'applied' : 'preview', ...audit.counts, first: updates[0], last: updates.at(-1), uniqueDates: byDate.size }, null, 2));
