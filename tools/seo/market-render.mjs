import { MARKET_CSS } from './market-styles.mjs';
import {
  MARKET_PATH,
  SELLER_NAME,
  SITE_ORIGIN,
  booleanValue,
  displayValue,
} from './market-policy.mjs';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeJsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function money(value) {
  return `${Number(value).toLocaleString('ko-KR')}원`;
}

function shortDescription(product) {
  const reference = product.referenceNumber || '레퍼런스 정보없음';
  const condition = product.condition || '상태 정보없음';
  return `${product.name} · ${reference} · ${condition} · ${money(product.currentPrice)} · 상품번호 ${product.productNumber}`;
}

function header() {
  return `<header class="site-header"><div class="site-header__inner">
  <a class="wordmark" href="${SITE_ORIGIN}/">BELLORE</a>
  <nav class="site-nav" aria-label="주요 메뉴">
    <a href="${SITE_ORIGIN}/">홈</a>
    <a href="${SITE_ORIGIN}${MARKET_PATH}">판매 시계</a>
    <a href="${SITE_ORIGIN}/#compare">내 시계 팔기</a>
  </nav>
</div></header>`;
}

function footer() {
  return `<footer class="site-footer"><div class="site-footer__inner">
  <strong>벨로르 BELLORE</strong><br>
  명품시계 판매 · 매입 · 수리 전문<br>
  <a href="${SITE_ORIGIN}/">bellore.co.kr</a>
</div></footer>`;
}

