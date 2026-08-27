import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const PAGE_ASSET_TOKEN = '/*__BELLORE_PAGE_ASSETS__*/[]';

export async function discoverPageHtmlFiles(root) {
  const directory = join(root, 'pages');
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.name.toLowerCase().endsWith('.html')) continue;
    const path = join(directory, entry.name);
    const info = await lstat(path);
    if (!entry.isFile() || !info.isFile() || info.isSymbolicLink()) {
      throw new Error(`pages/*.html은 일반 파일만 허용합니다: pages/${entry.name}`);
    }
    files.push(`pages/${entry.name}`);
  }
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}

export function injectPageAssets(serviceWorker, pageFiles) {
  const matches = serviceWorker.split(PAGE_ASSET_TOKEN).length - 1;
  if (matches !== 1) throw new Error(`서비스워커 페이지 자산 토큰은 정확히 1개여야 합니다: ${matches}`);
  const assets = JSON.stringify(pageFiles.map((file) => `./${file}`), null, 2);
  return serviceWorker.replace(PAGE_ASSET_TOKEN, assets);
}
