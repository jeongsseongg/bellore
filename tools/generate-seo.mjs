/* ============================================================
   벨로르(BELLORE) · SEO 정적 페이지 생성기
   ------------------------------------------------------------
   배포(GitHub Actions) 때 실행됩니다. Supabase 의 인사이트 글
   (community_posts)과 판매상품(listings)을 읽어, 검색엔진이 실제로
   읽을 수 있는 정적 페이지/피드를 만듭니다.

   생성물:
   - /insight/슬러그.html  : 인사이트 글 (Article 구조화데이터)
   - /product/슬러그.html  : 판매상품 (Product/Offer 구조화데이터)  ← A
   - /insight/ , /product/ : 허브 목록
   - sitemap.xml , rss.xml : 통합 사이트맵·피드
   - feed/google-merchant.xml : 구글 머천트센터 상품 피드          ← C
   - feed/products.csv        : 네이버 스마트스토어 등 마켓 공통 export

   배경:
   - 앱은 해시(#) 단일 페이지라 글/상품이 검색에 안 잡힙니다.
     이 스크립트가 항목마다 고유 URL 을 만들어 색인되게 합니다.
   - 매 실행 시 DB 전체를 새로 읽으므로, 새로 등록되는 상품/글도
     다음 생성(배포 또는 스케줄) 때 자동 반영됩니다.                ← B
   - 품절(status=hidden)·삭제된 상품은 다음 생성 때 빠지며,
     배포가 전체 스냅샷이라 해당 페이지는 사라집니다(404).
   - Supabase url/anonKey 는 supabase-config.js 한 곳에서만 읽습니다.
   - 네트워크 실패 시 기존 커밋된 sitemap/rss 폴백(배포는 계속).

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

/* ---------- 판매상품(listings) 가져오기 ---------- */
const KAKAO = 'https://pf.kakao.com/_Uzxixen';
const TEL = '+821062936668';
const krw = (n) => Number(n || 0).toLocaleString('ko-KR') + '원';
const isNewCond = (s) => /미사용|신품|new/i.test(String(s || ''));

