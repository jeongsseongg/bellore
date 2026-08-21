import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BATCH_NAME = 'watch-batch-20260821-3';
const MANIFEST_PATH = path.join(REPO_ROOT, 'data', `${BATCH_NAME}.json`);
const EXISTING_AUDIT_PATH = path.join(REPO_ROOT, 'data', 'watch-catalog-regrade-20260821.json');
const COMBINED_AUDIT_PATH = path.join(REPO_ROOT, 'data', 'watch-catalog-audit-20260821-158.json');
const SQL_PATH = path.join(REPO_ROOT, 'scripts', 'generated', `${BATCH_NAME}.sql`);
const OWNER_ID = '8ae9c0a1-065a-488b-8b06-7ac1a8fd10b1';

const SCORE_VALUES = `
111:9 112:8 113:7 114:8 115:7 116:8 117:8 118:8 119:9 120:8
121:7 122:8 123:9 124:8 125:6 126:9 127:8 128:8 129:7 130:7
131:9 132:8 133:8 134:7 135:7 136:6 137:7 138:6 139:7 140:6
141:7 142:7 143:7 144:7 145:6 146:7 147:7 148:6 149:7 150:8
151:8 152:6 153:8 154:7 155:9 156:7 157:7 158:8
`;
const SCORES = new Map(SCORE_VALUES.trim().split(/\s+/).map((pair) => pair.split(':').map(Number)));
const REASONS = new Map([
  [111, '케이스·베젤·브레이슬릿에 큰 흠집이 거의 없고 전체 광택과 모서리가 매우 깔끔합니다.'],
  [112, '케이스 측면과 브레이슬릿에 가벼운 생활 스크래치가 보이지만 전체 외관은 깔끔합니다.'],
  [113, '가죽 스트랩의 주름과 버클 사용감이 뚜렷하고 케이스에 생활 스크래치가 보입니다.'],
  [114, '베젤과 브레이슬릿에 가벼운 헤어라인이 있으나 다이얼과 케이스 외관은 깔끔합니다.'],
  [115, '가죽 스트랩의 눌림·주름과 케이스 측면의 사용감이 확인됩니다.'],
  [116, '가죽 스트랩에 가벼운 주름이 있고 케이스에 미세한 생활 스크래치가 보입니다.'],
  [117, '케이스 측면과 가죽 스트랩에 가벼운 사용감이 있으나 전체적으로 단정합니다.'],
  [118, '러버 스트랩과 케이스 측면에 가벼운 사용 흔적이 있으나 외관은 깔끔합니다.'],
  [119, '케이스와 베젤에 눈에 띄는 큰 흠집이 적고 스트랩 상태도 매우 깔끔합니다.'],
  [120, '베젤·케이스에 가벼운 생활 스크래치가 있으나 러버 스트랩과 전체 외관은 양호합니다.'],
  [121, '빈티지 브레이슬릿과 케이스 전반에 사용감과 잔스크래치가 확인됩니다.'],
  [122, '콤비 브레이슬릿과 베젤에 가벼운 생활 스크래치가 있으나 전체 외관은 양호합니다.'],
  [123, '케이스·베젤·브레이슬릿에 큰 흠집이 적고 전체 외관이 매우 깔끔합니다.'],
  [124, '가죽 스트랩에 가벼운 주름이 있고 금통 케이스에 미세한 생활 스크래치가 보입니다.'],
  [125, '빈티지 다이얼 노화와 케이스·브레이슬릿의 반복된 스크래치 및 마모가 뚜렷합니다.'],
  [126, '금통 케이스와 브레이슬릿에 큰 흠집이 적고 전체 광택이 매우 깔끔합니다.'],
  [127, '베젤과 브레이슬릿에 가벼운 헤어라인이 있으나 전체 외관은 깔끔합니다.'],
  [128, '콤비 브레이슬릿과 케이스에 가벼운 생활 스크래치가 있으나 상태가 양호합니다.'],
  [129, '가죽 스트랩의 주름·마모와 케이스 측면의 사용감이 확인됩니다.'],
  [130, '가죽 스트랩의 주름과 케이스·베젤의 생활 스크래치가 뚜렷합니다.'],
  [131, '케이스·베젤·브레이슬릿에 큰 흠집이 거의 없고 전체 외관이 매우 깔끔합니다.'],
  [132, '세라믹 브레이슬릿과 베젤에 미세한 사용 흔적이 있으나 전체적으로 깔끔합니다.'],
  [133, '케이스 측면과 가죽 스트랩에 가벼운 사용감이 있으나 전체 외관은 단정합니다.'],
  [134, '케이스와 브레이슬릿 전반에 뚜렷한 생활 스크래치와 사용감이 확인됩니다.'],
  [135, '가죽 스트랩의 주름·변색과 금통 케이스의 생활 스크래치가 보입니다.'],
  [136, '빈티지 가죽 스트랩의 마모·주름과 케이스의 노화 흔적이 뚜렷합니다.'],
  [137, '브레이슬릿과 케이스에 반복된 생활 스크래치와 사용감이 확인됩니다.'],
  [138, '빈티지 다이얼의 노화와 케이스·스트랩 전반의 마모가 뚜렷합니다.'],
  [139, '빈티지 가죽 스트랩의 주름과 금통 케이스의 생활 스크래치가 확인됩니다.'],
  [140, '빈티지 케이스·브레이슬릿에 넓은 스크래치와 마모가 보이고 다이얼에도 세월감이 있습니다.'],
  [141, '가죽 스트랩의 주름과 케이스 모서리의 생활 스크래치가 확인됩니다.'],
  [142, '빈티지 콤비 브레이슬릿과 케이스 전반에 뚜렷한 사용감과 스크래치가 보입니다.'],
  [143, '빈티지 금통 케이스와 가죽 스트랩에 뚜렷한 사용감과 잔스크래치가 있습니다.'],
  [144, '빈티지 도금 케이스와 가죽 스트랩에 사용감과 가장자리 마모가 확인됩니다.'],
  [145, '빈티지 케이스와 브레이슬릿 전반에 반복된 스크래치·마모와 세월감이 뚜렷합니다.'],
  [146, '콤비 브레이슬릿과 다이아 베젤 주변에 생활 스크래치와 사용감이 확인됩니다.'],
  [147, '가죽 스트랩의 주름·마모와 케이스 측면의 생활 스크래치가 보입니다.'],
  [148, '빈티지 다이얼의 노화, 케이스 가장자리 마모, 스트랩 주름이 뚜렷합니다.'],
  [149, '브레이슬릿과 케이스 전반에 뚜렷한 생활 스크래치와 사용감이 확인됩니다.'],
  [150, '케이스와 브레이슬릿에 가벼운 생활 스크래치가 있으나 전체 외관은 깔끔합니다.'],
  [151, '베젤과 브레이슬릿에 가벼운 생활 스크래치가 있으나 다이얼과 케이스는 양호합니다.'],
  [152, '빈티지 다이얼의 노화와 금통 케이스·브레이슬릿의 마모 및 스크래치가 뚜렷합니다.'],
  [153, '케이스와 가죽 스트랩에 가벼운 사용감이 있으나 전체 외관은 깔끔합니다.'],
  [154, '가죽 스트랩의 주름·마모와 케이스 측면의 생활 스크래치가 확인됩니다.'],
  [155, '케이스·베젤·브레이슬릿에 큰 흠집이 적고 전체 외관이 매우 깔끔합니다.'],
  [156, '빈티지 케이스와 브레이슬릿에 뚜렷한 생활 스크래치와 세월감이 보입니다.'],
  [157, '가죽 스트랩의 주름·마모와 금통 케이스의 생활 스크래치가 확인됩니다.'],
  [158, '베젤과 브레이슬릿에 가벼운 생활 스크래치가 있으나 전체 외관은 깔끔합니다.']
]);

