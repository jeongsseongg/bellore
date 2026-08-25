import { readFile } from 'node:fs/promises';
import { listingPresentation } from '../../app/core/listing-display.js';
import {
  DEFAULT_MIN_PRODUCTS,
  SITE_ORIGIN,
  absoluteImageUrl,
  legacyDemoMatch,
  normalizeProductNumber,
  publicMarketPath,
  statusPolicy,
} from './market-policy.mjs';

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} 값이 없습니다.`);
  return text;
}

function optionalText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function positiveAmount(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    throw new Error(`${label} 금액이 올바르지 않습니다: ${value}`);
  }
  return amount;
}

function validDate(value, label) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} 날짜가 올바르지 않습니다: ${value}`);
  return date.toISOString();
}

function normalizePhotos(row, productNumber) {
  const photos = Array.isArray(row.image_urls) ? row.image_urls : [];
  const candidates = photos.length ? photos : (row.image_url ? [row.image_url] : []);
  const normalized = [...new Set(candidates.map(absoluteImageUrl).filter(Boolean))];
  if (normalized.length < 2) {
    throw new Error(`${productNumber} 이미지가 2장 미만입니다: ${normalized.length}`);
  }
  if (row.image_url && absoluteImageUrl(row.image_url) !== normalized[0]) {
    throw new Error(`${productNumber} 대표 이미지와 image_urls 첫 이미지가 다릅니다.`);
  }
  return normalized;
}

function conditionLines(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^평가\s*근거\s*[:：·-]?/i.test(line) && !/상품화/.test(line));
}

export async function readPublicSupabaseConfig(configPath) {
  const source = await readFile(configPath, 'utf8');
  const url = source.match(/\burl\s*:\s*["']([^"']+)["']/)?.[1];
  const key = source.match(/\banonKey\s*:\s*["']([^"']+)["']/)?.[1];
  if (!url || !key) throw new Error('supabase-config.js에서 공개 url/anonKey를 찾지 못했습니다.');
  return { url, key };
}

