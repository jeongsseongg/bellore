import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const progressPath = process.argv[2] || 'C:/Users/LS/Desktop/새 폴더/bellore-watch-products-progress.json';
const manifestName = process.argv[3] || 'watch-batch-20260821';
const deploymentCommit = process.argv[4] || '43df80e';
const manifestPath = path.join(REPO_ROOT, 'data', `${manifestName}.json`);
const backupPath = progressPath.replace(/\.json$/i, `.before-${manifestName}-registration.json`);
const registeredAt = new Date().toISOString();

const progressText = await fs.readFile(progressPath, 'utf8');
const progress = JSON.parse(progressText);
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

const excludedSourceId = manifest.excludedSourceItem?.sourceId || null;
if (excludedSourceId) {
  progress.products = progress.products.filter((product) => product.sourcePost?.id !== excludedSourceId);
}

try {
  await fs.access(backupPath);
} catch {
  await fs.writeFile(backupPath, progressText, 'utf8');
}

const bySequence = new Map(manifest.products.map((product) => [product.sequence, product]));
for (const product of progress.products) {
  const registered = bySequence.get(product.sequence);
  if (!registered) continue;
  product.siteRegistration = {
    status: 'registered',
    productNo: registered.productNo,
    sourcePrice: registered.sourcePrice,
    sellingPrice: registered.sellingPrice,
    condition: registered.condition,
    warranty: registered.hasWarranty === null ? '정보없음' : (registered.hasWarranty ? '포함' : '없음'),
    uploadDate: registered.createdAt,
    registeredAt,
    deploymentCommit,
    imageCount: registered.imageUrls.length,
    imageUrls: registered.imageUrls
  };
}

progress.updatedAt = registeredAt;
progress.counts = {
  sourcePosts: progress.counts?.sourcePosts || progress.products.length,
  watchProducts: progress.products.length,
  excludedAccessories: (progress.counts?.sourcePosts || progress.products.length) - progress.products.length,
  completed: progress.products.filter((product) => product.registrationStatus === 'completed').length,
  pendingImage: progress.products.filter((product) => product.registrationStatus !== 'completed').length
};
const registeredProducts = progress.products.filter((product) => product.siteRegistration?.status === 'registered');
progress.siteRegistration = {
  status: 'completed',
  registeredProducts: registeredProducts.length,
  firstProductNo: registeredProducts[0]?.siteRegistration?.productNo || null,
  lastProductNo: registeredProducts.at(-1)?.siteRegistration?.productNo || null,
  pricingRule: '원가에 10% 적용 후 원 단위 반올림',
  uploadPeriod: '2026-01-01 ~ 2026-08-20',
  todayRegistrationBadge: false,
  merchandisingReference: '구구스형 상품 정보 중심 노출',
  deploymentCommit,
  completedAt: registeredAt
};

for (const product of manifest.products) {
  product.registrationStatus = 'registered';
  product.registeredAt = registeredAt;
  product.deploymentCommit = deploymentCommit;
}
manifest.registration = {
  status: 'completed',
  registered: manifest.products.length,
  completedAt: registeredAt,
  deploymentCommit
};

const tempPath = `${progressPath}.tmp`;
await fs.writeFile(tempPath, JSON.stringify(progress, null, 2) + '\n', 'utf8');
await fs.rename(tempPath, progressPath);
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  progressPath,
  backupPath,
  siteRegistered: progress.products.filter((product) => product.siteRegistration?.status === 'registered').length,
  manifestRegistered: manifest.products.filter((product) => product.registrationStatus === 'registered').length
}, null, 2));
