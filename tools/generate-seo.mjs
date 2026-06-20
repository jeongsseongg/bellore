/* ============================================================
   벨로르(BELLORE) · SEO 정적 페이지 생성기
   ------------------------------------------------------------
   배포(GitHub Actions) 때 실행됩니다. Supabase 의 인사이트 글
   (community_posts)을 읽어 검색엔진이 실제로 읽을 수 있는
   "정적 HTML 글 페이지 + 허브 + sitemap.xml + rss.xml" 을 만듭니다.

   - 앱은 해시(#) 단일 페이지라 글이 검색에 안 잡힙니다.
     이 스크립트가 글마다 고유 URL(/insight/슬러그.html)을 만들어
     색인이 되게 합니다.
   - Supabase url/anonKey 는 supabase-config.js 한 곳에서만 읽습니다.
   - 네트워크 실패 등으로 글을 못 받으면, 기존에 커밋된
     sitemap.xml / rss.xml 을 그대로 두고 종료(배포는 계속).

   실행: node tools/generate-seo.mjs
   ============================================================ */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://bellore.co.kr';
const DEFAULT_IMG = `${SITE}/assets/icons/icon-512.png`;
// 정식 인사이트가 아닌(검색 노출이 불필요한) 카테고리는 제외
const SKIP_CATEGORIES = new Set(['자유게시판']);

/* ---------- 공통 유틸 ---------- */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// JSON-LD 를 <script> 안에 안전하게 넣기 위해 <, >, & 를 유니코드 이스케이프.
// (본문에 </script> 가 있어도 태그가 조기 종료되지 않게)
const jsonLd = (obj) => JSON.stringify(obj)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