const BRAND_CODES = new Map(Object.entries({
  '롤렉스': 'ROL', '오메가': 'OME', '까르띠에': 'CAR', '브라이틀링': 'BRT',
  '태그호이어': 'TAG', '해밀턴': 'HAM', '프랭크뮬러': 'FRM', '오리스': 'ORI',
  '예거르쿨트르': 'JLC', 'IWC': 'IWC', '샤넬': 'CHA', '세이코': 'SEI',
  '콩코드': 'CON', '피아제': 'PIA', '바쉐론콘스탄틴': 'VAC'
}));

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
  return {
    localDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    createdAt: new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second)).toISOString()
  };
}

function compactDate(localDate) {
  const [year, month, day] = localDate.split('-').map(Number);
  return `${day}${String(year).slice(-2)}${month}`;
}

function warrantyStatus(product) {
  const text = `${product.sourceTitle || ''} ${product.sourceDescription || ''}`.replace(/\s+/g, ' ');
  if (/(보증서|개런티|게런티)\s*(빠진|없|무|미포함)|보증서가\s*없/.test(text)) return false;
  if (/(보증서|개런티|게런티|보증카드)/.test(text) || /(풀셋|풀세트|풀박스)/.test(text)) return true;
  return null;
}

function finalizeAccessories(product, warranty) {
  const values = String(product.accessories || '').split(' · ').filter(Boolean);
  const text = `${product.sourceTitle || ''} ${product.sourceDescription || ''}`;
  if (/(풀셋|풀세트)/.test(text) && !values.includes('풀세트')) values.unshift('풀세트');
  if (/풀박스/.test(text) && !values.includes('풀박스')) values.unshift('풀박스');
  if (warranty === true && !values.includes('보증서')) values.push('보증서');
  return [...new Set(values)];
}

