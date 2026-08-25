/* 매물 한 건을 화면 문구로 바꾸는 순수 규칙. DOM·네트워크를 모른다. */

export function priceText(amount) {
  return (Number(amount) || 0).toLocaleString('ko-KR');
}

export function discountRate(listing) {
  if (!listing.priceLowered || !listing.listPrice) return 0;
  return Math.round((1 - listing.price / listing.listPrice) * 100);
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
