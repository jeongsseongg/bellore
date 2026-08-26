import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..');
const dataDir = path.join(repoDir, 'data');
const generatedDir = path.join(scriptDir, 'generated');

const batchFiles = [
  'watch-batch-20260821.json',
  'watch-batch-20260821-2.json',
  'watch-batch-20260821-3.json',
];

const score9ProductNos = new Set([
  'ROL-N21268-2',
  'OME-N24264-1',
  'ROL-N21268-7',
  'ROL-N9266-3',
  'RTH-N14263-1',
  'TAG-N17265-1',
]);

// 원문에서 빈티지/엔틱/연식이 명시되었거나 레퍼런스로 구형 계열이 확인된 상품.
const vintageSequences = new Set([
  16, 22, 27, 36, 39, 49, 50, 53, 60, 70, 73, 74, 78, 81, 83, 86, 88, 89,
  91, 97, 101, 121, 125, 127, 136, 138, 139, 140, 143, 144, 145, 148, 149, 152, 156,
]);

const gradeLabels = { 9: '최상급', 8: '상급', 7: '양호' };
const generalDescriptions = {
  9: '사용 이력이 거의 느껴지지 않을 만큼 매우 깔끔한 컨디션입니다.',
  8: '전체적으로 깔끔하고 균형 있게 관리된 컨디션입니다.',
  7: '자연스러운 사용 이력이 일부 있으나 전반적으로 단정하게 관리된 컨디션입니다.',
};
const vintageDescriptions = {
  9: '연식을 고려해도 보존 상태가 매우 뛰어나며 전체적으로 매우 깔끔한 컨디션입니다.',
  8: '연식에 따른 자연스러운 변화가 있으나 전체적으로 균형 있게 관리된 컨디션입니다.',
  7: '연식과 사용에 따른 자연스러운 변화가 있으며 전반적으로 단정한 컨디션입니다.',
};

const batches = await Promise.all(batchFiles.map(async (file) => {
  const data = JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
  return { file, data };
}));
const products = batches.flatMap(({ file, data }) => data.products.map((product) => ({ ...product, batchFile: file })));

// 1번 상품은 최초 단건 등록으로 배치 JSON에 없으므로 등록 원장의 확인값을 합친다.
products.push({
  sequence: 1,
  sourceId: 'k13m48zztqi8',
  sourceProfile: '가을초저녁',
  sourceFile: 'gaeulchojeonyeok-2026-08-17.json',
  sourceTitle: '롤렉스 데이저스트 126334 41미리 청판&실버판 2종다이얼',
  sourceDescription: '롤렉스 41미리 인기 모델 126334입니다. 예쁘게 커스텀된 청판 다이얼과 실버판 다이얼을 모두 드리는 구성입니다. 보증서 빠진, 책자, 여분줄, 시계 상자 구성입니다.',
  batchFile: 'single-registration-20260821',
  productNo: 'ROL-N28266-1',
  brand: '롤렉스',
  brandCode: 'ROL',
  modelName: '데이저스트 126334 41미리 청판&실버판 2종다이얼',
  referenceNo: '126334',
  sourcePrice: 16500000,
  sellingPrice: 18150000,
  sizeMm: 41,
  stamping: '',
  dialColor: '청판 · 실버판',
  material: '',
  movement: '오토매틱',
  accessories: '시계 상자 · 책자 · 여분줄 · 추가 다이얼',
  pack: '일부 구성',
  setGrade: '시계 상자 · 책자 · 여분줄 · 추가 다이얼 / 등급 정보없음',
  hasWarranty: false,
  hasDiamond: false,
  createdAt: '2026-06-28T06:34:57.000Z',
  imageUrls: [],
  conditionScore: 8,
  conditionReason: '실사 기준 전체 외관은 깔끔하며 케이스·베젤 또는 브레이슬릿에 가벼운 생활 스크래치가 보입니다.',
});
products.sort((a, b) => a.sequence - b.sequence);

if (products.length !== 158) throw new Error(`Expected 158 products, got ${products.length}`);
if (new Set(products.map((product) => product.productNo)).size !== 158) throw new Error('Duplicate product numbers');
if (new Set(products.map((product) => product.sourceId)).size !== 158) throw new Error('Duplicate source IDs');

const finalized = products.map((product) => {
  let baseScore = Math.max(7, Number(product.conditionScore || 7));
  if (baseScore === 9 && !score9ProductNos.has(product.productNo)) baseScore = 8;
  const isVintage = vintageSequences.has(product.sequence);
  const finalScore = isVintage ? Math.min(9, baseScore + 1) : baseScore;
  const grade = gradeLabels[finalScore];
  const publicDescription = (isVintage ? vintageDescriptions : generalDescriptions)[finalScore];
  const condition = `중고 ${finalScore}/10 · ${grade}`;
  const conditionNotes = [
    '착용 이력이 있는 중고 상품입니다.',
    `${finalScore}/10 · ${grade}`,
    ...(isVintage ? ['분류 · 빈티지'] : []),
    publicDescription,
  ].join('\n');

  return {
    sequence: product.sequence,
    sourceId: product.sourceId,
    sourceProfile: product.sourceProfile,
    sourceFile: product.sourceFile,
    sourceTitle: product.sourceTitle,
    sourceDescription: product.sourceDescription,
    batchFile: product.batchFile,
    productNo: product.productNo,
    brand: product.brand,
    brandCode: product.brandCode,
    modelName: product.modelName,
    referenceNo: product.referenceNo || '',
    sourcePrice: product.sourcePrice || 0,
    sellingPrice: product.sellingPrice || 0,
    sizeMm: product.sizeMm || null,
    stamping: product.stamping || '',
    dialColor: product.dialColor || '',
    material: product.material || '',
    movement: product.movement || '',
    accessories: product.accessories || '',
    pack: product.pack || '',
    setGrade: product.setGrade || '',
    hasWarranty: product.hasWarranty,
    hasDiamond: !!product.hasDiamond,
    createdAt: product.createdAt,
    imageUrls: product.imageUrls || [],
    previousScore: Number(product.conditionScore || 0),
    baseScore,
    vintageBonus: isVintage ? 1 : 0,
    finalScore,
    grade,
    isVintage,
    vintageBasis: isVintage ? '원문 연식 표현 또는 구형 모델·레퍼런스 기준' : '',
    condition,
    conditionNotes,
    publicDescription,
    internalScoreReason: product.conditionReason || '',
  };
});