const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
const existingAudit = JSON.parse(await fs.readFile(EXISTING_AUDIT_PATH, 'utf8'));
if (manifest.products.length !== 48 || SCORES.size !== 48 || REASONS.size !== 48) {
  throw new Error(`Expected 48 products/scores/reasons, got ${manifest.products.length}/${SCORES.size}/${REASONS.size}`);
}

const existingMaxRank = new Map();
for (const product of existingAudit.products) {
  existingMaxRank.set(product.localDate, Math.max(existingMaxRank.get(product.localDate) || 0, product.dayRank || 0));
}
const newByDate = new Map();
for (const product of manifest.products) {
  if (product.sequence === 133) product.brand = '까르띠에';
  const date = deterministicDate(product.sourceId);
  Object.assign(product, date);
  if (!newByDate.has(date.localDate)) newByDate.set(date.localDate, []);
  newByDate.get(date.localDate).push(product);
}

for (const [localDate, products] of newByDate) {
  products.sort((a, b) => a.sequence - b.sequence);
  products.forEach((product, index) => {
    const score = SCORES.get(product.sequence);
    const reason = REASONS.get(product.sequence);
    const brandCode = BRAND_CODES.get(product.brand);
    if (!brandCode) throw new Error(`Missing brand code: ${product.brand}`);
    product.previousProductNo = product.productNo;
    product.brandCode = brandCode;
    product.dayRank = (existingMaxRank.get(localDate) || 0) + index + 1;
    product.productNo = `${brandCode}-N${compactDate(localDate)}-${product.dayRank}`;
    product.conditionScore = score;
    product.condition = `중고 ${score}/10`;
    product.conditionReason = reason;
    product.conditionNotes = `착용 이력이 있는 중고 상품입니다.\n사진 기준 상태 ${score}/10\n평가 근거: ${reason}`;
    product.hasWarranty = warrantyStatus(product);
    const accessories = finalizeAccessories(product, product.hasWarranty);
    product.accessories = accessories.join(' · ');
    const text = `${product.sourceTitle || ''} ${product.sourceDescription || ''}`;
    product.pack = /풀박스/.test(text) ? '풀박스' : (/(풀셋|풀세트)/.test(text) ? '풀세트' : (accessories.length ? '일부 구성' : '구성품 정보없음'));
    product.setGrade = `${accessories.length ? accessories.join(' · ') : '구성품 정보없음'} / 등급 정보없음`;
    product.registrationStatus = 'ready';
  });
}

const existingNos = new Set(existingAudit.products.map((product) => product.productNo));
const newNos = manifest.products.map((product) => product.productNo);
if (new Set(newNos).size !== 48 || newNos.some((productNo) => existingNos.has(productNo))) {
  throw new Error('Generated product numbers are not unique across the 158-watch catalog');
}

manifest.finalizedAt = new Date().toISOString();
manifest.productNumberRule = 'BRAND-N(day)(2-digit year)(month)-same-day rank; no zero padding for day/month/rank';
manifest.registrationDateRule = 'deterministic dates from 2026-01-01 through 2026-08-20 KST; no today-registration merchandising';
manifest.conditionRule = 'visual review of real-item photos; used condition scored 6-9 with per-product reason';
manifest.excludedSourceItem = { sourceId: 'yvri53nhkii8', reason: '오데마피게 로얄오크 오프셔 금통 링크 여분코로 시계 상품이 아님' };
manifest.productNumberRange = { first: manifest.products[0].productNo, last: manifest.products.at(-1).productNo };

