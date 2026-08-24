/* 홈 배너의 표시 데이터. DOM·네트워크를 모른다. */

/* 가격대·테마 10종. 배너 이미지는 왼쪽 문구 공간과 오른쪽 시계 구도가 맞는 순서로 연결한다. */
export const CATEGORY_BANNERS = [
  { slug: 'datejust', lead: '어디에나 어울리는', title: '데이트저스트', sub: '롤렉스 대표 라인업', query: '데이트저스트', image: 'assets/banners/category-01.webp' },
  { slug: 'over1000', lead: '평생 곁에 둘', title: '1,000만원 이상', sub: '파텍필립 · 오데마피게 · 바쉐론', min: 10000000, image: 'assets/banners/category-02.webp' },
  { slug: 'diver', lead: '물 위에서도 선명한', title: '다이버 워치', sub: '서브마리너 · 씨마스터 · 파네라이', query: '다이버', image: 'assets/banners/category-03.webp' },
  { slug: 'under500', lead: '가장 많이 찾는', title: '500만원 미만', sub: '오메가 · 태그호이어 · 튜더', max: 5000000, image: 'assets/banners/category-04.webp' },
  { slug: 'women', lead: '손목 위의 가벼운 빛', title: '여성 시계', sub: '까르띠에 · 샤넬 · 에르메스', query: '여성', image: 'assets/banners/category-05.webp' },
  { slug: 'under1000', lead: '롤렉스를 만나는', title: '1,000만원 미만', sub: '롤렉스 · 까르띠에 · IWC', max: 10000000, image: 'assets/banners/category-06.webp' },
  { slug: 'wedding', lead: '두 사람의 시작에', title: '예물 시계', sub: '까르띠에 · 샤넬 · 불가리', query: '예물', image: 'assets/banners/category-07.webp' },
  { slug: 'vintage', lead: '세월이 만든', title: '빈티지 컬렉션', sub: '희귀 · 단종 모델', query: '빈티지', image: 'assets/banners/category-08.webp' },
  { slug: 'fullset', lead: '상자까지 그대로인', title: '풀세트 매물', sub: '박스 · 개런티 완비', query: '풀세트', image: 'assets/banners/category-09.webp' },
  { slug: 'under300', lead: '첫 명품시계로 좋은', title: '300만원 미만', sub: '해밀턴 · 론진 · 라도 · 구찌', max: 3000000, image: 'assets/banners/category-10.webp' },
];

/* 매입 배너 15종. 설명형 종결어미를 줄이고 짧은 슬로건으로 읽히게 한다. */
export const BUYIN_COPY = [
  { lead: '가치 확인부터, 부담 없이', title: ['서랍 속 그 시계,', '오늘은 얼마일까'] },
  { lead: '서류보다 중요한 건 시계', title: ['보증서는 사라져도', '남아 있는 가치'] },
  { lead: '시계 한 점으로 충분', title: ['박스도 서류도 없이,', '시계만으로'] },
  { lead: '단품도 정식 감정', title: ['풀세트가 아니어도,', '가치는 온전히'] },
  { lead: '오래 둘수록 다시 볼 가치', title: ['십 년을 건너온 시계,', '다시 보는 오늘'] },
  { lead: '잠들어 있던 시간만큼', title: ['차지 않은 날들에도', '시세는 움직인다'] },
  { lead: '오늘의 시세로', title: ['안 차는 시계,', '지금의 가치'] },
  { lead: '연식보다 중요한 기준', title: ['오래된 시계일수록', '제대로 보는 눈'] },
  { lead: '결정은 천천히', title: ['팔지 않아도 좋은,', '가치 확인부터'] },
  { lead: '구성품 없이도', title: ['시계는 시계만으로', '이미 충분'] },
  { lead: '여러 곳의 값을 한 번에', title: ['한 곳의 값만', '믿지 말 것'] },
  { lead: '보관만 하고 있었다면', title: ['장롱 속에도', '매일의 시세'] },
  { lead: '이어받은 시간까지', title: ['누군가 아꼈던 시계,', '이어지는 가치'] },
  { lead: '사진 한 장으로 시작', title: ['가져오지 않아도', '먼저 보는 가치'] },
  { lead: '지금 값을 알아둘 때', title: ['파는 날은 나중,', '가치는 오늘'] },
];

export const FEATURED_MAX = 10;

export const FEATURED_BADGES = [
  '오늘의 추천 매물', '검수 완료 매물', '이번 주 단 한 점', '단독 입고 매물',
  '놓치기 아까운 컨디션', '사진 그대로의 상태', '실물 검수 완료',
  '풀세트 그대로 입고', '미착용에 가까운', '다시 보기 어려운 구성',
  '오늘 새로 들어온', '상태가 특히 좋은', '찾는 분이 많은 모델',
  '재고 마지막 한 점', '지금 바로 출고 가능',
];

export const HERO_COPY = [
  { title: ['실물 그대로 보고', '고르는 명품시계'], sub: '검수 사진 · 구성품 · 가격까지 한눈에' },
  { title: ['사진으로 보는', '모든 상태'], sub: '흠집까지 숨기지 않는 투명한 기록' },
  { title: ['보고 고르는', '확신'], sub: '실물 검수 사진 전부 공개' },
  { title: ['상태를 알고 사는', '중고시계'], sub: '구성품 · 컨디션 · 가격까지 투명하게' },
  { title: ['좋은 시계는', '조용히 온다'], sub: '매일 새로 들어오는 검수 완료 매물' },
  { title: ['가품이라면', '전액 환불'], sub: '정품에 대한 벨로르의 책임' },
  { title: ['살 때도, 팔 때도', '벨로르'], sub: '구입 · 판매 · 수리를 한 곳에서' },
  { title: ['오늘 도착한', '새 매물'], sub: '검수를 마친 시계만 등록' },
  { title: ['직접 보고 고르는', '확신'], sub: '서울 중구 매장 방문 가능' },
  { title: ['손목까지 이어지는', '2~4일'], sub: '전국 무료배송' },
  { title: ['급하지 않게', '고르는 시간'], sub: '상세페이지에 담은 모든 정보' },
  { title: ['묻기 전에', '알 수 있게'], sub: '스펙 · 구성품 · 상태 모두 공개' },
  { title: ['중고라도', '분명한 기준'], sub: '전문가 정밀 검수 후 등록' },
  { title: ['첫 명품시계일수록', '신중하게'], sub: '예산별로 나누어 보는 컬렉션' },
  { title: ['믿고 살 수 있는', '곳'], sub: '판매 당사자로 지는 벨로르의 책임' },
];

/* 배너 배경은 매물 id로 고정한다 — 같은 시계는 늘 같은 원단 위에 올라온다. */
export function stableIndex(id, length) {
  const text = String(id || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return length > 0 ? hash % length : 0;
}