async function fetchListings({ url, key }) {
  const endpoint = `${url}/rest/v1/listings`
    + '?select=id,title,description,price,sale_price,category,status,condition,'
    + 'has_warranty,accessories,components,stamping,product_no,detail_desc,'
    + 'special_note,ship_info,image_url,image_urls,created_at,updated_at'
    + '&status=neq.hidden&order=created_at.desc';
  const res = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Supabase listings ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows
    .filter((l) => l && l.title && (l.price || l.sale_price) && l.status !== 'hidden')
    .map((l) => {
      const brand = l.title || '';
      const model = l.description || '';
      const price = Number(l.price || 0);
      const sale = l.sale_price ? Number(l.sale_price) : null;
      const now = sale && sale < price ? sale : price; // 실제 판매가
      const photos = (Array.isArray(l.image_urls) && l.image_urls.length)
        ? l.image_urls : (l.image_url ? [l.image_url] : []);
      const slug = slugify(`${brand} ${model} ${l.product_no || ''}`, l.id);
      return {
        id: l.id, brand, model,
        name: [brand, model].filter(Boolean).join(' ').trim() || '명품시계',
        price, sale, now,
        condition: l.condition || '', components: l.components || l.accessories || '',
        hasWarranty: !!l.has_warranty, productNo: l.product_no || '',
        desc: l.detail_desc || l.special_note || '',
        ship: l.ship_info || '결제 후 2~4일 이내 발송',
        photos, image: photos[0] || DEFAULT_IMG,
        slug, path: `/product/${slug}.html`, url: `${SITE}/product/${slug}.html`,
        when: l.created_at || Date.now(), mod: l.updated_at || l.created_at || Date.now(),
        isNew: isNewCond(l.condition),
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
.gallery{display:flex;gap:8px;overflow-x:auto;margin:6px 0 20px;padding-bottom:4px}
.gallery img{height:300px;width:auto;border-radius:12px;flex:0 0 auto;object-fit:cover}
.price{font-size:28px;font-weight:800;margin:6px 0 2px}
.price .was{font-size:16px;color:#bbb;text-decoration:line-through;font-weight:500;margin-right:8px}
.price .off{font-size:15px;color:#d23;font-weight:700;margin-left:8px}
.spec{width:100%;border-collapse:collapse;margin:18px 0 6px;font-size:14px}
.spec th{text-align:left;color:var(--mut);font-weight:600;width:120px;padding:9px 0;vertical-align:top;border-bottom:1px solid var(--line)}
.spec td{padding:9px 0;border-bottom:1px solid var(--line)}
.pcard{display:block;text-decoration:none}
.pcard .th{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;background:#f3f3f3}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin:18px 0 0}
.grid .nm{font-size:14px;margin:8px 0 2px;line-height:1.4}
.grid .pr{font-weight:800;font-size:15px}
@media(min-width:560px){.grid{grid-template-columns:repeat(3,1fr)}}
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

/* ---------- 상품 페이지 ---------- */
function productHtml(p) {
  const desc = excerpt(p.desc || `${p.name} ${p.condition} ${p.components}`, 155);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    image: p.photos.length ? p.photos : [p.image],
    description: desc,
    sku: p.productNo || String(p.id),
    brand: { '@type': 'Brand', name: p.brand || '벨로르' },
    itemCondition: p.isNew ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
    offers: {
      '@type': 'Offer',
      url: p.url,
      priceCurrency: 'KRW',
      price: String(p.now),
      availability: 'https://schema.org/InStock',
      itemCondition: p.isNew ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
      seller: { '@type': 'Organization', name: '벨로르 BELLORE' },
    },
  };
  const crumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: '판매시계', item: SITE + '/product/' },
      { '@type': 'ListItem', position: 3, name: p.name, item: p.url },
    ],
  };
  const gallery = p.photos.length
    ? `<div class="gallery">${p.photos.map((u) => `<img src="${esc(u)}" alt="${esc(p.name)}" loading="lazy">`).join('')}</div>` : '';
  const priceBlock = (p.sale && p.sale < p.price)
    ? `<div class="price"><span class="was">${krw(p.price)}</span>${krw(p.now)}<span class="off">${Math.round((1 - p.now / p.price) * 100)}%↓</span></div>`
    : `<div class="price">${krw(p.now)}</div>`;
  const rows = [
    p.productNo && ['상품번호', p.productNo],
    p.brand && ['브랜드', p.brand],
    p.model && ['모델', p.model],
    p.condition && ['상태', p.condition + (p.isNew ? ' (미사용/신품)' : '')],
    p.components && ['구성품', p.components],
    ['보증서', p.hasWarranty ? '있음' : '문의'],
    p.ship && ['배송', p.ship],
  ].filter(Boolean).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(p.name)}${p.productNo ? ' ' + esc(p.productNo) : ''} | 벨로르 BELLORE</title>
<meta name="description" content="${esc(p.name)} ${krw(p.now)} · ${esc(desc)}">
<link rel="canonical" href="${p.url}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="product">
<meta property="og:site_name" content="BELLORE">
<meta property="og:title" content="${esc(p.name)}">
<meta property="og:description" content="${krw(p.now)} · ${esc(desc)}">
<meta property="og:url" content="${p.url}">
<meta property="og:image" content="${esc(p.image)}">
<meta property="product:price:amount" content="${p.now}">
<meta property="product:price:currency" content="KRW">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="${SITE}/assets/icons/favicon-32.png">
<script type="application/ld+json">${jsonLd(ld)}</script>
<script type="application/ld+json">${jsonLd(crumbLd)}</script>
<style>${PAGE_CSS}</style>
</head>
<body>
${header()}
<div class="wrap">
  <p class="crumb"><a href="${SITE}/">홈</a> › <a href="${SITE}/product/">판매시계</a> › ${esc(p.name)}</p>
  <article>
    <span class="cat">${p.isNew ? '미사용/신품' : '정품 중고'}</span>
    <h1>${esc(p.name)}</h1>
    ${priceBlock}
    ${gallery}
    <table class="spec">${rows}</table>
    ${p.desc ? bodyToHtml(p.desc) : ''}
  </article>
  <div class="cta">
    <h2>이 시계, 지금 문의하세요</h2>
    <p>벨로르 인증 · 안전거래. 정품 보장, 사진 추가요청 가능합니다.</p>
    <a class="btn" href="${KAKAO}">카카오톡 문의</a>
    <a class="btn ghost" href="tel:${TEL}">전화 상담</a>
    <a class="btn ghost" href="${SITE}/product/">전체 매물 보기</a>
  </div>
</div>
${footer()}
</body>
</html>`;
}

/* ---------- 상품 허브(목록) ---------- */
function productIndexHtml(products) {
  const cards = products.map((p) => `  <a class="pcard" href="${p.path}">
    <img class="th" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">
    <p class="nm">${esc(p.name)}</p>
    <p class="pr">${krw(p.now)}</p>
  </a>`).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>판매 중인 명품시계 | 벨로르 BELLORE</title>
<meta name="description" content="롤렉스·파텍필립·오데마피게 등 정품 명품시계 판매. 벨로르 인증 안전거래, 실시간 비교견적.">
<link rel="canonical" href="${SITE}/product/">
<meta name="robots" content="index, follow">
<meta property="og:title" content="판매 중인 명품시계 · 벨로르 BELLORE">
<meta property="og:url" content="${SITE}/product/">
<meta property="og:image" content="${DEFAULT_IMG}">
<link rel="icon" type="image/png" href="${SITE}/assets/icons/favicon-32.png">
<style>${PAGE_CSS}</style>
</head>
<body>
${header()}
<div class="wrap">
  <p class="crumb"><a href="${SITE}/">홈</a> › 판매시계</p>
  <article>
    <span class="cat">COLLECTION</span>
    <h1>판매 중인 명품시계</h1>
    <p class="meta">정품 보장 · 벨로르 인증 안전거래 · 총 ${products.length}점</p>
  </article>
  <div class="grid">
${cards || '<p>현재 등록된 상품이 없습니다.</p>'}
  </div>
</div>
${footer()}
</body>
</html>`;
}

/* ---------- 구글 머천트센터 상품 피드 ---------- */
function googleMerchantFeed(products) {
  const items = products.map((p) => {
    const saleTag = (p.sale && p.sale < p.price)
      ? `\n      <g:sale_price>${p.now} KRW</g:sale_price>` : '';
    return `    <item>
      <g:id>${esc(p.productNo || p.id)}</g:id>
      <g:title>${esc(p.name)}</g:title>
      <g:description>${esc(excerpt(p.desc || p.name, 4000))}</g:description>
      <g:link>${p.url}</g:link>
      <g:image_link>${esc(p.image)}</g:image_link>${p.photos.slice(1, 11).map((u) => `\n      <g:additional_image_link>${esc(u)}</g:additional_image_link>`).join('')}
      <g:availability>in_stock</g:availability>
      <g:price>${p.price} KRW</g:price>${saleTag}
      <g:condition>${p.isNew ? 'new' : 'used'}</g:condition>
      <g:brand>${esc(p.brand || '벨로르')}</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
      <g:google_product_category>Apparel &amp; Accessories &gt; Jewelry &gt; Watches</g:google_product_category>
    </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>벨로르 BELLORE · 판매시계</title>
    <link>${SITE}/product/</link>
    <description>롤렉스·파텍필립·오데마피게 등 정품 명품시계 판매</description>
${items}
  </channel>
</rss>
`;
}

/* ---------- 네이버 스마트스토어/마켓 공통 상품 CSV ---------- */
function productsCsv(products) {
  const head = ['상품번호', '상품명', '브랜드', '모델', '정상가', '판매가', '상태', '구성품', '보증서', '이미지URL', '상세링크', '설명'];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const lines = products.map((p) => [
    p.productNo || p.id, p.name, p.brand, p.model, p.price, p.now,
    p.isNew ? '미사용' : '중고', p.components, p.hasWarranty ? '있음' : '문의',
    p.image, p.url, excerpt(p.desc || p.name, 500),
  ].map(cell).join(','));
  return '﻿' + [head.map(cell).join(','), ...lines].join('\r\n') + '\r\n';
}

/* ---------- sitemap / rss ---------- */
function sitemapXml(posts, products) {
  const today = isoDay();
  const urls = [
    { loc: `${SITE}/`, mod: today, freq: 'daily', pri: '1.0' },
  ];
  if (products.length) urls.push({ loc: `${SITE}/product/`, mod: today, freq: 'daily', pri: '0.9' });
  if (posts.length) urls.push({ loc: `${SITE}/insight/`, mod: today, freq: 'weekly', pri: '0.8' });
  for (const p of products) urls.push({ loc: p.url, mod: isoDay(p.mod), freq: 'weekly', pri: '0.8' });
  for (const p of posts) urls.push({ loc: p.url, mod: isoDay(p.mod), freq: 'monthly', pri: '0.7' });
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
async function safe(label, fn) {
  try { return await fn(); }
  catch (e) { console.error(`⚠️ ${label} 실패:`, e.message); return []; }
}

async function main() {
  const cfg = await readSupabaseConfig();
  const [posts, products] = await Promise.all([
    safe('인사이트 로드', () => fetchPosts(cfg)),
    safe('상품 로드', () => fetchListings(cfg)),
  ]);

  if (!posts.length && !products.length) {
    console.warn('⚠️ 인사이트·상품 모두 0건. sitemap/rss 는 변경하지 않고 종료합니다.');
    return;
  }

  // 인사이트 글 페이지
  if (posts.length) {
    await mkdir(join(ROOT, 'insight'), { recursive: true });
    for (const p of posts) await writeFile(join(ROOT, 'insight', `${p.slug}.html`), articleHtml(p));
    await writeFile(join(ROOT, 'insight', 'index.html'), indexHtml(posts));
    await writeFile(join(ROOT, 'rss.xml'), rssXml(posts));
  }

  // 상품 페이지 + 피드 (A, C)
  if (products.length) {
    await mkdir(join(ROOT, 'product'), { recursive: true });
    for (const p of products) await writeFile(join(ROOT, 'product', `${p.slug}.html`), productHtml(p));
    await writeFile(join(ROOT, 'product', 'index.html'), productIndexHtml(products));
    await mkdir(join(ROOT, 'feed'), { recursive: true });
    await writeFile(join(ROOT, 'feed', 'google-merchant.xml'), googleMerchantFeed(products));
    await writeFile(join(ROOT, 'feed', 'products.csv'), productsCsv(products));
  }

  // 통합 sitemap (상품 + 인사이트)
  await writeFile(join(ROOT, 'sitemap.xml'), sitemapXml(posts, products));

  console.log(`✅ 생성 완료: 인사이트 ${posts.length}개 · 상품 ${products.length}개`
    + ` + sitemap.xml/rss.xml + 구글 머천트 피드 + 상품 CSV`);
}

main().catch((err) => {
  // 실패해도 배포는 계속되도록(기존 커밋된 sitemap/rss 가 폴백)
  console.error('⚠️ SEO 생성 실패(배포는 계속):', err.message);
  process.exitCode = 0;
});