const rows = manifest.products.map((product) => ({
  product_no: product.productNo, title: product.brand, description: product.modelName,
  price: product.sellingPrice, condition: product.condition, condition_notes: product.conditionNotes,
  has_warranty: product.hasWarranty, has_diamond: product.hasDiamond, size_mm: product.sizeMm,
  stamping: product.stamping || null, dial_color: product.dialColor || null, material: product.material || null,
  reference_no: product.referenceNo || null, accessories: product.accessories || null, pack: product.pack,
  set_grade: product.setGrade, movement: product.movement || null, created_at: product.createdAt,
  image_urls: product.imageUrls, tags: [product.brand, product.modelName].filter(Boolean)
}));

const sql = `-- Bellore ${rows.length}-watch idempotent bulk registration\n` +
`with batch as (\n  select * from jsonb_to_recordset($bellore$${JSON.stringify(rows)}$bellore$::jsonb) as x(\n` +
`    product_no text, title text, description text, price numeric, condition text, condition_notes text,\n` +
`    has_warranty boolean, has_diamond boolean, size_mm integer, stamping text, dial_color text,\n` +
`    material text, reference_no text, accessories text, pack text, set_grade text, movement text,\n` +
`    created_at timestamptz, image_urls text[], tags text[]\n  )\n)\n` +
`insert into public.listings (owner_id, title, description, price, status, image_url, created_at, updated_at, image_urls,\n` +
`  category, tags, condition, has_warranty, accessories, pack, size_mm, sale_started_at, stamping, sale_method,\n` +
`  product_no, ship_info, dial_color, material, has_diamond, reference_no, set_grade, movement, condition_notes)\n` +
`select '${OWNER_ID}'::uuid, b.title, b.description, b.price, 'on_sale', b.image_urls[1], b.created_at, now(), b.image_urls,\n` +
`  '벨로르판매', b.tags, b.condition, b.has_warranty, b.accessories, b.pack, b.size_mm, b.created_at, b.stamping,\n` +
`  '벨로르가 직접 판매하고 결제까지 책임집니다', b.product_no, '결제 후 2~4일 이내 발송', b.dial_color,\n` +
`  b.material, b.has_diamond, b.reference_no, b.set_grade, b.movement, b.condition_notes\n` +
`from batch b where not exists (select 1 from public.listings existing where existing.product_no = b.product_no)\n` +
`returning id, product_no, title, description, price, condition, created_at;\n\n` +
`select count(*) as registered_count, count(distinct product_no) as unique_product_numbers\n` +
`from public.listings where product_no in (select jsonb_array_elements_text($bellore$${JSON.stringify(newNos)}$bellore$::jsonb));\n`;

const combinedAudit = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  rules: { productNumber: manifest.productNumberRule, registrationDate: manifest.registrationDateRule, condition: manifest.conditionRule },
  counts: {
    products: existingAudit.products.length + manifest.products.length,
    score6: [...existingAudit.products, ...manifest.products].filter((p) => (p.score ?? p.conditionScore) === 6).length,
    score7: [...existingAudit.products, ...manifest.products].filter((p) => (p.score ?? p.conditionScore) === 7).length,
    score8: [...existingAudit.products, ...manifest.products].filter((p) => (p.score ?? p.conditionScore) === 8).length,
    score9: [...existingAudit.products, ...manifest.products].filter((p) => (p.score ?? p.conditionScore) === 9).length
  },
  excluded: [manifest.excludedSourceItem],
  products: [...existingAudit.products, ...manifest.products.map((product) => ({
    sequence: product.sequence, sourceId: product.sourceId, brand: product.brand, brandCode: product.brandCode,
    modelName: product.modelName, score: product.conditionScore, reason: product.conditionReason,
    localDate: product.localDate, createdAt: product.createdAt, dayRank: product.dayRank,
    oldProductNo: product.previousProductNo, productNo: product.productNo,
    condition: product.condition, conditionNotes: product.conditionNotes
  }))]
};

await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await fs.writeFile(COMBINED_AUDIT_PATH, `${JSON.stringify(combinedAudit, null, 2)}\n`, 'utf8');
await fs.mkdir(path.dirname(SQL_PATH), { recursive: true });
await fs.writeFile(SQL_PATH, sql, 'utf8');

console.log(JSON.stringify({
  products: manifest.products.length, combinedProducts: combinedAudit.counts.products,
  score6: manifest.products.filter((p) => p.conditionScore === 6).length,
  score7: manifest.products.filter((p) => p.conditionScore === 7).length,
  score8: manifest.products.filter((p) => p.conditionScore === 8).length,
  score9: manifest.products.filter((p) => p.conditionScore === 9).length,
  uniqueProductNos: new Set(newNos).size, sqlPath: SQL_PATH
}, null, 2));