function documentShell({ title, description, canonical, image, type = 'website', jsonLd, body }) {
  const blocks = jsonLd.map((value) => `<script type="application/ld+json">${safeJsonLd(value)}</script>`).join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="${escapeHtml(type)}">
<meta property="og:site_name" content="BELLORE">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="${SITE_ORIGIN}/assets/icons/favicon-32.png">
${blocks}
<style>${MARKET_CSS}</style>
</head>
<body>
${header()}
${body}
${footer()}
</body>
</html>`;
}

function property(name, value) {
  if (!value || value === '정보없음') return null;
  return { '@type': 'PropertyValue', name, value };
}

function productStructuredData(product) {
  const additionalProperty = [
    property('상품번호', product.productNumber),
    property('레퍼런스 번호', product.referenceNumber),
    property('상태', product.condition),
    property('사이즈', product.sizeMm ? `${product.sizeMm}mm` : ''),
    property('소재', product.caseSpec || product.material),
    property('구성품 · 등급', product.setGrade || product.components || product.accessories || product.pack),
    property('빈티지', product.isVintage ? '빈티지' : ''),
  ].filter(Boolean);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: shortDescription(product),
    sku: product.productNumber,
    image: product.photos,
    brand: { '@type': 'Brand', name: product.brand || '정보없음' },
    itemCondition: product.isNew
      ? 'https://schema.org/NewCondition'
      : 'https://schema.org/UsedCondition',
    offers: {
      '@type': 'Offer',
      url: product.url,
      priceCurrency: 'KRW',
      price: String(product.currentPrice),
      availability: product.availability,
      itemCondition: product.isNew
        ? 'https://schema.org/NewCondition'
        : 'https://schema.org/UsedCondition',
      seller: { '@type': 'Organization', name: SELLER_NAME, url: `${SITE_ORIGIN}/` },
    },
    additionalProperty,
  };
  if (product.referenceNumber) data.mpn = product.referenceNumber;
  return data;
}

function breadcrumbStructuredData(product) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: '판매 시계', item: `${SITE_ORIGIN}${MARKET_PATH}` },
      { '@type': 'ListItem', position: 3, name: product.name, item: product.url },
    ],
  };
}

function specRows(rows) {
  return `<dl class="spec">${rows.map(([label, value]) => `
    <div class="spec__row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
  </dl>`;
}

function firstValue(...values) {
  return values.find((value) => value !== null && value !== undefined && String(value).trim()) || '';
}

function sizeValue(value) {
  const raw = String(value || '').trim();
  return raw ? (/mm$/i.test(raw) ? raw : `${raw}mm`) : '정보없음';
}

function productBody(product) {
  const year = [product.stamping, product.purchaseYear].filter(Boolean).join(' · ');
  const setGrade = firstValue(product.setGrade, product.components, product.accessories, product.pack);
  const statusLines = product.conditionNotes.length ? product.conditionNotes : ['정보없음'];
  const details = product.detailImages.map((src, index) => {
    const alt = `${product.name} ${product.productNumber} 실물 상세 이미지 ${index + 1}`;
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
  }).join('\n');
  const oldPrice = product.salePrice
    ? `<span class="price__old">${money(product.price)}</span>`
    : '';

  return `<main class="page">
  <p class="crumbs"><a href="${SITE_ORIGIN}/">홈</a> › <a href="${SITE_ORIGIN}${MARKET_PATH}">판매 시계</a> › ${escapeHtml(product.productNumber)}</p>
  <div class="product-layout">
    <div class="hero-wrap">
      <img class="hero" src="${escapeHtml(product.heroImage)}" alt="${escapeHtml(`${product.name} ${product.productNumber} 정면 이미지`)}" fetchpriority="high" decoding="async">
    </div>
    <article class="product-summary">
      <p class="eyebrow">${escapeHtml(product.brand || 'BRAND')}</p>
      <div class="badges">
        <span class="badge">${escapeHtml(product.statusLabel)}</span>
        ${product.isVintage ? '<span class="badge badge--vintage">빈티지</span>' : ''}
      </div>
      <h1>${escapeHtml(product.name)}</h1>
      <p class="product-code">상품번호 ${escapeHtml(product.productNumber)}</p>
      <p class="price">${oldPrice}${money(product.currentPrice)}</p>
      <a class="cta" href="${escapeHtml(product.appUrl)}">벨로르에서 상품 보기</a>

      <section class="section" aria-labelledby="product-info"><h2 id="product-info">상품 정보</h2>
        ${specRows([
          ['브랜드', displayValue(product.brand)],
          ['모델', displayValue(product.model)],
          ['레퍼런스 번호', displayValue(product.referenceNumber)],
          ['상품번호', product.productNumber],
          ['사이즈', sizeValue(product.sizeMm)],
          ['스탬핑 · 연식', displayValue(year)],
          ['구성품 · 등급', displayValue(setGrade)],
        ])}
      </section>
      <section class="section" aria-labelledby="materials"><h2 id="materials">소재 · 기능</h2>
        ${specRows([
          ['무브먼트', displayValue(product.movement)],
          ['케이스', displayValue(firstValue(product.caseSpec, product.material))],
          ['밴드', displayValue(product.bandSpec)],
          ['다이얼', displayValue(product.dialColor)],
          ['다이아몬드', booleanValue(product.hasDiamond)],
          ['미리수', displayValue(product.misu)],
        ])}
      </section>
      <section class="section" aria-labelledby="condition"><h2 id="condition">상태</h2>
        ${specRows([['상품 상태', displayValue(product.condition)]])}
        <ul class="condition-list">${statusLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </section>
      <section class="section" aria-labelledby="trade"><h2 id="trade">거래 안내</h2>
        ${specRows([
          ['구성품', displayValue(firstValue(product.components, product.accessories, product.pack))],
          ['보증서', booleanValue(product.hasWarranty)],
          ['판매 방식', displayValue(product.saleMethod)],
          ['배송', displayValue(product.shipping)],
          ['특이사항', displayValue(product.specialNote)],
        ])}
      </section>
    </article>
  </div>
  <section class="section" aria-labelledby="details"><h2 id="details">실물 상세 이미지</h2>
    <div class="detail-gallery">${details}</div>
  </section>
  <a class="back-link" href="${SITE_ORIGIN}${MARKET_PATH}">판매 시계 전체 보기 →</a>
</main>`;
}

export function renderProductPage(product) {
  const title = `${product.name} ${product.productNumber} | 벨로르`;
  return documentShell({
    title,
    description: shortDescription(product),
    canonical: product.url,
    image: product.heroImage,
    type: 'product',
    jsonLd: [productStructuredData(product), breadcrumbStructuredData(product)],
    body: productBody(product),
  });
}

function marketStructuredData(products) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '벨로르 판매 시계',
    url: `${SITE_ORIGIN}${MARKET_PATH}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: product.url,
        name: product.name,
      })),
    },
  };
}

export function renderMarketIndex(products) {
  const cards = products.map((product) => `<a class="product-card" href="${escapeHtml(product.canonicalPath)}">
    <img class="product-card__image" src="${escapeHtml(product.heroImage)}" alt="${escapeHtml(`${product.name} ${product.productNumber} 정면 이미지`)}" loading="lazy" decoding="async">
    <p class="product-card__brand">${escapeHtml(product.brand || '정보없음')}</p>
    <h2 class="product-card__name">${escapeHtml(product.model || product.name)}</h2>
    <p class="product-card__meta"><span>${escapeHtml(product.condition || '상태 정보없음')}</span><span>${escapeHtml(product.productNumber)}</span></p>
    <p class="product-card__price">${money(product.currentPrice)}</p>
  </a>`).join('\n');
  const title = '명품 중고시계 판매 | 벨로르 BELLORE';
  const description = `벨로르가 판매하는 명품 중고시계 ${products.length}개를 브랜드, 모델, 레퍼런스, 상태와 가격 정보로 확인하세요.`;
  const body = `<main class="page">
    <p class="crumbs"><a href="${SITE_ORIGIN}/">홈</a> › 판매 시계</p>
    <header class="market-head"><p class="eyebrow">BELLORE MARKET</p><h1>판매 시계</h1><p class="lead">검증된 상품 정보와 실물 이미지를 확인하세요. 현재 ${products.length}개 상품이 공개되어 있습니다.</p></header>
    <section class="product-grid" aria-label="판매 시계 ${products.length}개">${cards}</section>
  </main>`;
  return documentShell({
    title,
    description,
    canonical: `${SITE_ORIGIN}${MARKET_PATH}`,
    image: products[0].heroImage,
    jsonLd: [marketStructuredData(products)],
    body,
  });
}
