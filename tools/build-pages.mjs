import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, extname, basename, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { discoverPageHtmlFiles, injectPageAssets } from './pages-html.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_PAGE_FILES = Object.freeze(['pages/mypage/index.html']);

export const ROOT_RUNTIME_FILES = Object.freeze([
  'index.html',
  'login.html',
  'styles.css',
  'wanted-theme.css',
  'reference-layout.css',
  'vendor-reference.css',
  'mypick.css',
  'bellore-redesign.css',
  'manifest.json',
  'sw.js',
  'ui-dialog.js',
  'supabase-config.js',
  'analytics-core.js',
  'analytics-client.js',
  'brands.js',
  'supabase.js',
  'bellore-features.js',
  'cq-demo.js',
  'script.js',
  'wishlist.js',
  'alerts.js',
  'auction.js',
  'search.js',
  'ai-advisor.js',
  'ai-advisor-admin.js',
  'payments.js',
  'naverpay.js',
  'rss.xml',
  'robots.txt',
  'CNAME',
  '시계판매 이미지/비교견적.png',
  '시계판매 이미지/위탁판매.png',
  '시계판매 이미지/즉시매입.png',
  '구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_56 (1).png',
  '구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_56 (2).png',
  '구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_57 (3).png',
  '구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_57 (4).png',
  '구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_57 (5).png',
  '구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_58 (6).png',
]);

export const APP_RUNTIME_FILES = Object.freeze([
  'pages/storage/index.html',
  'pages/recent/index.html',
  'pages/support/index.html',
  'app/bootstrap.js',
  'app/pages/standalone-auth-gate.mjs',
  'app/pages/standalone-page.css',
  'app/pages/standalone-page.js',
  'app/pages/standalone-route.js',
  'app/ui/app-tabbar.css',
  'app/ui/app-tabbar.js',
  'app/features/mypage-personal-shop/mypage-shell.css',
  'app/features/mypage-personal-shop/mypage-current-cards.css',
  'app/features/mypage-personal-shop/mypage-navigation.css',
  'app/features/mypage-personal-shop/mypage-personal-shop.css',
  'app/features/mypage-personal-shop/mypage-requested-polish.css',
  'app/features/mypage-personal-shop/mypage-empty-sale-carousel.css',
  'app/features/mypage-personal-shop/mypage-requested-actions.js',
  'app/pages/mypage-subpages.css',
  'app/pages/support-page.js',
  'app/features/auth-login/auth-login.css',
  'app/features/auth-login/auth-login.js',
  'app/services/auth/auth-login-backend.js',
  'app/features/auth-social-completion/auth-social-completion.css',
  'app/features/auth-social-completion/auth-social-completion.js',
  'app/features/auth-social-completion/social-profile-data.mjs',
  'app/features/auth-social-completion/social-progressive-flow.mjs',
  'app/features/profile-login-provider/profile-login-provider.js',
  'app/services/auth/social-auth-service.js',
  'app/features/auth-signup/auth-signup.css',
  'app/features/auth-signup/auth-signup.js',
  'app/services/auth/auth-signup-backend.js',
  'app/features/analytics-consent/analytics-consent.css',
  'app/features/checkout/checkout-addresses.css',
  'app/features/checkout/checkout-addresses.mjs',
  'app/features/checkout/shipping-address-popup.mjs',
  'app/core/customer-error.mjs',
  'app/core/listing-display.js',
  'app/core/market-product-url.mjs',
  'app/features/checkout/checkout-coupon.css',
  'app/features/checkout/checkout-coupon.js',
  'app/features/checkout/checkout-order.css',
  'app/features/checkout/checkout-presentation.js',
  'app/features/checkout/payment-flow.js',
  'app/features/home-banners/home-banner-data.js',
  'app/features/home-banners/home-banners.css',
  'app/features/home-banners/home-banners.js',
  'app/features/home-merchandising/home-merchandising.js',
  'app/features/home-layout/home-layout-config.js',
  'app/features/home-layout/home-layout.js',
  'app/features/home-quicklinks/home-quicklinks.css',
  'app/features/home-quicklinks/home-quicklinks.js',
  'app/features/condition-guide/condition-guide.css',
  'app/features/condition-guide/condition-guide.js',
  'app/features/home-rows/home-rows.css',
  'app/features/home-rows/home-rows.js',
  'app/features/home-rows/home-row-admin.js',
  'app/features/listing-availability/listing-availability-ui.js',
  'app/features/listing-availability/market-static-status.js',
  'app/features/insights/insight-filter.js',
  'app/features/insights/insight-reader.js',
  'app/features/legal/legal-modals.js',
  'app/features/member-verification/signup-verification.js',
  'app/features/mypage-settings/mypage-settings.js',
  'app/features/product-sharing/product-sharing.mjs',
  'app/features/sell-method/sell-method.css',
  'app/features/sell-method/sell-content.js',
  'app/features/sell-method/sell-service.css',
  'app/features/sell-method/sell-quotes.css',
  'app/features/sell-method/sell-service-navigation.css',
  'app/features/sell-method/sell-guest-access.css',
  'app/features/sell-method/sell-service-pages.css',
  'app/features/sell-method/sell-service-action.css',
  'app/features/sell-method/sell-method.js',
  'app/features/sell-method/sell-draft-owner.js',
  'app/features/sell-method/sell-guide-preview.js',
  'app/features/sell-method/sell-reference-controller.js',
  'app/features/sell-method/sell-quote-controller.js',
  'app/features/sell-method/sell-service-pages.js',
  'app/features/sell-method/sell-handoff-action.js',
  'app/features/sell-method/sell-guest-access.js',
  'app/services/sell/sell-request-access.js',
  'app/legacy/legacy-collection.js', 'app/legacy/payment-auth.js',
  'app/legacy/home-merchandising-grid.js',
  'app/legacy/home-layout-adapter.js',
  'app/legacy/member-verification-service.js',
  'app/legacy/member-verification-ui.js',
  'app/legacy/mypage-settings-adapter.js',
  'app/legacy/customer-feedback.js',
  'app/legacy/checkout-coupon.js',
  'app/legacy/legacy-reveal.js',
  'app/legacy/page-runtime.js',
  'app/legacy/recommendation-engine.js',
  'app/services/listings/listing-catalog-service.js',
  'app/services/auth/member-verification-service.js',
  'app/services/payments/checkout-request-recovery.js', 'app/services/payments/payment-auth.js',
  'app/services/payments/checkout-client.js',
  'app/services/payments/payment-network.js', 'app/services/payments/pending-payment-recovery.js',
  'app/ui/hero-parallax.js',
  'app/ui/reveal-effects.js',
  'app/ui/site-header.js',
  'app/ui/navigation-history.js',
  'app/ui/width-preference.js',
  'app/vendor/recommendation-engine.js',
]);

