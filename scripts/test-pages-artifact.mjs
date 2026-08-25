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
const WORKFLOW_DIR = join(ROOT, '.github', 'workflows');

function assertSingleReleaseGate(workflow, label) {
  const gates = workflow.match(/^\s*run:\s*node scripts\/check\.mjs\s*$/gm) || [];
  assert.equal(gates.length, 1, `${label}는 로컬과 같은 한 줄 검사를 정확히 한 번 실행해야 합니다.`);
  assert.match(workflow, /node-version:\s*['"]22['"]/, `${label}의 Node 버전은 CI 공통 기준 22여야 합니다.`);
}

async function validatePinnedActions() {
  const workflowFiles = (await readdir(WORKFLOW_DIR))
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();

  for (const name of workflowFiles) {
    const workflow = await readFile(join(WORKFLOW_DIR, name), 'utf8');
    for (const [index, line] of workflow.split(/\r?\n/).entries()) {
      const specifier = line.match(/^\s*uses:\s*([^\s#]+)/)?.[1];
      if (!specifier || specifier.startsWith('./')) continue;
      const separator = specifier.lastIndexOf('@');
      assert(separator > 0, `${name}:${index + 1} 액션 버전이 없습니다.`);
      const action = specifier.slice(0, separator);
      const ref = specifier.slice(separator + 1);
      assert.match(ref, /^[0-9a-f]{40}$/, `${name}:${index + 1} ${action}는 40자 커밋 SHA로 고정해야 합니다.`);
    }
  }
}

async function validateDeployConfig() {
  const firebase = JSON.parse(await readFile(join(ROOT, 'firebase.json'), 'utf8'));
  assert.equal(firebase.hosting?.public, '_site', 'Firebase도 검증된 _site 허용목록만 배포해야 합니다.');

  const [firebaseWorkflow, pagesWorkflow, qualityWorkflow, databaseWorkflow] = await Promise.all([
    readFile(join(WORKFLOW_DIR, 'firebase-deploy.yml'), 'utf8'),
    readFile(join(WORKFLOW_DIR, 'pages-deploy.yml'), 'utf8'),
    readFile(join(WORKFLOW_DIR, 'quality-gate.yml'), 'utf8'),
    readFile(join(WORKFLOW_DIR, 'db-maintenance.yml'), 'utf8'),
  ]);

  for (const [label, workflow] of [
    ['Firebase', firebaseWorkflow],
    ['GitHub Pages', pagesWorkflow],
    ['Quality', qualityWorkflow],
  ]) {
    assertSingleReleaseGate(workflow, label);
  }

  assert.match(firebaseWorkflow, /branches:\s*\[main\]/, 'Firebase push 배포는 main만 받아야 합니다.');
  assert.match(firebaseWorkflow, /run:\s*node tools\/build-pages\.mjs/, 'Firebase 배포 전 _site 빌드가 필요합니다.');
  assert.match(firebaseWorkflow, /run:\s*node scripts\/test-pages-artifact\.mjs --site _site --expect-seo/, 'Firebase 최종 artifact 검사가 필요합니다.');
  assert.doesNotMatch(firebaseWorkflow, /tools\/generate-seo\.mjs/, 'Firebase가 레거시 루트 생성기를 사용하면 안 됩니다.');
  assert.match(firebaseWorkflow, /group:\s*firebase-hosting-live/, 'Firebase live 배포는 동시 실행을 막아야 합니다.');
  assert.match(firebaseWorkflow, /deploy:\s*\n\s+if:\s*github\.ref == 'refs\/heads\/main'/, 'Firebase live job은 main에서만 실행해야 합니다.');
  assert.match(firebaseWorkflow, /deploy:\s*[\s\S]*?needs:\s*truth_guard/, 'Firebase live job은 Truth Guard를 직접 통과해야 합니다.');

  assert.match(pagesWorkflow, /branches:\s*\[main\]/, 'Pages push 배포는 main만 받아야 합니다.');
  assert.match(pagesWorkflow, /build:\s*\n\s+if:\s*>-\s*\n\s+github\.ref == 'refs\/heads\/main'/, 'Pages build job은 main에서만 실행해야 합니다.');
  assert.match(pagesWorkflow, /deploy:\s*\n\s+if:\s*>-\s*\n\s+github\.ref == 'refs\/heads\/main'/, 'Pages deploy job은 main에서만 실행해야 합니다.');
  assert.match(pagesWorkflow, /static_release_sha:[\s\S]*?required:\s*false/, 'Pages 수동 프론트 릴리스는 명시적 SHA 입력만 받아야 합니다.');
  assert.match(pagesWorkflow, /refs\/heads\/codex\/locked-pages-release/, '잠금형 Pages 릴리스는 전용 브랜치만 허용해야 합니다.');
  assert.match(pagesWorkflow, /git merge-base --is-ancestor "\$WORKFLOW_MAIN_SHA" "\$STATIC_RELEASE_SHA"/, '잠금형 릴리스는 실행 시점 main 전체를 포함해야 합니다.');
  assert.match(pagesWorkflow, /build:\s*[\s\S]*?needs:\s*truth_guard/, 'Pages build job은 Truth Guard를 먼저 통과해야 합니다.');
  assert.match(pagesWorkflow, /deploy:\s*[\s\S]*?needs:\s*\[truth_guard,\s*build\]/, 'Pages deploy는 Truth Guard와 검증된 build job에 직접 의존해야 합니다.');
  assert.match(pagesWorkflow, /run:\s*node tools\/build-pages\.mjs/, 'Pages 배포 전 _site 빌드가 필요합니다.');
  assert.match(pagesWorkflow, /run:\s*node scripts\/test-pages-artifact\.mjs --site _site --expect-seo/, 'Pages 최종 artifact 검사가 필요합니다.');
  assert.match(pagesWorkflow, /group:\s*github-pages/, 'Pages live 배포는 동시 실행을 막아야 합니다.');
  assert.match(pagesWorkflow, /pages:\s*write/, 'Pages 배포 권한이 필요합니다.');
  assert.match(pagesWorkflow, /id-token:\s*write/, 'Pages OIDC 배포 권한이 필요합니다.');

  assert.match(qualityWorkflow, /pull_request:/, 'Quality 검사는 pull request에서 실행해야 합니다.');
  assert.match(qualityWorkflow, /branches:\s*\[main\]/, 'Quality push 검사는 main을 포함해야 합니다.');
  assert.doesNotMatch(qualityWorkflow, /deploy-pages|action-hosting-deploy/, 'Quality workflow는 배포 권한을 소유하면 안 됩니다.');

  assert.match(databaseWorkflow, /run:\s*[\s\S]*?needs:\s*truth_guard/, '운영 DB 적용 job은 Truth Guard를 직접 통과해야 합니다.');

  await validatePinnedActions();
}

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
  const sitemapSet = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
  const sitemapUrls = sitemapSet.size;
  assert.equal(sitemapUrls, productDirs.length + 2, '사이트맵과 상품 디렉터리 수가 다릅니다.');
  assert.equal((sitemap.match(/<loc>/g) || []).length, sitemapSet.size, '사이트맵 URL이 중복됩니다.');

  const hub = await readFile(join(marketRoot, 'index.html'), 'utf8');
  const hubLinks = new Set([...hub.matchAll(/<a class="product-card" href="([^"]+)"/g)]
    .map((match) => new URL(match[1], 'https://bellore.co.kr/').href));

  let localImages = 0;
  const canonicals = new Set();
  const appListingIds = new Set();
  for (const entry of productDirs) {
    const html = await readFile(join(marketRoot, entry.name, 'index.html'), 'utf8');
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.equal(canonical, `https://bellore.co.kr/market/${entry.name}/`, `canonical 불일치: ${entry.name}`);
    assert(!canonical.includes('#'), `공개 공유 URL에 fragment가 있습니다: ${entry.name}`);
    assert.equal(html.match(/<meta property="og:url" content="([^"]+)"/)?.[1], canonical, `OG URL 불일치: ${entry.name}`);
    canonicals.add(canonical);

    const data = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((match) => JSON.parse(match[1]));
    const product = data.find((item) => item['@type'] === 'Product');
    const breadcrumb = data.find((item) => item['@type'] === 'BreadcrumbList');
    assert(product, `Product JSON-LD 누락: ${entry.name}`);
    assert(breadcrumb, `Breadcrumb JSON-LD 누락: ${entry.name}`);
    assert.equal(String(product.sku).toLowerCase(), entry.name, `SKU/slug 불일치: ${entry.name}`);
    assert.equal(product.offers?.url, canonical, `Offer URL 불일치: ${entry.name}`);
    assert.equal(breadcrumb.itemListElement?.at(-1)?.item, canonical, `Breadcrumb URL 불일치: ${entry.name}`);

    const appUrl = html.match(/<a class="cta" href="([^"]+)">벨로르에서 상품 보기<\/a>/)?.[1];
    const appId = appUrl?.match(/^https:\/\/bellore\.co\.kr\/#p=([0-9a-f-]{36})$/)?.[1];
    assert(appId, `앱 상품 딥링크 불일치: ${entry.name}`);
    assert(!appListingIds.has(appId), `앱 상품 UUID 중복: ${appId}`);
    appListingIds.add(appId);

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

  }
  assert.equal(canonicals.size, productDirs.length, '상품 canonical이 중복됩니다.');
  assert.equal(appListingIds.size, productDirs.length, '앱 딥링크가 상품 수와 다릅니다.');
  assert.deepEqual([...hubLinks].sort(), [...canonicals].sort(), '마켓 허브 링크와 상품 canonical 집합이 다릅니다.');
  assert.deepEqual(
    [...sitemapSet].sort(),
    ['https://bellore.co.kr/', 'https://bellore.co.kr/market/', ...canonicals].sort(),
    '사이트맵이 홈·마켓·상품 canonical 집합과 다릅니다.',
  );
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
  assert.equal(shellAssets.length, 58, '서비스워커 셸 자산 개수가 기준과 다릅니다.');
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
  await validateDeployConfig();
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
