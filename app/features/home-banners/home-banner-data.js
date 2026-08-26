/* 홈 배너의 표시 데이터. DOM·네트워크를 모른다. */

/* 가격대·테마 10종. 배너 이미지는 왼쪽 문구 공간과 오른쪽 시계 구도가 맞는 순서로 연결한다. */
export const CATEGORY_BANNERS = [
  { slug: 'datejust', lead: '매일을 함께할 클래식', title: '데이트저스트', sub: '롤렉스의 가장 대표적인 선택', filter: { brandsAny: ['롤렉스'], termsAny: ['데이트저스트', '데이저스트'] }, image: 'assets/banners/category-01.webp' },
  { slug: 'over1000', lead: '시간을 넘어 남는 이름', title: '1,000만원 이상의 명작', sub: '파텍필립 · 오데마피게 · 바쉐론 콘스탄틴', filter: { brandsAny: ['파텍필립', '오데마피게', '바쉐론 콘스탄틴', '바쉐론콘스탄틴'], min: 10000000 }, image: 'assets/banners/category-02.webp' },
  { slug: 'diver', lead: '깊이에서도 흔들리지 않는', title: '다이버 워치', sub: '서브마리너 · 씨마스터 · 파네라이', filter: { termsAny: ['서브마리너', '씨마스터 다이버', '씨마스터 플래닛오션', '파네라이'] }, image: 'assets/banners/category-03.webp' },
  { slug: 'under500', lead: '가격보다 빛나는 선택', title: '500만원 미만 컬렉션', sub: '오메가 · 태그호이어 · 튜더', filter: { brandsAny: ['오메가', '태그호이어', '튜더'], maxExclusive: 5000000 }, image: 'assets/banners/category-04.webp' },
  { slug: 'women', lead: '손목 위 가장 우아한 빛', title: '여성 명품시계', sub: '까르띠에 · 샤넬 · 에르메스', filter: { brandsAny: ['까르띠에', '샤넬', '에르메스'], audience: 'women' }, image: 'assets/banners/category-05.webp' },
  { slug: 'under1000', lead: '천만원 아래에서 만나는', title: '1,000만원 미만 컬렉션', sub: '롤렉스 · 까르띠에 · IWC', filter: { brandsAny: ['롤렉스', '까르띠에', 'IWC'], maxExclusive: 10000000 }, image: 'assets/banners/category-06.webp' },
  { slug: 'wedding', lead: '함께할 시간을 고르는 순간', title: '예물 시계', sub: '롤렉스 · 오메가 · 까르띠에', filter: { brandsAny: ['롤렉스', '오메가', '까르띠에'] }, image: 'assets/banners/category-07.webp' },
  { slug: 'vintage', lead: '시간이 더해 만든 가치', title: '빈티지 컬렉션', sub: '희귀 모델부터 단종 모델까지', filter: { vintage: true }, image: 'assets/banners/category-08.webp' },
  { slug: 'fullset', lead: '처음의 모습 그대로', title: '풀세트 컬렉션', sub: '박스와 보증서를 갖춘 매물', filter: { packsAny: ['풀세트'] }, image: 'assets/banners/category-09.webp' },
  { slug: 'under300', lead: '첫 명품시계를 위한 시작', title: '300만원 미만 컬렉션', sub: '해밀턴 · 론진 · 라도 · 구찌', filter: { brandsAny: ['해밀턴', '론진', '라도', '구찌'], maxExclusive: 3000000 }, image: 'assets/banners/category-10.webp' },
];

/* 매입 배너 6종. 질문형 존댓말 대신 행동을 바로 이해하는 짧은 슬로건을 쓴다. */
export const BUYIN_COPY = [
  { lead: '판매 전 시세 확인', title: ['내 시계, 얼마인지 먼저 확인'] },
  { lead: '구성품이 없어도 접수 가능', title: ['시계 단품도 판매 신청'] },
  { lead: '비교견적 · 위탁 · 즉시매입', title: ['원하는 방식으로 판매'] },
  { lead: '사진으로 먼저 접수', title: ['방문 전에 간편하게 신청'] },
  { lead: '연식과 상태를 함께 확인', title: ['오래된 시계도 현재 시세로'] },
  { lead: '견적 확인 후 결정', title: ['먼저 확인하고 천천히 결정'] },
];

export const FEATURED_MAX = 30;

/* 배경의 비어 있는 영역에 맞춰 고정 문구와 정렬·명암을 함께 지정한다. */
export const HERO_CAMPAIGNS = [
  { action: 'fullset', lead: '검수가 끝난,', title: '미사용급 풀세트', sub: '9점 이상 · 모든 구성품을 갖춘 시계', image: 'assets/banners/hero-01.webp', filter: { packsAny: ['풀세트'], gradeMin: 9 } },
  { action: 'wedding', lead: '함께할 시간을 고르는 순간', title: '예물 시계', sub: '롤렉스 · 오메가 · 까르띠에', image: 'assets/banners/hero-02.webp', tone: 'light', position: 'top-left', filter: { brandsAny: ['롤렉스', '오메가', '까르띠에'] } },
  { action: 'vintage', lead: '시간이 더해 만든 가치', title: '빈티지 컬렉션', sub: '희귀 모델부터 단종 모델까지', image: 'assets/banners/hero-03.webp', tone: 'light', position: 'right', filter: { vintage: true } },
  { action: 'newest', lead: '검수를 마치고 새롭게', title: 'NEW ARRIVAL', sub: '오늘 새롭게 만나는 시계', image: 'assets/banners/hero-05.webp', filter: { sort: 'latest' } },
  { action: 'sale', lead: '지금만 만나는 가격', title: 'TIME SALE', sub: '한정 수량 · 한정 혜택', image: 'assets/banners/hero-07.webp', filter: { saleOnly: true, sort: 'discount' } },
  { action: 'diver', lead: '깊이에서도 흔들리지 않는', title: '다이버 워치', sub: '서브마리너 · 씨마스터 · 파네라이', image: 'assets/banners/hero-08.webp', filter: { termsAny: ['서브마리너', '씨마스터 다이버', '씨마스터 플래닛오션', '블랙베이', '펠라고스', '파네라이'] } },
  { action: 'women', lead: '손목 위 가장 우아한 빛', title: '여성 명품시계', sub: '까르띠에 · 샤넬 · 에르메스', image: 'assets/banners/hero-09.webp', filter: { brandsAny: ['까르띠에', '샤넬', '에르메스'], audience: 'women' } },
  { action: 'santos', lead: '형태만으로 완성되는', title: '까르띠에 산토스', sub: '시대를 넘어 사랑받는 아이콘', image: 'assets/banners/hero-10.webp', filter: { brandsAny: ['까르띠에'], termsAny: ['산토스'] } },
];

/* 배너 배경은 매물 id로 고정한다 — 같은 시계는 늘 같은 원단 위에 올라온다. */
export function stableIndex(id, length) {
  const text = String(id || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return length > 0 ? hash % length : 0;
}
