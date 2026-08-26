import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..');
const sourcePath = path.join(repoDir, 'data', 'watch-catalog-audit-20260821-158.json');
const jsonPath = path.join(repoDir, 'data', 'watch-condition-review-20260822.json');
const markdownPath = path.join(repoDir, 'data', 'watch-condition-review-20260822.md');

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

// 앞·뒤·브레이슬릿 실사에서 전반적인 정돈 상태가 특히 우수한 상품만 9점 후보로 유지한다.
const score9ProductNos = new Set([
  'ROL-N21268-2',
  'OME-N24264-1',
  'ROL-N21268-7',
  'ROL-N9266-3',
  'RTH-N14263-1',
  'TAG-N17265-1',
]);

const vintageProductNos = new Set([
  'ROL-N1267-1',
  'OME-N24261-1',
  'ROL-N18263-1',
  'CAR-N26265-1',
  'OME-N9266-2',
  'ROL-N16266-2',
  'BRT-N19264-1',
  'OME-N3261-1',
  'ROL-N22266-1',
  'SEI-N4265-1',
  'OME-N16266-3',
  'OME-N16263-1',
  'ROL-N24265-1',
  'OME-N12268-1',
  'ROL-N11265-3',
  'ROL-N15267-3',
]);

const vintageReviewProductNos = new Set([
  'ROL-N21268-8',
  'CAR-N4262-1',
  'CAR-N9261-1',
  'CAR-N31265-3',
]);

const generalLabels = {
  10: ['새상품', '실제 미사용 새상품으로 확인된 제품입니다.'],
  9: ['미사용급', '상품화 과정을 거친 중고 제품으로, 사용 이력이 거의 느껴지지 않을 만큼 매우 깔끔한 컨디션입니다.'],
  8: ['최상급', '상품화 과정을 거쳐 전체적으로 깔끔하고 균형 있게 정돈된 최상급 중고 컨디션입니다.'],
  7: ['상급', '자연스러운 사용 이력이 일부 있으나 전반적으로 단정하게 관리된 상급 컨디션입니다.'],
  6: ['양호', '사용에 따른 변화가 자연스럽게 자리했으며 편안하게 즐기기 좋은 양호한 중고 컨디션입니다.'],
  5: ['일반', '시간과 사용에 따른 변화가 고르게 반영된 일반적인 중고 컨디션입니다.'],
  4: ['실사용', '충분한 착용 이력이 느껴지는 실사용 중심의 중고 컨디션입니다.'],
  3: ['보완 권장', '일부 상태를 살펴보고 필요한 부분을 보완하면 좋은 컨디션입니다.'],
  2: ['정비 권장', '안정적인 사용을 위해 전문적인 점검과 정비를 권해드리는 컨디션입니다.'],
  1: ['복원 권장', '복원과 정비를 통해 본래의 가치를 되살릴 수 있는 컨디션입니다.'],
};

const vintageLabels = {
  9: ['매우 우수', '연식의 매력을 간직하면서도 전체적으로 매우 잘 보존된 빈티지 컨디션입니다.'],
  8: ['우수', '빈티지 고유의 분위기를 간직하면서 전체적으로 균형 있게 보존된 컨디션입니다.'],
  7: ['양호', '자연스러운 세월의 변화와 함께 전반적으로 잘 유지된 빈티지 컨디션입니다.'],
  6: ['자연스러움', '시간의 흐름과 빈티지 특유의 매력이 자연스럽게 어우러진 컨디션입니다.'],
  5: ['세월감', '연식에 따른 변화가 고르게 자리한 빈티지 컨디션입니다.'],
};

const products = source.products.map((product) => {
  const proposedScore = product.score === 9 && !score9ProductNos.has(product.productNo)
    ? 8
    : product.score;
  const gradingType = vintageProductNos.has(product.productNo)
    ? 'vintage'
    : vintageReviewProductNos.has(product.productNo)
      ? 'vintage-review'
      : 'general';
  const displayLabels = gradingType === 'general' ? generalLabels : vintageLabels;
  const [gradeLabel, description] = displayLabels[proposedScore] ?? generalLabels[proposedScore];
  const conditionPrefix = gradingType === 'general' ? '중고' : 'VINTAGE';

  return {
    sequence: product.sequence,
    sourceId: product.sourceId,
    brand: product.brand,
    modelName: product.modelName,
    productNo: product.productNo,
    fullSet: product.fullSet,
    registrationDate: product.localDate,
    currentScore: product.score,
    proposedScore,
    scoreChanged: product.score !== proposedScore,
    gradingType,
    vintageClassificationReviewRequired: gradingType === 'vintage-review',
    proposedCondition: `${conditionPrefix} ${proposedScore}/10 · ${gradeLabel}`,
    proposedPublicDescription: description,
    proposedPublicConditionNotes: `착용 이력이 있는 중고 상품입니다.\n${conditionPrefix} 컨디션 ${proposedScore}/10 · ${gradeLabel}\n${description}`,
    internalVisualEvidence: product.reason,
    publicEvidenceExposure: false,
    reviewStatus: 'draft',
  };
});