const ASSET_EXTENSIONS = new Set([
  '.avif', '.gif', '.ico', '.jpeg', '.jpg', '.otf', '.png', '.svg',
  '.ttf', '.webp', '.woff', '.woff2',
]);

const FALLBACK_STYLE = `
  :root{color-scheme:light;font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f6f2;color:#12231d}
  main{width:min(520px,calc(100% - 40px));text-align:center;padding:56px 24px}
  img{width:150px;max-width:52%;height:auto;margin-bottom:28px}
  h1{font-size:clamp(26px,7vw,38px);margin:0 0 12px}
  p{line-height:1.7;color:#5b625f;margin:0 0 26px}
  a{display:inline-block;padding:13px 22px;border-radius:999px;background:#12231d;color:#fff;text-decoration:none;font-weight:700}
`;

function fallbackHtml({ title, message }) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${title} | BELLORE</title>
  <style>${FALLBACK_STYLE}</style>
</head>
<body>
  <main>
    <img src="/assets/logo-bellore.png" alt="BELLORE">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="/">벨로르 홈으로</a>
  </main>
</body>
</html>
`;
}

function resolveOutput(outputDir) {
  const output = resolve(ROOT, outputDir || '_site');
  const rel = relative(ROOT, output);
  const folder = basename(output);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`출력 폴더는 저장소 내부여야 합니다: ${output}`);
  }
  if (!/^_site(?:[-_].*)?$/.test(folder) && !/^\.tmp-pages-/.test(folder)) {
    throw new Error(`삭제 안전을 위해 출력 폴더명은 _site 또는 .tmp-pages-* 만 허용합니다: ${folder}`);
  }
  return output;
}

async function assertRegularFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`일반 파일이 아닌 항목은 배포할 수 없습니다: ${relative(ROOT, path)}`);
  }
}

async function assertNoSymlinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`심볼릭 링크는 배포 자산에 허용되지 않습니다: ${relative(ROOT, path)}`);
    }
    if (entry.isDirectory()) await assertNoSymlinks(path);
  }
}

async function copyFileFromRoot(sourceRelative, output) {
  const source = join(ROOT, sourceRelative);
  await assertRegularFile(source);
  const target = join(output, sourceRelative);
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target);
}

async function copyAssets(output) {
  const source = join(ROOT, 'assets');
  await assertNoSymlinks(source);
  await cp(source, join(output, 'assets'), {
    recursive: true,
    filter(path) {
      if (path === source) return true;
      const extension = extname(path).toLowerCase();
      if (!extension) return true;
      return ASSET_EXTENSIONS.has(extension) || basename(path) === 'LICENSE.txt';
    },
  });
}

async function copyRuntimeDirectory(sourceRelative, targetRelative, output) {
  const source = join(ROOT, sourceRelative);
  await assertNoSymlinks(source);
  await cp(source, join(output, targetRelative), {
    recursive: true,
    filter(path) {
      if (path === source) return true;
      const extension = extname(path).toLowerCase();
      if (!extension) return true;
      return ['.css', '.html', '.js'].includes(extension);
    },
  });
}

function mypageAppShell(source) {
  const page = source
    .replace('<html lang="ko">', '<html lang="ko" data-mypage-route-pending>')
    .replace(/<title>[^<]*<\/title>/, '<title>마이페이지 | BELLORE</title>')
    .replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex, follow">')
    .replace('<link rel="canonical" href="https://bellore.co.kr/">', '<link rel="canonical" href="https://bellore.co.kr/pages/mypage/">')
    .replace('<meta property="og:url" content="https://bellore.co.kr/">', '<meta property="og:url" content="https://bellore.co.kr/pages/mypage/">')
    .replace('</head>', '    <link rel="stylesheet" href="/app/pages/standalone-page.css?v=20260831-mypage-app-route-v1">\n</head>');
  if (!page.includes('data-mypage-route-pending') || !page.includes('https://bellore.co.kr/pages/mypage/')) {
    throw new Error('마이페이지 앱 셸 메타데이터를 생성하지 못했습니다.');
  }
  return page;
}

async function writeMypageAppRoute(output) {
  const target = join(output, 'pages', 'mypage', 'index.html');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, mypageAppShell(await readFile(join(ROOT, 'index.html'), 'utf8')));
}

function runSeoGenerator(output) {
  const generator = join(ROOT, 'tools', 'seo', 'build-market.mjs');
  const result = spawnSync(process.execPath, [generator, '--out', output], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`시장 SEO 생성기가 종료 코드 ${result.status}로 실패했습니다.`);
  }
}

async function verifyGeneratedSeo(output) {
  await Promise.all([
    assertRegularFile(join(output, 'market', 'index.html')),
    assertRegularFile(join(output, 'sitemap.xml')),
  ]);
  const sitemap = await readFile(join(output, 'sitemap.xml'), 'utf8');
  if (!sitemap.includes('https://bellore.co.kr/market/')) {
    throw new Error('생성된 sitemap.xml에 /market/ URL이 없습니다.');
  }
}

export async function buildPages({ outputDir = '_site', skipSeo = false, quiet = false } = {}) {
  const output = resolveOutput(outputDir);
  const pageFiles = await discoverPageHtmlFiles(ROOT);

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  for (const file of ROOT_RUNTIME_FILES) await copyFileFromRoot(file, output);
  for (const file of APP_RUNTIME_FILES) await copyFileFromRoot(file, output);
  for (const file of pageFiles) await copyFileFromRoot(file, output);
  await writeMypageAppRoute(output);
  const serviceWorkerPath = join(output, 'sw.js');
  await writeFile(serviceWorkerPath, injectPageAssets(
    await readFile(serviceWorkerPath, 'utf8'),
    [...pageFiles, ...GENERATED_PAGE_FILES],
  ));
  await copyAssets(output);
  await copyRuntimeDirectory('prototypes/admin-console-v2', 'admin', output);
  await copyRuntimeDirectory('prototypes/account-roles', 'account-roles', output);

  await writeFile(join(output, '.nojekyll'), '');
  await writeFile(join(output, '404.html'), fallbackHtml({
    title: '페이지를 찾을 수 없습니다',
    message: '주소가 변경되었거나 판매가 종료된 상품일 수 있습니다.',
  }));
  await writeFile(join(output, 'offline.html'), fallbackHtml({
    title: '인터넷 연결을 확인해 주세요',
    message: '연결이 복구되면 벨로르 상품을 다시 확인할 수 있습니다.',
  }));

  if (!skipSeo) {
    runSeoGenerator(output);
    await verifyGeneratedSeo(output);
  }

  if (!quiet) {
    const mode = skipSeo ? 'static-only' : 'static+market';
    console.log(`pages build: mode=${mode} output=${relative(ROOT, output)}`);
  }
  return output;
}

function parseArgs(argv) {
  const options = { outputDir: '_site', skipSeo: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--skip-seo') options.skipSeo = true;
    else if (argv[i] === '--out' && argv[i + 1]) options.outputDir = argv[++i];
    else throw new Error(`알 수 없는 인자: ${argv[i]}`);
  }
  return options;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  buildPages(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(`pages build failed: ${error.message}`);
    process.exitCode = 1;
  });
}