function excerpt(body, n = 155) {
  const t = String(body ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

function slugify(title, id) {
  const base = String(title ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')   // 한글/영문/숫자만 남기고 나머지는 -
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return (base ? base + '-' : '') + id;
}

const isoDay = (d) => new Date(d || Date.now()).toISOString().slice(0, 10);
const rfc822 = (d) => new Date(d || Date.now()).toUTCString().replace('GMT', '+0000');
function krDate(d) {
  const x = new Date(d || Date.now());
  return `${x.getFullYear()}년 ${x.getMonth() + 1}월 ${x.getDate()}일`;
}
function bodyToHtml(body) {
  return String(body ?? '')
    .split(/\n{2,}/)
    .map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>')
    .filter(Boolean)
    .join('\n');
}

/* ---------- Supabase 설정 읽기(단일 소스) ---------- */
async function readSupabaseConfig() {
  const txt = await readFile(join(ROOT, 'supabase-config.js'), 'utf8');
  const url = txt.match(/url:\s*"([^"]+)"/)?.[1];
  const key = txt.match(/anonKey:\s*"([^"]+)"/)?.[1];
  if (!url || !key) throw new Error('supabase-config.js 에서 url/anonKey 를 찾지 못했습니다.');
  return { url, key };
}

async function fetchPosts({ url, key }) {
  const endpoint = `${url}/rest/v1/community_posts`
    + '?select=id,title,body,category,image_url,image_urls,created_at,updated_at'
    + '&order=created_at.desc';
  const res = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows
    .filter((p) => p && p.title && p.body && !SKIP_CATEGORIES.has(p.category))
    .map((p) => {
      const slug = slugify(p.title, p.id);
      return {
        ...p,
        slug,
        path: `/insight/${slug}.html`,
        url: `${SITE}/insight/${slug}.html`,
        image: (Array.isArray(p.image_urls) && p.image_urls[0]) || p.image_url || DEFAULT_IMG,
        when: p.created_at || p.updated_at || Date.now(),
        mod: p.updated_at || p.created_at || Date.now(),
      };
    });
}

/* ---------- 공통 스타일/레이아웃 ---------- */
const PAGE_CSS = `
:root{--ink:#111;--mut:#777;--line:#e9e9e9;--gold:#a9874e}
*{box-sizing:border-box}
body{margin:0;font-family:"Pretendard",-apple-system,system-ui,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:var(--ink);line-height:1.75;background:#fff;-webkit-font-smoothing:antialiased}
a{color:inherit}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}
.top{border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;height:62px}
.brand{font-weight:800;letter-spacing:.14em;font-size:18px;text-decoration:none}
.top nav a{margin-left:18px;font-size:14px;color:var(--mut);text-decoration:none}
.crumb{font-size:13px;color:var(--mut);padding:18px 0 0}
.crumb a{text-decoration:none}
article{padding:14px 0 8px}
.cat{display:inline-block;font-size:12px;letter-spacing:.08em;color:var(--gold);font-weight:700;margin-bottom:8px}
h1{font-size:30px;line-height:1.3;margin:.1em 0 .35em;font-weight:800;letter-spacing:-.02em}
.meta{color:var(--mut);font-size:13px;margin-bottom:22px}
.hero{width:100%;height:auto;border-radius:14px;margin:6px 0 26px;display:block}
article p{margin:0 0 1.15em;font-size:17px}
.cta{margin:34px 0;padding:24px;border:1px solid var(--line);border-radius:16px;background:#fafafa;text-align:center}
.cta h2{font-size:19px;margin:0 0 6px}
.cta p{color:var(--mut);font-size:14px;margin:0 0 16px}
.btn{display:inline-block;background:#111;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:700;font-size:15px;margin:4px}
.btn.ghost{background:#fff;color:#111;border:1px solid #111}
.foot{border-top:1px solid var(--line);margin-top:40px;padding:26px 0 50px;color:var(--mut);font-size:13px;line-height:1.7}
.foot a{text-decoration:none}
.list{list-style:none;padding:0;margin:18px 0 0}
.list li{padding:20px 0;border-bottom:1px solid var(--line)}
.list .c{font-size:12px;color:var(--gold);font-weight:700;letter-spacing:.06em}
.list h3{margin:6px 0 4px;font-size:19px}
.list h3 a{text-decoration:none}
.list .ex{color:var(--mut);font-size:14px;margin:0}
.list .d{color:#aaa;font-size:12px;margin-top:6px}
`;

function header() {
  return `<header class="top"><div class="wrap">
  <a class="brand" href="${SITE}/">BELLORE</a>
  <nav>
    <a href="${SITE}/insight/">인사이트</a>
    <a href="${SITE}/#compare">내시계팔기</a>
    <a href="${SITE}/">홈</a>
  </nav>
</div></header>`;
}

function footer() {
  return `<footer class="foot"><div class="wrap">
  <strong>벨로르 BELLORE</strong> · 명품시계 매입·판매·수리 전문 (SINCE 2008)<br>
  롤렉스·파텍필립·오데마피게 최고가 매입 · 실시간 비교견적 · 24시간 연중무휴<br>
  <a href="${SITE}/">bellore.co.kr</a> · <a href="${SITE}/#compare">무료 비교견적</a>
</div></footer>`;
}

/* ---------- 글 페이지 ---------- */
function articleHtml(p) {
  const desc = excerpt(p.body);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.title,
    description: desc,
    image: [p.image],
    datePublished: new Date(p.when).toISOString(),
    dateModified: new Date(p.mod).toISOString(),
    articleSection: p.category || '인사이트',
    author: { '@type': 'Organization', name: '벨로르 BELLORE', url: SITE + '/' },
    publisher: { '@type': 'Organization', name: '벨로르 BELLORE', logo: { '@type': 'ImageObject', url: DEFAULT_IMG } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': p.url },
  };
  const crumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: '인사이트', item: SITE + '/insight/' },
      { '@type': 'ListItem', position: 3, name: p.title, item: p.url },
    ],
  };
  const heroImg = p.image && p.image !== DEFAULT_IMG
    ? `<img class="hero" src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy">` : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(p.title)} | 벨로르 BELLORE 인사이트</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${p.url}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="article">
<meta property="og:site_name" content="BELLORE">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${p.url}">
<meta property="og:image" content="${esc(p.image)}">
<meta property="article:section" content="${esc(p.category || '인사이트')}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="${SITE}/assets/icons/favicon-32.png">
<script type="application/ld+json">${jsonLd(ld)}</script>
<script type="application/ld+json">${jsonLd(crumbLd)}</script>
<style>${PAGE_CSS}</style>
</head>
<body>
${header()}
<div class="wrap">
  <p class="crumb"><a href="${SITE}/">홈</a> › <a href="${SITE}/insight/">인사이트</a> › ${esc(p.title)}</p>
  <article>
    <span class="cat">${esc(p.category || '인사이트')}</span>
    <h1>${esc(p.title)}</h1>
    <p class="meta">벨로르 BELLORE · ${krDate(p.when)}</p>
    ${heroImg}
    ${bodyToHtml(p.body)}
  </article>
  <div class="cta">
    <h2>내 시계, 지금 얼마일까요?</h2>
    <p>여러 전문업체의 입찰가를 비교해 최고가로 — 비교견적은 100% 무료입니다.</p>
    <a class="btn" href="${SITE}/#compare">무료 비교견적 받기</a>
    <a class="btn ghost" href="${SITE}/insight/">다른 인사이트 보기</a>
  </div>
