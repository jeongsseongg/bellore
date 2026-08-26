import assert from 'node:assert/strict';

const CANONICAL_ORIGIN = 'https://bellore.co.kr';

function args(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`잘못된 인자: ${key || '(없음)'}`);
    values[key.slice(2)] = value;
  }
  return values;
}

function canonicalFrom(html) {
  return html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || '';
}

function imageUrls(html, pageUrl) {
  return [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g)]
    .map((match) => new URL(match[1], pageUrl).href);
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function checkedFetch(url, label = url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  const cause = lastError?.cause?.message ? ` (${lastError.cause.message})` : '';
  throw new Error(`${label} 요청 실패: ${lastError?.message || '알 수 없는 오류'}${cause}`);
}

function hasImageSignature(bytes) {
  const ascii = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
  return (
    (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (bytes[0] === 0x89 && ascii(1, 3) === 'PNG') ||
    ascii(0, 3) === 'GIF' ||
    (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') ||
    (ascii(4, 4) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 4)))
  );
}

async function main() {
  const options = args(process.argv.slice(2));
  const requestOrigin = new URL(options['request-origin'] || CANONICAL_ORIGIN).origin;
  const expectedProducts = Number(options['expected-products'] || 158);
  assert(Number.isSafeInteger(expectedProducts) && expectedProducts > 0, 'expected-products가 올바르지 않습니다.');

  function requestUrl(publicUrl) {
    const url = new URL(publicUrl);
    return url.origin === CANONICAL_ORIGIN
      ? new URL(`${url.pathname}${url.search}`, `${requestOrigin}/`).href
      : url.href;
  }

  const sitemapResponse = await checkedFetch(`${requestOrigin}/sitemap.xml`, 'sitemap.xml');
  assert.equal(sitemapResponse.status, 200, 'sitemap.xml HTTP 상태가 200이 아닙니다.');
  const sitemap = await sitemapResponse.text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(urls).size, urls.length, '사이트맵 URL이 중복됩니다.');
  assert.equal(urls.length, expectedProducts + 2, '사이트맵 URL 수가 다릅니다.');
  assert(urls.includes(`${CANONICAL_ORIGIN}/`), '사이트맵 홈 URL이 없습니다.');
  assert(urls.includes(`${CANONICAL_ORIGIN}/market/`), '사이트맵 마켓 URL이 없습니다.');

  const products = urls.filter((url) => {
    const path = new URL(url).pathname;
    return path.startsWith('/market/') && path !== '/market/';
  });
  assert.equal(products.length, expectedProducts, '상품 URL 수가 다릅니다.');

  const images = new Set();
  await mapLimit(urls, 4, async (publicUrl) => {
    const response = await checkedFetch(requestUrl(publicUrl), publicUrl);
    assert.equal(response.status, 200, `${publicUrl} HTTP 상태가 200이 아닙니다.`);
    const html = await response.text();
    assert.equal(canonicalFrom(html), publicUrl, `${publicUrl} self-canonical이 아닙니다.`);
    if (products.includes(publicUrl)) {
      assert.equal(html.match(/<meta property="og:url" content="([^"]+)"/)?.[1], publicUrl, `${publicUrl} OG URL 불일치`);
      imageUrls(html, publicUrl).forEach((url) => images.add(url));
    }
  });

  await mapLimit([...images], 8, async (publicUrl) => {
    const response = await checkedFetch(requestUrl(publicUrl), publicUrl);
    assert.equal(response.status, 200, `${publicUrl} 이미지 HTTP 상태가 200이 아닙니다.`);
    const contentType = response.headers.get('content-type') || '';
    if (/^image\//.test(contentType)) {
      await response.body?.cancel();
      return;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert(
      contentType === 'application/octet-stream' && hasImageSignature(bytes),
      `${publicUrl} 이미지 Content-Type 또는 파일 시그니처가 올바르지 않습니다.`,
    );
  });

  const probes = [
    '/__bellore-seo-404-probe__/',
    '/scripts/check.mjs',
    '/tools/build-pages.mjs',
    '/firebase.json',
  ];
  for (const path of probes) {
    const response = await checkedFetch(`${requestOrigin}${path}`, path);
    assert.equal(response.status, 404, `${path}가 404가 아닙니다.`);
    await response.body?.cancel();
  }

  console.log(JSON.stringify({
    requestOrigin,
    sitemapUrls: urls.length,
    productUrls: products.length,
    selfCanonicals: urls.length,
    productImages: images.size,
    imageHttp200: images.size,
    forbiddenOrUnknown404: probes.length,
  }));
}

main().catch((error) => {
  console.error(`market HTTP verification failed: ${error.message}`);
  process.exitCode = 1;
});