const countScores = (items, key) => Object.fromEntries(
  [...Array(10)].map((_, index) => index + 1)
    .map((score) => [`score${score}`, items.filter((item) => item[key] === score).length])
    .filter(([, count]) => count > 0),
);

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: 'review-only',
  liveDatabaseModified: false,
  sourceFile: path.basename(sourcePath),
  policy: {
    generalUsedMaximum: 8,
    exceptionalUsedMaximum: 9,
    score9Rule: '여러 실사에서 사용 이력이 거의 느껴지지 않을 만큼 매우 깨끗한 상품만 허용',
    score8Rule: '폴리싱·점검·클리닝 등 상품화 과정을 거친 일반 중고의 기본 상한',
    score10Rule: '실제 미사용 새상품으로 확인된 경우에만 허용',
    vintageRule: '일반 중고와 분리해 연식 대비 보존 상태로 해석하며 VINTAGE 접두어 사용',
    publicReasonRule: '상세페이지에는 점수 근거를 노출하지 않고 부드러운 등급 설명만 노출',
  },
  counts: {
    products: products.length,
    before: countScores(products, 'currentScore'),
    proposed: countScores(products, 'proposedScore'),
    changed: products.filter((product) => product.scoreChanged).length,
    unchanged: products.filter((product) => !product.scoreChanged).length,
    vintage: products.filter((product) => product.gradingType === 'vintage').length,
    vintageReviewRequired: products.filter((product) => product.gradingType === 'vintage-review').length,
  },
  score9Kept: products.filter((product) => product.proposedScore === 9).map((product) => product.productNo),
  score9ReducedTo8: products.filter((product) => product.currentScore === 9 && product.proposedScore === 8).map((product) => product.productNo),
  products,
};

fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

const rows = products.map((product) => {
  const modelName = product.modelName.replaceAll('|', '\\|');
  const change = product.scoreChanged ? `${product.currentScore} → ${product.proposedScore}` : `${product.proposedScore}`;
  const type = product.gradingType === 'general'
    ? '일반'
    : product.gradingType === 'vintage'
      ? '빈티지'
      : '빈티지 검토';
  return `| ${product.sequence} | ${product.productNo} | ${product.brand} | ${modelName} | ${change} | ${type} | ${product.proposedCondition} |`;
});

const markdown = `# 벨로르 시계 컨디션 점수 재검토안

> 검토용 초안입니다. 운영 데이터는 변경하지 않았습니다.

## 적용 기준

- 일반 중고 상품의 기본 상한은 8점입니다.
- 여러 실사에서 사용 이력이 거의 느껴지지 않을 만큼 매우 깨끗한 상품만 9점을 부여합니다.
- 10점은 실제 미사용 새상품으로 확인된 경우에만 사용합니다.
- 빈티지는 일반 중고와 분리하여 연식 대비 보존 상태로 해석합니다.
- 상세페이지에는 개별 흠집·사용감 근거를 노출하지 않고 부드러운 등급 설명만 표시합니다.

## 변경 요약

- 전체: ${products.length}개
- 기존 9점: ${result.counts.before.score9 ?? 0}개
- 제안 9점: ${result.counts.proposed.score9 ?? 0}개
- 9점에서 8점으로 조정: ${result.score9ReducedTo8.length}개
- 빈티지 분류: ${result.counts.vintage}개
- 빈티지 여부 추가 확인: ${result.counts.vintageReviewRequired}개

## 전체 목록

| 순번 | 상품번호 | 브랜드 | 모델 | 점수 | 분류 | 고객 표시안 |
|---:|---|---|---|---:|---|---|
${rows.join('\n')}
`;

fs.writeFileSync(markdownPath, markdown, 'utf8');

console.log(JSON.stringify({
  jsonPath,
  markdownPath,
  counts: result.counts,
  score9Kept: result.score9Kept,
}, null, 2));
