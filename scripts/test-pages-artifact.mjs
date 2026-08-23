import assert from 'node:assert/strict';
import { lstat, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_RUNTIME_FILES,
  ROOT_RUNTIME_FILES,
  buildPages,
} from '../tools/build-pages.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FORBIDDEN_TOP_LEVEL = new Set([
  '.git', '.github', 'design-refs', 'docs', 'scripts', 'supabase', 'tools',
  'data', 'output', 'ai', '벨로르', '브랜드 로고 이미지',
]);
const FORBIDDEN_EXTENSIONS = new Set(['.md', '.sql', '.fig', '.yml', '.yaml']);
const GENERATED_STATIC = ['.nojekyll', '404.html', 'offline.html'];

function parseArgs(argv) {
  const options = { site: '', expectSeo: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--site' && argv[i + 1]) options.site = argv[++i];
    else if (argv[i] === '--expect-seo') options.expectSeo = true;
    else throw new Error(`알 수 없는 인자: ${argv[i]}`);
  }
  return options;
}

async function collectFiles(directory, result = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`산출물에 심볼릭 링크가 있습니다: ${path}`);
    if (entry.isDirectory()) await collectFiles(path, result);
    else result.push(path);
  }
  return result;
}

async function validateMarketArtifact(site) {
  const marketRoot = join(site, 'market');
  const productDirs = (await readdir(marketRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  const sitemap = await readFile(join(site, 'sitemap.xml'), 'utf8');
  const sitemapUrls = (sitemap.match(/<loc>/g) || []).length;
  assert.equal(sitemapUrls, productDirs.length + 2, '사이트맵과 상품 디렉터리 수가 다릅니다.');

  let localImages = 0;
  for (const entry of productDirs) {
    const html = await readFile(join(marketRoot, entry.name, 'index.html'), 'utf8');
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.equal(canonical, `https://bellore.co.kr/market/${entry.name}/`, `canonical 불일치: ${entry.name}`);

    for (const match of html.matchAll(/<img\b[^>]*>/g)) {
      const tag = match[0];
      const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
      assert.match(tag, /\balt="[^"]+"/, `빈 이미지 alt: ${entry.name}`);
      if (!src) continue;
      const url = new URL(src, 'https://bellore.co.kr/');
      if (url.origin !== 'https://bellore.co.kr') continue;
      const localPath = resolve(site, `.${decodeURIComponent(url.pathname)}`);
      assert(localPath.startsWith(site), `이미지 경로 이탈: ${url.pathname}`);
      await lstat(localPath);
      localImages += 1;
    }

    for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => JSON.parse(match[1]), `JSON-LD 오류: ${entry.name}`);
    }
  }
  return { products: productDirs.length, localImages, sitemapUrls };
}

async function validateArtifact(site, { expectSeo }) {
  const topLevel = await readdir(site);
  for (const name of topLevel) {
    assert(!FORBIDDEN_TOP_LEVEL.has(name), `비공개 최상위 경로 노출: ${name}`);
  }

  for (const file of [...ROOT_RUNTIME_FILES, ...APP_RUNTIME_FILES, ...GENERATED_STATIC]) {
    const info = await lstat(join(site, file));
    assert(info.isFile(), `필수 운영 파일 누락: ${file}`);
  }
  assert((await readFile(join(site, 'CNAME'), 'utf8')).trim() === 'bellore.co.kr');
  assert((await readFile(join(site, 'robots.txt'), 'utf8')).includes('https://bellore.co.kr/sitemap.xml'));
  assert((await readFile(join(site, '404.html'), 'utf8')).includes('noindex,nofollow'));
  assert((await readFile(join(site, 'offline.html'), 'utf8')).includes('인터넷 연결'));

  const serviceWorker = await readFile(join(site, 'sw.js'), 'utf8');
  const shellBlock = serviceWorker.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/)?.[1];
  assert(shellBlock, '서비스워커 SHELL_ASSETS를 찾지 못했습니다.');
  const shellAssets = [...shellBlock.matchAll(/['"](\.\/[^'"]+)['"]/g)]
    .map((match) => match[1].split(/[?#]/, 1)[0]);
  assert.equal(shellAssets.length, 40, '서비스워커 셸 자산 개수가 기준과 다릅니다.');
  for (const asset of shellAssets) {
    await lstat(resolve(site, asset));
  }

  const files = await collectFiles(site);
  for (const file of files) {
    const rel = relative(site, file).replaceAll('\\', '/');
    assert(!FORBIDDEN_EXTENSIONS.has(extname(file).toLowerCase()), `금지 확장자 노출: ${rel}`);
    assert(!/(^|\/)\.(?:git|github|env)/.test(rel), `숨김 내부 경로 노출: ${rel}`);
    assert(!/(^|\/)(?:tools|scripts|supabase|design-refs|docs)(\/|$)/.test(rel), `내부 경로 노출: ${rel}`);
  }

  const allowedTopLevel = new Set([
    ...ROOT_RUNTIME_FILES.map((file) => file.split('/')[0]),
    'app', 'assets', ...GENERATED_STATIC,
    ...(expectSeo ? ['market', 'sitemap.xml'] : []),
  ]);
  assert.deepEqual(
    [...topLevel].sort(),
    [...allowedTopLevel].sort(),
    '정적 allowlist 밖의 최상위 산출물이 있습니다.',
  );

  let marketCounts = { products: 0, localImages: 0, sitemapUrls: 0 };
  if (expectSeo) {
    const market = await lstat(join(site, 'market', 'index.html'));
    const sitemap = await readFile(join(site, 'sitemap.xml'), 'utf8');
    assert(market.isFile(), '시장 허브 누락');
    assert(sitemap.includes('https://bellore.co.kr/market/'), '사이트맵 시장 URL 누락');
    marketCounts = await validateMarketArtifact(site);
  }

  return { files: files.length, shellAssets: shellAssets.length, ...marketCounts };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.site) {
    const site = resolve(ROOT, options.site);
    const counts = await validateArtifact(site, options);
    console.log(`pages artifact test: files=${counts.files} shell=${counts.shellAssets} products=${counts.products} localImages=${counts.localImages} seo=${options.expectSeo ? 'yes' : 'no'} pass`);
    return;
  }

  const tempName = `.tmp-pages-test-${process.pid}`;
  const site = join(ROOT, tempName);
  try {
    await buildPages({ outputDir: tempName, skipSeo: true, quiet: true });
    const counts = await validateArtifact(site, { expectSeo: false });
    console.log(`pages artifact test: files=${counts.files} shell=${counts.shellAssets} seo=no pass`);
  } finally {
    await rm(site, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`pages artifact test failed: ${error.message}`);
  process.exitCode = 1;
});
