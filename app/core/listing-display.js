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
  return text && !text.includes('정보없음') ? text : '';
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* DB 원문을 바꾸지 않고 고객·검색 화면에서만 오래된 줄임말과 오탈자를 정규화한다. */
export function normalizeListingText(value) {
  return known(value)
    .replace(/데이저스트\s*36/gi, '데이저스트 36')
    .replace(/섭마/g, '서브마리너')
    .replace(/네비타이버|네비타리머/g, '내비타이머')
    .replace(/슈퍼오션\s*2/gi, '슈퍼오션 II')
    .replace(/오에스터데이트/g, '오이스터데이트')
    .replace(/퍼페츄얼/g, '퍼페추얼')
    .replace(/마스터콜렉션|마스터컬렉션/g, '마스터 컬렉션')
    .replace(/머스트드\s*탱크/g, '머스트 드 탱크')
    .replace(/산토스\s*100/gi, '산토스 100')
    .replace(/라도냐/g, '라 도나')
    .replace(/카키네이비/g, '카키 네이비')
    .replace(/H아워/gi, 'H 아워')
    .replace(/골든엘립스/g, '골든 엘립스')
    .replace(/애커스/g, '아퀴스')
    .replace(/(?:어쿠아|아쿠아)테라/g, '아쿠아 테라')
    .replace(/까레라\s*칼리버\s*(\d+)/gi, '까레라 칼리버 $1')
    .replace(/칼리버\s*(\d+)/gi, '칼리버 $1')
    .replace(/크로노\s+그래프/g, '크로노그래프')
    .replace(/\bj12\b/gi, 'J12')
    .replace(/18\s*k\b/gi, '18K')
    .replace(/화이트골드/g, '화이트 골드')
    .replace(/옐로골드/g, '옐로 골드')
    .replace(/블루다이얼/g, '블루 다이얼')
    .replace(/레드다이얼/g, '레드 다이얼')
    .replace(/그린다이얼/g, '그린 다이얼')
    .replace(/화이트로만/g, '화이트 로만')
    .replace(/청콤/g, '블루 콤비')
    .replace(/흑콤/g, '블랙 콤비')
    .replace(/녹판/g, '그린 다이얼')
    .replace(/텐포/g, '10P 다이아 인덱스')
    .replace(/초코판/g, '초코 다이얼')
    .replace(/\s+/g, ' ')
    .trim();
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

const COMPONENT_LABELS = {
  box: '박스',
  case: '케이스',
  card: '개런티카드',
  warranty: '보증서',
};

function componentTokens(value) {
  return String(value ?? '')
    .split(/[,/·\n]/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

/* 구성품은 구조화 components를 최우선으로 사용한다.
   과거 pack/set_grade의 "정보없음"이 실제 체크값을 덮지 못하게 한다. */
export function accessoryPresentation(listing) {
  const rawComponents = componentTokens(listing.components);
  const freeText = [listing.accessories, listing.pack, listing.setGrade ?? listing.set_grade]
    .map(known).filter(Boolean).join(' · ');
  const present = [];
  Object.entries(COMPONENT_LABELS).forEach(([key, label]) => {
    const inStructured = rawComponents.includes(key);
    const pattern = key === 'card' ? /개런티|게런티|보증카드/ : new RegExp(label);
    if (inStructured || pattern.test(freeText)) present.push(label);
  });
  if (/풀세트|풀박스/.test(freeText)) {
    ['박스', '케이스', '개런티카드', '보증서'].forEach((label) => {
      if (!present.includes(label)) present.push(label);
    });
  }

  const hasWarranty = listing.hasWarranty ?? listing.has_warranty;
  const warrantyIncluded = hasWarranty === true || present.includes('보증서');
  const physical = present.filter((label) => label !== '보증서');
  const includedText = physical.length ? `${physical.join(' · ')} 포함` : '';
  let warrantyText = '';
  if (warrantyIncluded) warrantyText = '보증서 포함';
  else if (physical.length || hasWarranty === false) warrantyText = '보증서 미포함';
  else warrantyText = '보증서 확인 필요';

  return {
    items: present,
    includedText,
    warrantyText,
    detailText: [includedText, warrantyText].filter(Boolean).join(' · ') || '구성품 확인 필요',
    compactText: [
      physical.join('·'),
      warrantyIncluded ? '보증서' : (physical.length || hasWarranty === false ? '보증서 없음' : ''),
    ].filter(Boolean).join(' · ') || '구성품 확인 필요',
  };
}

export function conditionPresentation(value) {
  const text = known(value);
  if (!text) return '';
  return text.replace(/^중고\s*/i, '').replace(/\s+/g, ' ').trim();
}

/* 사용자 확정 규칙: 브랜드 / 모델+사이즈 / Ref. / 핵심 특징+무브먼트. */
export function listingPresentation(listing) {
  const size = known(listing.sizeMm ?? listing.size_mm).replace(/mm$/i, '');
  const reference = known(listing.referenceNumber ?? listing.reference_no ?? listing.ref_id ?? listing.ref);
  let model = normalizeListingText(listing.model ?? listing.description).replace(/^\[?중고\]?\s*/i, '');
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
    if (!reference) {
      const sizeIndex = model.search(new RegExp(`(^|\\s)${escapePattern(size)}(?:\\s*(?:mm|미리))?(?=$|\\s)`, 'i'));
      if (sizeIndex >= 0) {
        const sizeMatch = model.slice(sizeIndex)
          .match(new RegExp(`^\\s*${escapePattern(size)}(?:\\s*(?:mm|미리))?`, 'i'))?.[0] || '';
        feature = model.slice(sizeIndex + sizeMatch.length).trim();
        model = model.slice(0, sizeIndex).trim();
      }
    }
    const sizePattern = new RegExp(`(^|\\s)${escapePattern(size)}(?:\\s*(?:mm|미리))?(?=$|\\s)`, 'ig');
    model = model.replace(sizePattern, ' ').replace(/\s+/g, ' ').trim();
    model = model.replace(new RegExp(`${escapePattern(size)}(?:mm|미리)?$`, 'i'), '').trim();
  }
  model = model.replace(/\s+/g, ' ').trim() || '모델 확인 필요';
  feature = normalizeListingText(feature).replace(/소재\s*기능|정보없음/g, '').replace(/\s+/g, ' ').trim();
  const modelSize = [model, size].filter(Boolean).join(' ');
  const move = movementText(listing.movement);
  return {
    model,
    size,
    modelSize,
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