</div>
${footer()}
</body>
</html>`;
}

/* ---------- 인사이트 허브(목록) ---------- */
function indexHtml(posts) {
  const items = posts.map((p) => `  <li>
    <span class="c">${esc(p.category || '인사이트')}</span>
    <h3><a href="${p.path}">${esc(p.title)}</a></h3>
    <p class="ex">${esc(excerpt(p.body, 110))}</p>
    <p class="d">${krDate(p.when)}</p>
  </li>`).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>인사이트 | 벨로르 BELLORE · 명품시계 시세분석·매입가이드</title>
<meta name="description" content="롤렉스·파텍필립·오데마피게 시세분석, 매입 가이드, 브랜드 스토리. 40년 감정 전문가 벨로르의 명품시계 인사이트.">
<link rel="canonical" href="${SITE}/insight/">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:title" content="벨로르 인사이트 · 명품시계 시세분석·매입가이드">
<meta property="og:url" content="${SITE}/insight/">
<meta property="og:image" content="${DEFAULT_IMG}">
<link rel="alternate" type="application/rss+xml" title="벨로르 BELLORE 인사이트" href="${SITE}/rss.xml">
<link rel="icon" type="image/png" href="${SITE}/assets/icons/favicon-32.png">
<style>${PAGE_CSS}</style>
</head>
<body>
${header()}
<div class="wrap">
  <p class="crumb"><a href="${SITE}/">홈</a> › 인사이트</p>
  <article>
    <span class="cat">INSIGHT</span>
    <h1>벨로르 인사이트</h1>
    <p class="meta">명품시계 시세분석 · 매입 가이드 · 브랜드 스토리</p>
  </article>
  <ul class="list">
${items || '  <li>준비 중입니다.</li>'}
  </ul>
  <div class="cta">
    <h2>내 시계, 지금 얼마일까요?</h2>
    <p>여러 전문업체의 입찰가를 비교해 최고가로 — 비교견적은 100% 무료입니다.</p>
    <a class="btn" href="${SITE}/#compare">무료 비교견적 받기</a>
  </div>
</div>
${footer()}
</body>
</html>`;
}

/* ---------- sitemap / rss ---------- */
function sitemapXml(posts) {
  const today = isoDay();
  const urls = [
    { loc: `${SITE}/`, mod: today, freq: 'daily', pri: '1.0' },
    { loc: `${SITE}/insight/`, mod: today, freq: 'weekly', pri: '0.8' },
    ...posts.map((p) => ({ loc: p.url, mod: isoDay(p.mod), freq: 'monthly', pri: '0.7' })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.mod}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

function rssXml(posts) {
  const items = posts.map((p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${p.url}</link>
      <guid isPermaLink="true">${p.url}</guid>
      <category>${esc(p.category || '인사이트')}</category>
      <description>${esc(excerpt(p.body))}</description>
      <pubDate>${rfc822(p.when)}</pubDate>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>벨로르 BELLORE 인사이트</title>
    <link>${SITE}/insight/</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml"/>
    <description>명품시계 시세분석·매입가이드·브랜드스토리. 롤렉스·파텍필립·오데마피게 매입/판매/수리 전문 벨로르.</description>
    <language>ko</language>
    <generator>BELLORE</generator>
    <lastBuildDate>${rfc822(Date.now())}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

/* ---------- 실행 ---------- */
async function main() {
  const cfg = await readSupabaseConfig();
  const posts = await fetchPosts(cfg);
  if (!posts.length) {
    console.warn('⚠️ 인사이트 글이 0건입니다. sitemap/rss 는 변경하지 않고 종료합니다.');
    return;
  }
  await mkdir(join(ROOT, 'insight'), { recursive: true });
  for (const p of posts) {
    await writeFile(join(ROOT, 'insight', `${p.slug}.html`), articleHtml(p));
  }
  await writeFile(join(ROOT, 'insight', 'index.html'), indexHtml(posts));
  await writeFile(join(ROOT, 'sitemap.xml'), sitemapXml(posts));
  await writeFile(join(ROOT, 'rss.xml'), rssXml(posts));
  console.log(`✅ 생성 완료: 글 ${posts.length}개 + insight/index.html + sitemap.xml + rss.xml`);
}

main().catch((err) => {
  // 실패해도 배포는 계속되도록(기존 커밋된 sitemap/rss 가 폴백)
  console.error('⚠️ SEO 생성 실패(배포는 계속):', err.message);
  process.exitCode = 0;
});
