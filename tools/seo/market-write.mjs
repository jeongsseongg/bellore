import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { MARKET_PATH, SITE_ORIGIN } from './market-policy.mjs';
import { renderMarketIndex, renderProductPage } from './market-render.mjs';

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isoDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`사이트맵 날짜가 올바르지 않습니다: ${value}`);
  return date.toISOString().slice(0, 10);
}

export function renderSitemap(products, buildDate = new Date()) {
  const today = isoDay(buildDate);
  const urls = [
    { location: `${SITE_ORIGIN}/`, modified: today },
    { location: `${SITE_ORIGIN}${MARKET_PATH}`, modified: today },
    ...products.map((product) => ({
      location: product.url,
      modified: isoDay(product.modifiedAt || product.publishedAt || buildDate),
    })),
  ];
  const body = urls.map((item) => `  <url>\n    <loc>${xmlEscape(item.location)}</loc>\n    <lastmod>${item.modified}</lastmod>\n  </url>`).join('\n');
  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    count: urls.length,
  };
}

async function restoreBackup(target, backup) {
  if (await exists(target)) await rm(target, { recursive: true, force: true });
  if (await exists(backup)) await rename(backup, target);
}

async function publishStage(outDir, stageDir) {
  const token = `${process.pid}-${Date.now()}`;
  const targetMarket = join(outDir, 'market');
  const targetSitemap = join(outDir, 'sitemap.xml');
  const backupMarket = join(dirname(outDir), `.${basename(outDir)}-market-backup-${token}`);
  const backupSitemap = join(dirname(outDir), `.${basename(outDir)}-sitemap-backup-${token}.xml`);
  const stageMarket = join(stageDir, 'market');
  const stageSitemap = join(stageDir, 'sitemap.xml');
  const hadMarket = await exists(targetMarket);
  const hadSitemap = await exists(targetSitemap);

  try {
    if (hadMarket) await rename(targetMarket, backupMarket);
    if (hadSitemap) await rename(targetSitemap, backupSitemap);
    await rename(stageMarket, targetMarket);
    await rename(stageSitemap, targetSitemap);
  } catch (error) {
    await restoreBackup(targetMarket, backupMarket);
    await restoreBackup(targetSitemap, backupSitemap);
    throw error;
  } finally {
    await rm(backupMarket, { recursive: true, force: true });
    await rm(backupSitemap, { force: true });
  }
}

export async function writeMarketArtifacts(outPath, products, options = {}) {
  const outDir = resolve(outPath);
  const stageDir = join(dirname(outDir), `.${basename(outDir)}-market-stage-${process.pid}-${Date.now()}`);
  const marketDir = join(stageDir, 'market');
  if (!products.length) throw new Error('생성할 공개 상품이 없습니다.');

  await rm(stageDir, { recursive: true, force: true });
  try {
    await mkdir(marketDir, { recursive: true });
    await writeFile(join(marketDir, 'index.html'), renderMarketIndex(products), 'utf8');
    for (const product of products) {
      const productDir = join(marketDir, product.slug);
      await mkdir(productDir, { recursive: true });
      await writeFile(join(productDir, 'index.html'), renderProductPage(product), 'utf8');
    }
    const sitemap = renderSitemap(products, options.buildDate || new Date());
    await writeFile(join(stageDir, 'sitemap.xml'), sitemap.xml, 'utf8');

    const stagedHub = await readFile(join(marketDir, 'index.html'), 'utf8');
    if (!stagedHub.includes(`${products.length}개 상품`)) {
      throw new Error('생성된 마켓 허브 검증에 실패했습니다.');
    }

    await mkdir(outDir, { recursive: true });
    await publishStage(outDir, stageDir);
    return { outDir, sitemapUrls: sitemap.count, productPages: products.length };
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}