const countByScore = Object.fromEntries([7, 8, 9].map((score) => [
  `score${score}`,
  finalized.filter((product) => product.finalScore === score).length,
]));

const output = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  status: 'approved-for-application',
  rules: {
    usedScores: [7, 8, 9],
    score7: '양호',
    score8: '상급',
    score9: '최상급',
    score10: '실제 미사용 새상품 전용; 이번 158개 중고 상품에는 사용하지 않음',
    vintage: '개별 기본 점수에 1점 가산, 최대 9점; 점수 앞 접두어 없이 상태 항목에 분류 · 빈티지 표시',
    publicCopy: '상품화·평가 근거·구체적인 흠집 표현을 노출하지 않음',
  },
  counts: {
    products: finalized.length,
    vintage: finalized.filter((product) => product.isVintage).length,
    nonVintage: finalized.filter((product) => !product.isVintage).length,
    ...countByScore,
  },
  products: finalized,
};

await fs.mkdir(generatedDir, { recursive: true });
await fs.writeFile(path.join(dataDir, 'watch-condition-final-20260822.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');

const sqlRows = finalized.map((product) => ({
  product_no: product.productNo,
  condition: product.condition,
  condition_notes: product.conditionNotes,
  is_vintage: product.isVintage,
}));

const targetNos = finalized.map((product) => product.productNo);
const preflightSql = `-- Bellore 158-watch condition preflight (read only)\n` +
`select count(*) as matched, count(distinct product_no) as unique_product_no,\n` +
`  count(*) filter (where 'vintage' = any(coalesce(tags, '{}'::text[]))) as existing_vintage_tags,\n` +
`  count(*) filter (where condition like '%6/10%') as existing_score6,\n` +
`  count(*) filter (where condition_notes like '%평가 근거:%') as exposed_reasons\n` +
`from public.listings\n` +
`where product_no in (select jsonb_array_elements_text($bellore$${JSON.stringify(targetNos)}$bellore$::jsonb));\n`;

const applySql = `-- Bellore 158-watch condition update, approved 2026-08-22\n` +
`begin;\n\n` +
`with changes as (\n` +
`  select * from jsonb_to_recordset($bellore$${JSON.stringify(sqlRows)}$bellore$::jsonb) as x(\n` +
`    product_no text, condition text, condition_notes text, is_vintage boolean\n` +
`  )\n` +
`), updated as (\n` +
`  update public.listings l\n` +
`  set condition = c.condition,\n` +
`      condition_notes = c.condition_notes,\n` +
`      tags = case when c.is_vintage\n` +
`        then array_append(array_remove(coalesce(l.tags, '{}'::text[]), 'vintage'), 'vintage')\n` +
`        else array_remove(coalesce(l.tags, '{}'::text[]), 'vintage') end,\n` +
`      updated_at = now()\n` +
`  from changes c\n` +
`  where l.product_no = c.product_no\n` +
`  returning l.product_no, l.condition, l.condition_notes, l.tags\n` +
`)\n` +
`select count(*) as updated,\n` +
`  count(*) filter (where condition like '%7/10%') as score7,\n` +
`  count(*) filter (where condition like '%8/10%') as score8,\n` +
`  count(*) filter (where condition like '%9/10%') as score9,\n` +
`  count(*) filter (where 'vintage' = any(tags)) as vintage\n` +
`from updated;\n\ncommit;\n`;

const verifySql = `-- Bellore 158-watch condition verification (read only)\n` +
`select count(*) as matched, count(distinct product_no) as unique_product_no,\n` +
`  count(*) filter (where condition like '%7/10%') as score7,\n` +
`  count(*) filter (where condition like '%8/10%') as score8,\n` +
`  count(*) filter (where condition like '%9/10%') as score9,\n` +
`  count(*) filter (where condition like '%6/10%' or condition like '%10/10%') as invalid_score,\n` +
`  count(*) filter (where 'vintage' = any(coalesce(tags, '{}'::text[]))) as vintage,\n` +
`  count(*) filter (where condition_notes like '%평가 근거:%' or condition_notes like '%상품화%' or condition_notes like 'VINTAGE%') as forbidden_copy\n` +
`from public.listings\n` +
`where product_no in (select jsonb_array_elements_text($bellore$${JSON.stringify(targetNos)}$bellore$::jsonb));\n`;

await fs.writeFile(path.join(generatedDir, 'watch-condition-preflight-20260822.sql'), preflightSql, 'utf8');
await fs.writeFile(path.join(generatedDir, 'watch-condition-apply-20260822.sql'), applySql, 'utf8');
await fs.writeFile(path.join(generatedDir, 'watch-condition-verify-20260822.sql'), verifySql, 'utf8');

console.log(JSON.stringify({
  output: path.join(dataDir, 'watch-condition-final-20260822.json'),
  counts: output.counts,
  changedFromPrevious: finalized.filter((product) => product.previousScore !== product.finalScore).length,
}, null, 2));
