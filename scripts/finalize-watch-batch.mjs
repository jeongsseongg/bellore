import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BATCH_NAME = process.argv[2] || 'watch-batch-20260821';
const MANIFEST_PATH = path.join(REPO_ROOT, 'data', `${BATCH_NAME}.json`);
const SQL_PATH = path.join(REPO_ROOT, 'scripts', 'generated', `${BATCH_NAME}.sql`);
const OWNER_ID = '8ae9c0a1-065a-488b-8b06-7ac1a8fd10b1';

// 실물 검수 시트와 원문 상태 표현을 함께 확인한 9점 상품.
const DEFAULT_SCORE_9 = '6,7,11,13,14,16,17,18,19,20,21,24,25,26,31,35,37,41,45,47,53,54,57,60,61,66,67';
const SCORE_9 = new Set(String(process.argv[3] || DEFAULT_SCORE_9).split(',').filter(Boolean).map(Number));

const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));

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

for (const product of manifest.products) {
  const score = SCORE_9.has(product.sequence) ? 9 : 8;
  const warranty = warrantyStatus(product);
  const accessories = finalizeAccessories(product, warranty);
  product.modelName = String(product.modelName || '').replace(/\s*판매$/, '').trim();
  product.conditionScore = score;
  product.condition = `중고 ${score}/10`;
  product.conditionNotes = `착용 이력이 있는 중고 상품입니다.\n사진 기준 상태 ${score}/10`;
  product.hasWarranty = warranty;
  product.accessories = accessories.join(' · ');
  product.pack = /풀박스/.test(`${product.sourceTitle} ${product.sourceDescription}`)
    ? '풀박스'
    : (/(풀셋|풀세트)/.test(`${product.sourceTitle} ${product.sourceDescription}`) ? '풀세트' : (accessories.length ? '일부 구성' : '구성품 정보없음'));
  product.setGrade = `${accessories.length ? accessories.join(' · ') : '구성품 정보없음'} / 등급 정보없음`;
  product.registrationStatus = 'ready';
}

manifest.finalizedAt = new Date().toISOString();
manifest.conditionRule = 'visual/source review: used 8/10 or 9/10; no severe-damage items found';
manifest.warrantyRule = 'true only when included/full-set is explicit; false when missing is explicit; null when unknown';
await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const rows = manifest.products.map((product) => ({
  product_no: product.productNo,
  title: product.brand,
  description: product.modelName,
  price: product.sellingPrice,
  condition: product.condition,
  condition_notes: product.conditionNotes,
  has_warranty: product.hasWarranty,
  has_diamond: product.hasDiamond,
  size_mm: product.sizeMm,
  stamping: product.stamping || null,
  dial_color: product.dialColor || null,
  material: product.material || null,
  reference_no: product.referenceNo || null,
  accessories: product.accessories || null,
  pack: product.pack,
  set_grade: product.setGrade,
  movement: product.movement || null,
  created_at: product.createdAt,
  image_urls: product.imageUrls,
  tags: [product.brand, product.modelName].filter(Boolean)
}));

const sql = `-- Bellore ${rows.length}-watch idempotent bulk registration\n` +
`with batch as (\n` +
`  select * from jsonb_to_recordset($bellore$${JSON.stringify(rows)}$bellore$::jsonb) as x(\n` +
`    product_no text, title text, description text, price numeric, condition text, condition_notes text,\n` +
`    has_warranty boolean, has_diamond boolean, size_mm integer, stamping text, dial_color text,\n` +
`    material text, reference_no text, accessories text, pack text, set_grade text, movement text,\n` +
`    created_at timestamptz, image_urls text[], tags text[]\n` +
`  )\n` +
`)\n` +
`insert into public.listings (\n` +
`  owner_id, title, description, price, status, image_url, created_at, updated_at, image_urls,\n` +
`  category, tags, condition, has_warranty, accessories, pack, size_mm, sale_started_at,\n` +
`  stamping, sale_method, product_no, ship_info, dial_color, material, has_diamond,\n` +
`  reference_no, set_grade, movement, condition_notes\n` +
`)\n` +
`select\n` +
`  '${OWNER_ID}'::uuid, b.title, b.description, b.price, 'on_sale', b.image_urls[1], b.created_at, now(), b.image_urls,\n` +
`  '벨로르판매', b.tags, b.condition, b.has_warranty, b.accessories, b.pack, b.size_mm, b.created_at,\n` +
`  b.stamping, '벨로르가 직접 판매하고 결제까지 책임집니다', b.product_no, '결제 후 2~4일 이내 발송',\n` +
`  b.dial_color, b.material, b.has_diamond, b.reference_no, b.set_grade, b.movement, b.condition_notes\n` +
`from batch b\n` +
`where not exists (select 1 from public.listings existing where existing.product_no = b.product_no)\n` +
`returning id, product_no, title, description, price, condition, created_at;\n\n` +
`select count(*) as registered_count, min(product_no) as first_product_no, max(product_no) as last_product_no\n` +
`from public.listings where product_no between '${rows[0].product_no}' and '${rows.at(-1).product_no}';\n`;

await fs.mkdir(path.dirname(SQL_PATH), { recursive: true });
await fs.writeFile(SQL_PATH, sql, 'utf8');

console.log(JSON.stringify({
  products: manifest.products.length,
  score8: manifest.products.filter((product) => product.conditionScore === 8).length,
  score9: manifest.products.filter((product) => product.conditionScore === 9).length,
  warrantyIncluded: manifest.products.filter((product) => product.hasWarranty === true).length,
  warrantyMissing: manifest.products.filter((product) => product.hasWarranty === false).length,
  warrantyUnknown: manifest.products.filter((product) => product.hasWarranty === null).length,
  sqlPath: SQL_PATH,
  sqlBytes: Buffer.byteLength(sql)
}, null, 2));