export async function fetchPublicListings(config, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch 구현이 없습니다.');
  const endpoint = `${config.url}/rest/v1/listings?select=*&order=created_at.desc`;
  const response = await fetchImpl(endpoint, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Accept: 'application/json',
      Prefer: 'count=exact',
    },
    signal: options.signal || AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const message = String(await response.text()).slice(0, 500);
    throw new Error(`Supabase listings ${response.status}: ${message}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Supabase listings 응답이 배열이 아닙니다.');
  const contentRange = response.headers?.get?.('content-range') || '';
  const totalText = contentRange.match(/\/(\d+)$/)?.[1];
  if (!totalText) throw new Error(`Supabase listings 전체 건수를 확인할 수 없습니다: ${contentRange || '(없음)'}`);
  const total = Number(totalText);
  if (rows.length !== total) {
    throw new Error(`Supabase listings 부분 응답: ${rows.length}/${total}`);
  }
  return rows;
}

export function normalizeListing(row) {
  const id = requiredText(row.id, 'listing.id');
  const productNumber = requiredText(row.product_no, `${id} product_no`);
  const slug = normalizeProductNumber(productNumber);
  const brand = optionalText(row.title);
  const model = optionalText(row.description);
  const price = positiveAmount(row.price, `${productNumber} price`);
  let salePrice = null;
  if (row.sale_price !== null && row.sale_price !== undefined && row.sale_price !== '') {
    salePrice = positiveAmount(row.sale_price, `${productNumber} sale_price`);
    if (salePrice > price) throw new Error(`${productNumber} 할인가가 정상가보다 큽니다.`);
  }
  const currentPrice = salePrice || price;
  const policy = statusPolicy(row.status);
  const photos = normalizePhotos(row, productNumber);
  const notes = conditionLines(row.condition_notes);
  const tags = Array.isArray(row.tags) ? row.tags.map(optionalText).filter(Boolean) : [];
  const isNew = /미사용|신품|새상품|new/i.test(optionalText(row.condition));
  const isVintage = tags.some((tag) => /^vintage$|빈티지/i.test(tag))
    || notes.some((line) => /빈티지/.test(line));
  const canonicalPath = publicMarketPath(row);

  const product = {
    id,
    productNumber,
    slug,
    canonicalPath,
    url: `${SITE_ORIGIN}${canonicalPath}`,
    appUrl: `${SITE_ORIGIN}/#p=${encodeURIComponent(id)}`,
    brand,
    model,
    name: '',
    referenceNumber: optionalText(row.reference_no),
    sizeMm: row.size_mm === null || row.size_mm === undefined ? '' : optionalText(row.size_mm),
    stamping: optionalText(row.stamping),
    purchaseYear: optionalText(row.purchase_year),
    setGrade: optionalText(row.set_grade),
    accessories: optionalText(row.accessories),
    pack: optionalText(row.pack),
    components: optionalText(row.components),
    movement: optionalText(row.movement),
    caseSpec: optionalText(row.case_spec),
    bandSpec: optionalText(row.band_spec),
    dialColor: optionalText(row.dial_color),
    material: optionalText(row.material),
    hasDiamond: row.has_diamond,
    hasWarranty: row.has_warranty,
    misu: optionalText(row.misu),
    condition: optionalText(row.condition),
    conditionNotes: notes,
    specialNote: optionalText(row.special_note),
    detailDescription: optionalText(row.detail_desc),
    saleMethod: optionalText(row.sale_method),
    shipping: optionalText(row.ship_info),
    category: optionalText(row.category),
    price,
    salePrice,
    currentPrice,
    photos,
    heroImage: photos[0],
    detailImages: photos.slice(1),
    isNew,
    isVintage,
    status: policy.status,
    statusLabel: policy.label,
    availability: policy.availability,
    publish: policy.publish,
    publishedAt: validDate(row.sale_started_at || row.created_at, `${productNumber} 등록일`),
    modifiedAt: validDate(row.updated_at || row.created_at, `${productNumber} 수정일`),
  };
  product.presentation = listingPresentation(product);
  product.name = [
    product.brand,
    product.presentation.modelSize,
    product.presentation.reference,
    product.presentation.feature,
  ].filter(Boolean).join(' ') || productNumber;
  return product;
}

export function prepareMarketListings(rows, options = {}) {
  if (!Array.isArray(rows)) throw new Error('상품 원본은 배열이어야 합니다.');
  const minProducts = Number(options.minProducts ?? DEFAULT_MIN_PRODUCTS);
  if (!Number.isInteger(minProducts) || minProducts < 1) {
    throw new Error(`최소 상품 수가 올바르지 않습니다: ${options.minProducts}`);
  }

  const products = [];
  const ids = new Set();
  const slugs = new Set();
  let excludedLegacyDemos = 0;
  let hidden = 0;

  for (const row of rows) {
    const id = requiredText(row?.id, 'listing.id');
    if (ids.has(id)) throw new Error(`중복 listing.id: ${id}`);
    ids.add(id);
    const policy = statusPolicy(row?.status);
    if (legacyDemoMatch(row)) {
      excludedLegacyDemos += 1;
      continue;
    }
    if (!policy.publish) {
      hidden += 1;
      continue;
    }
    const product = normalizeListing(row);
    if (slugs.has(product.slug)) throw new Error(`중복 상품번호: ${product.productNumber}`);
    slugs.add(product.slug);
    products.push(product);
  }

  if (products.length < minProducts) {
    throw new Error(`공개 상품 급감: ${products.length} < 최소 ${minProducts}`);
  }
  products.sort((a, b) => {
    const dateOrder = String(b.publishedAt).localeCompare(String(a.publishedAt));
    return dateOrder || a.productNumber.localeCompare(b.productNumber, 'en');
  });

  return {
    products,
    metrics: {
      source: rows.length,
      excludedLegacyDemos,
      hidden,
      published: products.length,
    },
  };
}
