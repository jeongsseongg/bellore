/* 매물 한 건을 화면 문구로 바꾸는 순수 규칙. DOM·네트워크를 모른다. */

export function priceText(amount) {
  return (Number(amount) || 0).toLocaleString('ko-KR');
}

export function discountRate(listing) {
  if (!listing.priceLowered || !listing.listPrice) return 0;
  return Math.round((1 - listing.price / listing.listPrice) * 100);
}

function known(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text && text !== '정보없음' ? text : '';
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function movementText(value) {
  const raw = known(value);
  if (!raw) return '';
  if (/^오토$|오토매틱|자동/.test(raw)) return '오토매틱';
  if (/쿼츠/.test(raw)) return '쿼츠';
  if (/수동/.test(raw)) return '수동';
  if (/스프링/.test(raw)) return '스프링 드라이브';
  return raw;
}

/* 확정된 카드 위계: 브랜드 / 모델+사이즈 / Ref. / 핵심 특징+무브먼트. */
export function listingPresentation(listing) {
  const size = known(listing.sizeMm ?? listing.size_mm).replace(/mm$/i, '');
  const reference = known(listing.referenceNumber ?? listing.reference_no ?? listing.ref_id ?? listing.ref);
  let model = known(listing.model ?? listing.description).replace(/^\[?중고\]?\s*/i, '');
  const brand = known(listing.brand);
  if (brand) model = model.replace(new RegExp(`^${escapePattern(brand)}\\s+`, 'i'), '');

  let feature = '';
  if (reference) {
    const index = model.toLowerCase().indexOf(reference.toLowerCase());
    if (index >= 0) {
      feature = model.slice(index + reference.length).trim();
      model = model.slice(0, index).trim();
    }
  }
  if (size) {
    const sizePattern = new RegExp(`(^|\\s)${escapePattern(size)}(?:\\s*(?:mm|미리))?(?=$|\\s)`, 'ig');
    model = model.replace(sizePattern, ' ').replace(/\s+/g, ' ').trim();
    model = model.replace(new RegExp(`${escapePattern(size)}(?:mm|미리)?$`, 'i'), '').trim();
  }
  model = model.replace(/\s+/g, ' ').trim() || '모델 정보없음';
  feature = feature.replace(/소재\s*기능|정보없음/g, '').replace(/\s+/g, ' ').trim();
  const move = movementText(listing.movement);
  return {
    model,
    size,
    modelSize: [model, size].filter(Boolean).join(' '),
    reference,
    referenceText: reference ? `Ref. ${reference}` : '',
    feature,
    movement: move,
    featureMovement: [feature, move].filter(Boolean).join(' · '),
  };
}

/* 카드 아래 한 줄: 상품번호 · 사이즈 · 구성품 */
export function specText(listing) {
  const parts = [];
  if (listing.productNo) parts.push(listing.productNo);
  if (listing.sizeMm) parts.push(`${String(listing.sizeMm).replace(/mm$/i, '')}mm`);
  if (listing.pack) parts.push(listing.pack);
  return parts.slice(0, 3).join(' · ');
}

/* 단독 매물 배너: 추상적인 설명 대신 실제 구성품·사이즈·상품번호를 짧게 보여준다. */
export function featuredMetaText(listing) {
  const parts = [String(listing.pack || '').trim() || '단품'];
  if (listing.sizeMm) parts.push(`${String(listing.sizeMm).replace(/mm$/i, '')}mm`);
  if (listing.productNo) parts.push(listing.productNo);
  return parts.slice(0, 3).join(' · ');
}

/* 내려간 금액 뱃지 문구 — 프리뷰 시안대로 만원·억 단위로 읽는다 */
export function dropAmountText(listing) {
  const drop = (Number(listing.listPrice) || 0) - (Number(listing.price) || 0);
  if (drop < 10000) return '';
  const man = Math.floor(drop / 10000);
  if (man < 10000) return `${man.toLocaleString('ko-KR')}만원`;
  const eok = Math.floor(man / 10000);
  const rest = man % 10000;
  return rest ? `${eok}억 ${rest.toLocaleString('ko-KR')}만원` : `${eok}억원`;
}

/* 배너 뱃지 — 과장 없이 사실만 */
export function badgeText(listing) {
  if (listing.saleActive) return '가격 내린 매물';
  if (listing.isNew) return '미착용 신품 매물';
  if (/풀세트/.test(listing.pack)) return '풀세트 검수 완료 매물';
  return '오늘의 추천 매물';
}

/* 누끼(투명 배경) 사진만 원단 위에 시계만 얹는다. JPEG는 투명 채널이 없다. */
export function isCutoutPhoto(url) {
  return /\.(png|webp)(\?|#|$)/i.test(String(url || ''));
}

export function shuffled(list, random = Math.random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const SALE_STATES = Object.freeze({
  on_sale: Object.freeze({ status: 'on_sale', label: '', message: '', purchasable: true, visible: false }),
  reserved: Object.freeze({
    status: 'reserved', label: '예약중', purchasable: false, visible: true,
    message: '현재 구매가 진행 중인 상품입니다. 구매가 취소되면 다시 구매할 수 있습니다.',
  }),
  sold: Object.freeze({ status: 'sold', label: 'SOLD OUT', message: '판매가 완료된 상품입니다.', purchasable: false, visible: true }),
  unavailable: Object.freeze({
    status: 'unavailable', label: '구매불가', purchasable: false, visible: true,
    message: '현재 구매할 수 없는 상품입니다. 상품 상태를 다시 확인해 주세요.',
  }),
});

export function normalizeListingStatus(value) {
  const raw = String(value == null ? '' : value).trim().toLowerCase();
  if (!raw) return 'on_sale';
  return ({ available: 'on_sale', active: 'on_sale', selling: 'on_sale', sold_out: 'sold', soldout: 'sold', confirmed: 'sold' })[raw] || raw;
}

export function effectiveListingStatus(row, now = Date.now()) {
  const status = normalizeListingStatus(row?.status);
  if (status !== 'on_sale' || !row?.reserved_order_id) return status;
  const until = String(row.reserved_until == null ? '' : row.reserved_until).trim().toLowerCase();
  if (until === 'infinity') return 'reserved';
  const expiresAt = Date.parse(until);
  return Number.isFinite(expiresAt) && expiresAt > Number(now) ? 'reserved' : status;
}

export function listingAvailability(value) {
  const status = normalizeListingStatus(value);
  return SALE_STATES[status] || Object.freeze({ ...SALE_STATES.unavailable, status });
}

export function listingIsPurchasable(value) {
  return listingAvailability(value).purchasable;
}
